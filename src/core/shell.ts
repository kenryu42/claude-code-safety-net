import { type ParseEntry, parse } from 'shell-quote';
import { MAX_STRIP_ITERATIONS, SHELL_OPERATORS } from '@/types';

// Proxy that preserves variable references as $VAR strings instead of expanding them
const ENV_PROXY = new Proxy(
  {},
  {
    get: (_, name) => `$${String(name)}`,
  },
);

export function splitShellCommands(command: string): string[][] {
  if (hasUnclosedQuotes(command)) {
    return [[command]];
  }
  const normalizedCommand = command.replace(/\n/g, ' ; ');
  const tokens = parse(normalizedCommand, ENV_PROXY);
  const segments: string[][] = [];
  let current: string[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) {
      i++;
      continue;
    }

    if (isOperator(token)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      i++;
      continue;
    }

    if (typeof token !== 'string') {
      i++;
      continue;
    }

    // Handle string tokens
    const nextToken = tokens[i + 1];
    if (token === '$' && nextToken && isParenOpen(nextToken)) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      const { innerSegments, endIndex } = extractCommandSubstitution(tokens, i + 2);
      for (const seg of innerSegments) {
        segments.push(seg);
      }
      i = endIndex + 1;
      continue;
    }

    const backtickSegments = extractBacktickSubstitutions(token);
    if (backtickSegments.length > 0) {
      for (const seg of backtickSegments) {
        segments.push(seg);
      }
    }
    current.push(token);
    i++;
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

function extractBacktickSubstitutions(token: string): string[][] {
  const segments: string[][] = [];
  let i = 0;

  while (i < token.length) {
    const backtickStart = token.indexOf('`', i);
    if (backtickStart === -1) break;

    const backtickEnd = token.indexOf('`', backtickStart + 1);
    if (backtickEnd === -1) break;

    const innerCommand = token.slice(backtickStart + 1, backtickEnd);
    if (innerCommand.trim()) {
      const innerSegments = splitShellCommands(innerCommand);
      for (const seg of innerSegments) {
        segments.push(seg);
      }
    }
    i = backtickEnd + 1;
  }

  return segments;
}

function isParenOpen(token: ParseEntry | undefined): boolean {
  return typeof token === 'object' && token !== null && 'op' in token && token.op === '(';
}

function isParenClose(token: ParseEntry | undefined): boolean {
  return typeof token === 'object' && token !== null && 'op' in token && token.op === ')';
}

function extractCommandSubstitution(
  tokens: ParseEntry[],
  startIndex: number,
): { innerSegments: string[][]; endIndex: number } {
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

    if (typeof token === 'string') {
      currentSegment.push(token);
    }
    i++;
  }

  if (currentSegment.length > 0) {
    innerSegments.push(currentSegment);
  }

  return { innerSegments, endIndex: i };
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

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

function parseEnvAssignment(token: string): { name: string; value: string } | null {
  if (!ENV_ASSIGNMENT_RE.test(token)) {
    return null;
  }
  const eqIdx = token.indexOf('=');
  if (eqIdx < 0) {
    return null;
  }
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
