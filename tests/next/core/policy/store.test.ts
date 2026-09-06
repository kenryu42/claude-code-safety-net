import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestEnvironment } from '@next/core/environment';
import { readRetentionDays } from '@next/core/policy/retention';
import * as ported from '@next/core/policy/store';
import { resolveAuditRetentionDays } from '@/engine/audit-retention';
import { processHomeDir } from '@/ir/environment';
import * as shipped from '@/policy/store';
import {
  SECRET_DEFAULT_OFF_RULE_ID_SET,
  SECRET_PROTECTION_RULE_ID_SET,
} from '@/rules/secret-protection-rules';
import { snapshotTree } from '../../helpers/fixture-tree';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';
import { createTempRoot, normalize, recordPorted, removeTempRoots } from '../../helpers/temp-home';
import { mutate, USER_POLICY_VALUES } from './policy-values';

/**
 * The salvage normalizer is what the whole loader stands on: an invalid section falls back
 * to its protective default and every other section stays in force. The port takes the home
 * directory as an argument instead of reading it from the process, so each fixture document
 * and a seeded mutation of it is normalized by both implementations and compared, with the
 * injected home set to the one the shipped store reads ambiently.
 */

const HOME = processHomeDir();
const HOME_FOLDS = [[HOME, '<home>']] as const;
const MUTATION_COUNT = 200;

const documents = (() => {
  const random = createSeededRandom(FUZZ_SEED);
  return [
    ...USER_POLICY_VALUES,
    ...Array.from({ length: MUTATION_COUNT }, (_unused, index) =>
      mutate(USER_POLICY_VALUES[index % USER_POLICY_VALUES.length], random),
    ),
  ];
})();

const overrideMaps: readonly Record<string, 'on' | 'off'>[] = [
  {},
  ...[...SECRET_DEFAULT_OFF_RULE_ID_SET].slice(0, 3).map((id) => ({ [id]: 'on' as const })),
  ...[...SECRET_PROTECTION_RULE_ID_SET].slice(0, 3).map((id) => ({ [id]: 'off' as const })),
  Object.fromEntries(
    [...SECRET_DEFAULT_OFF_RULE_ID_SET]
      .slice(0, 4)
      .map((id, index) => [id, index % 2 === 0 ? 'on' : 'off'] as const),
  ),
];

describe('the policy store port normalizes exactly as the shipped store does', () => {
  test('the built-in default policy is the same document', () => {
    expect(ported.DEFAULT_GUI_POLICY).toStrictEqual(shipped.DEFAULT_GUI_POLICY);
    expect(ported.DEFAULT_GUI_POLICY).toMatchSnapshot();
  });

  test('every user policy document salvages to the same canonical policy', () => {
    for (const document of documents) {
      const salvaged = ported.normalizeGuiPolicy(document, HOME);
      expect(salvaged).toStrictEqual(shipped.normalizeGuiPolicy(document));
      recordPorted(salvaged, HOME_FOLDS);
    }
  }, 30_000);

  test('every project policy document projects to the same present fields', () => {
    for (const document of documents) {
      const projected = ported.projectPolicyProjection(document, HOME);
      expect(projected).toStrictEqual(shipped.projectPolicyProjection(document));
      recordPorted(projected, HOME_FOLDS);
    }
  }, 30_000);

  test('every salvaged safety section projects to the same runtime safety', () => {
    for (const document of documents) {
      const safety = shipped.normalizeGuiPolicy(document).safety;
      const normalized = ported.normalizeSafety(safety);
      expect(normalized).toStrictEqual(shipped.normalizeSafety(safety));
      expect(normalized).toMatchSnapshot();
    }
  }, 30_000);

  test('the default-off secret tier resolves to the same disabled rule list', () => {
    const maps = [
      ...overrideMaps,
      ...documents.map(
        (document) => shipped.normalizeGuiPolicy(document).secret_protection.overrides,
      ),
    ];
    for (const overrides of maps) {
      const disabled = ported.resolveSecretDisabledRules(overrides);
      expect(disabled).toStrictEqual(shipped.resolveSecretDisabledRules(overrides));
      expect(disabled).toMatchSnapshot();
    }
  }, 30_000);
});

/**
 * Retention is read from the same salvaged policy the snapshot reads rather than from a
 * second parser, so the rows below are the ones where the two could disagree: values the
 * clamp rejects, a field of the wrong type, and every way the file can fail to be read.
 */
