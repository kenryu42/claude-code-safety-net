import { isAbsolute, parse as parsePath } from 'node:path';
import { LIMITS } from '@/core/budget';
import { resolveChdirTarget } from '@/core/paths/chdir';
import type { CommandWord } from '@/core/shell/model';
import type { EnvironmentContext, PathResolver } from '@/gate/analysis';
import { analysisWordText, textCommandWords } from './command-words';
import { parseGitContextAppendEnvAssignment } from './git/env';

const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function parseEnvAssignment(token: string): { name: string; value: string } | null {
  if (!ENV_ASSIGNMENT_RE.test(token)) {
    return null;
  }
  const eqIdx = token.indexOf('=');
  return { name: token.slice(0, eqIdx), value: token.slice(eqIdx + 1) };
}

type EnvWordStrippingResult = {
  words: readonly CommandWord[];
  envAssignments: Map<string, string>;
  cwd?: string | null;
  /** Raw `env -S` values the prelude dropped instead of expanding. */
  envSplitValues?: readonly string[];
};

export type WrapperPreludeResult = EnvWordStrippingResult & {
  /**
   * Whether a word the prelude produced itself survived (a `command -v` rewrite). Such words
   * carry no parser facts, so the caller analyzes the command as text only.
   */
  rewritten: boolean;
};

export function stripEnvAssignmentWords(words: readonly CommandWord[]): EnvWordStrippingResult {
  const envAssignments = new Map<string, string>();
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (!word) break;
    const assignment = parseEnvAssignment(analysisWordText(word));
    if (!assignment) break;
    envAssignments.set(assignment.name, assignment.value);
    i++;
  }
  return { words: words.slice(i), envAssignments };
}

/**
 * Whether a head word can start anything the prelude strips. Commands that cannot skip the
 * whole walk: the embedded-command scan runs it once per remaining word of a command.
 */
function hasWrapperPreludeHead(text: string): boolean {
  const head = text.toLowerCase();
  return (
    text.includes('=') ||
    head === 'sudo' ||
    head === 'env' ||
    head === 'command' ||
    head === 'builtin'
  );
}

export function stripWrapperWords(
  words: readonly CommandWord[],
  environment: EnvironmentContext,
  cwd?: string | null,
  inheritedEnvAssignments?: ReadonlyMap<string, string>,
): WrapperPreludeResult {
  if (!hasWrapperPreludeHead(headText(words))) {
    return { words, envAssignments: new Map(), cwd, rewritten: false };
  }
  const parsed = new Set(words);
  let result = words;
  const allEnvAssignments = new Map<string, string>();
  const effectiveEnvAssignments = new Map(inheritedEnvAssignments ?? []);
  const envSplitValues: string[] = [];
  let currentCwd = cwd;

  for (let iteration = 0; iteration < LIMITS.wrapperPeelIterations.cap; iteration++) {
    const before = wordsText(result);

    const stripped = stripEnvAssignmentWords(result);
    for (const [k, v] of stripped.envAssignments) {
      allEnvAssignments.set(k, v);
      effectiveEnvAssignments.set(k, v);
    }
    result = stripped.words;
    if (result.length === 0) break;

    while (result.length > 0 && headText(result).includes('=') && !isEnvAssignment(result)) {
      const appendAssignment =
        parseTmpdirAppendEnvAssignment(
          headText(result),
          effectiveEnvAssignments,
          environment.env,
        ) ??
        parseGitContextAppendEnvAssignment(
          headText(result),
          environment.env,
          effectiveEnvAssignments,
        );
      if (appendAssignment) {
        allEnvAssignments.set(appendAssignment.name, appendAssignment.value);
        effectiveEnvAssignments.set(appendAssignment.name, appendAssignment.value);
      }
      // Other non-strict leading assignments are dropped to reach the executable word.
      // Git context append assignments are preserved above so worktree relaxation fails closed.
      result = result.slice(1);
    }
    if (result.length === 0) break;

    const head = headText(result).toLowerCase();

    // Guard: unknown wrapper type, exit loop
    if (head !== 'sudo' && head !== 'env' && head !== 'command' && head !== 'builtin') {
      break;
    }

    if (head === 'sudo') {
      const sudoResult = stripSudoWords(result, environment.paths, currentCwd);
      result = sudoResult.words;
      if (sudoResult.cwd !== undefined) {
        currentCwd = sudoResult.cwd;
      }
    }
    if (head === 'env') {
      const envResult = stripEnvWords(result, currentCwd, effectiveEnvAssignments, environment);
      envSplitValues.push(...(envResult.envSplitValues ?? []));
      result = envResult.words;
      if (envResult.cwd !== undefined) {
        currentCwd = envResult.cwd;
      }
      for (const [k, v] of envResult.envAssignments) {
        allEnvAssignments.set(k, v);
        effectiveEnvAssignments.set(k, v);
      }
    }
    if (head === 'command') {
      result = stripCommandWords(result);
    }
    if (head === 'builtin') {
      result = result.slice(wordText(result, 1) === '--' ? 2 : 1);
    }

    if (wordsText(result) === before) break;
  }

  const final = stripEnvAssignmentWords(result);
  for (const [k, v] of final.envAssignments) {
    allEnvAssignments.set(k, v);
    effectiveEnvAssignments.set(k, v);
  }

  return {
    words: final.words,
    envAssignments: allEnvAssignments,
    cwd: currentCwd,
    envSplitValues: envSplitValues.length > 0 ? envSplitValues : undefined,
    rewritten: hasSynthesizedWord(final.words, parsed),
  };
}

