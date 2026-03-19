import { type ParseEntry, parse } from 'shell-quote';
import { MAX_STRIP_ITERATIONS, SHELL_OPERATORS } from '@/types';

// Proxy that preserves variable references as $VAR strings instead of expanding them
const ENV_PROXY = new Proxy(
  {},
  {
    get: (_, name) => `$${String(name)}`,
  },
);

const ARITHMETIC_SENTINEL = '__CC_SAFETY_NET_ARITH_SENTINEL__';
const BACKTICK_ATTACHED_SUFFIX_SENTINEL = '__CC_SAFETY_NET_BACKTICK_SUFFIX__';

export function splitShellCommands(command: string): string[][] {
  if (hasUnclosedQuotes(command)) {
    return [[command]];
  }
  const normalizedCommand = _stripAttachedIoNumbers(command.replace(/\n/g, ' ; '));
  const tokens = parse(normalizedCommand, ENV_PROXY);
  const segments: string[][] = [];
  let current: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i] as ParseEntry;
    if (isOperator(token)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      i++;
      continue;
    }

    if (_isProcessSubstitutionStart(tokens, i)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      const { innerSegments, endIndex } = extractProcessSubstitution(tokens, i);
      for (const seg of innerSegments) {
        segments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    if (_isRedirectOp(token)) {
      const { redirectTarget, advance } = _getRedirectTargetInfo(tokens, i);
      if (redirectTarget !== null) {
        _pushInlineSubstitutionSegments(segments, redirectTarget);
      }
      i += advance;
      continue;
    }

    if (_isCommandSubstitutionStart(tokens, i)) {
      const { innerSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      const attachedSuffix = _getBacktickAttachedSuffix(tokens[endIndex + 1]);
      const shouldKeepCurrent =
        attachedSuffix !== null && !_isRedirectOp(tokens[i - 1]) && !isOperatorToken(tokens[i - 1]);

      if (!shouldKeepCurrent && current.length > 0) {
        segments.push(current);
        current = [];
      }
      for (const seg of innerSegments) {
        segments.push(seg);
      }
      if (shouldKeepCurrent && attachedSuffix) {
        current.push(attachedSuffix);
      }
      i = endIndex + (attachedSuffix !== null ? 2 : 1);
      continue;
    }

    if (_isAttachedCommandSubstitutionStart(tokens, i)) {
      const tokenText = tokens[i];
      if (typeof tokenText === 'string') {
        const prefix = tokenText.slice(0, -1);
        if (prefix) {
          current.push(prefix);
        }
      }
      const { innerSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      for (const seg of innerSegments) {
        segments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    const tokenText = _getCommandTokenText(token);
    if (tokenText === null) {
      i++;
      continue;
    }

    _pushInlineSubstitutionSegments(segments, tokenText);
    current.push(tokenText);
    i++;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function extractInlineCommandSubstitutions(token: string): string[][] {
  const segments: string[][] = [];
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  while (i < token.length) {
    const char = token[i];
    if (!char) {
      break;
    }

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      i++;
      continue;
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      i++;
      continue;
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      i++;
      continue;
    }

    if (!inSingle && char === '$' && token[i + 1] === '(' && token[i + 2] !== '(') {
      const end = _findInlineCommandSubstitutionEnd(token, i + 2);
      if (end === -1) {
        break;
      }

      const innerCommand = token.slice(i + 2, end);
      if (innerCommand.trim()) {
        const innerSegments = splitShellCommands(innerCommand);
        for (const seg of innerSegments) {
          segments.push(seg);
        }
      }
      i = end + 1;
      continue;
    }

    i++;
  }

  return segments;
}

function isParenOpen(token: ParseEntry | undefined): boolean {
  return typeof token === 'object' && token !== null && 'op' in token && token.op === '(';
}

function isParenClose(token: ParseEntry | undefined): boolean {
  return typeof token === 'object' && token !== null && 'op' in token && token.op === ')';
}

function _getCommandTokenText(token: ParseEntry | undefined): string | null {
  if (typeof token === 'string') {
    return token;
  }

  if (
    token &&
    typeof token === 'object' &&
    'pattern' in token &&
    typeof token.pattern === 'string'
  ) {
    return token.pattern;
  }

  return null;
}

function extractCommandSubstitution(
  tokens: ParseEntry[],
  startIndex: number,
): { innerSegments: string[][]; endIndex: number } {
  if (tokens[startIndex] === ARITHMETIC_SENTINEL) {
    return _extractArithmeticSubstitution(tokens, startIndex);
  }

  const innerSegments: string[][] = [];
  let currentSegment: string[] = [];
  let depth = 1;
  let i = startIndex;

  while (i < tokens.length && depth > 0) {
    const token = tokens[i];

    if (isParenOpen(token)) {
      depth++;
      i++;
      continue;
    }

    if (isParenClose(token)) {
      depth--;
      if (depth === 0) break;
      i++;
      continue;
    }

    if (depth === 1 && token && isOperator(token)) {
      if (currentSegment.length > 0) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      i++;
      continue;
    }

    if (depth === 1 && _isProcessSubstitutionStart(tokens, i)) {
      if (currentSegment.length > 0) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      const { innerSegments: nestedSegments, endIndex } = extractProcessSubstitution(tokens, i);
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    if (depth === 1 && _isRedirectOp(token)) {
      const { redirectTarget, advance } = _getRedirectTargetInfo(tokens, i);
      if (redirectTarget !== null) {
        _pushInlineSubstitutionSegments(innerSegments, redirectTarget);
      }
      i += advance;
      continue;
    }

    if (depth === 1 && _isCommandSubstitutionStart(tokens, i)) {
      const { innerSegments: nestedSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      const attachedSuffix = _getBacktickAttachedSuffix(tokens[endIndex + 1]);
      const shouldKeepCurrent =
        attachedSuffix !== null && !_isRedirectOp(tokens[i - 1]) && !isOperatorToken(tokens[i - 1]);

      if (!shouldKeepCurrent && currentSegment.length > 0) {
        innerSegments.push(currentSegment);
        currentSegment = [];
      }
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      if (shouldKeepCurrent && attachedSuffix) {
        currentSegment.push(attachedSuffix);
      }
      i = endIndex + (attachedSuffix !== null ? 2 : 1);
      continue;
    }

    if (depth === 1 && _isAttachedCommandSubstitutionStart(tokens, i)) {
      if (typeof token === 'string') {
        const prefix = token.slice(0, -1);
        if (prefix) {
          currentSegment.push(prefix);
        }
      }
      const { innerSegments: nestedSegments, endIndex } = extractCommandSubstitution(
        tokens as ParseEntry[],
        i + 2,
      );
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    const tokenText = _getCommandTokenText(token);
    if (tokenText !== null) {
      currentSegment.push(tokenText);
    }
    i++;
  }

  if (currentSegment.length > 0) {
    innerSegments.push(currentSegment);
  }

  return { innerSegments, endIndex: i };
}

function _extractArithmeticSubstitution(
  tokens: readonly ParseEntry[],
  startIndex: number,
): { innerSegments: string[][]; endIndex: number } {
  const innerSegments: string[][] = [];
  let expression = '';
  let depth = 1;
  let i = startIndex + 1;

  while (i < tokens.length) {
    const token = tokens[i];

    if (_isCommandSubstitutionStart(tokens, i)) {
      if (expression) {
        innerSegments.push([expression]);
        expression = '';
      }
      const { innerSegments: nestedSegments, endIndex } = extractCommandSubstitution(
        tokens as ParseEntry[],
        i + 2,
      );
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    if (
      typeof token === 'string' &&
      token !== '$' &&
      token.endsWith('$') &&
      isParenOpen(tokens[i + 1])
    ) {
      expression += token.slice(0, -1);
      if (expression) {
        innerSegments.push([expression]);
        expression = '';
      }
      const { innerSegments: nestedSegments, endIndex } = extractCommandSubstitution(
        tokens as ParseEntry[],
        i + 2,
      );
      for (const seg of nestedSegments) {
        innerSegments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    if (isParenOpen(token)) {
      depth++;
      expression += '(';
      i++;
      continue;
    }

    if (isParenClose(token)) {
      depth--;
      if (depth === 0) {
        return {
          innerSegments: expression ? [...innerSegments, [expression]] : innerSegments,
          endIndex: i,
        };
      }
      expression += ')';
      i++;
      continue;
    }

    if (typeof token === 'string') {
      _pushInlineSubstitutionSegments(innerSegments, token);
      expression += token;
      i++;
      continue;
    }

    if (token && typeof token === 'object') {
      if ('pattern' in token && typeof token.pattern === 'string') {
        expression += token.pattern;
        i++;
        continue;
      }

      if ('op' in token) {
        expression += String(token.op);
      }
    }
    i++;
  }

  return {
    innerSegments: expression ? [...innerSegments, [expression]] : innerSegments,
    endIndex: i,
  };
}

function _pushInlineSubstitutionSegments(segments: string[][], token: string): void {
  const inlineSegments = extractInlineCommandSubstitutions(token);
  for (const seg of inlineSegments) {
    segments.push(seg);
  }
}

function hasUnclosedQuotes(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    }
  }

  return inSingle || inDouble;
}

function _stripAttachedIoNumbers(command: string): string {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let atTokenBoundary = true;
  let arithmeticParenDepth = 0;

  for (let i = 0; i < command.length; ) {
    const char = command[i];
    if (!char) {
      break;
    }

    if (escaped) {
      result += char;
      escaped = false;
      atTokenBoundary = false;
      i++;
      continue;
    }

    if (!inSingle && char === '\\') {
      result += char;
      escaped = true;
      i++;
      continue;
    }

    if (!inDouble && char === "'") {
      result += char;
      inSingle = !inSingle;
      atTokenBoundary = false;
      i++;
      continue;
    }

    if (!inSingle && char === '"') {
      result += char;
      inDouble = !inDouble;
      atTokenBoundary = false;
      i++;
      continue;
    }

    if (!inSingle && char === '`') {
      const endIndex = _findBacktickEnd(command, i + 1);
      if (endIndex === -1) {
        result += char;
        atTokenBoundary = false;
        i++;
        continue;
      }

      result += `$(${command.slice(i + 1, endIndex)})`;
      if (
        atTokenBoundary &&
        command[endIndex + 1] &&
        _isPathLikeBacktickSuffix(command[endIndex + 1] as string)
      ) {
        result += BACKTICK_ATTACHED_SUFFIX_SENTINEL;
      }
      atTokenBoundary = false;
      i = endIndex + 1;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (arithmeticParenDepth === 0 && command.startsWith('$((', i)) {
        result += `$( ${ARITHMETIC_SENTINEL} `;
        arithmeticParenDepth = 1;
        atTokenBoundary = false;
        i += 3;
        continue;
      }

      if (arithmeticParenDepth > 0) {
        if (char === '(') {
          arithmeticParenDepth++;
          result += char;
        } else if (char === ')') {
          arithmeticParenDepth--;
          if (arithmeticParenDepth === 0) {
            result += ')';
            if (command[i + 1] === ')') {
              i += 2;
            } else {
              i++;
            }
            atTokenBoundary = false;
            continue;
          }
          result += char;
        } else {
          result += char;
        }
        atTokenBoundary = false;
        i++;
        continue;
      }

      if (_isWhitespaceChar(char)) {
        result += char;
        atTokenBoundary = true;
        i++;
        continue;
      }

      if (atTokenBoundary && _isAsciiDigit(char)) {
        let end = i + 1;
        while (end < command.length) {
          const nextChar = command[end];
          if (!nextChar || !_isAsciiDigit(nextChar)) {
            break;
          }
          end++;
        }

        const redirectOpLength = _getRawRedirectOpLength(command, end);
        if (redirectOpLength > 0) {
          i = end;
          atTokenBoundary = true;
          continue;
        }
      }
    }

    result += char;
    atTokenBoundary = _isShellTokenBoundaryChar(char);
    i++;
  }

  return result;
}

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function parseEnvAssignment(token: string): { name: string; value: string } | null {
  if (!ENV_ASSIGNMENT_RE.test(token)) {
    return null;
  }
  const eqIdx = token.indexOf('=');
  return { name: token.slice(0, eqIdx), value: token.slice(eqIdx + 1) };
}

export interface EnvStrippingResult {
  tokens: string[];
  envAssignments: Map<string, string>;
}

export function stripEnvAssignmentsWithInfo(tokens: string[]): EnvStrippingResult {
  const envAssignments = new Map<string, string>();
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      break;
    }
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}

export interface WrapperStrippingResult {
  tokens: string[];
  envAssignments: Map<string, string>;
}

export function stripWrappers(tokens: string[]): string[] {
  return stripWrappersWithInfo(tokens).tokens;
}

export function stripWrappersWithInfo(tokens: string[]): WrapperStrippingResult {
  let result = [...tokens];
  const allEnvAssignments = new Map<string, string>();

  for (let iteration = 0; iteration < MAX_STRIP_ITERATIONS; iteration++) {
    const before = result.join(' ');

    const { tokens: strippedTokens, envAssignments } = stripEnvAssignmentsWithInfo(result);
    for (const [k, v] of envAssignments) {
      allEnvAssignments.set(k, v);
    }
    result = strippedTokens;
    if (result.length === 0) break;

    while (
      result.length > 0 &&
      result[0]?.includes('=') &&
      !ENV_ASSIGNMENT_RE.test(result[0] ?? '')
    ) {
      // Conservative parsing: only strict NAME=value is treated as an env assignment.
      // Other leading tokens that contain '=' (e.g. NAME+=value) are dropped to reach
      // the actual executable token.
      result = result.slice(1);
    }
    if (result.length === 0) break;

    const head = result[0]?.toLowerCase();

    // Guard: unknown wrapper type, exit loop
    if (head !== 'sudo' && head !== 'env' && head !== 'command') {
      break;
    }

    if (head === 'sudo') {
      result = stripSudo(result);
    }
    if (head === 'env') {
      const envResult = stripEnvWithInfo(result);
      result = envResult.tokens;
      for (const [k, v] of envResult.envAssignments) {
        allEnvAssignments.set(k, v);
      }
    }
    if (head === 'command') {
      result = stripCommand(result);
    }

    if (result.join(' ') === before) break;
  }

  const { tokens: finalTokens, envAssignments: finalAssignments } =
    stripEnvAssignmentsWithInfo(result);
  for (const [k, v] of finalAssignments) {
    allEnvAssignments.set(k, v);
  }

  return { tokens: finalTokens, envAssignments: allEnvAssignments };
}

const SUDO_OPTS_WITH_VALUE = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U']);

function stripSudo(tokens: string[]): string[] {
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      return tokens.slice(i + 1);
    }

    // Guard: not an option, exit loop
    if (!token.startsWith('-')) {
      break;
    }

    if (SUDO_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    i++;
  }
  return tokens.slice(i);
}

const ENV_OPTS_NO_VALUE = new Set(['-i', '-0', '--null']);
const ENV_OPTS_WITH_VALUE = new Set([
  '-u',
  '--unset',
  '-C',
  '--chdir',
  '-S',
  '--split-string',
  '-P',
]);

function stripEnvWithInfo(tokens: string[]): EnvStrippingResult {
  const envAssignments = new Map<string, string>();
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      return { tokens: tokens.slice(i + 1), envAssignments };
    }

    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }

    if (ENV_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    if (token.startsWith('-u=') || token.startsWith('--unset=')) {
      i++;
      continue;
    }

    if (token.startsWith('-C=') || token.startsWith('--chdir=')) {
      i++;
      continue;
    }

    if (token.startsWith('-P')) {
      i++;
      continue;
    }

    if (token.startsWith('-')) {
      i++;
      continue;
    }

    // Not an option - try to parse as env assignment
    const assignment = parseEnvAssignment(token);
    if (!assignment) {
      break;
    }
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { tokens: tokens.slice(i), envAssignments };
}

function stripCommand(tokens: string[]): string[] {
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '-p' || token === '-v' || token === '-V') {
      i++;
      continue;
    }

    if (token === '--') {
      return tokens.slice(i + 1);
    }

    // Check for combined short opts like -pv
    if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
      const chars = token.slice(1);
      if (!/^[pvV]+$/.test(chars)) {
        break;
      }
      i++;
      continue;
    }

    break;
  }
  return tokens.slice(i);
}

export function extractShortOpts(tokens: string[]): Set<string> {
  const opts = new Set<string>();
  let pastDoubleDash = false;

  for (const token of tokens) {
    if (token === '--') {
      pastDoubleDash = true;
      continue;
    }
    if (pastDoubleDash) continue;

    if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
      for (let i = 1; i < token.length; i++) {
        const char = token[i];
        if (!char || !/[a-zA-Z]/.test(char)) {
          break;
        }
        opts.add(`-${char}`);
      }
    }
  }

  return opts;
}

export function normalizeCommandToken(token: string): string {
  return getBasename(token).toLowerCase();
}

export function getBasename(token: string): string {
  return token.includes('/') ? (token.split('/').pop() ?? token) : token;
}

function isOperator(token: ParseEntry): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    'op' in token &&
    SHELL_OPERATORS.has(token.op as string)
  );
}

