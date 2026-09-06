import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type RunInstallCommandOptions,
  runInstallCommand,
  runUpdateCommand,
} from '@/cli/install/index';
import type { UpdateInfo } from '@/hosts/doctor-types';
import { createFakeBin, type FakeScriptEntry } from './fake-bin';
import { createFakeInput, createFakeOutput } from './fake-tty';
import { snapshotTree, type TreeEntry, type TreeSpec, writeTree } from './fixture-tree';
import {
  createTempRoot,
  isolationEnv,
  normalize,
  recordPorted,
  snapshotHome,
  withProcessEnv,
} from './temp-home';

/**
 * The whole command as a user runs it: its own root, its own seeded home and its own fake host CLIs
 * in front of `PATH`. A row therefore records everything the command is: its exit code, what it
 * printed, what it reported as a failure, which host commands it ran and where, and the bytes it
 * left in the home and the temp dir.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..');

/** The `install --amp` row's tmp tree holds the packaged artifact byte for byte, and a rebuild of
 *  `dist/` changes it; the record sees a placeholder in its place. */
const AMP_ARTIFACT = readFileSync(
  join(REPO_ROOT, 'dist', 'amp', 'cc-safety-net', 'index.ts'),
  'utf8',
);

/** Everything but `input`/`output`, which the harness owns so every row is recorded alike. */
export type FlowOptions = Omit<RunInstallCommandOptions, 'input' | 'output'> & {
  showBanner?: boolean;
  checkLatestVersion?: () => Promise<UpdateInfo>;
  scriptPath?: string;
};

export type FlowSpec = {
  seed?: TreeSpec;
  /** Written into `<root>/tmp`: the `TMPDIR` the run resolves caches and checkouts against. */
  seedTmp?: TreeSpec;
  /** `<home>` and `<root>` inside an entry stand for the run's paths. */
  script?: readonly FakeScriptEntry[];
  extraCommands?: readonly string[];
  invoke: 'install' | 'uninstall' | 'update';
  args?: readonly string[];
  options?: (home: string) => FlowOptions;
};

async function runSide(spec: FlowSpec) {
  const root = createTempRoot('cc-safety-net-ported-flow-');
  const home = join(root, 'home');
  const tmp = join(root, 'tmp');
  mkdirSync(home, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  writeTree(home, spec.seed ?? {});
  writeTree(tmp, spec.seedTmp ?? {});
  const fakeBin = createFakeBin(
    root,
    JSON.parse(
      JSON.stringify(spec.script ?? [])
        .replaceAll('<home>', home)
        .replaceAll('<root>', root),
    ) as FakeScriptEntry[],
    spec.extraCommands,
  );

  const output = createFakeOutput({ isTTY: false });
  const errors: string[] = [];
  const warnings: string[] = [];
  const reportedError = console.error;
  const reportedWarning = console.warn;
  console.error = (...args: unknown[]) => {
    errors.push(args.map((arg) => String(arg)).join(' '));
  };
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };
  const callOptions = {
    input: createFakeInput({ isTTY: false }) as unknown as NodeJS.ReadStream,
    output: output as unknown as NodeJS.WriteStream,
    ...spec.options?.(home),
  };
  const args = spec.args ?? [];
  // Detection also reads `<cwd>/.claude` and `<cwd>/.github`, so the row owns the working
  // directory too, not the checkout the suite happens to run from.
  const previousCwd = process.cwd();
  process.chdir(root);
  const exitCode = await withProcessEnv(isolationEnv(home, { ...fakeBin.env, TMPDIR: tmp }), () => {
    if (spec.invoke === 'update') return runUpdateCommand(args, callOptions);
    return runInstallCommand(spec.invoke, args, callOptions);
  }).finally(() => {
    process.chdir(previousCwd);
    console.error = reportedError;
    console.warn = reportedWarning;
  });

  return normalize(
    {
      exitCode,
      lines: output.text().split('\n'),
      errors,
      warnings,
      log: fakeBin.readLog().sort(),
      tree: snapshotHome(home),
      tmp: snapshotTree(tmp),
    },
    [
      [home, '<home>'],
      [root, '<root>'],
      [REPO_ROOT, '<repo>'],
    ],
  );
}

/** One run of the flow, which mutates `process.env` and the console while it lasts. */
export async function runFlowDifferential(spec: FlowSpec) {
  return runSide(spec);
}

/**
 * Record the run; the returned result is what the contract is asserted on. A directory's mode is
 * the runner's umask rather than the contract — `mkdtemp` alone spells it 0700 on some Bun versions
 * and 0755 on others — so only the file modes, which carry the executable hooks, are recorded.
 */
export function expectSameFlow(result: Awaited<ReturnType<typeof runFlowDifferential>>) {
  const listed = (entries: readonly TreeEntry[]) =>
    entries.map((entry) =>
      entry.kind === 'directory' ? { path: entry.path, kind: entry.kind } : entry,
    );
  recordPorted({ ...result, tree: listed(result.tree), tmp: listed(result.tmp) }, [
    [AMP_ARTIFACT, '<amp-artifact>'],
  ]);
  return result;
}
