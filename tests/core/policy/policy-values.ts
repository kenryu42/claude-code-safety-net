/**
 * Fixture documents for the policy differential tests: a canonical file of each kind, one
 * document per failure class the validators report, and a seeded mutator that walks a
 * document and applies a few edits from a fixed vocabulary. Shared with the loader tests,
 * which write the same documents to disk.
 */

const LONG_REASON = 'r'.repeat(257);

export const USER_POLICY_VALUES: readonly unknown[] = [
  { version: 1 },
  {
    version: 1,
    safety: {
      level: 'strict',
      overrides: { fail_closed: true, paranoid_rm: false, paranoid_interpreters: true },
    },
    workflow: { worktree_mode: true },
    destructive_command_protection: {
      enabled: true,
      overrides: { 'git.checkout-force': 'off', 'git.alias-config': 'on' },
      allow_paths: ['/srv/scratch', '~/scratch'],
    },
    secret_protection: {
      enabled: false,
      overrides: { 'secret.basename.env': 'off' },
      deny_paths: ['config/production.env'],
      allow_paths: ['~/work/fixtures/sample.env'],
    },
    audit: { retention_days: 14 },
  },
  { version: 1, safety: { level: 'standard' } },
  { version: 1, safety: { level: 'paranoid', overrides: {} } },
  {},
  { version: 2 },
  { version: '1' },
  { version: null },
  { version: 1, safety: 'strict' },
  { version: 1, safety: null },
  { version: 1, safety: [] },
  { version: 1, safety: { level: 'lenient' } },
  { version: 1, safety: { level: null, overrides: null } },
  { version: 1, safety: { level: 'strict', overrides: [] } },
  { version: 1, safety: { level: 'strict', overrides: { fail_closed: 'yes' } } },
  {
    version: 1,
    safety: { overrides: { paranoid_rm: 1, paranoid_interpreters: null, tighten: true } },
  },
  { version: 1, safety: { level: 'strict', tier: 'gold' } },
  { version: 1, workflow: null },
  { version: 1, workflow: [] },
  { version: 1, workflow: { worktree_mode: 'on', branch: 'main' } },
  { version: 1, destructive_command_protection: null },
  { version: 1, destructive_command_protection: [] },
  { version: 1, destructive_command_protection: { enabled: 'true' } },
  { version: 1, destructive_command_protection: { overrides: null } },
  {
    version: 1,
    destructive_command_protection: {
      overrides: { 'git.no-such-rule': 'on', 'git.alias-config': 1 },
    },
  },
  { version: 1, destructive_command_protection: { allow_paths: '/srv' } },
  {
    version: 1,
    destructive_command_protection: { allow_paths: ['   ', 42, 'relative/dir', '~', '/'] },
  },
  { version: 1, destructive_command_protection: { allow_paths: ['$HOME/scratch'], keep: true } },
  { version: 1, secret_protection: null },
  { version: 1, secret_protection: [] },
  { version: 1, secret_protection: { enabled: [], overrides: 'off' } },
  {
    version: 1,
    secret_protection: { overrides: { 'secret.nope': 'off', 'secret.basename.env': [] } },
  },
  { version: 1, secret_protection: { deny_paths: { path: '~' } } },
  { version: 1, secret_protection: { deny_paths: ['~', '/', '${HOME}', '  ', null] } },
  {
    version: 1,
    secret_protection: { allow_paths: ['~/**/config', '~/.cc-safety-net/policy.json'] },
  },
  { version: 1, secret_protection: { allow_paths: ['$HOME'], deny_paths: ['$HOME/keys'] } },
  { version: 1, audit: null },
  { version: 1, audit: [] },
  { version: 1, audit: { retention_days: 0 } },
  { version: 1, audit: { retention_days: 1 } },
  { version: 1, audit: { retention_days: 365 } },
  { version: 1, audit: { retention_days: 366 } },
  { version: 1, audit: { retention_days: 1.5 } },
  { version: 1, audit: { retention_days: '5' } },
  { version: 1, audit: { retention_days: null } },
  { version: 1, audit: { retention_days: 30, scope: 'blocked' } },
  { version: 1, telemetry: true, notes: 'ignored' },
  {
    version: 1,
    secret_protection: { deny_paths: ['~'], allow_paths: [1], enabled: 'x', extra: 1 },
    destructive_command_protection: {
      allow_paths: ['relative'],
      overrides: { 'git.checkout-force': 'maybe' },
    },
  },
  {
    version: 0,
    safety: { level: 3, overrides: { fail_closed: 'no' } },
    workflow: { worktree_mode: [] },
    destructive_command_protection: { enabled: null, allow_paths: [null] },
    secret_protection: { enabled: 1, deny_paths: 'none' },
    audit: { retention_days: -1 },
    stray: 'field',
  },
  null,
  [],
  ['version'],
  'policy',
  42,
  true,
];

