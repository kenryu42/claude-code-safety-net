import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';
import { AnalysisLimit, type Budget, LIMITS } from '../budget';
import type { Environment, PathResolver } from '../environment';

// The cap bounds walk cost, not trust: a path whose nearest existing ancestor is this far up
// names no existing file, so stopping at the lexical reconstruction hides nothing.
const MAX_MISSING_SUFFIX_COMPONENTS = 256;

const SUPPORTED_PATH_ENV_NAMES = new Set([
  'CC_SAFETY_NET_HOME',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'COPILOT_HOME',
  'GEMINI_CLI_HOME',
  'GROK_HOME',
  'HOME',
  'KIMI_CODE_HOME',
  'KIMI_SHARE_DIR',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'PI_CODING_AGENT_DIR',
  'ProgramData',
  'TMPDIR',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
]);

export function normalizeMsysDrivePath(
  target: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return target;
  return target.replace(/^\/([A-Za-z])(?:\/|$)/, '$1:/');
}

export function isUnsupportedWindowsNamespacePath(
  target: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== 'win32') return false;
  return (target[0] === '/' || target[0] === '\\') && (target[1] === '/' || target[1] === '\\');
}

export function expandSupportedPathEnvironmentVariables(
  value: string,
  environment: Environment,
): string {
  return expandSupportedPathEnvironmentVariablesAtDepth(value, 0, environment);
}

function expandSupportedPathEnvironmentVariablesAtDepth(
  value: string,
  depth: number,
  environment: Environment,
): string {
  let expanded = '';
  let index = 0;
  while (index < value.length) {
    if (value[index] !== '$') {
      expanded += value[index];
      index++;
      continue;
    }

    if (value[index + 1] === '{') {
      const name = readPathEnvironmentName(value, index + 2);
      const end = findParameterExpansionEnd(value, index, depth);
      if (end === null) {
        if (SUPPORTED_PATH_ENV_NAMES.has(name)) throw new AnalysisLimit('pathEnvironmentExpansion');
        expanded += value.slice(index);
        break;
      }
      const match = value.slice(index, end + 1);
      expanded += expandBracedPathEnvironmentVariable(match, depth, environment);
      index = end + 1;
      continue;
    }

    const name = readPathEnvironmentName(value, index + 1);
    if (!name) {
      expanded += '$';
      index++;
      continue;
    }
    expanded += getSupportedPathEnvironmentValue(name, environment) ?? `$${name}`;
    index += name.length + 1;
  }
  return expanded;
}

function findParameterExpansionEnd(value: string, start: number, depth: number): number | null {
  let nesting = 1;
  for (let index = start + 2; index < value.length; index++) {
    if (value[index] === '\\') {
      index++;
      continue;
    }
    if (value[index] === '$' && value[index + 1] === '{') {
      nesting++;
      if (depth + nesting > LIMITS.pathEnvironmentExpansion.cap) {
        throw new AnalysisLimit('pathEnvironmentExpansion');
      }
      index++;
      continue;
    }
    if (value[index] !== '}') continue;
    nesting--;
    if (nesting === 0) return index;
  }
  return null;
}

function expandBracedPathEnvironmentVariable(
  match: string,
  depth: number,
  environment: Environment,
): string {
  const content = match.slice(2, -1);
  const name = readPathEnvironmentName(content, 0);
  if (!name) return match;
  const suffix = content.slice(name.length);
  if (!suffix) return getSupportedPathEnvironmentValue(name, environment) ?? match;

  const operator = [':-', ':+', ':=', ':?', '-', '+', '=', '?'].find((candidate) =>
    suffix.startsWith(candidate),
  );
  if (!operator) {
    if (SUPPORTED_PATH_ENV_NAMES.has(name)) throw new AnalysisLimit('pathEnvironmentExpansion');
    return match;
  }
  if (!SUPPORTED_PATH_ENV_NAMES.has(name)) return match;
  // Assignment operators require write semantics we do not model.
  if (operator.endsWith('=')) throw new AnalysisLimit('pathEnvironmentExpansion');

  const environmentValue = getSupportedPathEnvironmentValue(name, environment);
  const usable = operator.startsWith(':')
    ? environmentValue !== null && environmentValue !== ''
    : environmentValue !== null;
  // Error operators (? / :?) only fail closed when the value is missing/unusable.
  if (operator.endsWith('?') && !usable) throw new AnalysisLimit('pathEnvironmentExpansion');
  if (operator.endsWith('-') || operator.endsWith('?')) {
    return usable
      ? (environmentValue ?? '')
      : expandSupportedPathEnvironmentVariablesAtDepth(
          suffix.slice(operator.length),
          depth + 1,
          environment,
        );
  }
  return usable
    ? expandSupportedPathEnvironmentVariablesAtDepth(
        suffix.slice(operator.length),
        depth + 1,
        environment,
      )
    : '';
}