function isOperatorToken(token: ParseEntry | undefined): boolean {
  return token !== undefined && isOperator(token);
}

const REDIRECT_OPS = new Set(['>', '>>', '<', '>&', '<&', '>|']);
const RAW_REDIRECT_OPS = ['>>', '>&', '<&', '>|', '>', '<'];

function _isRedirectOp(token: ParseEntry | undefined): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    'op' in token &&
    REDIRECT_OPS.has(token.op as string)
  );
}

function _isCommandSubstitutionStart(tokens: readonly ParseEntry[], index: number): boolean {
  return tokens[index] === '$' && isParenOpen(tokens[index + 1]);
}

function _isAttachedCommandSubstitutionStart(
  tokens: readonly ParseEntry[],
  index: number,
): boolean {
  const token = tokens[index];
  return (
    typeof token === 'string' &&
    token !== '$' &&
    token.endsWith('$') &&
    isParenOpen(tokens[index + 1])
  );
}

function _getBacktickAttachedSuffix(token: ParseEntry | undefined): string | null {
  return typeof token === 'string' && token.startsWith(BACKTICK_ATTACHED_SUFFIX_SENTINEL)
    ? token.slice(BACKTICK_ATTACHED_SUFFIX_SENTINEL.length)
    : null;
}

function _isProcessSubstitutionStart(tokens: readonly ParseEntry[], index: number): boolean {
  const token = tokens[index];
  return (
    typeof token === 'object' &&
    token !== null &&
    'op' in token &&
    (token.op === '<(' || (token.op === '>' && isParenOpen(tokens[index + 1])))
  );
}

