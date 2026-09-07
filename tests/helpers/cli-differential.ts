import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createFakeBin } from './fake-bin';
import { snapshotTree, type TreeEntry, type TreeSpec, writeTree } from './fixture-tree';
import { createTempRoot, isolatedSpawnEnv, normalize, recordPorted, rootFolds } from './temp-home';

/**
 * The bin over one argument vector. Each row runs `bun run src/entries/bin.ts` under its own temp
 * root, with every home the CLI reads pointed inside it and a `PATH` that holds one empty
 * directory, so every host, node, npm and git probe fails with ENOENT instead of finding whatever
 * the machine installed. What is recorded is what a user sees: the stdout bytes, the stderr bytes,
 * the exit code and the tree the run left behind.
 */

export const REPO_ROOT = join(import.meta.dir, '..', '..');
export const PORTED_ENTRY = join(REPO_ROOT, 'src/entries/bin.ts');

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
 * cache `bun run` fills under the isolated `HOME`, whose content-keyed entries name the build that
 * filled them.
 */
const SCAFFOLDING = /^(bin|fake-script\.json|fake-log\.txt|home\/\.bun)(\/|$)/;

function createSide(): CliSide {
  // The padded label the differential recorded its snapshots under: a row that renders a path into
  // a fixed-width column truncates it, so the root's length is part of what `status` prints.
  const root = createTempRoot('cli-ported--');
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

function runSide(row: CliRow): CliOutcome {
  const side = createSide();
  const env = Object.fromEntries(
    Object.entries({ ...side.env, ...row.env }).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, value] as const],
    ),
  );
  row.seed?.({ ...side, env });
  const result = spawnSync(process.execPath, ['run', PORTED_ENTRY, ...row.args], {
    cwd: row.cwd?.({ ...side, env }) ?? side.project,
    input: row.stdin ?? '',
    env,
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const clean = (text: string) => normalize(text, [...rootFolds(side.root), [REPO_ROOT, '<repo>']]);
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

export function runCliDifferential(row: CliRow): CliOutcome {
  return runSide(row);
}

/** Write a row's fixture under its temp root, with paths spelled from the root. */
export function seedFiles(side: CliSide, spec: TreeSpec): void {
  writeTree(side.root, spec);
}

/** Record the run against its snapshot, and hand the outcome back to pin against. */
export function expectSameCli(outcome: CliOutcome): CliOutcome {
  // `doctor` names the machine it ran on, which the run reads from the process.
  recordPorted(outcome, [[`${process.platform} ${process.arch}`, '<platform>']]);
  return outcome;
}
