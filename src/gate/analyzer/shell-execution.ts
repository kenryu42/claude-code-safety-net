import { SHELL_WRAPPERS } from '@/core/rules/constants';
import type {
  CommandProgram,
  CommandRedirection,
  CommandView,
  CommandWord,
} from '@/core/shell/model';
import { DEFAULT_COMMAND_PARSER_LIMITS, parseCommand } from '@/core/shell/parse';
import { getBasename, normalizeCommandToken } from '@/core/shell/tokens';
import { analysisWordText, isLiteralExecutionSourceWord } from './command-words';
import { parseShellArgv } from './shell-wrappers';
import { isStandardCommandWrapper } from './transparent-wrappers';
import { parseEnvAssignment } from './wrapper-prelude';

type ShellExecutionSource =
  | { kind: 'none' }
  | { kind: 'literal'; source: string }
  | { kind: 'dynamic' };

type PositionalReference = {
  parameter: number | '@' | '*';
  quoted: boolean;
};

type PositionalCarrier = {
  command:
    | '.'
    | 'bash'
    | 'command'
    | 'dash'
    | 'exec'
    | 'eval'
    | 'ksh'
    | 'sh'
    | 'source'
    | 'zsh'
    | null;
  optionTerminator: boolean;
  references: readonly PositionalReference[];
  ifs: string;
};

