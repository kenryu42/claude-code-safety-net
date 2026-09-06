import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import { chargeNativeLinearPass } from './text-scanner';

const AWK_SOURCE_VALUE_OPTIONS = new Set(['-e', '--source']);
const AWK_DATA_VALUE_OPTIONS = new Set(['-F', '-v', '--assign', '--field-separator']);
const AWK_FILE_VALUE_OPTIONS = new Set(['-f', '--file']);
const AWK_REGEX_PREFIX_KEYWORDS = new Set(['print', 'printf', 'return']);

/** @internal */
export type AwkExecutableSourceKind = 'inline-code' | 'main-program' | 'program-file';

export interface AwkExecutableSource {
  readonly tokenIndex: number;
  readonly kind: AwkExecutableSourceKind;
  readonly value: string;
}

export interface AwkExecutableSourceSelector {
  readonly selector: string;
  readonly kind: Exclude<AwkExecutableSourceKind, 'main-program'>;
  readonly valueForm: 'attached-or-separate' | 'equals-or-separate';
}

export interface AwkArgvMetadata {
  readonly sources: readonly AwkExecutableSource[];
  readonly optionsOpen: boolean;
}

export const AWK_EXECUTABLE_SOURCE_SELECTORS: readonly AwkExecutableSourceSelector[] = [
  { selector: '-e', kind: 'inline-code', valueForm: 'attached-or-separate' },
  { selector: '--source', kind: 'inline-code', valueForm: 'equals-or-separate' },
  { selector: '-f', kind: 'program-file', valueForm: 'attached-or-separate' },
  { selector: '--file', kind: 'program-file', valueForm: 'equals-or-separate' },
];

/** @internal */
export const REASON_AWK_SYSTEM_DYNAMIC =
  'Detected awk system(), pipe, or getline command with dynamic command that cannot be safely analyzed. Use a literal command or process the data without system(), pipes, or getline.';