const GITHUB_SOURCE = 'acme/guardrails#main/deploy-rules';

const manySources = (count: number) =>
  Array.from({ length: count }, (_, index) => `bulk-rules-${index}`);

export const RULES_CONFIG_VALUES: readonly unknown[] = [
  { version: 1 },
  { version: 1, rules: [], overrides: {}, transparent_wrappers: [] },
  {
    $schema: './rule.schema.json',
    version: 1,
    rules: ['infra-rules', GITHUB_SOURCE],
    overrides: {
      'infra-rules/block-force-push': 'off',
      'infra-rules/block-reset': { reason: 'Ask the release owner first.', intent: 'manual_only' },
    },
    transparent_wrappers: ['rtk', 'pnpm'],
    editor_hint: true,
  },
  { $schema: 42, version: 1, rules: ['infra-rules'] },
  { $schema: { editor: 'zed' }, version: 1 },
  { $schema: null, version: 1, rules: [GITHUB_SOURCE] },
  {},
  { version: 2, rules: ['infra-rules'] },
  { version: 1, rules: 'infra-rules' },
  { version: 1, rules: null },
  { version: 1, rules: { name: 'infra-rules' } },
  { version: 1, rules: [7] },
  { version: 1, rules: [''] },
  { version: 1, rules: ['   '] },
  { version: 1, rules: ['not a source!'] },
  { version: 1, rules: ['infra-rules', 'infra-rules', 'infra-rules', ' infra-rules'] },
  { version: 1, rules: ['acme/guardrails#'] },
  { version: 1, rules: [GITHUB_SOURCE, GITHUB_SOURCE] },
  { version: 1, rules: manySources(64) },
  { version: 1, rules: manySources(65) },
  { version: 1, rules: [...manySources(65), 9], overrides: { bad: 'off' } },
  { version: 1, overrides: null },
  { version: 1, overrides: [] },
  { version: 1, overrides: 'off' },
  {
    version: 1,
    overrides: {
      'a/b': true,
      'a/c': [],
      'a/d': {},
      'a/e': 'on',
      'a/f': { reason: 5 },
      'a/g': { reason: 'ok', intent: null },
      'a/h': { reason: 'ok', extra: 1 },
    },
  },
  { version: 1, overrides: { 'a/i': { reason: '' }, 'a/j': { reason: LONG_REASON } } },
  // A non-string reason still carries a `length`, which the schema checks beside the type error.
  { version: 1, overrides: { 'a/m': { reason: [...LONG_REASON] } } },
  { version: 1, overrides: { 'a/k': { reason: 'ok', intent: 'scope_down' } } },
  { version: 1, overrides: { plain: 'off', 'too/many/slashes': 'off', '/leading': 'off' } },
  { version: 1, overrides: { 'a/l': null } },
  { version: 1, transparent_wrappers: null },
  { version: 1, transparent_wrappers: 'rtk' },
  { version: 1, transparent_wrappers: [5] },
  { version: 1, transparent_wrappers: [''] },
  { version: 1, transparent_wrappers: ['not a wrapper'] },
  { version: 1, transparent_wrappers: ['git'] },
  { version: 1, transparent_wrappers: ['python3', 'awk', 'busybox'] },
  { version: 1, transparent_wrappers: ['rtk', 'rtk', 'rtk'] },
  {
    version: 2,
    rules: ['infra-rules', ''],
    overrides: { nope: { reason: '' } },
    transparent_wrappers: ['bash', 5],
  },
  null,
  [],
  'rules',
  0,
];

