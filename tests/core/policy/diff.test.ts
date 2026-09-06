import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestEnvironment } from '@/core/environment';
import * as ported from '@/core/policy/diff';
import { normalizeGuiPolicy } from '@/core/policy/store';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';

/**
 * `policy check` prints these rows and `policy apply` writes what they describe, so how the diff
 * flattens, orders and words them is contract. The baseline read is the one place it could
 * diverge quietly: it mirrors the runtime's precedence — an existing file wins even when it is
 * unreadable, and the embedded Amp snapshot stands in only when none exists.
 */

const HOME = '/srv/home/tester';
const environment = createTestEnvironment({ home: HOME });
const EMBEDDED = '__CC_SAFETY_NET_EMBEDDED_POLICY__';

const DEFAULTS = normalizeGuiPolicy({ version: 1 }, HOME);
const STRICT = normalizeGuiPolicy(
  {
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
  },
  HOME,
);
const PARANOID = normalizeGuiPolicy(
  {
    version: 1,
    safety: { level: 'paranoid', overrides: { paranoid_interpreters: true } },
    destructive_command_protection: { enabled: false, overrides: {}, allow_paths: [] },
    audit: { retention_days: 90 },
  },
  HOME,
);
const POLICIES = [DEFAULTS, STRICT, PARANOID];

describe('flattening a policy into displayed rows', () => {
  test('the default policy flattens to one row per section with an empty list spelled (none)', () => {
    expect(ported.flattenPolicy(DEFAULTS, true)).toEqual({
      'safety.level': 'standard',
      'workflow.worktree_mode': 'false',
      'destructive_command_protection.enabled': 'true',
      'destructive_command_protection.allow_paths': '(none)',
      'secret_protection.enabled': 'true',
      'secret_protection.deny_paths': '(none)',
      'secret_protection.allow_paths': '(none)',
      'audit.retention_days': '30',
    });
  });

  test('a configured policy adds one row per set override and joins path lists with commas', () => {
    expect(ported.flattenPolicy(STRICT, true)).toEqual({
      'safety.level': 'strict',
      'safety.overrides.fail_closed': 'true',
      'safety.overrides.paranoid_rm': 'false',
      'workflow.worktree_mode': 'true',
      'destructive_command_protection.enabled': 'true',
      'destructive_command_protection.overrides.git.reset-hard': 'off',
      'destructive_command_protection.allow_paths': '/srv/scratch, /srv/build',
      'secret_protection.enabled': 'false',
      'secret_protection.overrides.secret.basename.env': 'off',
      'secret_protection.deny_paths': '/srv/vault',
      'secret_protection.allow_paths': '/srv/public',
      'audit.retention_days': '5',
    });
  });

  test('an unset override contributes no row at all', () => {
    expect(ported.flattenPolicy(PARANOID, true)).toEqual({
      'safety.level': 'paranoid',
      'safety.overrides.paranoid_interpreters': 'true',
      'workflow.worktree_mode': 'false',
      'destructive_command_protection.enabled': 'false',
      'destructive_command_protection.allow_paths': '(none)',
      'secret_protection.enabled': 'true',
      'secret_protection.deny_paths': '(none)',
      'secret_protection.allow_paths': '(none)',
      'audit.retention_days': '90',
    });
  });

  test.each([
    ['the default policy', DEFAULTS],
    ['a strict policy', STRICT],
    ['a paranoid policy', PARANOID],
  ])('audit is user scope only, so %s drops it from a project comparison', (_label, policy) => {
    expect(ported.flattenPolicy(policy, false)).toEqual(
      Object.fromEntries(
        Object.entries(ported.flattenPolicy(policy, true)).filter(
          ([field]) => field !== 'audit.retention_days',
        ),
      ),
    );
  });
});