export function analyzeAwkSystemCallMatch(
  tokens: readonly string[],
  analyzeNested: (command: string) => DestructiveCommandRuleMatch | null,
  scanWork?: { units: number },
): DestructiveCommandRuleMatch | null {
  let dynamic = false;

  for (const source of extractAwkSourceArgs(tokens)) {
    const commands = extractAwkExternalCommands(source, scanWork);
    if (!commands) continue;

    for (const command of commands.commands) {
      const result = analyzeNested(command);
      if (result) return result;
      // Fail closed when nested analysis cannot prove the recovered command text is fixed.
      // xargs/parallel replacement tokens like "{}" are literal to awk but dynamic at runtime.
      if (command.includes('{}') || /[$`]/.test(command)) dynamic = true;
    }
    dynamic ||= commands.dynamic;
  }

  return dynamic ? destructiveCommandMatch('awk.system-dynamic', REASON_AWK_SYSTEM_DYNAMIC) : null;
}

export function parseAwkArgv(tokens: readonly string[]): AwkArgvMetadata {
  const sources: AwkExecutableSource[] = [];
  let hasExplicitSource = false;
  let hasFileSource = false;
  let options = true;
  let valid = true;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;

    if (options && token === '--') {
      options = false;
      continue;
    }

    if (options && AWK_SOURCE_VALUE_OPTIONS.has(token)) {
      hasExplicitSource = true;
      const source = tokens[i + 1];
      valid &&= source !== undefined;
      if (source !== undefined) {
        sources.push({ tokenIndex: i + 1, kind: 'inline-code', value: source });
      }
      i++;
      continue;
    }

    if (options && token.startsWith('--source=')) {
      hasExplicitSource = true;
      sources.push({
        tokenIndex: i,
        kind: 'inline-code',
        value: token.slice('--source='.length),
      });
      continue;
    }

    if (options && token.startsWith('-e') && token.length > 2) {
      hasExplicitSource = true;
      sources.push({ tokenIndex: i, kind: 'inline-code', value: token.slice(2) });
      continue;
    }

    if (options && (AWK_DATA_VALUE_OPTIONS.has(token) || AWK_FILE_VALUE_OPTIONS.has(token))) {
      const source = tokens[i + 1];
      valid &&= source !== undefined;
      if (AWK_FILE_VALUE_OPTIONS.has(token)) {
        hasFileSource = true;
        if (source !== undefined) {
          sources.push({ tokenIndex: i + 1, kind: 'program-file', value: source });
        }
      }
      i++;
      continue;
    }

    if (
      options &&
      (token.startsWith('-F') || (token.startsWith('-v') && token.slice(2).includes('=')))
    ) {
      continue;
    }

    if (options && token.startsWith('-f') && token.length > 2) {
      hasFileSource = true;
      sources.push({ tokenIndex: i, kind: 'program-file', value: token.slice(2) });
      continue;
    }

    if (options && (token.startsWith('--assign=') || token.startsWith('--field-separator='))) {
      continue;
    }

    if (options && token.startsWith('--file=')) {
      hasFileSource = true;
      sources.push({
        tokenIndex: i,
        kind: 'program-file',
        value: token.slice('--file='.length),
      });
      continue;
    }

    if (options && token.startsWith('-') && token !== '-') continue;
    options = false;

    if (!hasExplicitSource && !hasFileSource) {
      sources.push({ tokenIndex: i, kind: 'main-program', value: token });
    }
    return { sources, optionsOpen: false };
  }

  return { sources: valid ? sources : [], optionsOpen: options && valid };
}

export function extractAwkExecutableSources(
  tokens: readonly string[],
): readonly AwkExecutableSource[] {
  return parseAwkArgv(tokens).sources;
}

function extractAwkSourceArgs(tokens: readonly string[]): string[] {
  return extractAwkExecutableSources(tokens)
    .filter((source) => source.kind !== 'program-file')
    .map((source) => source.value);
}

function extractAwkExternalCommands(
  code: string,
  scanWork?: { units: number },
): { dynamic: boolean; commands: string[] } | null {
  chargeNativeLinearPass(scanWork, code);
  const systemCommands = code.includes('system') ? extractAwkSystemCommands(code, scanWork) : null;
  const pipeCommands = extractAwkPipeCommands(code, scanWork);
  if (!systemCommands && !pipeCommands) return null;

  return {
    dynamic: !!systemCommands?.dynamic || !!pipeCommands?.dynamic,
    commands: [...(systemCommands?.commands ?? []), ...(pipeCommands?.commands ?? [])],
  };
}

export function extractAwkSystemCommands(
  code: string,
  scanWork?: { units: number },
): { dynamic: boolean; commands: string[] } | null {
  chargeNativeLinearPass(scanWork, code);
  const commands: string[] = [];
  let sawSystem = false;
  let dynamic = false;
  let searchIndex = 0;

  while (searchIndex < code.length) {
    const char = code[searchIndex];
    if (char === '"' || char === "'") {
      searchIndex = readAwkStringLiteral(code, searchIndex, char)?.endIndex ?? searchIndex + 1;
      continue;
    }
    if (char === '#') {
      searchIndex = findAwkLineEnd(code, searchIndex + 1);
      continue;
    }
    if (char === '/' && isLikelyAwkRegexStart(code, searchIndex)) {
      searchIndex = findAwkRegexEnd(code, searchIndex + 1) ?? searchIndex + 1;
      continue;
    }
    if (!code.startsWith('system', searchIndex)) {
      searchIndex++;
      continue;
    }

    const systemIndex = searchIndex;
    searchIndex += 'system'.length;

    if (isAwkIdentifierChar(code[systemIndex - 1]) || isAwkIdentifierChar(code[searchIndex])) {
      continue;
    }

    let i = skipAwkWhitespace(code, searchIndex);
    if (code[i] !== '(') continue;
    i = skipAwkWhitespace(code, i + 1);

    const quote = code[i];
    if (quote !== '"' && quote !== "'") {
      sawSystem = true;
      dynamic = true;
      continue;
    }

    const parsed = readAwkStringLiteral(code, i, quote);
    if (!parsed) {
      sawSystem = true;
      dynamic = true;
      continue;
    }

    i = skipAwkWhitespace(code, parsed.endIndex);
    sawSystem = true;
    if (code[i] !== ')') {
      dynamic = true;
      searchIndex = parsed.endIndex;
      continue;
    }
    commands.push(parsed.value);
    searchIndex = i + 1;
  }

  if (!sawSystem) return null;
  return { dynamic, commands };
}

function extractAwkPipeCommands(
  code: string,
  scanWork?: { units: number },
): { dynamic: boolean; commands: string[] } | null {
  chargeNativeLinearPass(scanWork, code);
  const commands: string[] = [];
  let dynamic = false;
  let sawPipeCommand = false;
  let i = 0;
  let statementStart = 0;
  let printKeywordIndex: number | null = null;
  let leadingString:
    | ({ startIndex: number } & NonNullable<ReturnType<typeof readAwkStringAt>>)
    | null = null;
  let lastSignificantEnd = 0;

  while (i < code.length) {
    const char = code[i];
    if (!char) break;

    if (char === '"' || char === "'") {
      const parsed = readAwkStringLiteral(code, i, char);
      if (parsed && lastSignificantEnd === statementStart) {
        leadingString = { ...parsed, startIndex: i };
      }
      lastSignificantEnd = parsed?.endIndex ?? i + 1;
      i = parsed?.endIndex ?? i + 1;
      continue;
    }

    if (char === '#') {
      i = findAwkLineEnd(code, i + 1);
      statementStart = i;
      printKeywordIndex = null;
      leadingString = null;
      lastSignificantEnd = i;
      continue;
    }

    if (char === '/' && isLikelyAwkRegexStart(code, i)) {
      const regexEnd = findAwkRegexEnd(code, i + 1);
      lastSignificantEnd = regexEnd ?? i + 1;
      i = regexEnd ?? i + 1;
      continue;
    }

    if (';\n{}'.includes(char)) {
      i++;
      statementStart = i;
      printKeywordIndex = null;
      leadingString = null;
      lastSignificantEnd = i;
      continue;
    }

    if (
      printKeywordIndex === null &&
      (startsAwkKeyword(code, i, 'print') || startsAwkKeyword(code, i, 'printf'))
    ) {
      printKeywordIndex = i;
    }

    if (char !== '|' || code[i - 1] === '|' || code[i + 1] === '|') {
      if (!/\s/.test(char)) lastSignificantEnd = i + 1;
      i++;
      continue;
    }

    const operatorEnd = code[i + 1] === '&' ? i + 2 : i + 1;
    const afterPipe = skipAwkWhitespace(code, operatorEnd);
    if (startsAwkKeyword(code, afterPipe, 'getline')) {
      sawPipeCommand = true;
      const command = readAwkStringBeforePipe(statementStart, leadingString, lastSignificantEnd);
      dynamic ||= command === null;
      if (command !== null) {
        commands.push(command);
      }
      lastSignificantEnd = operatorEnd;
      i = operatorEnd;
      continue;
    }

    if (isAwkPrintPipe(statementStart, printKeywordIndex)) {
      sawPipeCommand = true;
      const parsed = readAwkStringAt(code, afterPipe);
      if (!parsed) {
        dynamic = true;
        lastSignificantEnd = operatorEnd;
        i = operatorEnd;
        continue;
      }
      if (!isAwkExpressionEnd(code, parsed.endIndex)) {
        dynamic = true;
        lastSignificantEnd = parsed.endIndex;
        i = parsed.endIndex;
        continue;
      }
      commands.push(parsed.value);
      lastSignificantEnd = parsed.endIndex;
      i = parsed.endIndex;
      continue;
    }

    lastSignificantEnd = operatorEnd;
    i++;
  }

  if (!sawPipeCommand) return null;
  return { dynamic, commands };
}

function isAwkIdentifierChar(char: string | undefined): boolean {
  return !!char && /[A-Za-z0-9_]/.test(char);
}

function skipAwkWhitespace(code: string, index: number): number {
  let i = index;
  while (/\s/.test(code[i] ?? '')) {
    i++;
  }
  return i;
}

function isAwkExpressionEnd(code: string, index: number): boolean {
  let i = index;
  while (/[\t\f\v\r ]/.test(code[i] ?? '')) {
    i++;
  }
  const char = code[i];
  return !char || ';\n}#'.includes(char);
}

function readAwkStringLiteral(
  code: string,
  startIndex: number,
  quote: '"' | "'",
): { value: string; endIndex: number } | null {
  let value = '';
  let escaped = false;

  for (let i = startIndex + 1; i < code.length; i++) {
    const char = code[i];
    if (!char) break;

    if (escaped) {
      const decoded = decodeAwkEscape(code, i);
      if (!decoded) return null;
      value += decoded.value;
      i = decoded.endIndex;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === quote) {
      return { value, endIndex: i + 1 };
    }

    value += char;
  }

  return null;
}

function readAwkStringAt(code: string, index: number): { value: string; endIndex: number } | null {
  const quote = code[index];
  if (quote !== '"' && quote !== "'") return null;
  return readAwkStringLiteral(code, index, quote);
}

function readAwkStringBeforePipe(
  statementStart: number,
  leadingString: ({ startIndex: number } & NonNullable<ReturnType<typeof readAwkStringAt>>) | null,
  lastSignificantEnd: number,
): string | null {
  if (!leadingString) return null;
  return leadingString.startIndex >= statementStart && leadingString.endIndex === lastSignificantEnd
    ? leadingString.value
    : null;
}

function decodeAwkEscape(code: string, index: number): { value: string; endIndex: number } | null {
  const char = code[index];
  if (!char) return null;

  if (char === 'x') {
    const hex = code.slice(index + 1, index + 3);
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), endIndex: index + 2 };
  }

  if (/[0-7]/.test(char)) {
    const match = /^[0-7]{1,3}/.exec(code.slice(index));
    if (!match) return null;
    return {
      value: String.fromCharCode(Number.parseInt(match[0], 8)),
      endIndex: index + match[0].length - 1,
    };
  }

  const simpleEscapes: Record<string, string> = {
    a: '\x07',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
    v: '\v',
  };
  return { value: simpleEscapes[char] ?? char, endIndex: index };
}

function startsAwkKeyword(code: string, index: number, keyword: string): boolean {
  return (
    code.startsWith(keyword, index) &&
    !isAwkIdentifierChar(code[index - 1]) &&
    !isAwkIdentifierChar(code[index + keyword.length])
  );
}

function isAwkPrintPipe(statementStart: number, printKeywordIndex: number | null): boolean {
  return printKeywordIndex !== null && printKeywordIndex >= statementStart;
}

function findAwkLineEnd(code: string, index: number): number {
  const lineEnd = code.indexOf('\n', index);
  return lineEnd === -1 ? code.length : lineEnd + 1;
}

function isLikelyAwkRegexStart(code: string, index: number): boolean {
  const previousIndex = findPreviousAwkNonWhitespace(code, index);
  if (previousIndex === -1) return true;
  if ('{([,;!~='.includes(code[previousIndex] ?? '')) return true;

  let wordStart = previousIndex;
  while (isAwkIdentifierChar(code[wordStart - 1])) wordStart--;
  return AWK_REGEX_PREFIX_KEYWORDS.has(code.slice(wordStart, previousIndex + 1));
}

function findPreviousAwkNonWhitespace(code: string, index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (!/\s/.test(code[i] ?? '')) return i;
  }
  return -1;
}

function findAwkRegexEnd(code: string, index: number): number | null {
  let escaped = false;

  for (let i = index; i < code.length; i++) {
    const char = code[i];
    if (!char) break;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '/') {
      return i + 1;
    }
  }
  return null;
}