const v1Rulebook = (rules: unknown) => ({
  rulebook_version: 1,
  name: 'infra-guards',
  version: '2.4.0',
  allowed_commands: ['terraform', 'kubectl'],
  rules,
});

const v2Rulebook = (rules: unknown) => ({
  rulebook_version: 2,
  name: 'deploy-guards',
  version: '0.1.0',
  allowed_commands: ['helm'],
  rules,
});

const v1Rule = {
  name: 'block-destroy',
  command: 'terraform',
  subcommand: 'destroy',
  block_args: ['-auto-approve'],
  reason: 'Destroying infrastructure needs a human.',
  intent: 'manual_only',
};

const v2Rule = {
  name: 'block-uninstall',
  command: 'helm',
  match: { command_path: ['uninstall'], any_args: ['--no-hooks'], exclude_args: ['--dry-run'] },
  reason: 'Uninstalling a release drops live state.',
  intent: 'hard_stop',
};

export const RULEBOOK_VALUES: readonly unknown[] = [
  {
    ...v1Rulebook([
      v1Rule,
      {
        name: 'block-delete-namespace',
        command: 'kubectl',
        block_args: ['delete', 'namespace'],
        reason: 'Namespace deletion is irreversible.',
      },
    ]),
    description: 'Guards for the infra workspace',
    author: 'platform',
    tests: [
      { command: 'terraform destroy -auto-approve', expect: 'blocked', rule: 'block-destroy' },
      { command: 'terraform plan', expect: 'allowed' },
    ],
  },
  {
    ...v2Rulebook([v2Rule]),
    tests: [
      { command: 'helm uninstall app --no-hooks', expect: 'blocked', rule: 'block-uninstall' },
    ],
  },
  { ...v1Rulebook([v1Rule]), rulebook_version: 3 },
  { ...v1Rulebook([v1Rule]), rulebook_version: '2' },
  { ...v2Rulebook([v2Rule]), rulebook_version: undefined },
  { ...v1Rulebook([v1Rule]), name: 4 },
  { ...v1Rulebook([v1Rule]), name: 'not a rule name' },
  { ...v1Rulebook([v1Rule]), version: '' },
  { ...v1Rulebook([v1Rule]), version: 2.4 },
  { ...v1Rulebook([v1Rule]), allowed_commands: 'terraform' },
  { ...v1Rulebook([v1Rule]), allowed_commands: [null, 'terraform', 'not a command'] },
  { ...v1Rulebook([v1Rule]), allowed_commands: ['terraform', 'terraform', 'kubectl', 'kubectl'] },
  v1Rulebook('none'),
  v1Rulebook([]),
  v1Rulebook([null, 3, 'rule', []]),
  v1Rulebook([{}]),
  v1Rulebook([{ ...v1Rule, name: 5 }]),
  v1Rulebook([{ ...v1Rule, name: 'has spaces' }]),
  v1Rulebook([{ ...v1Rule, command: 'not a command' }]),
  v1Rulebook([{ ...v1Rule, command: undefined }]),
  v1Rulebook([{ ...v1Rule, subcommand: 9 }]),
  v1Rulebook([{ ...v1Rule, subcommand: 'not a subcommand' }]),
  v1Rulebook([{ ...v1Rule, block_args: 'auto' }]),
  v1Rulebook([{ ...v1Rule, block_args: [] }]),
  v1Rulebook([{ ...v1Rule, block_args: ['', 4, '-f'] }]),
  v1Rulebook([{ ...v1Rule, block_args: ['-f', ''] }]),
  v1Rulebook([{ ...v1Rule, reason: '' }]),
  v1Rulebook([{ ...v1Rule, reason: LONG_REASON }]),
  v1Rulebook([{ ...v1Rule, reason: 12 }]),
  v1Rulebook([{ ...v1Rule, intent: 'shrug' }]),
  v1Rulebook([{ ...v1Rule, intent: null }]),
  v1Rulebook([
    { ...v1Rule, name: 'dup' },
    { ...v1Rule, name: 'DUP' },
    { ...v1Rule, name: 'dup' },
    { ...v1Rule, name: 6 },
  ]),
  v1Rulebook([{ ...v1Rule, command: 'ansible' }]),
  v1Rulebook(Array.from({ length: 70 }, (_, index) => index)),
  v1Rulebook(Array.from({ length: 1_025 }, () => ({}))),
  v2Rulebook([{ ...v2Rule, match: undefined }]),
  v2Rulebook([{ ...v2Rule, match: 'uninstall' }]),
  v2Rulebook([{ ...v2Rule, match: [] }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: 'x', any_args: [], exclude_args: [1, 1] } }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: [] } }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: ['uninstall', ''] } }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: ['a'], any_args: ['a', 'a', ''] } }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: ['a'], exclude_args: ['b', 'b'] } }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: ['a'], any_args: 'b' } }]),
  v2Rulebook([{ ...v2Rule, match: { command_path: ['a'], future: true } }]),
  v2Rulebook([{ ...v2Rule, subcommand: 'uninstall' }]),
  v2Rulebook([{ ...v2Rule, block_args: ['--no-hooks'] }]),
  v2Rulebook([{ ...v2Rule, subcommand: undefined, block_args: [] }]),
  { ...v1Rulebook([v1Rule]), tests: 'none' },
  { ...v1Rulebook([v1Rule]), tests: [] },
  { ...v1Rulebook([v1Rule]), tests: [null, 'x'] },
  { ...v1Rulebook([v1Rule]), tests: [{ command: '  ', expect: 'maybe' }] },
  {
    ...v1Rulebook([v1Rule]),
    tests: [
      { command: 'terraform destroy', expect: 'blocked', rule: 'block-destroy' },
      { command: 'terraform destroy', expect: 'blocked', rule: null },
    ],
  },
  {
    ...v1Rulebook([v1Rule]),
    tests: [
      { command: 'terraform apply', expect: 'blocked', rule: 'missing-rule' },
      { command: 'terraform apply', expect: 'blocked', rule: 'missing-rule' },
      { command: 'terraform apply', expect: 'blocked', rule: 'other-missing' },
      { command: 'terraform apply', expect: 'allowed', rule: 'block-destroy' },
    ],
  },
  { ...v1Rulebook([v1Rule]), tests: [{ command: 5, expect: 'allowed', extra: 1 }] },
  { rulebook_version: 1 },
  { rulebook_version: 2, name: 'x', version: '1', allowed_commands: [], rules: [] },
  null,
  [],
  'rulebook',
  9,
];