const RETENTION_FILES: readonly { readonly label: string; readonly file: string }[] = [
  { label: 'below the minimum', file: '{"version":1,"audit":{"retention_days":0}}' },
  { label: 'at the minimum', file: '{"version":1,"audit":{"retention_days":1}}' },
  { label: 'the default window', file: '{"version":1,"audit":{"retention_days":30}}' },
  { label: 'at the maximum', file: '{"version":1,"audit":{"retention_days":365}}' },
  { label: 'above the maximum', file: '{"version":1,"audit":{"retention_days":366}}' },
  { label: 'a fractional window', file: '{"version":1,"audit":{"retention_days":1.5}}' },
  { label: 'a numeric string', file: '{"version":1,"audit":{"retention_days":"5"}}' },
  { label: 'a null window', file: '{"version":1,"audit":{"retention_days":null}}' },
  { label: 'an audit section with no window', file: '{"version":1,"audit":{}}' },
  { label: 'no audit section', file: '{"version":1,"safety":{"level":"strict"}}' },
  {
    label: 'a window beside fields that fail validation',
    file: '{"version":1,"tier":"gold","safety":{"level":"paranoid!"},"audit":{"retention_days":45}}',
  },
  { label: 'malformed JSON', file: '{"version":1,"audit":' },
  { label: 'an empty file', file: '' },
  { label: 'whitespace only', file: '   \n' },
  { label: 'a JSON array', file: '[]' },
];

describe('audit retention reads the same window as the shipped resolver', () => {
  const root = mkdtempSync(join(tmpdir(), 'next-retention-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const windowFor = (userConfigDir: string) =>
    readRetentionDays(createTestEnvironment({ home: HOME }), { userConfigDir });

  test.each(
    RETENTION_FILES.map((row) => [row.label, row.file] as const),
  )('reads %s the same way', (label, file) => {
    const home = join(root, label.replace(/\W+/g, '-'));
    mkdirSync(join(home, 'rules'), { recursive: true });
    writeFileSync(join(home, 'policy.json'), file);
    const userConfigDir = join(home, 'rules');
    const days = windowFor(userConfigDir);
    expect(days).toBe(resolveAuditRetentionDays({ userConfigDir }));
    expect(days).toMatchSnapshot();
  });

  test('reads a directory at the policy path the same way', () => {
    const userConfigDir = join(root, 'directory', 'rules');
    mkdirSync(userConfigDir, { recursive: true });
    mkdirSync(join(root, 'directory', 'policy.json'));
    const days = windowFor(userConfigDir);
    expect(days).toBe(resolveAuditRetentionDays({ userConfigDir }));
    expect(days).toMatchSnapshot();
  });

  test('reads a missing policy file the same way', () => {
    const userConfigDir = join(root, 'absent', 'rules');
    mkdirSync(userConfigDir, { recursive: true });
    const days = windowFor(userConfigDir);
    expect(days).toBe(resolveAuditRetentionDays({ userConfigDir }));
    expect(days).toMatchSnapshot();
  });
});

/**
 * `policy apply` writes the user scope through this call, so what lands on disk is contract: the
 * salvaged document, the 0600 file inside a 0700 directory, and nothing at all when the proposal
 * fails validation. Each side writes into its own root, and the two roots are compared as trees.
 */
const GUI_POLICIES: readonly { readonly label: string; readonly policy: unknown }[] = [
  {
    label: 'a strict policy with a home-relative allow path',
    policy: {
      version: 1,
      safety: { level: 'strict', overrides: { paranoid_rm: true } },
      workflow: { worktree_mode: true },
      destructive_command_protection: { allow_paths: ['~/scratch'] },
      audit: { retention_days: 45 },
    },
  },
  { label: 'the minimal document', policy: { version: 1 } },
  { label: 'a level the schema rejects', policy: { version: 1, safety: { level: 'nope' } } },
  { label: 'a document that is not an object', policy: 'not a policy' },
];

describe('the GUI policy write lands what the shipped write lands', () => {
  afterEach(removeTempRoots);

  const environment = createTestEnvironment({ home: HOME });

  const landed = (side: string, write: (options: { userConfigDir: string }) => unknown) => {
    const root = createTempRoot(`gui-policy-${side}-`);
    const result = write({ userConfigDir: join(root, '.cc-safety-net', 'rules') });
    return normalize({ result, tree: snapshotTree(root) }, [[root, '<root>']]);
  };

  test.each(
    GUI_POLICIES.map((row) => [row.label, row.policy] as const),
  )('writes %s the same way', (_label, policy) => {
    const applied = landed('ported', (options) =>
      ported.writeUserPolicyFromGui(environment, policy, options),
    );
    expect(applied).toStrictEqual(
      landed('shipped', (options) => shipped.writeUserPolicyFromGui(policy, options)),
    );
    recordPorted(applied, HOME_FOLDS);
  });

  test('leaves an owner-only file inside an owner-only directory', () => {
    const written = landed('modes', (options) =>
      ported.writeUserPolicyFromGui(environment, { version: 1 }, options),
    );
    expect(written.tree).toEqual([
      { path: '.cc-safety-net', kind: 'directory', mode: 0o700 },
      {
        path: '.cc-safety-net/policy.json',
        kind: 'file',
        mode: 0o600,
        content: `${JSON.stringify(ported.DEFAULT_GUI_POLICY, null, 2)}\n`,
      },
    ]);
  });

  test('writes nothing when the proposal fails validation', () => {
    const written = landed('invalid', (options) =>
      ported.writeUserPolicyFromGui(environment, { version: 2 }, options),
    );
    expect(written.tree).toEqual([]);
    expect((written.result as { errors: string[] }).errors).toEqual(['version must be 1']);
  });
});