describe('the changed rows between two policies', () => {
  test('raising the default policy to strict reports every field that moved', () => {
    expect(ported.diffPolicyRows(DEFAULTS, STRICT, true)).toEqual([
      { field: 'safety.level', before: 'standard', after: 'strict' },
      { field: 'workflow.worktree_mode', before: 'false', after: 'true' },
      {
        field: 'destructive_command_protection.allow_paths',
        before: '(none)',
        after: '/srv/scratch, /srv/build',
      },
      { field: 'secret_protection.enabled', before: 'true', after: 'false' },
      { field: 'secret_protection.deny_paths', before: '(none)', after: '/srv/vault' },
      { field: 'secret_protection.allow_paths', before: '(none)', after: '/srv/public' },
      { field: 'audit.retention_days', before: '30', after: '5' },
      { field: 'safety.overrides.fail_closed', before: undefined, after: 'true' },
      { field: 'safety.overrides.paranoid_rm', before: undefined, after: 'false' },
      {
        field: 'destructive_command_protection.overrides.git.reset-hard',
        before: undefined,
        after: 'off',
      },
      {
        field: 'secret_protection.overrides.secret.basename.env',
        before: undefined,
        after: 'off',
      },
    ]);
  });

  test('a field only the current policy sets reports an absent after side', () => {
    expect(
      ported
        .diffPolicyRows(STRICT, DEFAULTS, true)
        .filter((row) => row.field === 'safety.overrides.fail_closed'),
    ).toEqual([{ field: 'safety.overrides.fail_closed', before: 'true', after: undefined }]);
  });

  test.each([
    ['the default policy', DEFAULTS],
    ['a strict policy', STRICT],
    ['a paranoid policy', PARANOID],
  ])('%s against itself has no changed rows', (_label, policy) => {
    expect(ported.diffPolicyRows(policy, policy, true)).toEqual([]);
  });

  // Row order follows the first policy's fields, so the comparison is by field, not by position.
  test('reversing a comparison reports the same fields with the two sides swapped', () => {
    const byField = (rows: readonly ported.PolicyDiffRow[]) =>
      [...rows].sort((a, b) => a.field.localeCompare(b.field));
    for (const current of POLICIES) {
      for (const proposed of POLICIES) {
        expect(byField(ported.diffPolicyRows(proposed, current, true))).toEqual(
          byField(
            ported
              .diffPolicyRows(current, proposed, true)
              .map((row) => ({ field: row.field, before: row.after, after: row.before })),
          ),
        );
      }
    }
  });

  test('a project comparison never reports an audit row', () => {
    for (const current of POLICIES) {
      for (const proposed of POLICIES) {
        expect(
          ported.diffPolicyRows(current, proposed, false).map((row) => row.field),
        ).not.toContain('audit.retention_days');
      }
    }
  });
});

describe('the sparse project file a proposal writes', () => {
  test('only the sections the proposal sets are written, so the rest keeps inheriting', () => {
    expect(
      ported.buildProjectPolicyFileValue({ version: 1, safety: { level: 'strict' } }, STRICT),
    ).toEqual({ version: 1, safety: { level: 'strict' } });
  });

  test('audit has no project scope and is dropped from the written file', () => {
    expect(
      ported.buildProjectPolicyFileValue(
        { version: 1, workflow: { worktree_mode: true }, audit: { retention_days: 5 } },
        STRICT,
      ),
    ).toEqual({ version: 1, workflow: { worktree_mode: true } });
  });

  test.each([
    ['an array', ['not an object']],
    ['a string', 'not an object either'],
  ])('a proposal that is %s writes the version and nothing else', (_label, proposal) => {
    expect(ported.buildProjectPolicyFileValue(proposal, STRICT)).toEqual({ version: 1 });
  });
});

/** A home whose policy file holds `file`, or none when `file` is undefined. */
function policyHome(file?: string) {
  const root = createTempRoot('policy-diff-');
  mkdirSync(join(root, '.cc-safety-net'), { recursive: true });
  if (file !== undefined) writeFileSync(join(root, '.cc-safety-net', 'policy.json'), file);
  return {
    path: join(root, '.cc-safety-net', 'policy.json'),
    options: { userConfigDir: join(root, '.cc-safety-net', 'rules') },
  };
}