const REPLACEMENTS = [null, 1, 'x', '', [], {}, true, 'x'.repeat(257)] as const;
const RESERVED_INSERTS = ['git', 'bash', 'python3', 'rm'] as const;
const UNKNOWN_IDS = ['git.no-such-rule', 'secret.nowhere', 'plain', 'a/b'] as const;
const SWAPPED_PATHS = ['~', '/', '$HOME', '   '] as const;

type Container = Record<string, unknown> | unknown[];

/**
 * One to three edits from a fixed vocabulary, applied to a deep copy of the document at
 * positions the seeded random picks. The mutations are for the differential assertions,
 * so an edit that cannot apply to its position is simply skipped.
 */
export function mutate(value: unknown, random: () => number): unknown {
  return Array.from({ length: 1 + Math.floor(random() * 3) }).reduce<unknown>(
    (current) => applyEdit(current, random),
    value,
  );
}

function applyEdit(value: unknown, random: () => number): unknown {
  if (!isContainer(value)) return choose(random, REPLACEMENTS);
  const root = structuredClone(value);
  const paths = collectPaths(root, []);
  choose(random, EDITS)(root, choose(random, [[], ...paths]), random);
  return root;
}

const EDITS = [
  (root: Container, path: readonly PropertyKey[]) => {
    withParent(root, path, (parent, key) => {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      if (!Array.isArray(parent)) delete parent[String(key)];
    });
  },
  (root: Container, path: readonly PropertyKey[], random: () => number) => {
    withParent(root, path, (parent, key) => write(parent, key, choose(random, REPLACEMENTS)));
  },
  (root: Container, path: readonly PropertyKey[], random: () => number) => {
    const target = containerAt(root, path);
    if (Array.isArray(target)) return;
    target[`extra_${Math.floor(random() * 3)}`] = choose(random, REPLACEMENTS);
  },
  (root: Container, path: readonly PropertyKey[], random: () => number) => {
    const target = containerAt(root, path);
    if (!Array.isArray(target) || target.length === 0) return;
    target.push(structuredClone(target[Math.floor(random() * target.length)]));
  },
  (root: Container, path: readonly PropertyKey[], random: () => number) => {
    const target = containerAt(root, path);
    if (Array.isArray(target)) {
      target.push(choose(random, RESERVED_INSERTS));
      return;
    }
    target[choose(random, UNKNOWN_IDS)] = 'on';
  },
  (root: Container, path: readonly PropertyKey[], random: () => number) => {
    withParent(root, path, (parent, key) => {
      if (typeof read(parent, key) !== 'string') return;
      write(parent, key, choose(random, SWAPPED_PATHS));
    });
  },
  (root: Container, path: readonly PropertyKey[]) => {
    withParent(root, path, (parent, key) => {
      const current = read(parent, key);
      if (typeof current === 'string') write(parent, key, `${current}x`);
    });
  },
] as const;