function hasSynthesizedWord(words: readonly CommandWord[], parsed: ReadonlySet<CommandWord>) {
  return words.some((word) => !parsed.has(word));
}

function wordsText(words: readonly CommandWord[]): string {
  return words.map(analysisWordText).join(' ');
}

function headText(words: readonly CommandWord[]): string {
  const head = words[0];
  return head ? analysisWordText(head) : '';
}

function wordText(words: readonly CommandWord[], index: number): string | undefined {
  const word = words[index];
  return word ? analysisWordText(word) : undefined;
}

function isEnvAssignment(words: readonly CommandWord[]): boolean {
  return ENV_ASSIGNMENT_RE.test(headText(words));
}

function parseTmpdirAppendEnvAssignment(
  token: string,
  envAssignments: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): { name: string; value: string } | null {
  const prefix = 'TMPDIR+=';
  if (!token.startsWith(prefix)) return null;
  return {
    name: 'TMPDIR',
    value: `${envAssignments.get('TMPDIR') ?? env.get('TMPDIR') ?? ''}${token.slice(prefix.length)}`,
  };
}

const SUDO_OPTS_WITH_VALUE = new Set(['-u', '-g', '-C', '-D', '-h', '-p', '-r', '-t', '-T', '-U']);

function stripSudoWords(
  words: readonly CommandWord[],
  paths: PathResolver,
  cwd?: string | null,
): { words: readonly CommandWord[]; cwd?: string | null } {
  let i = 1;
  let currentCwd = cwd;
  while (i < words.length) {
    const token = wordText(words, i);
    if (!token) break;

    if (token === '--') {
      return { words: words.slice(i + 1), cwd: currentCwd };
    }

    // Guard: not an option, exit loop
    if (!token.startsWith('-')) {
      break;
    }

    if (token === '-D' || token === '--chdir') {
      const target = wordText(words, i + 1);
      currentCwd = target ? resolveWrapperCwd(currentCwd, target, paths) : null;
      i += 2;
      continue;
    }

    if (token.startsWith('--chdir=')) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice('--chdir='.length), paths);
      i++;
      continue;
    }

    if (token.startsWith('-D') && token.length > 2) {
      currentCwd = resolveWrapperCwd(currentCwd, token.slice(2), paths);
      i++;
      continue;
    }

    if (token === '-i' || token === '--login') {
      currentCwd = null;
      i++;
      continue;
    }

    if (SUDO_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    i++;
  }
  return { words: words.slice(i), cwd: currentCwd };
}

const ENV_OPTS_NO_VALUE = new Set(['-i', '-0', '--null']);
const ENV_OPTS_WITH_VALUE = new Set(['-u', '--unset', '-C', '--chdir', '-P']);