describe('reading the policy file behind the diff', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[EMBEDDED];
    removeTempRoots();
  });

  test('a valid file yields its parsed JSON and no errors', () => {
    const home = policyHome('{"version":1,"safety":{"level":"strict"}}');
    expect(ported.readPolicyJson(home.path)).toEqual({
      value: { version: 1, safety: { level: 'strict' } },
      errors: [],
    });
  });

  test('a file the schema rejects still parses, so the read reports no error of its own', () => {
    const home = policyHome('{"version":1,"safety":{"level":"nope"},"tier":"gold"}');
    expect(ported.readPolicyJson(home.path)).toEqual({
      value: { version: 1, safety: { level: 'nope' }, tier: 'gold' },
      errors: [],
    });
  });

  test.each([
    ['malformed JSON', '{"version":1,'],
    ['an empty file', ''],
  ])('%s is reported as invalid JSON against the path that holds it', (_label, file) => {
    const home = policyHome(file);
    const read = ported.readPolicyJson(home.path);
    expect(read.value).toBeUndefined();
    expect(read.errors).toHaveLength(1);
    // The parser's own wording moves between runtimes; the classification and the path do not.
    expect(read.errors[0]).toStartWith(`${home.path}: Invalid JSON:`);
  });

  test('a missing file names itself rather than reporting a JSON failure', () => {
    const home = policyHome();
    expect(ported.readPolicyJson(home.path)).toEqual({
      errors: [`${home.path}: file not found`],
    });
  });
});

describe('the baseline the effective diff merges against', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)[EMBEDDED];
    removeTempRoots();
  });

  test('a valid file is the baseline and carries no diagnostics', () => {
    const home = policyHome('{"version":1,"safety":{"level":"strict"}}');
    const read = ported.readRuntimeUserBaseline(environment, home.options);
    expect(read.baseline.safety.level).toBe('strict');
    expect(read.diagnostics).toEqual([]);
  });

  test('a file the schema rejects is salvaged into the baseline and reports the schema diagnostics', () => {
    const home = policyHome('{"version":1,"safety":{"level":"nope"},"tier":"gold"}');
    const read = ported.readRuntimeUserBaseline(environment, home.options);
    // The rejected level falls back to the protective default rather than to the file's value.
    expect(read.baseline.safety.level).toBe('standard');
    expect(read.diagnostics).toEqual([
      'unknown field "tier"',
      'safety.level must be "standard", "strict", or "paranoid"',
    ]);
  });

  test.each([
    ['malformed JSON', '{"version":1,'],
    ['an empty file', ''],
  ])('%s degrades the baseline to protective defaults and reports the JSON failure', (_l, file) => {
    const home = policyHome(file);
    const read = ported.readRuntimeUserBaseline(environment, home.options);
    expect(read.baseline).toEqual(DEFAULTS);
    expect(read.diagnostics).toHaveLength(1);
    expect(read.diagnostics[0]).toContain('Invalid JSON:');
  });

  test('no file at all and no embedded snapshot is the default policy with no diagnostics', () => {
    const home = policyHome();
    expect(ported.readRuntimeUserBaseline(environment, home.options)).toEqual({
      baseline: DEFAULTS,
      diagnostics: [],
    });
  });

  test('the embedded snapshot an Amp install stamped in stands in when no file exists', () => {
    const home = policyHome();
    (globalThis as Record<string, unknown>)[EMBEDDED] = {
      version: 1,
      safety: { level: 'paranoid' },
    };
    const read = ported.readRuntimeUserBaseline(environment, home.options);
    expect(read.baseline.safety.level).toBe('paranoid');
    expect(read.diagnostics).toEqual([]);
  });

  test('an existing file wins over the embedded snapshot even when it is unreadable', () => {
    const home = policyHome('{"version":1,');
    (globalThis as Record<string, unknown>)[EMBEDDED] = {
      version: 1,
      safety: { level: 'paranoid' },
    };
    expect(ported.readRuntimeUserBaseline(environment, home.options).baseline.safety.level).toBe(
      'standard',
    );
  });
});