function withParent(
  root: Container,
  path: readonly PropertyKey[],
  edit: (parent: Container, key: PropertyKey) => void,
): void {
  const key = path.at(-1);
  if (key === undefined) return;
  const parent = containerAt(root, path.slice(0, -1));
  edit(parent, key);
}

function containerAt(root: Container, path: readonly PropertyKey[]): Container {
  return path.reduce<Container>((current, segment) => {
    const next = read(current, segment);
    return isContainer(next) ? next : current;
  }, root);
}

function collectPaths(value: Container, prefix: readonly PropertyKey[]): PropertyKey[][] {
  return entryKeys(value).flatMap((key) => {
    const path = [...prefix, key];
    const child = read(value, key);
    return [path, ...(isContainer(child) ? collectPaths(child, path) : [])];
  });
}

function entryKeys(value: Container): PropertyKey[] {
  return Array.isArray(value) ? value.map((_, index) => index) : Object.keys(value);
}

function read(container: Container, key: PropertyKey): unknown {
  if (Array.isArray(container)) return container[Number(key)];
  return container[String(key)];
}

function write(container: Container, key: PropertyKey, value: unknown): void {
  if (Array.isArray(container)) container[Number(key)] = value;
  if (!Array.isArray(container)) container[String(key)] = value;
}

function isContainer(value: unknown): value is Container {
  return typeof value === 'object' && value !== null;
}

function choose<T>(random: () => number, values: readonly [T, ...T[]]): T {
  return values[Math.floor(random() * values.length)] ?? values[0];
}
