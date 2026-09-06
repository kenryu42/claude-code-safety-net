import { afterAll, describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { createProcessEnvironment, type Environment } from '@/core/environment';
import { resolveProtectedGitMetadata } from '@/core/git/metadata';
import {
  bashCall,
  createGateTree,
  expectRecordedDigest,
  type GateVerdict,
  portedVerdict,
} from '../helpers/gate-differential';
import { HARVESTED_LITERAL_COUNT, HARVESTED_LITERALS } from '../helpers/harvested-literals';
import { policySnapshot } from '../helpers/policy';
import { FUZZ_SAMPLE_COUNT, FUZZ_SEED, fuzzShellSources } from '../helpers/shell-inputs';
import { normalize, rootFolds, withProcessEnv } from '../helpers/temp-home';

/**
 * Every string the retired test suites spelled out, replayed as a command through the gate and
 * recorded as digests. Those suites proved thousands of small facts one at a time; replaying their
 * literals keeps all of them pinned without importing or copying a single test file. The seeded
 * fuzz then pins the catch boundary: whatever the gate throws stays inside it, so no verdict is
 * `uncaught`.
 */

const tree = createGateTree('gate-harvested-');

const environment = createProcessEnvironment();

afterAll(() => {
  tree.remove();
});

/**
 * What the gate reads out of the process while a batch runs. It reads a snapshot of `process.env`,
 * so a literal spelling `$TMPDIR` or `~` would otherwise decide on whatever the host set — `allow`
 * where `TMPDIR` is unset, `deny` where it names a directory above the fixture — and a recorded
 * verdict would carry the machine's own paths. The two variables that reach a verdict point into
 * the fixture; the rest are the synthetic values the trace recordings already use.
 */
const PINNED_PROCESS = {
  HOME: tree.home,
  LOGNAME: 'agent',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  SHELL: '/bin/bash',
  TMPDIR: tree.root,
  USER: 'agent',
};

/** One batch over the pinned process, with the gate's snapshot taken inside the pinned window. */
const withPinnedProcess = <T>(batch: (environment: Environment) => T): T =>
  withProcessEnv(PINNED_PROCESS, () => batch(createProcessEnvironment()));

/** Both directories are real, so a relative operand resolves; only one of them is a repository. */
const PLACES = [
  {
    where: 'workspace',
    cwd: tree.workspace,
    metadata: resolveProtectedGitMetadata(tree.workspace, environment),
  },
  {
    where: 'repository',
    cwd: tree.repository,
    metadata: resolveProtectedGitMetadata(tree.repository, environment),
  },
] as const;

/**
 * The level comes from the policy the gate is handed. `getCCSafetyNetEnvModes` can still raise it
 * from an ambient `CC_SAFETY_NET_*` variable, which the pinned process decides.
 */
const LEVELS = [
  { level: 'standard', snapshot: policySnapshot() },
  { level: 'strict', snapshot: policySnapshot({ safety: { level: 'strict' } }) },
] as const;

const PARANOID_LEVELS = [
  {
    level: 'paranoid_rm',
    snapshot: policySnapshot({ safety: { overrides: { paranoidRm: true } } }),
  },
  {
    level: 'paranoid_interpreters',
    snapshot: policySnapshot({ safety: { overrides: { paranoidInterpreters: true } } }),
  },
] as const;

const home = homedir();

/**
 * The recorded shape of a verdict. Home text reaches one only through a `~` or `$HOME` expansion
 * in `evidence.segment`, and is folded only where the input does not spell the home itself: a
 * sandbox whose home is `/root` must keep a literal `/root` in an input the way every other
 * machine sees it.
 */
const folded = (input: string, verdict: GateVerdict) =>
  normalize(verdict, [
    ...rootFolds(tree.root),
    ...(input.includes(home) ? [] : [[home, '<home>'] as const]),
  ]);

/** Every verdict the ported gate reached, per place and level, for the recorded digests. */
const recorded = new Map(
  PLACES.flatMap((place) =>
    [...LEVELS, ...PARANOID_LEVELS].map((entry) => [
      `${place.where}/${entry.level}`,
      [] as [string, GateVerdict][],
    ]),
  ),
);

/** Room for a slow machine: a batch decides a few thousand invocations. */
const BATCH_TIMEOUT_MS = 30_000;

/** Which verdicts the replay actually reached, so the batches cannot pass by deciding nothing. */
const reached = new Set<string>();

function decide(input: string, index: number, environment: Environment): GateVerdict[] {
  const levels = index % 10 === 0 ? [...LEVELS, ...PARANOID_LEVELS] : LEVELS;
  return PLACES.flatMap((place) =>
    levels.map((entry) => {
      const ported = portedVerdict(bashCall(input, place.cwd), environment, {
        loadPolicySnapshot: () => entry.snapshot,
        resolveGitMetadata: () => place.metadata,
      });
      recorded.get(`${place.where}/${entry.level}`)?.push([input, folded(input, ported)]);
      reached.add(`${ported.outcome} ${String(ported.stage)} ${ported.ruleId ?? ''}`.trim());
      return ported;
    }),
  );
}

const BATCH_SIZE = 250;

describe(`${HARVESTED_LITERAL_COUNT} literals harvested from the shipped test suite`, () => {
  test('the harvest read whole files, not a fragment of them', () => {
    expect(HARVESTED_LITERAL_COUNT).toBeGreaterThan(5_000);
    for (const known of ['rm -rf /', 'git reset --hard', 'cat ~/.ssh/config', 'npm run build']) {
      expect(HARVESTED_LITERALS).toContain(known);
    }
    // A literal this long means the scanner lost the quote state and swallowed source: the
    // longest the retired suites actually spelled out is a few hundred characters.
    expect(HARVESTED_LITERALS.filter((literal) => literal.length > 2_000)).toStrictEqual([]);
  });

  for (let start = 0; start < HARVESTED_LITERAL_COUNT; start += BATCH_SIZE) {
    const batch = HARVESTED_LITERALS.slice(start, start + BATCH_SIZE);
    test(
      `literals ${start + 1}-${start + batch.length} of ${HARVESTED_LITERAL_COUNT} decide identically`,
      () =>
        withPinnedProcess((environment) => {
          const verdicts = batch.flatMap((input, offset) =>
            decide(input, start + offset, environment),
          );
          expect(verdicts.filter((verdict) => verdict.outcome === 'uncaught')).toStrictEqual([]);
        }),
      BATCH_TIMEOUT_MS,
    );
  }

  test('the ported verdicts match the recorded digests', () => {
    expect([...recorded.keys()].sort()).toStrictEqual([
      'repository/paranoid_interpreters',
      'repository/paranoid_rm',
      'repository/standard',
      'repository/strict',
      'workspace/paranoid_interpreters',
      'workspace/paranoid_rm',
      'workspace/standard',
      'workspace/strict',
    ]);
    for (const [key, pairs] of recorded) {
      expect(pairs.length).toBeGreaterThan(0);
      expectRecordedDigest(key, pairs);
    }
  });

  test('the closed secret-walk gap is decided as a secret denial', () => {
    const pair = recorded
      .get('workspace/standard')
      ?.find(([input]) => input === 'cd ~ && cat .ssh/config');
    expect(pair).toBeDefined();
    expect(pair?.[1]).toMatchObject({
      outcome: 'deny',
      stage: 'secret-protection',
      ruleId: 'secret.home.ssh',
    });
  });

  test('the replay reached allows, analyzer denials and secret denials', () => {
    expect([...reached].some((entry) => entry.startsWith('allow'))).toBeTrue();
    expect(reached.has('deny command-analysis rm.recursive-force-root-or-home')).toBeTrue();
    expect(reached.has('deny secret-protection secret.home.ssh')).toBeTrue();
    expect(reached.has('deny command-validation')).toBeTrue();
  });
});

const FUZZ_BATCH_SIZE = 500;

describe(`${FUZZ_SAMPLE_COUNT} seeded fuzz sources through both gates`, () => {
  const sources = fuzzShellSources(FUZZ_SAMPLE_COUNT, FUZZ_SEED);
  const dependencies = {
    loadPolicySnapshot: () => LEVELS[0].snapshot,
    resolveGitMetadata: () => null,
  };
  for (let start = 0; start < sources.length; start += FUZZ_BATCH_SIZE) {
    const batch = sources.slice(start, start + FUZZ_BATCH_SIZE);
    test(
      `sources ${start + 1}-${start + batch.length} agree and never escape the catch boundary`,
      () =>
        withPinnedProcess((environment) => {
          const escaped: GateVerdict[] = [];
          const pairs: [string, GateVerdict][] = [];
          for (const source of batch) {
            const ported = portedVerdict(
              bashCall(source, tree.workspace),
              environment,
              dependencies,
            );
            pairs.push([source, folded(source, ported)]);
            if (ported.outcome === 'uncaught') escaped.push(ported);
          }
          expect(escaped).toStrictEqual([]);
          expectRecordedDigest(`fuzz/${start + 1}-${start + batch.length}`, pairs);
        }),
      BATCH_TIMEOUT_MS,
    );
  }
});
