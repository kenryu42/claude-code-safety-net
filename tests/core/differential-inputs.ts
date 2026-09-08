import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { createTestEnvironment, processPathResolver } from '@/core/environment';
import { behavioralContractCases } from '../gate/behavioral-contract-cases';
import { pipelineContractCases } from '../gate/pipeline-contract-cases';
import { type TreeSpec, writeTree } from '../helpers/fixture-tree';

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
    userPolicyPath: posix.join(HOME, '.cc-safety-net', 'policy.json'),
    userPolicyDir: posix.join(HOME, '.cc-safety-net'),
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
 * The named variables and home behind an Environment over the real filesystem, so a row can be fed
 * process state it spells out itself.
 */
export function pairedEnvironments(env: Record<string, string>, home: string) {
  return createTestEnvironment({
    env: new Map(Object.entries(env)),
    home,
    tmpdir: tmpdir(),
    paths: processPathResolver,
  });
}
