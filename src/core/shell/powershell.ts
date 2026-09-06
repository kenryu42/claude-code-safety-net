import {
  appendAccumulatedCommand,
  type CommandGroup,
  type CommandIssue,
  type CommandNode,
  type CommandParserLimits,
  type CommandProgram,
  type CommandView,
  type CommandWord,
  type CommandWordPart,
  createCommandAccumulator,
  createCommandWordParts,
  freezeCommandProgram,
  freezeCommandWord,
  freezeParsedCommandWord,
  type WordProvenance,
} from './model';

type PowerShellWordResult = {
  word: CommandWord;
  next: number;
  issues: CommandIssue[];
  nested: CommandProgram[];
  words: number;
  limited: boolean;
};

type PowerShellScanResult = {
  nodes: CommandNode[];
  issues: CommandIssue[];
  next: number;
  closed: boolean;
  words: number;
  limited: boolean;
};

const AUTO_POWERSHELL_HEADS = new Set([
  'remove-item',
  'ri',
  'del',
  'erase',
  'rd',
  'rmdir',
  'get-content',
  'set-content',
  'add-content',
  'copy-item',
  'move-item',
]);
// These names are ordinary POSIX programs too, so they only select the PowerShell
// parser when an argument is spelled as a PowerShell path expression.
const AUTO_POWERSHELL_PATH_ALIASES = new Set(['gc', 'cat', 'type', 'cp', 'mv', 'rm']);
const AUTO_POWERSHELL_PARAMETERS = ['-rec', '-for', '-path', '-literalpath', '-whatif'];
const POWERSHELL_ENV_VARIABLE = /^\$env:\w/i;
const POWERSHELL_SEPARATED_VARIABLE = /^(?:\$\{?\w+\}?|~)\\./;
const SELECTOR_LIMITS = { maxInputLength: 131_072, maxWords: 16_384, maxDepth: 64 };

export function shouldUsePowerShellParser(source: string): boolean {
  const candidate = source.toLowerCase().replaceAll('`', '');
  if (
    ![...AUTO_POWERSHELL_HEADS].some((head) => candidate.includes(head)) &&
    !(
      candidate.includes('rm') &&
      AUTO_POWERSHELL_PARAMETERS.some((word) => candidate.includes(word))
    ) &&
    !candidate.includes('<#') &&
    !hasPathExpressionSignal(candidate)
  ) {
    return false;
  }
  const selector = scanSelectorCommands(source);
  return selector.invalidComment || selector.commands.some(isPowerShellSelectorCommand);
}

// A linear precheck for the alias forms: a word scan is only worth paying for when the
// source could hold `$env:` or a variable joined to a suffix by a backslash at all.
function hasPathExpressionSignal(candidate: string): boolean {
  if (candidate.includes('$env:')) return true;
  return candidate.includes('\\') && (candidate.includes('$') || candidate.includes('~'));
}

function isPowerShellSelectorCommand(words: readonly string[]): boolean {
  const headIndex = words[0] === '&' || words[0] === '.' ? 1 : 0;
  const head = words[headIndex]?.toLowerCase();
  if (head && AUTO_POWERSHELL_HEADS.has(head)) return true;
  const args = words.slice(headIndex + 1);
  if (head && AUTO_POWERSHELL_PATH_ALIASES.has(head) && args.some(isPowerShellPathExpression)) {
    return true;
  }
  if (head !== 'rm') return false;
  return args.some((word) => {
    const parameter = word.toLowerCase().split(':', 1)[0] ?? '';
    return AUTO_POWERSHELL_PARAMETERS.some((prefix) => parameter.startsWith(prefix));
  });
}

function isPowerShellPathExpression(word: string): boolean {
  return POWERSHELL_ENV_VARIABLE.test(word) || POWERSHELL_SEPARATED_VARIABLE.test(word);
}

export function parsePowerShellCommand(
  source: string,
  limits: CommandParserLimits,
): CommandProgram {
  const span = { start: 0, end: source.length };
  if (source.length > limits.maxInputLength) {
    return freezeCommandProgram({
      kind: 'program',
      dialect: 'powershell',
      source,
      span,
      status: 'limited',
      issues: [
        {
          code: 'input-limit',
          message: `command exceeds ${limits.maxInputLength} UTF-16 code units`,
          span,
        },
      ],
      nodes: [],
    });
  }

  const result = scanPowerShellSequence(source, 0, source.length, limits, 0);
  return freezeCommandProgram({
    kind: 'program',
    dialect: 'powershell',
    source,
    span,
    status: getPowerShellParseStatus(result.issues, result.limited),
    issues: result.issues,
    nodes: result.nodes,
  });
}

