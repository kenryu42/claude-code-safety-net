import { expect } from 'bun:test';
import { join } from 'node:path';
import { createTestEnvironment, processPathResolver } from '@next/core/environment';
import { createProcessEnvironment as createShippedEnvironment } from '@/ir/environment';
import { behavioralContractCases } from '../../analyzer/behavioral-contract-cases';
import { pipelineContractCases } from '../../engine/pipeline-contract-cases';
import { type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { recordPorted } from '../helpers/temp-home';

/**
 * A file, a dangling link and a two-link cycle under `root`, plus `extras`: the shapes every path
 * differential walks.
 */
export function writeSymlinkLoopTree(root: string, extras: TreeSpec): void {
  writeTree(root, {
    file: 'x',
    broken: { symlink: join(root, 'nowhere') },
    'loop-a': { symlink: join(root, 'loop-b') },
    'loop-b': { symlink: join(root, 'loop-a') },
    ...extras,
  });
}

const HOME = '/srv/home/tester';
const WORKSPACE = '/srv/work/space';

/** Every command and tool-input string the two contract corpora carry, once each. */
export function corpusStrings(): string[] {
  const commands = behavioralContractCases({ cwd: WORKSPACE, home: HOME }).map(
    (row) => row.command,
  );
  const inputs = pipelineContractCases({
    workspace: WORKSPACE,
    repo: '/srv/work/repo',
    home: HOME,
    userPolicyPath: join(HOME, '.cc-safety-net', 'policy.json'),
    userPolicyDir: join(HOME, '.cc-safety-net'),
  }).flatMap((row) =>
    typeof row.input === 'object' && row.input !== null
      ? Object.values(row.input).filter((value): value is string => typeof value === 'string')
      : [],
  );
  return [...new Set([...commands, ...inputs])];
}

/** The whitespace-separated words of the corpus strings: the operands the path guards see. */
export function corpusWords(): string[] {
  return [...new Set(corpusStrings().flatMap((text) => text.split(/\s+/)))].filter(
    (word) => word !== '',
  );
}

/** A xorshift32 generator: one seed yields one sequence on every run and platform. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 0x9e37_79b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

export function pickWord(random: () => number, words: readonly string[]): string {
  return words[Math.floor(random() * words.length)] ?? '';
}

/**
 * The same variables and home behind a shipped `EnvironmentContext` and a `next/` Environment,
 * both over the real filesystem, so a function pair can be fed identical process state.
 */
export function pairedEnvironments(env: Record<string, string>, home: string) {
  const shipped = createShippedEnvironment();
  const variables = new Map(Object.entries(env));
  return {
    shipped: { ...shipped, env: variables, home },
    next: createTestEnvironment({
      env: variables,
      home,
      tmpdir: shipped.tmpdir,
      paths: processPathResolver,
    }),
  };
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function outcome<T>(call: () => T): Outcome<T> {
  try {
    return { ok: true, value: call() };
  } catch (error) {
    return { ok: false, error };
  }
}

/**
 * Asserts the two calls both return the same value or both throw, records what the `next/` call
 * settled with — folded of the roots `replacements` names, unless `record` is false because the
 * value is machine-shaped past what a fold can hide — and hands back what it threw so the caller
 * can pin its kind.
 */
export function expectSameOutcome<T>(
  next: () => T,
  shipped: () => T,
  replacements: readonly (readonly [string | RegExp, string])[] = [],
  record = true,
): unknown {
  const left = outcome(next);
  const right = outcome(shipped);
  expect(left.ok).toBe(right.ok);
  if (left.ok && right.ok) expect(left.value).toEqual(right.value);
  if (record) recordPorted(left, replacements);
  return left.ok ? undefined : left.error;
}
