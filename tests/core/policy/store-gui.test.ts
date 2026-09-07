import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestEnvironment } from '@/core/environment';
import { deriveEffectiveSafetyLevel } from '@/core/policy/env';
import * as ported from '@/core/policy/store';
import { getUserPolicyDiagnostics } from '@/core/policy/validate';
import { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/rules/destructive';
import { snapshotTree } from '../../helpers/fixture-tree';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
} from '../../helpers/temp-home';
import { mutate, USER_POLICY_VALUES } from './policy-values';

/**
 * The four helpers the GUI reads, previews, repairs and writes user policy with. They take the
 * `Environment`, so every row names the home and the mode flags it runs under as a map and a
 * developer's own shell cannot move what they report.
 */

const HOME = '/srv/home/tester';
const MUTATION_COUNT = 200;

/** The fixture documents and a seeded mutation of each, for the properties below. */
const DOCUMENTS: readonly unknown[] = (() => {
  const random = createSeededRandom(FUZZ_SEED);
  return USER_POLICY_VALUES.concat(
    Array.from({ length: MUTATION_COUNT }, (_unused, index) =>
      mutate(USER_POLICY_VALUES.at(index % USER_POLICY_VALUES.length), random),
    ),
  );
})();

const environmentWith = (values: Record<string, string>) =>
  createTestEnvironment({ home: HOME, env: new Map(Object.entries(values)) });

/** The report the resolver writes for the row that names a level it does not recognize. */
const INVALID_LEVEL_REPORT = 'CC Safety Net: ignored invalid CC_SAFETY_NET_LEVEL=';

/**
 * The rows below resolve the environment once per document, so the row naming an invalid level
 * reports it hundreds of times and buries the run's own output. The report is pinned verbatim in
 * `tests/core/policy/env.test.ts`; here it is captured, and anything else reaching the channel is
 * a diagnostic these rows are not supposed to produce.
 */
function withCapturedReports(run: () => void): void {
  const captured: string[] = [];
  const spy = spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    captured.push(parts.map(String).join(' '));
  });
  try {
    run();
  } finally {
    spy.mockRestore();
  }
  expect(captured.filter((line) => !line.startsWith(INVALID_LEVEL_REPORT))).toEqual([]);
}

const CONFIGURABLE_RULE_COUNT = DESTRUCTIVE_COMMAND_RULE_METADATA.filter(
  (rule) => rule.catastrophic !== true,
).length;

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

describe('previewing a proposed policy document', () => {
  test('a valid document is previewed at the level it selects', () => {
    const result = ported.previewUserPolicyForGui(environmentWith({}), {
      version: 1,
      safety: { level: 'strict' },
    });
    expect(result.errors).toEqual([]);
    expect(result.preview?.selectedPreset).toBe('strict');
    expect(result.preview?.effectiveLevel).toBe('strict');
  });

  test('a document the schema rejects is not previewed at all, only reported', () => {
    expect(
      ported.previewUserPolicyForGui(environmentWith({}), {
        version: 1,
        safety: { level: 'bogus' },
        secret_protection: { enabled: 'yes' },
      }),
    ).toEqual({
      errors: [
        'safety.level must be "standard", "strict", or "paranoid"',
        'secret_protection.enabled must be a boolean',
      ],
    });
  });

  test('the built-in default document previews cleanly', () => {
    const result = ported.previewUserPolicyForGui(environmentWith({}), ported.DEFAULT_GUI_POLICY);
    expect(result.errors).toEqual([]);
    expect(result.preview?.selectedPreset).toBe('standard');
  });
});

