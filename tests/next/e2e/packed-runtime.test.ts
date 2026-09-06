import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pkg from '../../../package.json';
import { PORTED_LAYOUT, SHIPPED_LAYOUT } from '../../../scripts/build-layout';
import { buildRuntimeBundles } from '../../../scripts/build-runtime';
import { normalizeDoctorJson } from '../helpers/doctor-json';
import { repairBundlerDirectoryCache } from '../helpers/gui-bundle-repair';
import {
  createTempRoot,
  isolatedSpawnEnv,
  normalize,
  recordPorted,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * The two runtime bundles the same layout-taking build emits — `src/` into one temp outdir,
 * `next/` into the other — answering the journeys a packed install runs. Every row runs `node`
 * over both bundles under its own temp root, with each side's homes inside that root, and
 * compares what a user of the published artifact sees: the stdout bytes, the stderr bytes and
 * the exit code. Unlike the source-level CLI differential these run the minified, split,
 * define-substituted output, so a bundling difference the sources cannot show — a chunk the
 * ported entry never reaches, a value the define left unreplaced — surfaces here.
 *
 * The command strings in the rows are analyzer input: node runs nothing but the two built bins
 * and the two eval scripts that import the bundle's own entry points.
 */

const NODE = (() => {
  const executable = Bun.which('node');
  if (executable) return executable;
  throw new Error('Node.js is required to run the built runtime bundles');
})();

// `process.argv[1]` under `--eval` is the first argument after the script, so each consumer is
// handed the entry point of the bundle under test rather than resolving an installed package.
const API_SCRIPT = `
  import { pathToFileURL } from 'node:url';
  const { checkCommand } = await import(pathToFileURL(process.argv[1]).href);
  console.log(
    JSON.stringify([
      checkCommand({ command: 'git reset --hard', cwd: process.cwd() }),
      checkCommand({ command: 'ls', cwd: process.cwd() }),
    ]),
  );
`;
const INDEX_SCRIPT = `
  import { pathToFileURL } from 'node:url';
  const module = await import(pathToFileURL(process.argv[1]).href);
  console.log(Object.keys(module).join(','));
`;

type Side = { root: string; home: string; project: string; outdir: string; bin: string };

type Outcome = { stdout: string; stderr: string; exitCode: number | null };

type Journey = {
  name: string;
  args: (side: Side) => string[];
  stdin?: (side: Side) => string;
  /** Folds what neither side can pin, applied after the temp paths are spelled from the root. */
  normalize?: (text: string) => string;
  /** What the shipped side has to have answered, so a row cannot pass on two identical failures. */
  check: (outcome: Outcome) => void;
};

const hookInput = (side: Side, command: string) =>
  JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: 'packed',
    transcript_path: join(side.home, 'transcript.jsonl'),
    cwd: side.project,
    tool_name: 'Bash',
    tool_input: { command },
  });

