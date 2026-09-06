import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestEnvironment } from '@next/core/environment';
import * as ported from '@next/core/policy/store';
import { processHomeDir } from '@/ir/environment';
import * as shipped from '@/policy/store';
import { snapshotTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
  withProcessEnv,
} from '../../helpers/temp-home';
import { mutate, USER_POLICY_VALUES } from './policy-values';

/**
 * The four helpers the GUI reads, previews, repairs and writes user policy with. The shipped ones
 * read the home and the mode flags off the process; the ported ones take the `Environment`, so
 * every row runs the shipped side with the process pointed at a temp home and a blanked mode
 * environment, and the ported side over an identical second home with the same values as a map.
 */

const HOME = processHomeDir();
const MUTATION_COUNT = 200;

const seededDocuments = createSeededRandom(FUZZ_SEED);
const documents: readonly unknown[] = USER_POLICY_VALUES.concat(
  Array.from({ length: MUTATION_COUNT }, (_unused, index) =>
    mutate(USER_POLICY_VALUES.at(index % USER_POLICY_VALUES.length), seededDocuments),
  ),
);

/** Every flag that can raise the level or force a capability on, so a developer's own shell cannot
 *  move the preview the shipped side computes. */
const MODE_FLAGS = [
  'CC_SAFETY_NET_LEVEL',
  'CC_SAFETY_NET_STRICT',
  'CC_SAFETY_NET_PARANOID',
  'CC_SAFETY_NET_PARANOID_RM',
  'CC_SAFETY_NET_PARANOID_INTERPRETERS',
  'CC_SAFETY_NET_WORKTREE',
  'SAFETY_NET_STRICT',
  'SAFETY_NET_PARANOID',
  'SAFETY_NET_PARANOID_RM',
  'SAFETY_NET_PARANOID_INTERPRETERS',
  'SAFETY_NET_WORKTREE',
];

const processValues = (values: Record<string, string>) => ({
  ...Object.fromEntries(MODE_FLAGS.map((name) => [name, undefined])),
  ...values,
});

const environmentWith = (values: Record<string, string>) =>
  createTestEnvironment({ home: HOME, env: new Map(Object.entries(values)) });

const ENV_MAPS: readonly {
  readonly label: string;
  readonly values: Record<string, string>;
  readonly effectiveLevel: ReturnType<typeof ported.createPolicyPreview>['effectiveLevel'];
}[] = [
  { label: 'no mode flag set', values: {}, effectiveLevel: 'standard' },
  {
    label: 'the level raised to paranoid',
    values: { CC_SAFETY_NET_LEVEL: 'paranoid' },
    effectiveLevel: 'paranoid',
  },
  { label: 'the strict flag', values: { CC_SAFETY_NET_STRICT: '1' }, effectiveLevel: 'strict' },
  {
    label: 'one capability forced on',
    values: { CC_SAFETY_NET_PARANOID_RM: '1' },
    effectiveLevel: 'custom',
  },
  {
    label: 'a level the parser rejects',
    values: { CC_SAFETY_NET_LEVEL: 'bogus' },
    effectiveLevel: 'standard',
  },
];

describe('the GUI policy preview', () => {
  test('previews every document exactly as the shipped store does', () => {
    withProcessEnv(processValues({}), () => {
      const recorded: (readonly [string, unknown])[] = [];
      for (const [row, document] of documents.entries()) {
        const preview = ported.previewUserPolicyForGui(environmentWith({}), document);
        expect(preview).toStrictEqual(shipped.previewUserPolicyForGui(document));
        recorded.push([`${row}`, preview]);
      }
      expectRecordedDigest('core-store-gui/preview', normalize(recorded, [[HOME, '<home>']]));
    });
  }, 60_000);

  test.each(ENV_MAPS.map((row) => [row.label, row.values] as const))(
    'resolves every salvaged policy the same way with %s',
    (label, values) => {
      const policies = documents.map((document) => shipped.normalizeGuiPolicy(document));
      const environment = environmentWith(values);
      withProcessEnv(processValues(values), () => {
        const recorded: (readonly [string, unknown])[] = [];
        for (const [row, policy] of policies.entries()) {
          const preview = ported.createPolicyPreview(policy, environment.env);
          expect(preview).toStrictEqual(shipped.createPolicyPreview(policy));
          recorded.push([`${row}`, preview]);
        }
        expectRecordedDigest(`core-store-gui/${label}`, normalize(recorded, [[HOME, '<home>']]));
      });
    },
    60_000,
  );

  test.each(
    ENV_MAPS.map((row) => [row.label, row.values, row.effectiveLevel] as const),
  )('reports the effective level under %s', (_label, values, effectiveLevel) => {
    const preview = ported.createPolicyPreview(
      ported.DEFAULT_GUI_POLICY,
      environmentWith(values).env,
    );
    expect(preview.effectiveLevel).toBe(effectiveLevel);
    // Catastrophic rules are always enforced, so they are surfaced separately and never counted.
    const states = Object.values(preview.rules);
    const catastrophic = states.filter((state) => state.source === 'catastrophic');
    expect(catastrophic.length).toBeGreaterThan(0);
    expect(preview.counts.enabled + preview.counts.disabled).toBe(
      states.length - catastrophic.length,
    );
  });
});