function stripEnvWords(
  words: readonly CommandWord[],
  cwd: string | null | undefined,
  inheritedEnvAssignments: ReadonlyMap<string, string>,
  environment: EnvironmentContext,
): EnvWordStrippingResult {
  const envAssignments = new Map<string, string>();
  const envSplitValues: string[] = [];
  let currentCwd = cwd;
  let i = 1;
  const result = (index: number): EnvWordStrippingResult => ({
    words: words.slice(index),
    envAssignments,
    cwd: currentCwd,
    envSplitValues: envSplitValues.length > 0 ? envSplitValues : undefined,
  });
  while (i < words.length) {
    const token = wordText(words, i);
    if (!token) break;

    if (token === '--') {
      return result(i + 1);
    }

    if (token === '-i' || token === '--ignore-environment' || token === '-') {
      envAssignments.clear();
      for (const name of inheritedEnvAssignments.keys()) envAssignments.set(name, '');
      envAssignments.set('TMPDIR', '');
      i++;
      continue;
    }

    if (ENV_OPTS_NO_VALUE.has(token)) {
      i++;
      continue;
    }

    if (token === '-u' || token === '--unset') {
      const name = wordText(words, i + 1);
      if (name !== undefined) {
        envAssignments.set(name, '');
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-u') && token.length > 2 && !token.startsWith('-u=')) {
      envAssignments.set(token.slice(2), '');
      i++;
      continue;
    }

    if (token.startsWith('--unset=')) {
      envAssignments.set(token.slice('--unset='.length), '');
      i++;
      continue;
    }

    const splitString =
      token === '-S' || token === '--split-string'
        ? { value: wordText(words, i + 1), consumed: 2 }
        : token.startsWith('-S') && token.length > 2
          ? { value: token.slice('-S'.length), consumed: 1 }
          : token.startsWith('--split-string=')
            ? { value: token.slice('--split-string='.length), consumed: 1 }
            : null;
    if (splitString) {
      // The split-string language is not emulated: keep the raw value for the caller's
      // dangerous-text scan, drop the option and mark the cwd unknown so relaxations fail closed.
      // Option parsing stops here because GNU env treats every following word as an operand.
      if (splitString.value !== undefined) envSplitValues.push(splitString.value);
      currentCwd = null;
      return result(i + splitString.consumed);
    }

    if (ENV_OPTS_WITH_VALUE.has(token)) {
      if (token === '-C' || token === '--chdir') {
        const target = wordText(words, i + 1);
        currentCwd = target ? resolveWrapperCwd(currentCwd, target, environment.paths) : null;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-u=')) {
      i++;
      continue;
    }

    if ((token.startsWith('-C') && token.length > 2) || token.startsWith('--chdir=')) {
      const target = token.startsWith('--chdir=')
        ? token.slice('--chdir='.length)
        : token.startsWith('-C=')
          ? token.slice('-C='.length)
          : token.slice('-C'.length);
      currentCwd = resolveWrapperCwd(currentCwd, target, environment.paths);
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
    if (!parseEnvAssignment(token)) {
      break;
    }
    while (i < words.length) {
      const nextAssignment = parseEnvAssignment(wordText(words, i) ?? '');
      if (!nextAssignment) break;
      envAssignments.set(nextAssignment.name, nextAssignment.value);
      i++;
    }
    if (wordText(words, i) === '--') i++;
    return result(i);
  }
  return result(i);
}

function resolveWrapperCwd(
  cwd: string | null | undefined,
  target: string,
  paths: PathResolver,
): string | null {
  if (target === '') {
    return null;
  }
  if (!cwd && !isAbsolute(target)) {
    return null;
  }
  const baseCwd = isAbsolute(target) ? parsePath(target).root : paths.realpath(cwd ?? '/');
  if (baseCwd === null) return null;
  try {
    return resolveChdirTarget(baseCwd, target, paths);
  } catch {
    return null;
  }
}

function stripCommandWords(words: readonly CommandWord[]): readonly CommandWord[] {
  if (wordText(words, 1) === '-v') return [...textCommandWords(['type']), ...words.slice(2)];
  let i = 1;
  while (i < words.length) {
    const token = wordText(words, i);
    if (!token) break;

    if (token === '-p' || token === '-v' || token === '-V') {
      i++;
      continue;
    }

    if (token === '--') {
      return words.slice(i + 1);
    }

    // Check for combined short opts like -pv
    if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
      if (!/^[pvV]+$/.test(token.slice(1))) {
        break;
      }
      i++;
      continue;
    }

    break;
  }
  return words.slice(i);
}

// `env -S` gives these characters quoting, expansion, escape, or comment semantics the analyzer
// does not emulate (`#` also hides retained operands behind a shell comment on re-parse).
const ENV_SPLIT_NON_INERT_RE = /['"\\$`{}#]/;

/**
 * Words of an `env -S` command reconstructed by splicing the whitespace-split values ahead of the
 * retained operands. Null when a value is non-inert or the result exceeds the 64-word splice
 * budget, so callers keep their conservative behavior.
 */
export function reconstructEnvSplitWords(
  envSplitValues: readonly string[],
  operands: readonly string[],
): string[] | null {
  if (envSplitValues.some((value) => ENV_SPLIT_NON_INERT_RE.test(value))) return null;
  const words = [
    ...envSplitValues.flatMap((value) => value.split(/\s+/).filter((word) => word.length > 0)),
    ...operands,
  ];
  return words.length <= 64 ? words : null;
}

export interface EnvStrippingResult {
  tokens: string[];
  envAssignments: Map<string, string>;
  cwd?: string | null;
  envSplitValues?: readonly string[];
}

/**
 * Token views of the word-based prelude, for the derived commands that exist only as text
 * (find -exec children, xargs/parallel templates) and the guards that skip wrapper prefixes.
 */
export function stripWrappers(
  tokens: string[],
  environment: EnvironmentContext,
  cwd?: string | null,
): string[] {
  return stripWrappersWithInfo(tokens, environment, cwd).tokens;
}

/**
 * Words of an `env -S` value for the path-scan view: a `"…"` or `'…'` span becomes part of one word
 * with the quotes dropped, so a quoted path containing whitespace stays a single word; whitespace
 * outside quotes splits words. An unbalanced quote falls back to the plain whitespace split.
 */
function splitPathScanWords(value: string) {
  const words: string[] = [];
  let current = '';
  let index = 0;
  while (index < value.length) {
    const char = value.charAt(index);
    if (char === '"' || char === "'") {
      const close = value.indexOf(char, index + 1);
      if (close === -1) {
        return value
          .split(/\s+/)
          .map((word) => word.replace(/["']/g, ''))
          .filter((word) => word.length > 0);
      }
      current += value.slice(index + 1, close);
      index = close + 1;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) words.push(current);
      current = '';
      index++;
      continue;
    }
    current += char;
    index++;
  }
  if (current.length > 0) words.push(current);
  return words;
}

/**
 * Token view for the path guards, with the quote-grouped `env -S` value words spliced ahead of the
 * retained operands so a mutation hidden in the split string is still matched against the
 * protected paths. Path matching needs no quoting fidelity, so the quote characters are dropped
 * from the split words and the inert-value and splice-budget limits of
 * {@link reconstructEnvSplitWords} do not apply.
 */
export function stripWrappersForPathScan(
  tokens: string[],
  environment: EnvironmentContext,
  cwd?: string | null,
  depth = 0,
): string[] {
  const stripped = stripWrappersWithInfo(tokens, environment, cwd);
  const splitWords = (stripped.envSplitValues ?? []).flatMap(splitPathScanWords);
  if (splitWords.length === 0) return stripped.tokens;
  const spliced = [...splitWords, ...stripped.tokens];
  // The spliced words can themselves start a prelude (`env -S 'LC_ALL=C mv'` hides the head command
  // behind an assignment), so re-normalize until the view settles.
  if (depth >= 8) return spliced;
  return stripWrappersForPathScan(spliced, environment, cwd, depth + 1);
}

export function stripWrappersWithInfo(
  tokens: string[],
  environment: EnvironmentContext,
  cwd?: string | null,
  inheritedEnvAssignments?: ReadonlyMap<string, string>,
): EnvStrippingResult {
  // Skips building stand-in words for the commands the prelude would leave untouched.
  if (!hasWrapperPreludeHead(tokens[0] ?? '')) {
    return { tokens: [...tokens], envAssignments: new Map(), cwd };
  }
  const stripped = stripWrapperWords(
    textCommandWords(tokens),
    environment,
    cwd,
    inheritedEnvAssignments,
  );
  return {
    tokens: stripped.words.map(analysisWordText),
    envAssignments: stripped.envAssignments,
    cwd: stripped.cwd,
    envSplitValues: stripped.envSplitValues,
  };
}