const JOURNEYS: readonly Journey[] = [
  {
    name: 'the hook denies a destructive command',
    args: (side) => [side.bin, 'hook', '--claude-code'],
    stdin: (side) => hookInput(side, 'git reset --hard'),
    check: (outcome) => {
      expect(outcome.stdout).toContain('"permissionDecision":"deny"');
      expect(outcome.stdout).toContain('git.reset-hard');
    },
  },
  {
    name: 'the hook stays silent on a safe command',
    args: (side) => [side.bin, 'hook', '--claude-code'],
    stdin: (side) => hookInput(side, 'ls'),
    check: (outcome) => {
      expect(outcome.stdout).toBe('');
      expect(outcome.exitCode).toBe(0);
    },
  },
  {
    name: 'explain renders the blocked verdict',
    args: (side) => [side.bin, 'explain', 'git reset --hard'],
    check: (outcome) => {
      expect(outcome.stdout).toContain('Status: BLOCKED');
      expect(outcome.exitCode).toBe(0);
    },
  },
  {
    name: 'the bin reports the version the define substituted',
    args: (side) => [side.bin, '--version'],
    check: (outcome) => {
      expect(outcome.stdout).toBe(`${pkg.version}\n`);
    },
  },
  {
    name: 'status renders a report',
    args: (side) => [side.bin, 'status'],
    check: (outcome) => {
      expect(outcome.stdout).toContain('CC Safety Net');
      expect(outcome.exitCode).toBe(0);
    },
  },
  {
    // An isolated home has findings, so the exit code is the differential's to compare rather
    // than a constant to assert; what this row pins is that the document is whole.
    name: 'doctor renders a parseable report',
    args: (side) => [side.bin, 'doctor', '--json', '--skip-update-check'],
    normalize: normalizeDoctorJson,
    check: (outcome) => {
      expect((JSON.parse(outcome.stdout) as { hooks: unknown[] }).hooks.length).toBeGreaterThan(0);
    },
  },
  {
    name: 'the api entry answers a deny and an allow',
    args: (side) => ['--input-type=module', '--eval', API_SCRIPT, join(side.outdir, 'api.js')],
    check: (outcome) => {
      const results = JSON.parse(outcome.stdout) as { kind: string; ruleId?: string }[];

      expect(results.map((result) => result.kind)).toEqual(['deny', 'allow']);
      expect(results[0]?.ruleId).toBe('git.reset-hard');
    },
  },
  {
    name: 'the index entry exports the OpenCode plugin',
    args: (side) => ['--input-type=module', '--eval', INDEX_SCRIPT, join(side.outdir, 'index.js')],
    check: (outcome) => {
      expect(outcome.stdout).toBe('CCSafetyNetPlugin\n');
    },
  },
];

// Named here but created in `beforeAll`, so a run whose rows are all filtered out leaves no
// directory behind: `afterAll` never fires for a file that contributed no test.
const buildRoot = join(
  process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(),
  `packed-runtime-${process.pid}`,
);

beforeAll(async () => {
  mkdirSync(buildRoot, { recursive: true });
  for (const [directory, layout] of [
    ['shipped', SHIPPED_LAYOUT],
    ['ported', PORTED_LAYOUT],
  ] as const) {
    expect((await buildRuntimeBundles(join(buildRoot, directory), layout)).success).toBeTrue();
  }
  // The ported build imports next/gui/assets in-process, which leaves bun's listings of
  // next/core and next/gui stale for every test file loaded after this one.
  await repairBundlerDirectoryCache();
}, 120_000);

afterAll(() => {
  rmSync(buildRoot, { recursive: true, force: true });
});

afterEach(() => {
  removeTempRoots();
});

function runSide(outdir: string, journey: Journey, label: string): Outcome {
  const root = createTempRoot(`packed-${label}-`);
  const side = {
    root,
    home: join(root, 'home'),
    project: join(root, 'project'),
    outdir,
    bin: join(outdir, 'bin', 'cc-safety-net.js'),
  };
  mkdirSync(side.home, { recursive: true });
  mkdirSync(side.project, { recursive: true });
  // PATH holds one empty directory, so every host, node and npm probe `doctor` and `status`
  // make fails with ENOENT rather than reaching whatever CLI happens to sit beside `node` on
  // this machine; the bins themselves are spawned through the absolute `NODE` path.
  const emptyBin = join(root, 'bin');
  mkdirSync(emptyBin, { recursive: true });
  const result = spawnSync(NODE, journey.args(side), {
    cwd: side.project,
    input: journey.stdin?.(side) ?? '',
    env: isolatedSpawnEnv(side.home, { PATH: emptyBin, TZ: 'UTC' }),
    encoding: 'utf-8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const clean = (text: string) => {
    const spelled = normalize(text, [
      [root, '<root>'],
      [realpathSync(root), '<root>'],
      [outdir, '<dist>'],
    ]);
    return journey.normalize?.(spelled) ?? spelled;
  };
  return { stdout: clean(result.stdout), stderr: clean(result.stderr), exitCode: result.status };
}

for (const journey of JOURNEYS) {
  test(journey.name, () => {
    const shipped = runSide(join(buildRoot, 'shipped'), journey, 'shipped');
    const ported = runSide(join(buildRoot, 'ported'), journey, 'ported');

    expect(ported).toStrictEqual(shipped);
    recordPorted(ported, [[pkg.version, '<version>']]);
    journey.check(shipped);
  }, 60_000);
}