function readPathEnvironmentName(value: string, start: number): string {
  if (!/[A-Za-z_]/.test(value[start] ?? '')) return '';
  let end = start + 1;
  while (/[A-Za-z0-9_]/.test(value[end] ?? '')) end++;
  return value.slice(start, end);
}

function getSupportedPathEnvironmentValue(name: string, environment: Environment): string | null {
  if (!SUPPORTED_PATH_ENV_NAMES.has(name)) return null;
  if (name === 'HOME') return environment.env.get('HOME') ?? environment.home;
  return environment.env.get(name) ?? null;
}

export function resolveExistingPath(path: string, paths: PathResolver, budget: Budget): string {
  if (!path) return path;
  const cached = budget.resolvedPaths.get(path);
  if (cached !== undefined) return cached;

  const suffixes: string[] = [];
  let candidate = path;
  while (true) {
    chargeRealpath(budget, candidate);

    const existing = paths.realpath(candidate);
    if (existing !== null) {
      return remember(budget, path, existing, suffixes);
    }

    const parent = dirname(candidate);
    if (parent === candidate || suffixes.length >= MAX_MISSING_SUFFIX_COMPONENTS) {
      return remember(budget, path, candidate, suffixes);
    }
    suffixes.push(basename(candidate));
    candidate = parent;
  }
}

function remember(budget: Budget, path: string, base: string, suffixes: string[]): string {
  const resolved = suffixes.length === 0 ? base : join(base, ...suffixes.reverse());
  budget.resolvedPaths.set(path, resolved);
  return resolved;
}

/** @internal */
export function probeExistingPath(
  path: string,
  paths: PathResolver,
  budget: Budget,
): string | null {
  // A cached value may come from a full walk of a nonexistent path; returning it
  // is safe because callers compare it against a known identity rather than
  // treating it as proof the path exists.
  const cached = budget.resolvedPaths.get(path);
  if (cached !== undefined) return cached;

  chargeRealpath(budget, path);
  const existing = paths.realpath(path);
  if (existing !== null) budget.resolvedPaths.set(path, existing);
  return existing;
}

function chargeRealpath(budget: Budget, candidate: string): void {
  budget.charge('realpathAttempts');
  budget.charge('processedCandidateBytes', Buffer.byteLength(candidate));
}

/**
 * The protected-path guards' view of a candidate: supported variables and `~` expanded, MSYS
 * drive form normalized, resolved against the cwd, canonicalized through the existing prefix,
 * and reported with forward slashes.
 */
export function normalizeProtectedPathCandidate(
  target: string,
  cwd: string,
  environment: Environment,
  budget: Budget,
): string {
  const lexical = lexicallyNormalizeCandidate(target, cwd, environment);
  if (!lexical) return '';
  return resolveExistingPath(lexical, environment.paths, budget).replace(/\\/g, '/');
}

/**
 * Canonicalizes like normalizeProtectedPathCandidate, but skips the ancestor walk
 * for candidates whose basename cannot match the protected file: resolveExistingPath
 * appends missing components verbatim, so a nonexistent path always resolves to its
 * own lexical basename. A single budgeted probe still catches an existing symlink
 * aliasing the protected file. Returns null when the candidate is disqualified.
 */
export function normalizeProtectedFileCandidate(
  target: string,
  cwd: string,
  environment: Environment,
  budget: Budget,
  isPlausibleBasename: (name: string) => boolean,
): string | null {
  const lexical = lexicallyNormalizeCandidate(target, cwd, environment);
  if (!lexical) return null;
  if (isPlausibleBasename(basename(lexical))) {
    return resolveExistingPath(lexical, environment.paths, budget).replace(/\\/g, '/');
  }
  const probed = probeExistingPath(lexical, environment.paths, budget);
  return probed === null ? null : probed.replace(/\\/g, '/');
}

function lexicallyNormalizeCandidate(
  target: string,
  cwd: string,
  environment: Environment,
): string {
  const home = environment.home;
  const unix = expandSupportedPathEnvironmentVariables(target.trim(), environment).replace(
    /\\/g,
    '/',
  );
  if (!unix) return '';
  const expanded =
    unix === '~' ? home : unix.startsWith('~/') ? resolve(home, unix.slice(2)) : unix;
  const nativeTarget = normalizeMsysDrivePath(expanded);
  return normalize(isAbsolute(nativeTarget) ? nativeTarget : resolve(cwd, nativeTarget));
}
