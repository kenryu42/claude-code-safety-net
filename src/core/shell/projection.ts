import {
  type CommandNode,
  type CommandProgram,
  type CommandRedirection,
  type CommandSpan,
  type CommandView,
  type CommandWord,
  getCalledCommandName,
} from './model';
import { DEFAULT_COMMAND_PARSER_LIMITS, parseCommand } from './parse';
import { hasUnclosedQuotes } from './tokens';

export type ShellSyntaxEntry =
  | { readonly kind: 'word'; readonly text: string }
  | { readonly kind: 'operator'; readonly operator: string; readonly boundary: boolean }
  | {
      readonly kind: 'redirection';
      readonly operator: string;
      readonly role: 'file-read' | 'file-write' | 'here-data';
      readonly targetOrder: 'immediate' | 'legacy-segment';
      readonly target?: string;
    };

export type ShellSyntaxFacts = {
  readonly status: 'complete' | 'unclosed-quote' | 'invalid' | 'structural-limit';
  readonly source: string;
  readonly entries: readonly ShellSyntaxEntry[];
  readonly assignmentFallbacks: readonly string[];
};

const LEGACY_BOUNDARIES = new Set(['&&', '||', '|&', '|', '&', ';']);
const LEGACY_SEGMENT_REDIRECTS = new Set(['<<', '<<<', '>|']);
const SPECIAL_VARIABLE_NAME = /[*@#?$!_-]/;
// PowerShell variable names carry an optional scope or provider prefix, so `$env:USERPROFILE`
// is one name rather than `$env` followed by literal text.
const POWERSHELL_VARIABLE_NAME = /^\w+(?::\w+)*/;
const EMPTY_ENTRIES = Object.freeze([]) as readonly ShellSyntaxEntry[];
const EMPTY_STRINGS = Object.freeze([]) as readonly string[];
// A call site inlines the whole body, so branching recursion (`a() { a; a; }`) grows
// exponentially where the depth cap alone never triggers. Real commands call a handful of
// functions; anything past this budget fails closed instead of running the projection dry.
const MAX_FUNCTION_EXPANSIONS = 256;

type ProjectionFlags = {
  invalid: boolean;
  limited: boolean;
  expansions: number;
  assignmentFallbacks: string[];
};

type ProjectionContext = {
  readonly source: string;
  readonly suppressed: ReadonlySet<CommandSpan>;
  readonly flags: ProjectionFlags;
  readonly depth: number;
  readonly functions: Map<string, CommandProgram>;
  readonly powershell: boolean;
};

type QuoteState = { single: boolean; double: boolean };

type PositionedEntries = { readonly start: number; readonly entries: readonly ShellSyntaxEntry[] };

/**
 * Projects the parsed program onto the flat entry stream the path scanners read.
 * Word text keeps shell expansions inert (`$NAME` becomes `${NAME}`) so downstream variable
 * tracking sees one spelling, and heredoc bodies fed to inert data sinks stay out of the stream.
 */
export function projectShellSyntax(source: string, program: CommandProgram): ShellSyntaxFacts {
  const suppressed =
    program.status === 'complete'
      ? new Set(collectDataSinkHeredocSpans(program))
      : new Set<CommandSpan>();
  const masked = [...suppressed].reduce(
    (text, span) =>
      text.slice(0, span.start) + ' '.repeat(span.end - span.start) + text.slice(span.end),
    source,
  );
  if (hasUnclosedQuotes(masked)) return freezeFacts('unclosed-quote', masked, EMPTY_ENTRIES);
  const flags: ProjectionFlags = {
    invalid: false,
    limited: false,
    expansions: 0,
    assignmentFallbacks: [],
  };
  const entries = projectProgram(program, {
    source: masked,
    suppressed,
    flags,
    depth: 0,
    functions: new Map(),
    powershell: program.dialect === 'powershell',
  });
  if (flags.limited) return freezeFacts('structural-limit', masked, EMPTY_ENTRIES);
  if (flags.invalid) return freezeFacts('invalid', masked, EMPTY_ENTRIES);
  return freezeFacts('complete', masked, entries, flags.assignmentFallbacks);
}

function freezeFacts(
  status: ShellSyntaxFacts['status'],
  source: string,
  entries: readonly ShellSyntaxEntry[],
  assignmentFallbacks: readonly string[] = EMPTY_STRINGS,
): ShellSyntaxFacts {
  return Object.freeze({
    status,
    source,
    entries: Object.freeze(entries),
    assignmentFallbacks: Object.freeze(assignmentFallbacks),
  });
}

function projectProgram(program: CommandProgram, context: ProjectionContext): ShellSyntaxEntry[] {
  return program.nodes
    .flatMap((node, index) => projectNode(node, program, index, context))
    .sort((left, right) => left.start - right.start)
    .flatMap((item) => [...item.entries]);
}

function projectNode(
  node: CommandNode,
  program: CommandProgram,
  index: number,
  context: ProjectionContext,
): PositionedEntries[] {
  if (node.kind === 'connector') {
    return [
      { start: node.span.start, entries: [operatorEntry(normalizeConnector(node.operator))] },
    ];
  }
  if (node.kind === 'unknown') {
    return [{ start: node.span.start, entries: [operatorEntry(node.source)] }];
  }
  if (node.kind === 'function') {
    context.functions.set(node.name, node.body);
    return [];
  }
  if (node.kind === 'group') {
    const brace = node.style !== 'subshell';
    const closed = context.source[node.span.end - 1] === (brace ? '}' : ')');
    const groupContext = brace ? context : { ...context, functions: new Map(context.functions) };
    return [
      {
        start: node.span.start,
        entries: [
          brace ? boundaryOperatorEntry('{') : operatorEntry('('),
          ...projectProgram(node.body, groupContext),
          ...(closed ? [brace ? boundaryOperatorEntry('}') : operatorEntry(')')] : []),
        ],
      },
    ];
  }
  const functionBody = getCalledFunctionBody(node, context.functions);
  if (functionBody) {
    if (
      context.depth >= DEFAULT_COMMAND_PARSER_LIMITS.maxDepth ||
      ++context.flags.expansions > MAX_FUNCTION_EXPANSIONS
    ) {
      context.flags.limited = true;
      return [];
    }
    return [
      {
        start: node.span.start,
        entries: [
          ...projectView(node, context),
          boundaryOperatorEntry(';'),
          ...projectProgram(functionBody, { ...context, depth: context.depth + 1 }),
          boundaryOperatorEntry(';'),
        ],
      },
      ...projectHeredocs(node, program, index, context),
    ];
  }
  return [
    { start: node.span.start, entries: projectView(node, context) },
    ...projectHeredocs(node, program, index, context),
  ];
}

function projectView(view: CommandView, context: ProjectionContext): ShellSyntaxEntry[] {
  return [
    ...view.words.map((word) => ({
      start: word.span.start,
      entries: projectWord(word, view, context, false),
    })),
    ...view.redirections.map((redirection) => ({
      start: redirection.span.start,
      entries: projectRedirection(redirection, view, context),
    })),
  ]
    .sort((left, right) => left.start - right.start)
    .flatMap((item) => item.entries);
}

function projectRedirection(
  redirection: CommandRedirection,
  view: CommandView,
  context: ProjectionContext,
): ShellSyntaxEntry[] {
  const operator = redirection.operator === '<<-' ? '<<' : redirection.operator;
  const targetEntries = redirection.target
    ? projectWord(redirection.target, view, context, true)
    : [];
  const first = targetEntries[0];
  const target = first?.kind === 'word' ? first.text : undefined;
  return [
    // An explicit fd prefix (`2>&1`) is a word of its own in the entry stream, as the scanners
    // have always seen it; folding it into the redirection would silently drop that token.
    ...(redirection.fd === undefined ? [] : [wordEntry(String(redirection.fd))]),
    Object.freeze({
      kind: 'redirection' as const,
      operator,
      role: getRedirectionRole(operator),
      targetOrder: LEGACY_SEGMENT_REDIRECTS.has(operator)
        ? ('legacy-segment' as const)
        : ('immediate' as const),
      ...(target === undefined ? {} : { target }),
    }),
    ...(target === undefined ? targetEntries : targetEntries.slice(1)),
  ];
}

function projectHeredocs(
  view: CommandView,
  program: CommandProgram,
  index: number,
  context: ProjectionContext,
): PositionedEntries[] {
  const heredocs = view.redirections.filter(
    (redirection) => redirection.operator === '<<' || redirection.operator === '<<-',
  );
  return [
    ...heredocs.flatMap((redirection): PositionedEntries[] => {
      const heredoc = redirection.heredoc;
      if (!heredoc) return [];
      // The newline that closes the terminator line separates the heredoc from what follows;
      // without it the next command would join this one's segment.
      const terminator = [
        wordEntry(heredoc.delimiter),
        ...(/[\r\n]/.test(context.source[heredoc.terminatorSpan.end] ?? '')
          ? [operatorEntry(';')]
          : []),
      ];
      if (context.suppressed.has(heredoc.bodySpan)) {
        return [{ start: heredoc.bodySpan.start, entries: terminator }];
      }
      return [
        {
          start: heredoc.bodySpan.start,
          entries: [
            ...projectText(
              context.source.slice(heredoc.bodySpan.start, heredoc.bodySpan.end),
              context,
            ),
            ...terminator,
          ],
        },
      ];
    }),
    // A declared-but-never-terminated heredoc swallows the rest of the input; a heredoc with no
    // delimiter at all swallows nothing, so its trailing text is already an ordinary node.
    ...(heredocs.some((redirection) => !redirection.heredoc && redirection.target)
      ? projectUnterminatedHeredoc(program, index, context)
      : []),
  ];
}

// An unterminated heredoc leaves its body outside the node tree: the parser stops at the
// declaration. The body text still reaches the shell, so it stays scannable here.
function projectUnterminatedHeredoc(
  program: CommandProgram,
  index: number,
  context: ProjectionContext,
): PositionedEntries[] {
  const connector = program.nodes.slice(index + 1).find((node) => node.kind === 'connector');
  if (!connector || connector.span.end >= program.span.end) return [];
  return [
    {
      start: connector.span.end,
      entries: projectText(context.source.slice(connector.span.end, program.span.end), context),
    },
  ];
}

// Each re-parse resets the parser's own depth limit, so nesting across parses (heredoc bodies
// declaring further heredocs) is bounded here to keep total recursion finite.
function projectText(text: string, context: ProjectionContext): ShellSyntaxEntry[] {
  if (context.depth >= DEFAULT_COMMAND_PARSER_LIMITS.maxDepth) {
    context.flags.limited = true;
    return [];
  }
  const program = parseCommand(text, 'posix');
  if (program.status === 'limited') {
    context.flags.limited = true;
    return [];
  }
  // A body is often not shell at all (code, prose), so its invalid marks stay contained: an
  // unclosed `${` aborts a real shell before anything in the text it swallows runs, which keeps
  // the surviving entries faithful without failing the whole command's projection.
  const flags: ProjectionFlags = {
    invalid: false,
    limited: false,
    expansions: context.flags.expansions,
    assignmentFallbacks: context.flags.assignmentFallbacks,
  };
  const entries = projectProgram(program, {
    source: text,
    suppressed: new Set<CommandSpan>(),
    flags,
    depth: context.depth + 1,
    functions: new Map(),
    powershell: false,
  });
  context.flags.limited ||= flags.limited;
  context.flags.expansions = flags.expansions;
  return entries;
}

function projectWord(
  word: CommandWord,
  view: CommandView,
  context: ProjectionContext,
  keepGlobText: boolean,
): ShellSyntaxEntry[] {
  const entries: ShellSyntaxEntry[] = [];
  const state: QuoteState = { single: false, double: false };
  let pending = '';
  let glob = false;
  const flush = () => {
    const entry =
      glob && !keepGlobText
        ? operatorEntry('glob')
        : pending !== '' || (word.quoted && entries.length === 0)
          ? wordEntry(pending)
          : undefined;
    if (entry) entries.push(entry);
    pending = '';
    glob = false;
  };

  for (const part of word.parts) {
    if (part.provenance !== 'command-substitution' && part.provenance !== 'arithmetic') {
      for (const run of scanWordText(part.raw, state, context.flags, context.powershell)) {
        if (typeof run === 'string') {
          flush();
          entries.push(operatorEntry(run));
          continue;
        }
        pending += run.text;
        glob ||= run.glob;
      }
      continue;
    }
    // Inside double quotes a substitution never breaks the word: its text stays inert, and the
    // nested command is still reached through the substitution scan over the source.
    if (state.double) {
      const quotedText = context.source.slice(part.span.start, part.span.end);
      pending += scanWordText(
        quotedText,
        { single: false, double: true },
        context.flags,
        context.powershell,
      )
        .map((run) => (typeof run === 'string' ? run : run.text))
        .join('');
      continue;
    }
    const nested = view.nested.find(
      (program) => program.span.start >= part.span.start && program.span.end <= part.span.end,
    );
    const inner = nested ? projectProgram(nested, context) : [];
    if (part.raw.startsWith('`')) {
      pending += '${}';
      flush();
      entries.push(...inner);
      continue;
    }
    if (part.raw.startsWith('<(') || part.raw.startsWith('>(')) {
      flush();
      entries.push(
        part.raw.startsWith('<(')
          ? operatorEntry('<(')
          : Object.freeze({
              kind: 'redirection' as const,
              operator: '>',
              role: 'file-write' as const,
              targetOrder: 'immediate' as const,
            }),
        ...inner,
        ...(part.raw.endsWith(')') ? [operatorEntry(')')] : []),
      );
      continue;
    }
    const frames = part.raw.startsWith('$((') ? 2 : 1;
    pending += '${}';
    flush();
    entries.push(
      ...Array.from({ length: frames }, () => operatorEntry('(')),
      ...inner,
      ...(part.raw.endsWith(')'.repeat(frames))
        ? Array.from({ length: frames }, () => operatorEntry(')'))
        : []),
    );
  }
  flush();
  return entries;
}

// Reproduces the quoting, escaping and expansion rules of the token stream the scanners were
// built against: quotes come off, `$NAME` normalizes to `${NAME}`, active assignment expansions
// expose their fallback, and an unquoted `*`/`?` makes the whole word a glob whose text never
// reaches a segment. An unquoted parenthesis ends the run it sits in, so `open('.env')` still
// yields `.env` as a token of its own.
//
// A PowerShell word follows PowerShell's rules instead: the escape character is a backtick, a
// backslash is an ordinary path separator, and a variable name may carry a scope
// (`$env:USERPROFILE`).
function scanWordText(
  raw: string,
  state: QuoteState,
  flags: ProjectionFlags,
  powershell: boolean,
): ({ text: string; glob: boolean } | string)[] {
  const runs: ({ text: string; glob: boolean } | string)[] = [];
  let text = '';
  let glob = false;
  let index = 0;
  while (index < raw.length) {
    const char = raw[index] ?? '';
    if (!state.single && !state.double && (char === '(' || char === ')')) {
      runs.push({ text, glob }, char);
      text = '';
      glob = false;
      index++;
      continue;
    }
    // A backtick escapes the next character everywhere except inside single quotes, which are
    // literal in PowerShell.
    if (powershell && char === '`' && !state.single) {
      text += raw[index + 1] ?? '';
      index += 2;
      continue;
    }
    if (state.single && char === "'") {
      state.single = false;
      index++;
      continue;
    }
    if (state.single) {
      text += char;
      index++;
      continue;
    }
    if (state.double) {
      if (char === '"') {
        state.double = false;
        index++;
        continue;
      }
      if (!powershell && char === '\\') {
        const escaped = raw[index + 1] ?? '';
        text += ['"', '\\', '$'].includes(escaped) ? escaped : `\\${escaped}`;
        index += 2;
        continue;
      }
      if (char === '$') {
        const expansion = readExpansion(raw, index, state, flags, powershell);
        text += expansion.text;
        index = expansion.next;
        continue;
      }
      text += char;
      index++;
      continue;
    }
    if (char === "'" || char === '"') {
      state.single = char === "'";
      state.double = char === '"';
      index++;
      continue;
    }
    if (!powershell && char === '\\') {
      const escaped = raw[index + 1] ?? '';
      glob ||= escaped === '*' || escaped === '?';
      text += escaped;
      index += 2;
      continue;
    }
    if (char === '$') {
      const expansion = readExpansion(raw, index, state, flags, powershell);
      text += expansion.text;
      index = expansion.next;
      continue;
    }
    glob ||= char === '*' || char === '?';
    text += char;
    index++;
  }
  return [...runs, { text, glob }];
}

function readExpansion(
  raw: string,
  start: number,
  state: QuoteState,
  flags: ProjectionFlags,
  powershell: boolean,
) {
  const char = raw[start + 1];
  if (char === '{') {
    const close = findExpansionClose(raw, start + 2);
    if (close === -1) {
      flags.invalid = true;
      return { text: '', next: raw.length };
    }
    const expansion = raw.slice(start, close + 1);
    collectAssignmentFallback(expansion, state, flags, powershell);
    return { text: expansion, next: close + 1 };
  }
  if (char !== undefined && SPECIAL_VARIABLE_NAME.test(char)) {
    return { text: `\${${char}}`, next: start + 2 };
  }
  const name =
    (powershell ? POWERSHELL_VARIABLE_NAME : /^\w*/).exec(raw.slice(start + 1))?.[0] ?? '';
  return { text: `\${${name}}`, next: start + 1 + name.length };
}

function collectAssignmentFallback(
  expansion: string,
  state: QuoteState,
  flags: ProjectionFlags,
  powershell: boolean,
): void {
  const content = expansion.slice(2, -1);
  const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(content)?.[0];
  if (!name) return;
  const suffix = content.slice(name.length);
  const operator = [':=', '='].find((candidate) => suffix.startsWith(candidate));
  if (!operator) return;
  const runs = scanWordText(suffix.slice(operator.length), { ...state }, flags, powershell);
  flags.assignmentFallbacks.push(
    ...runs.flatMap((run) => (typeof run === 'string' || !run.text ? [] : [run.text])),
  );
}

function findExpansionClose(raw: string, start: number): number {
  let depth = 1;
  let index = start;
  while (depth > 0 && index < raw.length) {
    if (raw[index] === '{' && raw[index - 1] === '$') depth++;
    if (raw[index] === '}') depth--;
    index++;
  }
  return depth === 0 ? index - 1 : -1;
}

function normalizeConnector(operator: string): string {
  return /^[\r\n]+$/.test(operator) ? ';' : operator;
}

function operatorEntry(operator: string): ShellSyntaxEntry {
  return Object.freeze({
    kind: 'operator' as const,
    operator,
    boundary: LEGACY_BOUNDARIES.has(operator),
  });
}

function boundaryOperatorEntry(operator: string): ShellSyntaxEntry {
  return Object.freeze({ kind: 'operator' as const, operator, boundary: true });
}

function wordEntry(text: string): ShellSyntaxEntry {
  return Object.freeze({ kind: 'word' as const, text });
}

function getRedirectionRole(operator: string) {
  if (operator === '<<' || operator === '<<<') return 'here-data' as const;
  if (operator === '<' || operator === '<&') return 'file-read' as const;
  return 'file-write' as const;
}

// Bodies fed to executing/applying consumers (bash, python, git apply, a pipe into another
// command, an output process substitution) must stay scannable; only inert data sinks qualify.
function collectDataSinkHeredocSpans(program: CommandProgram): CommandSpan[] {
  return program.nodes.flatMap((node, index): CommandSpan[] => {
    if (node.kind === 'group' || node.kind === 'function') {
      return collectDataSinkHeredocSpans(node.body);
    }
    if (node.kind !== 'command') return [];
    const nestedSpans = node.nested.flatMap((nested) => collectDataSinkHeredocSpans(nested));
    const next = program.nodes[index + 1];
    const piped = next?.kind === 'connector' && (next.operator === '|' || next.operator === '|&');
    if (piped || !isDataSinkHeredocConsumer(node)) return nestedSpans;
    return [
      ...nestedSpans,
      ...node.redirections.flatMap((redirection) =>
        redirection.heredoc?.quotedDelimiter ? [redirection.heredoc.bodySpan] : [],
      ),
    ];
  });
}

function getCalledFunctionBody(
  view: CommandView,
  functions: ReadonlyMap<string, CommandProgram>,
): CommandProgram | undefined {
  const name = getCalledCommandName(view);
  return name === undefined ? undefined : functions.get(name);
}

function isBareWord(word: CommandWord | undefined, text: string): boolean {
  return (
    word !== undefined &&
    word.provenance === 'literal' &&
    !word.quoted &&
    word.raw === word.text &&
    word.text === text
  );
}

// A message sink stores or publishes its body; it never resolves a word in it as a path.
// git apply is not one: its body names the files the patch writes, so it stays scannable.
function isMessageSinkConsumer(view: CommandView): boolean {
  if (isBareWord(view.words[0], 'git')) return isBareWord(view.words[1], 'commit');
  if (!isBareWord(view.words[0], 'gh') || !isBareWord(view.words[2], 'create')) return false;
  return isBareWord(view.words[1], 'pr') || isBareWord(view.words[1], 'issue');
}

function isDataSinkHeredocConsumer(view: CommandView): boolean {
  const isDataSink =
    isBareWord(view.words[0], 'cat') ||
    isBareWord(view.words[0], 'tee') ||
    isMessageSinkConsumer(view);
  return (
    isDataSink &&
    !view.words.some(hasOutputProcessSubstitution) &&
    !view.redirections.some((redirection) => hasOutputProcessSubstitution(redirection.target))
  );
}

function hasOutputProcessSubstitution(word: CommandWord | undefined): boolean {
  return (
    word?.parts.some(
      (part) => part.provenance === 'command-substitution' && part.raw.startsWith('>('),
    ) ?? false
  );
}