describe('properties every proposed document must satisfy', () => {
  test('a document is either previewed or reported, never both and never neither', () => {
    for (const document of DOCUMENTS) {
      const result = ported.previewUserPolicyForGui(environmentWith({}), document);
      expect(result.preview !== undefined).toBe(result.errors.length === 0);
    }
  });

  test('a previewed document is one the salvage would have left untouched', () => {
    for (const document of DOCUMENTS) {
      const result = ported.previewUserPolicyForGui(environmentWith({}), document);
      if (result.preview === undefined) continue;
      expect(result.preview.selectedPreset).toBe(
        ported.normalizeGuiPolicy(document, HOME).safety.level,
      );
    }
  });

  test.each(ENV_MAPS.map((row) => [row.label, row.values] as const))(
    'a preview under %s counts every configurable rule exactly once',
    (_label, values) => {
      const env = environmentWith(values).env;
      withCapturedReports(() => {
        for (const document of DOCUMENTS) {
          const preview = ported.createPolicyPreview(
            ported.normalizeGuiPolicy(document, HOME),
            env,
          );
          const states = Object.values(preview.rules);
          const configurable = states.filter((state) => state.source !== 'catastrophic');
          expect(Object.keys(preview.rules)).toHaveLength(DESTRUCTIVE_COMMAND_RULE_METADATA.length);
          expect(configurable).toHaveLength(CONFIGURABLE_RULE_COUNT);
          // The GUI headline reads "N active / M disabled": each tally is the rules that are
          // actually in that state, so a swapped pair is a wrong headline, not a wrong sum.
          expect(preview.counts.enabled).toBe(configurable.filter((state) => state.enabled).length);
          expect(preview.counts.disabled).toBe(
            configurable.filter((state) => !state.enabled).length,
          );
          expect(preview.counts.effectiveCustomizations).toBe(
            states.filter((state) => state.changesInherited).length,
          );
          expect(preview.effectiveLevel).toBe(
            deriveEffectiveSafetyLevel({
              failClosed: preview.capabilities.fail_closed.enabled,
              paranoidRm: preview.capabilities.paranoid_rm.enabled,
              paranoidInterpreters: preview.capabilities.paranoid_interpreters.enabled,
            }),
          );
        }
      });
    },
    60_000,
  );

  test.each(
    ENV_MAPS.map((row) => [row.label, row.values, row.effectiveLevel] as const),
  )('the default policy reports the effective level under %s', (_label, values, effectiveLevel) => {
    let preview!: ReturnType<typeof ported.createPolicyPreview>;
    withCapturedReports(() => {
      preview = ported.createPolicyPreview(ported.DEFAULT_GUI_POLICY, environmentWith(values).env);
    });
    expect(preview.effectiveLevel).toBe(effectiveLevel);
    // Catastrophic rules are always enforced, so they are surfaced separately and never counted.
    const catastrophic = Object.values(preview.rules).filter(
      (state) => state.source === 'catastrophic',
    );
    expect(catastrophic.length).toBeGreaterThan(0);
    // The tallies themselves are asserted by the invariant above, which decides the default
    // policy too: the empty document is one of DOCUMENTS and salvages to DEFAULT_GUI_POLICY.
  });

  test('with no mode flag set the default policy activates exactly the ungated rules', () => {
    const preview = ported.createPolicyPreview(ported.DEFAULT_GUI_POLICY, environmentWith({}).env);
    expect(preview.counts.enabled).toBe(
      DESTRUCTIVE_COMMAND_RULE_METADATA.filter(
        (rule) => rule.catastrophic !== true && rule.activationCapability === undefined,
      ).length,
    );
    expect(preview.counts.disabled).toBe(
      DESTRUCTIVE_COMMAND_RULE_METADATA.filter(
        (rule) => rule.catastrophic !== true && rule.activationCapability !== undefined,
      ).length,
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

const REJECTED_POLICY =
  '{"version":1,"safety":{"level":"bogus"},"audit":{"retention_days":5},"secret_protection":{"enabled":"yes"}}';

/** A home holding `file` as its user policy, or none when `file` is null. */
const seedHome = (file: string | null) => {
  const root = createTempRoot('gui-store-');
  mkdirSync(join(root, '.cc-safety-net'), { recursive: true });
  if (file !== null) writeFileSync(join(root, '.cc-safety-net', 'policy.json'), file);
  return { root, environment: environmentFor(root, isolationEnv(root)) };
};

type FileState = {
  readonly behavior: string;
  readonly file: string | null;
  readonly exists: boolean;
  /** Exact messages where the wording is ours; a prefix where the JSON parser supplies it. */
  readonly errors: readonly string[] | { readonly startsWith: string };
  /** What the GUI shows for this file — the same projection the engine enforces. */
  readonly shownLevel: 'standard' | 'strict' | 'paranoid';
  readonly shownRetentionDays: number;
  /** What repair writes back. */
  readonly repairedRetentionDays: number;
};

const FILE_STATES: readonly FileState[] = [
  {
    behavior: 'no file at all is the default policy, and not an error',
    file: null,
    exists: false,
    errors: [],
    shownLevel: 'standard',
    shownRetentionDays: 30,
    repairedRetentionDays: 30,
  },
  {
    behavior: 'an empty file names emptiness and shows the defaults',
    file: '',
    exists: true,
    errors: ['Config file is empty'],
    shownLevel: 'standard',
    shownRetentionDays: 30,
    repairedRetentionDays: 30,
  },
  {
    behavior: 'a whitespace-only file is empty too',
    file: '   \n',
    exists: true,
    errors: ['Config file is empty'],
    shownLevel: 'standard',
    shownRetentionDays: 30,
    repairedRetentionDays: 30,
  },
  {
    behavior: 'malformed JSON reports the parse failure and shows the defaults',
    file: '{ not json',
    exists: true,
    errors: { startsWith: 'Invalid JSON:' },
    shownLevel: 'standard',
    shownRetentionDays: 30,
    repairedRetentionDays: 30,
  },
  {
    behavior:
      'a file the schema rejects keeps the sections that were valid, so repair does not lose them',
    file: REJECTED_POLICY,
    exists: true,
    errors: [
      'safety.level must be "standard", "strict", or "paranoid"',
      'secret_protection.enabled must be a boolean',
    ],
    shownLevel: 'standard',
    shownRetentionDays: 5,
    repairedRetentionDays: 5,
  },
  {
    behavior: 'a valid strict policy is shown as written',
    file: STRICT_POLICY,
    exists: true,
    errors: [],
    shownLevel: 'strict',
    shownRetentionDays: 10,
    repairedRetentionDays: 10,
  },
];

describe('reading the user policy file for the GUI', () => {
  afterEach(removeTempRoots);

  test.each(FILE_STATES.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    const home = seedHome(row.file);
    const read = ported.readUserPolicyForGui(home.environment);

    expect(read.path).toBe(join(home.root, '.cc-safety-net', 'policy.json'));
    expect(read.exists).toBe(row.exists);
    expect(read.raw).toBe(row.file ?? '');
    if (Array.isArray(row.errors)) expect(read.errors).toEqual([...row.errors]);
    if (!Array.isArray(row.errors)) {
      expect(read.errors).toHaveLength(1);
      expect(read.errors[0]).toStartWith((row.errors as { startsWith: string }).startsWith);
    }
    // The GUI shows the salvaged projection the engine enforces, never the raw file.
    expect(read.policy.safety.level).toBe(row.shownLevel);
    expect(read.policy.audit.retention_days).toBe(row.shownRetentionDays);
  });
});

describe('repairing the user policy file', () => {
  afterEach(removeTempRoots);

  test.each(
    FILE_STATES.map((row) => [row.behavior, row] as const),
  )('repair rewrites the canonical document — %s', (_behavior, row) => {
    const home = seedHome(row.file);
    const repaired = ported.repairUserPolicyForGui(home.environment);

    expect(repaired.errors).toEqual([]);
    expect(repaired.policy.audit.retention_days).toBe(row.repairedRetentionDays);
    // The whole config directory: one owner-only file with the canonical bytes, and no
    // half-written temp file left beside it.
    expect(
      snapshotTree(home.root).filter((entry) => entry.path.startsWith('.cc-safety-net/')),
    ).toEqual([
      {
        path: '.cc-safety-net/policy.json',
        kind: 'file',
        content: `${JSON.stringify(repaired.policy, null, 2)}\n`,
      },
    ]);
    // Windows has no POSIX mode to assert.
    if (process.platform !== 'win32')
      expect(lstatSync(join(home.root, '.cc-safety-net', 'policy.json')).mode & 0o777).toBe(0o600);
    // What repair wrote validates cleanly, so a repaired file never degrades the next load.
    expect(getUserPolicyDiagnostics(repaired.policy, home.environment.home)).toEqual([]);
  });

  test('a file nothing could be salvaged from is replaced with the defaults', () => {
    const home = seedHome('{ not json');
    expect(ported.repairUserPolicyForGui(home.environment).policy).toStrictEqual(
      ported.DEFAULT_GUI_POLICY,
    );
  });
});