function scanPowerShellSequence(
  source: string,
  start: number,
  end: number,
  limits: CommandParserLimits,
  depth: number,
  closingBrace = false,
): PowerShellScanResult {
  const nodes: CommandNode[] = [];
  const issues: CommandIssue[] = [];
  const accumulator = createCommandAccumulator();
  let wordCount = 0;
  let limited = false;

  const flush = () => {
    if (accumulator.words.length === 0 && accumulator.redirections.length === 0) return;
    const commandSpan = { start: accumulator.start, end: accumulator.end };
    appendAccumulatedCommand(nodes, accumulator, {
      kind: 'command',
      dialect: 'powershell',
      source: source.slice(commandSpan.start, commandSpan.end),
      span: commandSpan,
      words: accumulator.words,
      redirections: accumulator.redirections,
      nested: accumulator.nested,
      displayText: accumulator.words.map((word) => word.text).join(' '),
    } satisfies CommandView);
  };

  let i = start;
  while (i < end) {
    const char = source[i];
    if (!char) break;
    if (closingBrace && char === '}') {
      flush();
      return { nodes, issues, next: i + 1, closed: true, words: wordCount, limited };
    }
    const comment = readPowerShellComment(source, i, end, limits.maxDepth);
    if (comment) {
      if (comment.issue) issues.push(comment.issue);
      if (comment.limited) {
        flush();
        return {
          nodes,
          issues,
          next: comment.next,
          closed: false,
          words: wordCount,
          limited: true,
        };
      }
      i = comment.next;
      continue;
    }
    if (/\s/.test(char)) {
      if (char === '\r' || char === '\n') {
        flush();
        const next = char === '\r' && source[i + 1] === '\n' ? i + 2 : i + 1;
        nodes.push(connector(source, i, next));
        i = next;
        continue;
      }
      i++;
      continue;
    }
    const operator = readOperator(source, i);
    if (operator) {
      flush();
      nodes.push(connector(source, i, i + operator.length));
      i += operator.length;
      continue;
    }
    if (char === '{') {
      flush();
      if (depth >= limits.maxDepth) {
        issues.push(depthLimitIssue(i, limits.maxDepth));
        return { nodes, issues, next: end, closed: false, words: wordCount, limited: true };
      }
      const inner = scanPowerShellSequence(source, i + 1, end, limits, depth + 1, true);
      const bodyEnd = inner.closed ? inner.next - 1 : inner.next;
      const body = freezeCommandProgram({
        kind: 'program',
        dialect: 'powershell',
        source: source.slice(i + 1, bodyEnd),
        span: { start: i + 1, end: bodyEnd },
        status: inner.limited ? 'limited' : inner.issues.length > 0 ? 'partial' : 'complete',
        issues: inner.issues,
        nodes: inner.nodes,
      });
      nodes.push(
        Object.freeze({
          kind: 'group',
          style: 'brace',
          span: Object.freeze({ start: i, end: inner.next }),
          body,
        } satisfies CommandGroup),
      );
      issues.push(...inner.issues);
      if (!inner.closed) {
        issues.push({
          code: 'unclosed-script-block',
          message: 'PowerShell script block is not closed',
          span: { start: i, end: inner.next },
        });
      }
      wordCount += inner.words;
      limited ||= inner.limited;
      i = inner.next;
      continue;
    }
    if (char === '}') {
      flush();
      nodes.push(connector(source, i, i + 1));
      i++;
      continue;
    }
    if (char === '>' || char === '<') {
      accumulator.start = accumulator.start === -1 ? i : accumulator.start;
      const operatorEnd = source[i + 1] === char ? i + 2 : i + 1;
      let targetStart = operatorEnd;
      while (/[ \t]/.test(source[targetStart] ?? '')) targetStart++;
      const target =
        targetStart < end ? readPowerShellWord(source, targetStart, end, limits, depth) : undefined;
      const redirectEnd = target?.next ?? operatorEnd;
      accumulator.redirections.push(
        Object.freeze({
          kind: 'redirection',
          operator: source.slice(i, operatorEnd),
          span: Object.freeze({ start: i, end: redirectEnd }),
          ...(target ? { target: target.word } : {}),
        }),
      );
      if (target) {
        issues.push(...target.issues);
        accumulator.nested.push(...target.nested);
        wordCount += target.words;
        limited ||= target.limited;
      }
      accumulator.end = redirectEnd;
      i = redirectEnd;
      continue;
    }
    if (char === ',') {
      accumulator.start = accumulator.start === -1 ? i : accumulator.start;
      accumulator.words.push(
        freezeCommandWord({
          text: ',',
          raw: ',',
          span: { start: i, end: i + 1 },
          provenance: 'literal',
          quoted: false,
        }),
      );
      accumulator.end = ++i;
      continue;
    }

    const result = readPowerShellWord(source, i, end, limits, depth);
    accumulator.start = accumulator.start === -1 ? i : accumulator.start;
    accumulator.end = result.next;
    accumulator.words.push(result.word);
    issues.push(...result.issues);
    accumulator.nested.push(...result.nested);
    wordCount += 1 + result.words;
    limited ||= result.limited;
    if (wordCount > limits.maxWords) {
      issues.push({
        code: 'word-limit',
        message: `command exceeds ${limits.maxWords} words`,
        span: { start: i, end: result.next },
      });
      flush();
      return { nodes, issues, next: result.next, closed: false, words: wordCount, limited: true };
    }
    i = result.next > i ? result.next : i + 1;
  }
  flush();
  return { nodes, issues, next: i, closed: !closingBrace, words: wordCount, limited };
}