function extractProcessSubstitution(
  tokens: readonly ParseEntry[],
  startIndex: number,
): { innerSegments: string[][]; endIndex: number } {
  const token = tokens[startIndex];
  if (typeof token === 'object' && token !== null && 'op' in token && token.op === '<(') {
    return extractCommandSubstitution(tokens as ParseEntry[], startIndex + 1);
  }

  if (_isProcessSubstitutionStart(tokens, startIndex)) {
    return extractCommandSubstitution(tokens as ParseEntry[], startIndex + 2);
  }

  return { innerSegments: [], endIndex: startIndex };
}

function _getRedirectTargetInfo(
  tokens: readonly ParseEntry[],
  index: number,
): { redirectTarget: string | null; advance: number } {
  if (
    _isCommandSubstitutionStart(tokens, index + 1) ||
    _isProcessSubstitutionStart(tokens, index + 1)
  ) {
    return { redirectTarget: null, advance: 1 };
  }

  const firstTarget = tokens[index + 1];
  if (typeof firstTarget !== 'string') {
    const isGlobTarget =
      firstTarget &&
      typeof firstTarget === 'object' &&
      'pattern' in firstTarget &&
      typeof firstTarget.pattern === 'string';
    return { redirectTarget: null, advance: isGlobTarget ? 2 : 1 };
  }

  let redirectTarget = firstTarget;
  let nextIndex = index + 2;

  if (firstTarget.endsWith('$') && isParenOpen(tokens[nextIndex])) {
    const { text, consumed } = _collectParenthesizedTokens(tokens, nextIndex);
    if (consumed > 0) {
      redirectTarget += text;
      nextIndex += consumed;
    }
  }

  return {
    redirectTarget,
    advance: nextIndex - index,
  };
}