const STRICT_POLICY = `${JSON.stringify(
  {
    ...ported.DEFAULT_GUI_POLICY,
    safety: { level: 'strict', overrides: {} },
    audit: { retention_days: 10 },
  },
  null,
  2,
)}\n`;

const POLICY_FILES: readonly { readonly label: string; readonly file: string | null }[] = [
  { label: 'no file at all', file: null },
  { label: 'an empty file', file: '' },
  { label: 'whitespace only', file: '   \n' },
  { label: 'malformed JSON', file: '{ not json' },
  {
    label: 'a file the schema rejects',
    file: '{"version":1,"safety":{"level":"bogus"},"audit":{"retention_days":5},"secret_protection":{"enabled":"yes"}}',
  },
  { label: 'a valid strict policy', file: STRICT_POLICY },
];

const seedHome = (side: string, file: string | null) => {
  const root = createTempRoot(`gui-store-${side}-`);
  mkdirSync(join(root, '.cc-safety-net'), { recursive: true });
  if (file !== null) writeFileSync(join(root, '.cc-safety-net', 'policy.json'), file);
  return root;
};

const observed = (root: string, run: () => { read: unknown; repair: unknown }) =>
  normalize({ ...run(), tree: snapshotTree(root) }, [[root, '<root>']]);

const portedSide = (file: string | null) => {
  const root = seedHome('ported', file);
  const environment = environmentFor(root, isolationEnv(root));
  return observed(root, () => ({
    read: ported.readUserPolicyForGui(environment),
    repair: ported.repairUserPolicyForGui(environment),
  }));
};

const shippedSide = (file: string | null) => {
  const root = seedHome('shipped', file);
  return withProcessEnv(isolationEnv(root), () =>
    observed(root, () => ({
      read: shipped.readUserPolicyForGui(),
      repair: shipped.repairUserPolicyForGui(),
    })),
  );
};

describe('reading and repairing the user policy file', () => {
  afterEach(removeTempRoots);

  test.each(
    POLICY_FILES.map((row) => [row.label, row.file] as const),
  )('reads and repairs %s the same way', (_label, file) => {
    const observedPorted = portedSide(file);
    expect(observedPorted).toStrictEqual(shippedSide(file));
    recordPorted(observedPorted);
  });

  test('reports what each file state is', () => {
    const readOf = (file: string | null) =>
      portedSide(file).read as ReturnType<typeof ported.readUserPolicyForGui>;

    expect(readOf(null).exists).toBeFalse();
    expect(readOf(null).errors).toEqual([]);
    expect(readOf('').exists).toBeTrue();
    expect(readOf('').errors).toEqual(['Config file is empty']);
    expect(readOf('   \n').errors).toEqual(['Config file is empty']);
    expect(readOf('{ not json').errors[0]).toStartWith('Invalid JSON:');
    const rejected = readOf(POLICY_FILES[4]?.file ?? null);
    expect(rejected.errors.length).toBeGreaterThan(0);
    // The salvaged projection keeps the section the schema accepted, so repair does not lose it.
    expect(rejected.policy.audit.retention_days).toBe(5);
    expect(readOf(STRICT_POLICY).errors).toEqual([]);
    expect(readOf(STRICT_POLICY).policy.safety.level).toBe('strict');
  });

  test('repair leaves an owner-only file holding the canonical document', () => {
    const side = portedSide(POLICY_FILES[4]?.file ?? null);
    const repaired = side.repair as ReturnType<typeof ported.repairUserPolicyForGui>;

    expect(repaired.policy.audit.retention_days).toBe(5);
    // The whole config directory: the owner-only file with the canonical bytes, and no half-written
    // temp file left beside it.
    expect(side.tree.filter((entry) => entry.path.startsWith('.cc-safety-net/'))).toEqual([
      {
        path: '.cc-safety-net/policy.json',
        kind: 'file',
        mode: 0o600,
        content: `${JSON.stringify(repaired.policy, null, 2)}\n`,
      },
    ]);
  });

  test('repair replaces a file nothing could be salvaged from with the defaults', () => {
    const repaired = portedSide('{ not json').repair as ReturnType<
      typeof ported.repairUserPolicyForGui
    >;
    expect(repaired.policy).toStrictEqual(ported.DEFAULT_GUI_POLICY);
    expect(repaired.errors).toEqual([]);
  });
});