function readPowerShellWord(
  source: string,
  start: number,
  end: number,
  limits: CommandParserLimits,
  depth: number,
): PowerShellWordResult {
  let text = '';
  let provenance: WordProvenance = 'literal';
  let quoted = false;
  const issues: CommandIssue[] = [];
  const nested: CommandProgram[] = [];
  let nestedWords = 0;
  let limited = false;
  const consumeSubexpression = (offset: number) => {
    const subexpression = readPowerShellSubexpression(source, offset, end, limits, depth);
    text += source.slice(offset, subexpression.next);
    nested.push(subexpression.program);
    issues.push(...subexpression.program.issues);
    nestedWords += countProgramWords(subexpression.program);
    limited ||= subexpression.program.status === 'limited';
    provenance = 'command-substitution';
    return subexpression.next;
  };
  let i = start;
  while (i < end) {
    const char = source[i];
    if (
      !char ||
      /\s/.test(char) ||
      readOperator(source, i) ||
      char === '>' ||
      char === '<' ||
      char === '#'
    ) {
      break;
    }
    if (char === ',') break;
    if (char === '`') {
      const next = source[i + 1];
      if (!next) {
        issues.push({
          code: 'trailing-escape',
          message: 'PowerShell escape has no following character',
          span: { start: i, end: i + 1 },
        });
        i++;
        break;
      }
      text += next;
      i += 2;
      continue;
    }
    if (source.startsWith('$(', i)) {
      i = consumeSubexpression(i);
      continue;
    }
    if (char === "'") {
      quoted = true;
      i++;
      let closed = false;
      while (i < source.length) {
        if (source[i] === "'" && source[i + 1] === "'") {
          text += "'";
          i += 2;
          continue;
        }
        if (source[i] === "'") {
          closed = true;
          i++;
          break;
        }
        text += source[i] ?? '';
        i++;
      }
      if (!closed) {
        issues.push({
          code: 'unclosed-single-quote',
          message: 'single-quoted word is not closed',
          span: { start, end: source.length },
        });
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      const quoteStart = i++;
      let closed = false;
      while (i < end) {
        const inner = source[i];
        if (inner === '`' && source[i + 1]) {
          text += source[i + 1];
          i += 2;
          continue;
        }
        if (inner === '"') {
          closed = true;
          i++;
          break;
        }
        if (source.startsWith('$(', i)) {
          i = consumeSubexpression(i);
          continue;
        }
        if (inner === '$') {
          provenance = source[i + 1] === '(' ? 'command-substitution' : 'variable';
        }
        text += inner ?? '';
        i++;
      }
      if (!closed) {
        issues.push({
          code: 'unclosed-double-quote',
          message: 'double-quoted word is not closed',
          span: { start: quoteStart, end: source.length },
        });
      }
      continue;
    }
    if (char === '$') {
      provenance = source[i + 1] === '(' ? 'command-substitution' : 'variable';
    }
    if (char === '@' && i === start) provenance = 'variable';
    text += char;
    i++;
  }
  return {
    word: freezeParsedCommandWord(
      source,
      start,
      i,
      text,
      provenance,
      quoted,
      provenance === 'literal' ? undefined : derivePowerShellWordParts(source, start, i),
    ),
    next: i,
    issues,
    nested,
    words: nestedWords,
    limited,
  };
}

function readPowerShellSubexpression(
  source: string,
  start: number,
  end: number,
  limits: CommandParserLimits,
  depth: number,
) {
  const close = findPowerShellSubexpressionEnd(source, start + 2, end);
  const innerEnd = close === -1 ? end : close;
  const next = close === -1 ? end : close + 1;
  if (depth >= limits.maxDepth) {
    return {
      program: freezeCommandProgram({
        kind: 'program',
        dialect: 'powershell',
        source: source.slice(start + 2, innerEnd),
        span: { start: start + 2, end: innerEnd },
        status: 'limited',
        issues: [depthLimitIssue(start, limits.maxDepth)],
        nodes: [],
      }),
      next,
    };
  }

  const inner = scanPowerShellSequence(source, start + 2, innerEnd, limits, depth + 1);
  const unclosedIssue =
    close === -1
      ? [
          {
            code: 'unclosed-command-subexpression',
            message: 'PowerShell command subexpression is not closed',
            span: { start, end: next },
          },
        ]
      : [];
  return {
    program: freezeCommandProgram({
      kind: 'program',
      dialect: 'powershell',
      source: source.slice(start + 2, innerEnd),
      span: { start: start + 2, end: innerEnd },
      status: inner.limited
        ? 'limited'
        : inner.issues.length + unclosedIssue.length > 0
          ? 'partial'
          : 'complete',
      issues: [...inner.issues, ...unclosedIssue],
      nodes: inner.nodes,
    }),
    next,
  };
}

function findPowerShellSubexpressionEnd(source: string, start: number, end: number) {
  let depth = 1;
  let single = false;
  let double = false;
  for (let i = start; i < end; i++) {
    const char = source[i];
    if (char === '`') {
      i++;
      continue;
    }
    if (!double && char === "'") {
      if (single && source[i + 1] === "'") {
        i++;
        continue;
      }
      single = !single;
      continue;
    }
    if (!single && char === '"') {
      double = !double;
      continue;
    }
    if (single) continue;
    if (source.startsWith('$(', i)) {
      depth++;
      i++;
      continue;
    }
    if (!double && char === '(') depth++;
    if (char !== ')') continue;
    depth--;
    if (depth === 0) return i;
  }
  return -1;
}

function countProgramWords(program: CommandProgram): number {
  let count = 0;
  for (const node of program.nodes) {
    if (node.kind === 'group') count += countProgramWords(node.body);
    if (node.kind === 'command') {
      count += node.words.length;
      for (const nested of node.nested) count += countProgramWords(nested);
    }
  }
  return count;
}

function derivePowerShellWordParts(source: string, start: number, end: number): CommandWordPart[] {
  const collector = createCommandWordParts(source);
  let literalStart = start;
  let single = false;

  let i = start;
  while (i < end) {
    const char = source[i];
    if (char === '`') {
      i += 2;
      continue;
    }
    if (char === "'") {
      if (single && source[i + 1] === "'") {
        i += 2;
        continue;
      }
      single = !single;
      i++;
      continue;
    }
    if (single) {
      i++;
      continue;
    }
    if (source.startsWith('$(', i)) {
      const close = findPowerShellSubexpressionEnd(source, i + 2, end);
      const next = close === -1 ? end : close + 1;
      collector.push(literalStart, i, 'literal');
      collector.push(i, next, 'command-substitution');
      i = next;
      literalStart = next;
      continue;
    }
    if (char === '$' || (char === '@' && i === start)) {
      const next = readPowerShellVariableEnd(source, i + 1, end);
      collector.push(literalStart, i, 'literal');
      collector.push(i, next, 'variable');
      i = next;
      literalStart = next;
      continue;
    }
    i++;
  }
  collector.push(literalStart, end, 'literal');
  return collector.parts;
}

function readPowerShellVariableEnd(source: string, start: number, end: number): number {
  if (source[start] === '{') {
    const close = source.indexOf('}', start + 1);
    return close === -1 || close >= end ? end : close + 1;
  }
  let next = start;
  while (next < end && /[A-Za-z0-9_:?]/.test(source[next] ?? '')) next++;
  return next;
}

function depthLimitIssue(start: number, limit: number): CommandIssue {
  return {
    code: 'depth-limit',
    message: `command structure exceeds parser limit ${limit}`,
    span: { start, end: start },
  };
}

function scanSelectorCommands(source: string): { commands: string[][]; invalidComment: boolean } {
  const commands: string[][] = [];
  let words: string[] = [];
  let i = 0;
  let wordCount = 0;
  let invalidComment = false;
  const flush = () => {
    if (words.length > 0) commands.push(words);
    words = [];
  };
  while (i < source.length && i < 131_072 && wordCount < 16_384) {
    const char = source[i];
    if (char === '\r' || char === '\n') {
      flush();
      i += char === '\r' && source[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (/\s/.test(char ?? '')) {
      i++;
      continue;
    }
    const comment = readPowerShellComment(
      source,
      i,
      Math.min(source.length, SELECTOR_LIMITS.maxInputLength),
      SELECTOR_LIMITS.maxDepth,
    );
    if (comment) {
      invalidComment ||= !!comment.issue || comment.limited;
      i = comment.next;
      continue;
    }
    const operator = readOperator(source, i);
    if (operator) {
      flush();
      i += operator.length;
      continue;
    }
    if (char === '{' || char === '}') {
      flush();
      i++;
      continue;
    }
    const result = readPowerShellWord(
      source,
      i,
      Math.min(source.length, SELECTOR_LIMITS.maxInputLength),
      SELECTOR_LIMITS,
      0,
    );
    if (result.word.text) words.push(result.word.text);
    for (const nested of result.nested) commands.push(...selectorCommandsFromProgram(nested));
    wordCount++;
    i = result.next > i ? result.next : i + 1;
  }
  flush();
  return { commands, invalidComment };
}

function selectorCommandsFromProgram(program: CommandProgram): string[][] {
  return program.nodes.flatMap((node) => {
    if (node.kind === 'group') return selectorCommandsFromProgram(node.body);
    if (node.kind !== 'command') return [];
    return [
      node.words.map((word) => word.text),
      ...node.nested.flatMap(selectorCommandsFromProgram),
    ];
  });
}

function readOperator(source: string, index: number): string | null {
  for (const operator of ['&&', '||', ';', '|']) {
    if (source.startsWith(operator, index)) return operator;
  }
  return null;
}

function readPowerShellComment(
  source: string,
  start: number,
  end: number,
  maxDepth: number,
): { next: number; issue?: CommandIssue; limited: boolean } | null {
  if (source[start] === '#' && source[start + 1] !== '>') {
    let next = start + 1;
    while (next < end && source[next] !== '\r' && source[next] !== '\n') next++;
    return { next, limited: false };
  }
  if (!source.startsWith('<#', start)) return null;

  let depth = 1;
  let i = start + 2;
  while (i < end) {
    if (source.startsWith('<#', i)) {
      depth++;
      if (depth > maxDepth) {
        return {
          next: end,
          issue: {
            code: 'comment-depth-limit',
            message: `PowerShell block comment exceeds nesting limit ${maxDepth}`,
            span: { start, end: i + 2 },
          },
          limited: true,
        };
      }
      i += 2;
      continue;
    }
    if (source.startsWith('#>', i)) {
      depth--;
      i += 2;
      if (depth === 0) return { next: i, limited: false };
      continue;
    }
    i++;
  }
  return {
    next: end,
    issue: {
      code: 'unclosed-block-comment',
      message: 'PowerShell block comment is not closed',
      span: { start, end },
    },
    limited: false,
  };
}

function getPowerShellParseStatus(
  issues: readonly CommandIssue[],
  limited: boolean,
): CommandProgram['status'] {
  if (limited) return 'limited';
  if (issues.some((issue) => issue.code === 'unclosed-block-comment')) return 'invalid';
  return issues.length > 0 ? 'partial' : 'complete';
}

function connector(source: string, start: number, end: number): CommandNode {
  return Object.freeze({
    kind: 'connector',
    operator: source.slice(start, end),
    span: Object.freeze({ start, end }),
  });
}