const NO_SOURCE = { kind: 'none' } as const;
const DYNAMIC_SOURCE = { kind: 'dynamic' } as const;
const INPUT_REDIRECTIONS = new Set(['<', '<<', '<<-', '<<<', '<&', '<>']);
const SHELL_PARAMETER_RE =
  /\$(?:([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*)|\{!?([0-9]+|[@*]|[A-Za-z_][A-Za-z0-9_]*))/g;
const POSITIONAL_SHELL_PARAMETER_RE = /^(?:[0-9]+|[@*])$/;
const MAX_POSITIONAL_EXPANSION_WORDS = DEFAULT_COMMAND_PARSER_LIMITS.maxWords;
const MAX_POSITIONAL_EXPANSION_CHARACTERS = DEFAULT_COMMAND_PARSER_LIMITS.maxInputLength;

export function extractLiteralPrintfOutput(command: CommandView | undefined): string | undefined {
  if (!command || getBasename(normalizeCommandToken(command.words[0]?.text ?? '')) !== 'printf') {
    return undefined;
  }
  if (command.words.some((word) => word.provenance !== 'literal')) return undefined;

  const args = command.words.slice(command.words[1]?.text === '--' ? 2 : 1);
  const format = args[0]?.text;
  if (format === undefined) return '';
  const values = args.slice(1).map((word) => word.text);
  if (format === '%s') return values.join('');
  if (format === '%s\\n' || format === '%s\n') return `${values.join('\n')}\n`;
  if (format.includes('%') || /\\(?![\\nrt])/.test(format)) return undefined;
  return format
    .replaceAll('\\n', '\n')
    .replaceAll('\\r', '\r')
    .replaceAll('\\t', '\t')
    .replaceAll('\\\\', '\\');
}

export function extractEvalSource(words: readonly CommandWord[]): ShellExecutionSource {
  const start = wordText(words[1]) === '--' ? 2 : 1;
  if (words.length <= start) return NO_SOURCE;
  const args = words.slice(start);
  if (!args.every(isLiteralWord)) return DYNAMIC_SOURCE;
  return { kind: 'literal', source: args.map(analysisWordText).join(' ') };
}

export function extractTrapSource(words: readonly CommandWord[]): ShellExecutionSource {
  const actionIndex = wordText(words[1]) === '--' ? 2 : 1;
  const action = words[actionIndex];
  const source = wordText(action);
  if (
    action === undefined ||
    words.length <= actionIndex + 1 ||
    source === '-' ||
    source === '' ||
    source === '-l' ||
    source === '-p'
  ) {
    return NO_SOURCE;
  }
  if (!isLiteralWord(action)) return DYNAMIC_SOURCE;
  return { kind: 'literal', source };
}

export function extractPositionalShellSource(
  words: readonly CommandWord[],
  script: string,
): ShellExecutionSource {
  const scriptIndex = findShellScriptIndex(words);
  if (scriptIndex === -1) return NO_SOURCE;
  const carrier = parsePositionalCarrier(script);
  if (!carrier) return NO_SOURCE;
  const expanded: string[] = [];
  let expandedCharacters = carrier.command?.length ?? 0;
  for (const reference of carrier.references) {
    const values = expandPositionalReference(reference, words, scriptIndex, carrier.ifs);
    if (!values) return DYNAMIC_SOURCE;
    expandedCharacters += values.reduce((total, value) => total + value.length + 3, 0);
    if (
      expanded.length + values.length > MAX_POSITIONAL_EXPANSION_WORDS ||
      expandedCharacters > MAX_POSITIONAL_EXPANSION_CHARACTERS
    ) {
      return DYNAMIC_SOURCE;
    }
    expanded.push(...values);
  }
  if (carrier.command === 'eval') {
    return { kind: 'literal', source: expanded.join(' ') };
  }
  if (expanded.length === 0 || /\s/.test(expanded[0] ?? '')) {
    return { kind: 'literal', source: '' };
  }
  return {
    kind: 'literal',
    source: [
      carrier.command,
      carrier.command && carrier.optionTerminator ? '--' : null,
      ...expanded.map(quoteShellWord),
    ]
      .filter((value): value is string => value !== null)
      .join(' '),
  };
}

export function extractShellStdinSource(
  words: readonly CommandWord[],
  redirections: readonly CommandRedirection[],
  hasPipelineInput: boolean,
  literalPipelineInput: string | undefined,
): ShellExecutionSource {
  if (!parseShellArgv(words.map(analysisWordText)).readsStdinAsCommands) return NO_SOURCE;

  const input = redirections
    .filter(
      (redirection) =>
        (redirection.fd === undefined || redirection.fd === 0) &&
        INPUT_REDIRECTIONS.has(redirection.operator),
    )
    .at(-1);
  if (input) {
    if (input.operator === '<<' || input.operator === '<<-') return NO_SOURCE;
    if (input.operator !== '<<<' || input.target?.provenance !== 'literal') {
      return DYNAMIC_SOURCE;
    }
    return { kind: 'literal', source: input.target.text };
  }
  if (!hasPipelineInput) return NO_SOURCE;
  return literalPipelineInput === undefined
    ? DYNAMIC_SOURCE
    : { kind: 'literal', source: literalPipelineInput };
}

export function extractShellScriptOperandSource(
  words: readonly CommandWord[],
): ShellExecutionSource {
  const scriptIndex = parseShellArgv(words.map(analysisWordText)).scriptIndex;
  if (scriptIndex === null) return NO_SOURCE;
  const word = words[scriptIndex];
  const source = wordText(word);
  return isLiteralExecutionSourceWord(word, source) ? { kind: 'literal', source } : DYNAMIC_SOURCE;
}

const REMOTE_FETCHERS = new Set([
  'curl',
  'wget',
  'fetch',
  'aria2c',
  'http',
  'https',
  'xh',
  'xhs',
  'nc',
  'ncat',
  'netcat',
]);

/**
 * Whether the command is `eval "$(CMD)"` or `source`/`.` `<(CMD)` where CMD is a single
 * fully literal local command: no dynamic word, no compound body, no remote fetcher,
 * and no shell or wrapper head that could forward to one.
 */
export function isVerifiableLocalGeneratorSource(command: CommandView): boolean {
  if (
    command.words.length !== 2 ||
    command.redirections.length !== 0 ||
    command.nested.length !== 1
  ) {
    return false;
  }

  const head = command.words[0];
  const operand = command.words[1];
  if (!head || head.provenance !== 'literal' || head.quoted || head.raw !== head.text || !operand) {
    return false;
  }

  const hasExactOuterForm =
    (head.text === 'eval' &&
      operand.quoted &&
      operand.parts.length === 3 &&
      operand.parts[0]?.raw === '"' &&
      operand.parts[1]?.provenance === 'command-substitution' &&
      operand.parts[1].raw.startsWith('$(') &&
      operand.parts[2]?.raw === '"') ||
    ((head.text === 'source' || head.text === '.') &&
      !operand.quoted &&
      operand.parts.length === 1 &&
      operand.parts[0]?.provenance === 'command-substitution' &&
      operand.parts[0].raw.startsWith('<('));
  if (!hasExactOuterForm) return false;

  const program = command.nested[0];
  if (program?.status !== 'complete' || program.nodes.length !== 1) return false;
  const inner = program.nodes[0];
  if (
    inner?.kind !== 'command' ||
    inner.redirections.length !== 0 ||
    inner.nested.length !== 0 ||
    inner.words.some(
      (word) =>
        word.provenance !== 'literal' || word.parts.some((part) => part.provenance !== 'literal'),
    )
  ) {
    return false;
  }

  const innerHead = inner.words[0]?.text;
  if (innerHead === undefined || parseEnvAssignment(innerHead) !== null) return false;

  const basename = getBasename(normalizeCommandToken(innerHead));
  return (
    !REMOTE_FETCHERS.has(basename) &&
    !SHELL_WRAPPERS.has(basename) &&
    !isStandardCommandWrapper(basename)
  );
}

function findShellScriptIndex(words: readonly CommandWord[]): number {
  return parseShellArgv(words.map(analysisWordText)).commandIndex ?? -1;
}

function parsePositionalCarrier(script: string): PositionalCarrier | null {
  const ifsAssignment = /^IFS=(?:'([^']*)'|"([^"]*)"|([^;\s]*))\s*;\s*(.+)$/.exec(script.trim());
  const source = ifsAssignment?.[4] ?? script.trim();
  const command = /^(\.|bash|command|dash|exec|eval|ksh|sh|source|zsh)(?:\s+(--))?\s+(.+)$/.exec(
    source,
  );
  const references = (command?.[3] ?? source).split(/\s+/).map(parsePositionalReference);
  if (references.length === 0 || references.some((reference) => reference === null)) return null;
  return {
    command: (command?.[1] as PositionalCarrier['command'] | undefined) ?? null,
    optionTerminator: command?.[2] !== undefined,
    references: references.filter((reference): reference is PositionalReference => !!reference),
    ifs: ifsAssignment ? (ifsAssignment[1] ?? ifsAssignment[2] ?? ifsAssignment[3] ?? '') : ' \t\n',
  };
}

function parsePositionalReference(value: string): PositionalReference | null {
  const quoted = /^"\$(?:([0-9]+|[@*])|\{([0-9]+|[@*])\})"$/.exec(value);
  const unquoted = /^\$(?:([0-9]+|[@*])|\{([0-9]+|[@*])\})$/.exec(value);
  const match = quoted ?? unquoted;
  if (!match) return null;
  const parameter = match[1] ?? match[2];
  return {
    parameter: parameter === '@' || parameter === '*' ? parameter : Number(parameter),
    quoted: quoted !== null,
  };
}

function expandPositionalReference(
  reference: PositionalReference,
  words: readonly CommandWord[],
  scriptIndex: number,
  ifs: string,
): string[] | undefined {
  const positional = words.slice(scriptIndex + 2);
  if (reference.parameter === '@') {
    return reference.quoted
      ? literalPositionalValues(positional)
      : splitLiteralPositionalValues(positional, ifs);
  }
  if (reference.parameter === '*') {
    const values = literalPositionalValues(positional);
    if (!values) return undefined;
    const joined = values.join(ifs[0] ?? '');
    return reference.quoted ? [joined] : splitLiteralShellFields(joined, ifs);
  }

  const word = words[scriptIndex + 1 + reference.parameter];
  if (word && !isLiteralWord(word)) return undefined;
  const value = wordText(word);
  return reference.quoted ? [value] : splitLiteralShellFields(value, ifs);
}

function literalPositionalValues(words: readonly CommandWord[]): string[] | undefined {
  return words.every(isLiteralWord) ? words.map(analysisWordText) : undefined;
}

function splitLiteralPositionalValues(
  words: readonly CommandWord[],
  ifs: string,
): string[] | undefined {
  const literal = literalPositionalValues(words);
  if (!literal) return undefined;
  const fields = literal.map((value) => splitLiteralShellFields(value, ifs));
  return fields.some((value) => value === undefined)
    ? undefined
    : fields.flatMap((value) => value ?? []);
}

function splitLiteralShellFields(value: string, ifs: string): string[] | undefined {
  if (['*', '?', '[', ']'].some((character) => value.includes(character))) return undefined;
  if (ifs === '') return value === '' ? [] : [value];
  if (ifs === ' \t\n') return value.trim().split(/\s+/).filter(Boolean);
  if (ifs.length !== 1) return undefined;
  return ifs === ' ' || ifs === '\t' || ifs === '\n'
    ? value.trim().split(/\s+/).filter(Boolean)
    : value.split(ifs).filter(Boolean);
}

/**
 * Whether the word is a literal execution source. Parsed words answer from provenance;
 * text-only stand-ins carry none, so they keep the text test the token path used.
 */
function isLiteralWord(word: CommandWord | undefined): boolean {
  if (!word) return true;
  return word.provenance === 'unknown'
    ? !/[$`]/.test(analysisWordText(word))
    : word.provenance === 'literal';
}

function wordText(word: CommandWord | undefined): string {
  return word ? analysisWordText(word) : '';
}

function quoteShellWord(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function shellSourceHasDynamicExecutionCarrier(
  source: string,
  dynamicEnvNames: ReadonlySet<string>,
): boolean {
  return programHasDynamicExecutionCarrier(parseCommand(source, 'posix'), dynamicEnvNames);
}

export function shellSourceHasUnresolvedDynamicExecutionCarrier(source: string): boolean {
  return shellSourceHasDynamicExecutionCarrier(
    source,
    new Set(
      Array.from(source.matchAll(SHELL_PARAMETER_RE)).flatMap((match) => {
        const parameter = match[1] ?? match[2];
        return parameter === undefined ? [] : [parameter];
      }),
    ),
  );
}

function programHasDynamicExecutionCarrier(
  program: CommandProgram,
  inheritedDynamicNames: ReadonlySet<string>,
): boolean {
  if (program.status === 'invalid' || program.status === 'limited') return false;
  const dynamicNames = new Set(inheritedDynamicNames);

  for (const node of program.nodes) {
    if (node.kind === 'group') {
      if (programHasDynamicExecutionCarrier(node.body, dynamicNames)) return true;
      continue;
    }
    if (node.kind !== 'command') continue;
    if (
      node.nested.some((nested) => programHasDynamicExecutionCarrier(nested, dynamicNames)) ||
      wordsHaveDynamicExecutionCarrier(node.words, dynamicNames)
    ) {
      return true;
    }
    updateDynamicAssignments(node, dynamicNames);
  }

  return false;
}

function wordsHaveDynamicExecutionCarrier(
  words: readonly CommandWord[],
  dynamicNames: ReadonlySet<string>,
): boolean {
  const headIndex = words.findIndex((word) => parseEnvAssignment(word.text) === null);
  if (headIndex === -1) return false;
  const head = words[headIndex];
  if (!head) return false;
  if (wordReferencesDynamicInput(head, dynamicNames)) return true;

  const normalizedHead = normalizeCommandToken(head.text);
  if (normalizedHead === 'source' || normalizedHead === '.') {
    const operandIndex = words[headIndex + 1]?.text === '--' ? headIndex + 2 : headIndex + 1;
    return wordSuppliesDynamicExecutionSource(words[operandIndex], dynamicNames);
  }
  if (SHELL_WRAPPERS.has(normalizedHead)) {
    const shellWords = words.slice(headIndex);
    const parsed = parseShellArgv(shellWords.map((word) => word.text));
    const sourceIndex = parsed.commandIndex ?? parsed.scriptIndex;
    return (
      !parsed.syntaxCheck &&
      sourceIndex !== null &&
      wordSuppliesDynamicExecutionSource(shellWords[sourceIndex], dynamicNames)
    );
  }

  const carrierIndex = findCarrierCommandIndex(words, headIndex, dynamicNames);
  if (carrierIndex === null) return false;
  if (carrierIndex === -1) return true;
  return wordsHaveDynamicExecutionCarrier(words.slice(carrierIndex), dynamicNames);
}

function findCarrierCommandIndex(
  words: readonly CommandWord[],
  headIndex: number,
  dynamicNames: ReadonlySet<string>,
): number | null {
  const head = normalizeCommandToken(words[headIndex]?.text ?? '');
  if (head === 'command') return findCommandBuiltinCommandIndex(words, headIndex + 1);
  if (head === 'exec') return findExecCommandIndex(words, headIndex + 1);
  if (head === 'env') return findEnvCommandIndex(words, headIndex + 1, dynamicNames);
  return null;
}

function findCommandBuiltinCommandIndex(
  words: readonly CommandWord[],
  start: number,
): number | null {
  for (let index = start; index < words.length; index++) {
    const token = words[index]?.text ?? '';
    if (token === '--') return words[index + 1] ? index + 1 : null;
    if (/^-[p]*[vV][pvV]*$/.test(token)) return null;
    if (/^-p+$/.test(token)) continue;
    return index;
  }
  return null;
}

function findExecCommandIndex(words: readonly CommandWord[], start: number): number | null {
  for (let index = start; index < words.length; index++) {
    const token = words[index]?.text ?? '';
    if (token === '--') return words[index + 1] ? index + 1 : null;
    if (token === '-a') {
      index++;
      continue;
    }
    if (/^-a.+/.test(token) || /^-[cl]+$/.test(token)) continue;
    return index;
  }
  return null;
}

function findEnvCommandIndex(
  words: readonly CommandWord[],
  start: number,
  dynamicNames: ReadonlySet<string>,
): number | null {
  for (let index = start; index < words.length; index++) {
    const word = words[index];
    const token = word?.text ?? '';
    if (token === '--') return words[index + 1] ? index + 1 : null;
    if (token === '-S' || token === '--split-string') {
      return wordReferencesDynamicInput(words[index + 1], dynamicNames) ? -1 : index + 2;
    }
    if (token.startsWith('-S') || token.startsWith('--split-string=')) {
      return wordReferencesDynamicInput(word, dynamicNames) ? -1 : index + 1;
    }
    if (
      token === '-u' ||
      token === '--unset' ||
      token === '-C' ||
      token === '--chdir' ||
      token === '-P'
    ) {
      index++;
      continue;
    }
    if (
      token === '-i' ||
      token === '-0' ||
      token === '--null' ||
      token.startsWith('-u=') ||
      token.startsWith('--unset=') ||
      token.startsWith('-C') ||
      token.startsWith('--chdir=') ||
      token.startsWith('-P')
    ) {
      continue;
    }
    if (token.startsWith('-')) continue;
    if (parseEnvAssignment(token)) continue;
    return index;
  }
  return null;
}

function updateDynamicAssignments(command: CommandView, dynamicNames: Set<string>): void {
  if (!command.words.every((word) => parseEnvAssignment(word.text) !== null)) return;
  for (const word of command.words) {
    const assignment = parseEnvAssignment(word.text);
    if (!assignment) continue;
    if (wordReferencesDynamicInput(word, dynamicNames)) {
      dynamicNames.add(assignment.name);
    }
  }
}

function wordReferencesDynamicInput(
  word: CommandWord | undefined,
  dynamicNames: ReadonlySet<string>,
): boolean {
  if (!word) return false;
  return word.parts
    .filter((part) => part.provenance === 'variable')
    .some((part) =>
      Array.from(part.raw.matchAll(SHELL_PARAMETER_RE)).some((match) => {
        const parameter = match[1] ?? match[2];
        return (
          parameter !== undefined &&
          (POSITIONAL_SHELL_PARAMETER_RE.test(parameter) || dynamicNames.has(parameter))
        );
      }),
    );
}

function wordSuppliesDynamicExecutionSource(
  word: CommandWord | undefined,
  dynamicNames: ReadonlySet<string>,
): boolean {
  return (
    !!word &&
    (word.parts.some((part) => part.provenance !== 'literal' && part.provenance !== 'variable') ||
      wordReferencesDynamicInput(word, dynamicNames))
  );
}
