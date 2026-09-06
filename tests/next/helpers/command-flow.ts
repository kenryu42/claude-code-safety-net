import { expect } from 'bun:test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type RunInstallCommandOptions,
  runInstallCommand,
  runUpdateCommand,
} from '@next/cli/install/index';
import type { UpdateInfo } from '@next/hosts/doctor-types';
import {
  runInstallCommand as shippedRunInstallCommand,
  runUpdateCommand as shippedRunUpdateCommand,
} from '@/cli/install';
import { createFakeBin, type FakeScriptEntry } from './fake-bin';
import { createFakeInput, createFakeOutput } from './fake-tty';
import { snapshotTree, type TreeSpec, writeTree } from './fixture-tree';
import {
  createTempRoot,
  isolationEnv,
  normalize,
  recordPorted,
  snapshotHome,
  withProcessEnv,
} from './temp-home';

/**
 * The whole command as a user runs it. Each side gets its own root, its own seeded home and its
 * own fake host CLIs in front of `PATH`, and both are driven through their own entry point under
 * the same environment — the shipped flow reads it off `process.env`, the ported one builds its
 * `Environment` from it. A row therefore compares everything the command is: its exit code, what
 * it printed, what it reported as a failure, which host commands it ran and where, and the bytes
 * it left in the home and the temp dir.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

/** The `install --amp` row's tmp tree holds the packaged artifact byte for byte, and the cutover's
 *  rebuild of `dist/` changes it; the comparison sees the bytes, the record sees a placeholder. */
const AMP_ARTIFACT = readFileSync(
  join(REPO_ROOT, 'dist', 'amp', 'cc-safety-net', 'index.ts'),
  'utf8',
);

type FlowSide = 'shipped' | 'ported';

/** Everything but `input`/`output`, which the harness owns so both sides are recorded alike. */
export type FlowOptions = Omit<RunInstallCommandOptions, 'input' | 'output'> & {
  showBanner?: boolean;
  checkLatestVersion?: () => Promise<UpdateInfo>;
  scriptPath?: string;
};

export type FlowSpec = {
  seed?: TreeSpec;
  /** Written into `<root>/tmp`: the `TMPDIR` both sides resolve caches and checkouts against. */
  seedTmp?: TreeSpec;
  /** `<home>` and `<root>` inside an entry stand for that side's paths. */
  script?: readonly FakeScriptEntry[];
  extraCommands?: readonly string[];
  invoke: 'install' | 'uninstall' | 'update';
  args?: readonly string[];
  options?: (home: string) => FlowOptions;
};

async function runSide(side: FlowSide, spec: FlowSpec) {
  const root = createTempRoot(`cc-safety-net-${side}-flow-`);
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
    if (spec.invoke === 'update') {
      return side === 'shipped'
        ? shippedRunUpdateCommand(args, callOptions)
        : runUpdateCommand(args, callOptions);
    }
    return side === 'shipped'
      ? shippedRunInstallCommand(spec.invoke, args, callOptions)
      : runInstallCommand(spec.invoke, args, callOptions);
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

/** The shipped side first, then the ported one: both mutate `process.env` and the console. */
export async function runFlowDifferential(spec: FlowSpec) {
  const shipped = await runSide('shipped', spec);
  return { shipped, ported: await runSide('ported', spec) };
}

/** The two sides must be indistinguishable; the shipped one is what the contract is asserted on. */
export function expectSameFlow<T>(result: { shipped: T; ported: T }): T {
  expect(result.ported).toEqual(result.shipped);
  recordPorted(result.ported, [[AMP_ARTIFACT, '<amp-artifact>']]);
  return result.shipped;
}
