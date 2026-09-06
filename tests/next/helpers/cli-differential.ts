import { expect } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createFakeBin } from './fake-bin';
import { snapshotTree, type TreeEntry, type TreeSpec, writeTree } from './fixture-tree';
import { createTempRoot, isolatedSpawnEnv, normalize, recordPorted } from './temp-home';

/**
 * The two bins over the same argument vector. Each row runs `bun run src/cli/cc-safety-net.ts`
 * and `bun run next/entries/bin.ts` under its own temp root, with every home the CLI reads
 * pointed inside it and a `PATH` that holds one empty directory, so every host, node, npm and
 * git probe fails with ENOENT on both sides instead of finding whatever the machine installed.
 * What is compared is what a user sees: the stdout bytes, the stderr bytes, the exit code and
 * the tree the run left behind.
 */

export const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
export const SHIPPED_ENTRY = join(REPO_ROOT, 'src/cli/cc-safety-net.ts');
export const PORTED_ENTRY = join(REPO_ROOT, 'next/entries/bin.ts');

/** The temp root one side of a row runs against, handed to `seed` and `cwd`. */
export type CliSide = {
  root: string;
  home: string;
  project: string;
  env: Record<string, string>;
};

export type CliRow = {
  args: readonly string[];
  /** Writes the fixture this row reads, with the side's own env already resolved. */
  seed?: (side: CliSide) => void;
  /** Where the CLI runs; the project directory by default. */
  cwd?: (side: CliSide) => string;
  env?: Record<string, string | undefined>;
  stdin?: string;
};

export type CliOutcome = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  tree: TreeEntry[];
};

/** The mode, debug and audit variables a developer's shell may carry into the run. */
const BLANKED_ENV_NAMES = [
  'CC_SAFETY_NET_LEVEL',
  'CC_SAFETY_NET_STRICT',
  'CC_SAFETY_NET_PARANOID',
  'CC_SAFETY_NET_PARANOID_RM',
  'CC_SAFETY_NET_PARANOID_INTERPRETERS',
  'CC_SAFETY_NET_WORKTREE',
  'CC_SAFETY_NET_DEBUG',
  'CC_SAFETY_NET_AUDIT_SCOPE',
  'SAFETY_NET_STRICT',
  'SAFETY_NET_PARANOID',
  'SAFETY_NET_PARANOID_RM',
  'SAFETY_NET_PARANOID_INTERPRETERS',
  'SAFETY_NET_WORKTREE',
  'CLAUDE_SETTINGS_PATH',
  'NO_COLOR',
  'FORCE_COLOR',
];

/**
 * Scaffolding rather than something the run wrote: the fake bin's own files, and the transpiler
 * cache `bun run` fills under the isolated `HOME`, whose content-keyed entries differ between the
 * two implementations by construction.
 */
const SCAFFOLDING = /^(bin|fake-script\.json|fake-log\.txt|home\/\.bun)(\/|$)/;

function createSide(label: string): CliSide {
  // Both sides get a root of the same length: a row that renders a path into a fixed-width
  // column truncates it, and `cli-shipped-` against `cli-ported-` would truncate one character
  // apart and read as a difference between the bins.
  const root = createTempRoot(`cli-${label.padEnd(7, '-')}-`);
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  return {
    root,
    home,
    project,
    // `isolatedSpawnEnv` drops a blanked name from the map rather than leaving it unset (Node
    // stringifies `undefined` to the literal `'undefined'`) and, on Windows, drops the
    // case-insensitive duplicate an inherited `Path` would otherwise leave in front of the
    // fake bin's `PATH`.
    env: isolatedSpawnEnv(home, {
      ...createFakeBin(root, []).env,
      TZ: 'UTC',
      ...Object.fromEntries(BLANKED_ENV_NAMES.map((name) => [name, undefined])),
    }),
  };
}

function runSide(entry: string, row: CliRow, label: string): CliOutcome {
  const side = createSide(label);
  const env = Object.fromEntries(
    Object.entries({ ...side.env, ...row.env }).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as const],
    ),
  );
  row.seed?.({ ...side, env });
  const result = spawnSync(process.execPath, ['run', entry, ...row.args], {
    cwd: row.cwd?.({ ...side, env }) ?? side.project,
    input: row.stdin ?? '',
    env,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const clean = (text: string) =>
    normalize(text, [
      [side.root, '<root>'],
      [realpathSync(side.root), '<root>'],
      [REPO_ROOT, '<repo>'],
    ]);
  return {
    stdout: clean(result.stdout),
    stderr: clean(result.stderr),
    exitCode: result.status,
    tree: normalize(
      snapshotTree(side.root).filter((entry) => !SCAFFOLDING.test(entry.path)),
      [[side.root, '<root>']],
    ),
  };
}

export async function runCliDifferential(row: CliRow) {
  return {
    shipped: runSide(SHIPPED_ENTRY, row, 'shipped'),
    ported: runSide(PORTED_ENTRY, row, 'ported'),
  };
}

/** Write a row's fixture under its side's temp root, with paths spelled from the root. */
export function seedFiles(side: CliSide, spec: TreeSpec): void {
  writeTree(side.root, spec);
}

/** Assert both bins answered identically, and hand back the shipped outcome to pin against. */
export function expectSameCli(result: { shipped: CliOutcome; ported: CliOutcome }): CliOutcome {
  expect(result.ported).toStrictEqual(result.shipped);
  // `doctor` names the machine it ran on, which both sides read from the same process.
  recordPorted(result.ported, [[`${process.platform} ${process.arch}`, '<platform>']]);
  return result.shipped;
}