function _findInlineCommandSubstitutionEnd(token: string, startIndex: number): number {
  let depth = 1;
  let i = startIndex;
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  while (i < token.length) {
    const char = token[i];
    if (!char) {
      break;
    }

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      i++;
      continue;
    }

    if (!inDouble && char === "'") {
      inSingle = !inSingle;
      i++;
      continue;
    }

    if (!inSingle && char === '"') {
      inDouble = !inDouble;
      i++;
      continue;
    }

    if (!inSingle && !inDouble) {
      if (char === '(') {
        depth++;
      } else if (char === ')') {
        depth--;
        if (depth === 0) {
          return i;
        }
      }
    }

    i++;
  }

  return -1;
}

function _findBacktickEnd(command: string, startIndex: number): number {
  let escaped = false;

  for (let i = startIndex; i < command.length; i++) {
    const char = command[i];
    if (!char) {
      break;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '`') {
      return i;
    }
  }

  return -1;
}

function _collectParenthesizedTokens(
  tokens: readonly ParseEntry[],
  startIndex: number,
): { text: string; consumed: number } {
  if (!isParenOpen(tokens[startIndex])) {
    return { text: '', consumed: 0 };
  }

  const parts: string[] = [];
  let depth = 0;
  let i = startIndex;

  while (i < tokens.length) {
    const token = tokens[i];
    if (isParenOpen(token)) {
      depth++;
    } else if (isParenClose(token)) {
      depth--;
    }

    const piece = _stringifyParseEntry(token);
    if (piece) {
      parts.push(piece);
    }

    i++;
    if (depth === 0) {
      break;
    }
  }

  return { text: parts.join(' '), consumed: i - startIndex };
}

function _stringifyParseEntry(token: ParseEntry | undefined): string {
  if (typeof token === 'string') {
    return token;
  }

  if (token && typeof token === 'object') {
    if ('pattern' in token && typeof token.pattern === 'string') {
      return token.pattern;
    }

    if ('op' in token) {
      return String(token.op);
    }
  }

  return '';
}

function _getRawRedirectOpLength(command: string, index: number): number {
  for (const op of RAW_REDIRECT_OPS) {
    if (command.startsWith(op, index)) {
      return op.length;
    }
  }

  return 0;
}

function _isWhitespaceChar(char: string): boolean {
  return /\s/.test(char);
}

function _isAsciiDigit(char: string): boolean {
  return char >= '0' && char <= '9';
}

function _isPathLikeBacktickSuffix(char: string): boolean {
  return char === '/' || char === '.';
}

function _isShellTokenBoundaryChar(char: string): boolean {
  return _isWhitespaceChar(char) || ';|&()<>'.includes(char);
}
