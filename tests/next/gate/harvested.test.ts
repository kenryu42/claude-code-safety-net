import { afterAll, describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { createProcessEnvironment, type Environment } from '@next/core/environment';
import { resolveProtectedGitMetadata } from '@/guards/git-metadata-protection';
import { policySnapshot } from '../../helpers/policy';
import {
  bashCall,
  createGateTree,
  deniedByTrackedCwd,
  expectRecordedDigest,
  type GateVerdict,
  portedVerdict,
  shippedVerdict,
} from '../helpers/gate-differential';
import { HARVESTED_LITERAL_COUNT, HARVESTED_LITERALS } from '../helpers/harvested-literals';
import { FUZZ_SAMPLE_COUNT, FUZZ_SEED, fuzzShellSources } from '../helpers/shell-inputs';
import { normalize, rootFolds, withProcessEnv } from '../helpers/temp-home';

/**
 * Every string the shipped test suite spells out, replayed as a command through both gates. The
 * legacy suite proved thousands of small facts against `src/`; running its literals through the
 * port turns all of them into one oracle without importing or copying a single test file. The
 * seeded fuzz then pins the catch boundary: whatever the port throws, `src/` throws it too, and
 * the class is always `GuardEvaluationError`.
 */

const tree = createGateTree('gate-harvested-');

afterAll(() => {
  tree.remove();
});

/**
 * What both gates read out of the process while a batch runs. The shipped gate reads `process.env`
 * itself and the port reads a snapshot of it, so a literal spelling `$TMPDIR` or `~` decides on
 * whatever the host set — `allow` where `TMPDIR` is unset, `deny` where it names a directory above
 * the fixture — and a recorded verdict would carry the machine's own paths. The two variables that
 * reach a verdict point into the fixture; the rest are the synthetic values the trace
 * differentials already record against.
 */
const PINNED_PROCESS = {
  HOME: tree.home,
  LOGNAME: 'agent',
  PATH: '/usr/local/bin:/usr/bin:/bin',
  SHELL: '/bin/bash',
  TMPDIR: tree.root,
  USER: 'agent',
};

/** One batch over the pinned process, with the port's snapshot taken inside the pinned window. */
const withPinnedProcess = <T>(batch: (environment: Environment) => T): T =>
  withProcessEnv(PINNED_PROCESS, () => batch(createProcessEnvironment()));

/** Both directories are real, so a relative operand resolves; only one of them is a repository. */
const PLACES = [
  {
    where: 'workspace',
    cwd: tree.workspace,
    metadata: resolveProtectedGitMetadata([tree.workspace]),
  },
  {
    where: 'repository',
    cwd: tree.repository,
    metadata: resolveProtectedGitMetadata([tree.repository]),
  },
] as const;

/**
 * The level comes from the policy each side is handed. `getCCSafetyNetEnvModes` can still raise it
 * from an ambient `CC_SAFETY_NET_*` variable, but both gates read that from the same process — the
 * shipped one directly, the port through the snapshot of it — so the two always agree.
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

type Mismatch = {
  input: string;
  where: string;
  level: string;
  ported: GateVerdict;
  shipped: GateVerdict;
};

/** Room for a slow machine: a batch decides a few thousand invocations against both gates. */
const BATCH_TIMEOUT_MS = 30_000;

/**
 * The one class of difference the port is meant to have: a secret denial the shared guard walk
 * reaches because a `cd` moved the tracked cwd. Collected instead of failing, then pinned to the
 * exact inputs below so a second literal cannot slip into the class unnoticed.
 */
const walkDivergences: Mismatch[] = [];

function evidenceSegment(verdict: GateVerdict): string | undefined {
  const evidence = Array.isArray(verdict.evidence) ? verdict.evidence[0] : undefined;
  if (typeof evidence !== 'object' || evidence === null || !('segment' in evidence))
    return undefined;
  return typeof evidence.segment === 'string' ? evidence.segment : undefined;
}

/** Which verdicts the replay actually reached, so the batches cannot pass by deciding nothing. */
const reached = new Set<string>();

function disagreements(input: string, index: number, environment: Environment): Mismatch[] {
  const levels = index % 10 === 0 ? [...LEVELS, ...PARANOID_LEVELS] : LEVELS;
  return PLACES.flatMap((place) =>
    levels.flatMap((entry) => {
      const call = bashCall(input, place.cwd);
      const dependencies = {
        loadPolicySnapshot: () => entry.snapshot,
        resolveGitMetadata: () => place.metadata,
      };
      const ported = portedVerdict(call, environment, dependencies);
      recorded.get(`${place.where}/${entry.level}`)?.push([input, folded(input, ported)]);
      const shipped = shippedVerdict(call, dependencies);
      reached.add(`${ported.outcome} ${String(ported.stage)} ${ported.ruleId ?? ''}`.trim());
      if (Bun.deepEquals(ported, shipped, true)) return [];
      const mismatch = { input, where: place.where, level: entry.level, ported, shipped };
      const segment = evidenceSegment(ported);
      if (
        ported.outcome === 'deny' &&
        ported.stage === 'secret-protection' &&
        (shipped.outcome === 'allow' || shipped.stage === 'command-analysis') &&
        segment !== undefined &&
        deniedByTrackedCwd(
          input,
          segment,
          ported.ruleId,
          place.cwd,
          environment,
          entry.snapshot.policy.secretProtection,
        )
      ) {
        walkDivergences.push(mismatch);
        return [];
      }
      return [mismatch];
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
    // longest the shipped suites actually spell out is a few hundred characters.
    expect(HARVESTED_LITERALS.filter((literal) => literal.length > 2_000)).toStrictEqual([]);
  });

  for (let start = 0; start < HARVESTED_LITERAL_COUNT; start += BATCH_SIZE) {
    const batch = HARVESTED_LITERALS.slice(start, start + BATCH_SIZE);
    test(
      `literals ${start + 1}-${start + batch.length} of ${HARVESTED_LITERAL_COUNT} decide identically`,
      () =>
        withPinnedProcess((environment) => {
          expect(
            batch.flatMap((input, offset) => disagreements(input, start + offset, environment)),
          ).toStrictEqual([]);
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

  test('the accepted differences are the tracked-cwd secret denials and nothing else', () => {
    const inputs = [...new Set(walkDivergences.map((entry) => entry.input))].sort();
    console.log(
      `tracked-cwd divergences: ${walkDivergences.length} over ${inputs.length} input(s) ${JSON.stringify(inputs)}`,
    );
    expect(inputs).toStrictEqual(['cd ~ && cat .ssh/config']);
    expect(
      walkDivergences.filter((entry) => entry.ported.ruleId?.startsWith('secret.') !== true),
    ).toStrictEqual([]);
    expect(walkDivergences.filter((entry) => entry.shipped.outcome !== 'allow')).toStrictEqual([]);
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
          const differing = batch.flatMap((source) => {
            const call = bashCall(source, tree.workspace);
            const ported = portedVerdict(call, environment, dependencies);
            pairs.push([source, folded(source, ported)]);
            if (ported.outcome === 'uncaught') escaped.push(ported);
            const shipped = shippedVerdict(call, dependencies);
            return Bun.deepEquals(ported, shipped, true) ? [] : [{ source, ported, shipped }];
          });
          expect({ differing, escaped }).toStrictEqual({ differing: [], escaped: [] });
          expectRecordedDigest(`fuzz/${start + 1}-${start + batch.length}`, pairs);
        }),
      BATCH_TIMEOUT_MS,
    );
  }
});
