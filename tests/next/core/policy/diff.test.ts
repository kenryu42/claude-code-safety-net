import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestEnvironment } from '@next/core/environment';
import * as ported from '@next/core/policy/diff';
import { processHomeDir } from '@/ir/environment';
import * as shipped from '@/policy/diff';
import { normalizeGuiPolicy } from '@/policy/store';
import {
  createTempRoot,
  normalize,
  recordPorted,
  removeTempRoots,
  rootFolds,
} from '../../helpers/temp-home';

/**
 * `policy check` prints these rows and `policy apply` writes what they describe, so the port has
 * to flatten, order and word them exactly as the shipped diff does. The baseline read is the one
 * place the two could diverge quietly: it mirrors the runtime's precedence — an existing file
 * wins even when it is unreadable, and the embedded Amp snapshot stands in only when none exists.
 */

const HOME = processHomeDir();
const HOME_FOLDS = [[HOME, '<home>']] as const;
const environment = createTestEnvironment({ home: HOME });
const EMBEDDED = '__CC_SAFETY_NET_EMBEDDED_POLICY__';

const DEFAULTS = normalizeGuiPolicy({ version: 1 });
const STRICT = normalizeGuiPolicy({
  version: 1,
  safety: { level: 'strict', overrides: { fail_closed: true, paranoid_rm: false } },
  workflow: { worktree_mode: true },
  destructive_command_protection: {
    enabled: true,
    overrides: { 'git.reset-hard': 'off' },
    allow_paths: ['/srv/scratch', '/srv/build'],
  },
  secret_protection: {
    enabled: false,
    overrides: { 'secret.basename.env': 'off' },
    deny_paths: ['/srv/vault'],
    allow_paths: ['/srv/public'],
  },
  audit: { retention_days: 5 },
});
const PARANOID = normalizeGuiPolicy({
  version: 1,
  safety: { level: 'paranoid', overrides: { paranoid_interpreters: true } },
  destructive_command_protection: { enabled: false, overrides: {}, allow_paths: [] },
  audit: { retention_days: 90 },
});
const POLICIES = [DEFAULTS, STRICT, PARANOID];

const FILES = [
  ['a valid policy', '{"version":1,"safety":{"level":"strict"}}'],
  ['malformed JSON', '{"version":1,'],
  ['a policy the schema rejects', '{"version":1,"safety":{"level":"nope"},"tier":"gold"}'],
  ['an empty file', ''],
  ['no file at all', undefined],
] as const;

/** A home whose policy file holds `file`, or none when `file` is undefined. */
function policyHome(file?: string) {
  const root = createTempRoot('policy-diff-');
  mkdirSync(join(root, '.cc-safety-net'), { recursive: true });
  if (file !== undefined) writeFileSync(join(root, '.cc-safety-net', 'policy.json'), file);
  return { root, options: { userConfigDir: join(root, '.cc-safety-net', 'rules') } };
}

describe('the policy diff port describes a proposal as the shipped diff does', () => {
  test.each([true, false])('flattens every policy with includeAudit %p', (includeAudit) => {
    for (const policy of POLICIES) {
      const flattened = ported.flattenPolicy(policy, includeAudit);
      expect(flattened).toStrictEqual(shipped.flattenPolicy(policy, includeAudit));
      recordPorted(flattened, HOME_FOLDS);
    }
  });

  test('reports the same changed rows for every ordered pair of policies', () => {
    for (const current of POLICIES) {
      for (const proposed of POLICIES) {
        for (const includeAudit of [true, false]) {
          const rows = ported.diffPolicyRows(current, proposed, includeAudit);
          expect(rows).toStrictEqual(shipped.diffPolicyRows(current, proposed, includeAudit));
          recordPorted(rows, HOME_FOLDS);
        }
      }
    }
  });

  test('writes the same sparse project file for a proposal that sets one section', () => {
    for (const proposal of [
      { version: 1, safety: { level: 'strict' } },
      { version: 1, workflow: { worktree_mode: true }, audit: { retention_days: 5 } },
      ['not an object'],
      'not an object either',
    ]) {
      const built = ported.buildProjectPolicyFileValue(proposal, STRICT);
      expect(built).toStrictEqual(shipped.buildProjectPolicyFileValue(proposal, STRICT));
      recordPorted(built, HOME_FOLDS);
    }
  });
});

describe('the policy diff port reads a file as the shipped diff does', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[EMBEDDED];
    removeTempRoots();
  });

  test.each(FILES)('reads %s the same way', (_label, file) => {
    const home = policyHome(file);
    const path = join(home.root, '.cc-safety-net', 'policy.json');
    const replacements = [[home.root, '<root>']] as const;
    const read = normalize(ported.readPolicyJson(path), replacements);
    expect(read).toStrictEqual(normalize(shipped.readPolicyJson(path), replacements));
    recordPorted(read, HOME_FOLDS);
  });

  test.each(FILES)('takes %s as the same baseline and diagnostics', (_label, file) => {
    const home = policyHome(file);
    const replacements = [[home.root, '<root>']] as const;
    const baseline = normalize(
      ported.readRuntimeUserBaseline(environment, home.options),
      replacements,
    );
    expect(baseline).toStrictEqual(
      normalize(shipped.readRuntimeUserBaseline(home.options), replacements),
    );
    recordPorted(baseline, HOME_FOLDS);
  });

  test('falls back to the embedded snapshot an Amp install stamped in', () => {
    const home = policyHome();
    (globalThis as Record<string, unknown>)[EMBEDDED] = {
      version: 1,
      safety: { level: 'paranoid' },
    };
    const embedded = ported.readRuntimeUserBaseline(environment, home.options);
    expect(embedded).toStrictEqual(shipped.readRuntimeUserBaseline(home.options));
    recordPorted(embedded, [...rootFolds(home.root), ...HOME_FOLDS]);
    expect(ported.readRuntimeUserBaseline(environment, home.options).baseline.safety.level).toBe(
      'paranoid',
    );
  });
});
