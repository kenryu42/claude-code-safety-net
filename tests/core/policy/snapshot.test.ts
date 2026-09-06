import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createProcessEnvironment,
  createTestEnvironment,
  processPathResolver,
} from '@/core/environment';
import type { RulesPolicyOptions } from '@/core/policy/paths';
import { loadPolicySnapshot as loadPortedSnapshot } from '@/core/policy/snapshot';
import type { PolicySnapshot } from '@/core/policy/types';
import { snapshotTree, type TreeSpec, writeTree } from '../../helpers/fixture-tree';

/**
 * The loader is the one reader behind the gate, the CLI, the GUI and audit retention, so every
 * row of `docs/config-recovery.md` is contract — the whole snapshot, not just its state. Each
 * row builds its own tree under one temp root, records the snapshot the loader returns and
 * checks the documented fallback on it. The tree is captured before and after: loading writes
 * nothing.
 */

const HOME = createProcessEnvironment().home;

const USER_POLICY = 'home/.cc-safety-net/policy.json';
const USER_RULES = 'home/.cc-safety-net/rules/rule.json';
const PROJECT_POLICY = 'project/.cc-safety-net/policy.json';
const PROJECT_RULES = 'project/.cc-safety-net/rules/rule.json';
const userRulebook = (name: string) => `home/.cc-safety-net/rules/${name}/rulebook.json`;
const projectRulebook = (name: string) => `project/.cc-safety-net/rules/${name}/rulebook.json`;

const DROPPED_SOURCE_ADVICE =
  'Those rule sources are not active; every other rule and all built-in protections still apply';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

type FixtureRule = {
  name: string;
  command: string;
  subcommand?: string;
  block_args: string[];
  reason: string;
  intent?: string;
};

function localRulebook(name: string, rules: readonly FixtureRule[], version = '1.4.0') {
  return json({
    rulebook_version: 1,
    name,
    version,
    allowed_commands: [...new Set(rules.map((rule) => rule.command))],
    rules,
  });
}

function matchRulebook(name: string, ruleName: string) {
  return json({
    rulebook_version: 2,
    name,
    version: '2.1.0',
    allowed_commands: ['stackctl'],
    rules: [
      {
        name: ruleName,
        command: 'stackctl',
        match: { command_path: ['space'], any_args: ['--purge'] },
        reason: 'Purging a shared space cannot be undone from a session.',
        intent: 'manual_only',
      },
    ],
  });
}

const DEPLOY_RULE: FixtureRule = {
  name: 'block-prod-release',
  command: 'deploybot',
  subcommand: 'release',
  block_args: ['--environment=prod'],
  reason: 'Production releases go through the release checklist.',
  intent: 'manual_only',
};

const WIPE_RULE: FixtureRule = {
  name: 'block-schema-wipe',
  command: 'dbctl',
  block_args: ['wipe'],
  reason: 'Wiping the schema drops every migration.',
  intent: 'use_alternative',
};

/** A project scope that stays active with one override key rejected. */
const IGNORED_OVERRIDE_PROJECT = {
  [PROJECT_RULES]: json({
    version: 1,
    rules: ['extra'],
    overrides: { 'extra/no-such-rule': 'off' },
  }),
  [projectRulebook('extra')]: localRulebook('extra', [WIPE_RULE]),
};

type Row = {
  name: string;
  tree: TreeSpec;
  env?: (sub: string) => Record<string, string>;
  options?: (sub: string) => RulesPolicyOptions;
  embedded?: unknown;
  check: (snapshot: PolicySnapshot) => void;
};

function reasonOf(snapshot: PolicySnapshot): string {
  expect(snapshot.state).toBe('degraded');
  return snapshot.state === 'degraded' ? snapshot.reason : '';
}

const ruleNames = (snapshot: PolicySnapshot) => snapshot.policy.rules.map((rule) => rule.name);

function droppedSource(snapshot: PolicySnapshot, fragment: string) {
  const reason = reasonOf(snapshot);
  expect(reason).toContain(fragment);
  expect(reason).toContain(DROPPED_SOURCE_ADVICE);
  expect(ruleNames(snapshot)).toEqual([]);
}

const ROWS: readonly Row[] = [
  {
    name: 'nothing configured',
    tree: {},
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.diagnostics).toEqual([]);
      expect(ruleNames(snapshot)).toEqual([]);
    },
  },
  {
    name: 'a valid policy and a valid rulebook in each scope',
    tree: {
      [USER_POLICY]: json({
        version: 1,
        safety: { level: 'strict', overrides: { fail_closed: true } },
        destructive_command_protection: {
          enabled: true,
          overrides: { 'git.checkout-force': 'off' },
          allow_paths: ['~/scratch'],
        },
        secret_protection: {
          enabled: true,
          overrides: { 'secret.cli.codex.config': 'on', 'secret.basename.env': 'off' },
          deny_paths: [' private/token.txt '],
        },
      }),
      [USER_RULES]: json({
        version: 1,
        rules: ['team'],
        transparent_wrappers: ['runner', 'shared-wrap'],
      }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE]),
      [PROJECT_RULES]: json({
        version: 1,
        rules: ['v2team'],
        transparent_wrappers: ['shared-wrap', 'projrunner'],
      }),
      [projectRulebook('v2team')]: matchRulebook('v2team', 'block-space-purge'),
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(ruleNames(snapshot)).toEqual(['team/block-prod-release', 'v2team/block-space-purge']);
      expect(snapshot.policy.transparentWrappers).toEqual(['runner', 'shared-wrap', 'projrunner']);
      expect(snapshot.policy.secretProtection.denyPaths).toEqual([' private/token.txt ']);
    },
  },
  {
    name: 'an unknown top-level field in the user policy',
    tree: { [USER_POLICY]: json({ version: 1, tier: 'gold', safety: { level: 'strict' } }) },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('the salvaged policy with protective defaults');
      expect(snapshot.policy.safety.level).toBe('strict');
    },
  },
  {
    name: 'invalid recognized fields in the user policy',
    tree: {
      [USER_POLICY]: json({
        version: 1,
        safety: { level: 'stricter' },
        workflow: { worktree_mode: 'x' },
        destructive_command_protection: {
          enabled: 'yes',
          overrides: { 'git.no-such-rule': 'off', 'git.alias-config': 'sometimes' },
          allow_paths: ['/', '~', 'rel'],
        },
        secret_protection: { deny_paths: ['~'] },
        audit: { retention_days: 0 },
      }),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('the salvaged policy with protective defaults');
      expect(snapshot.policy.safety.level).toBe('standard');
      expect(snapshot.policy.destructiveCommandProtectionEnabled).toBeTrue();
      expect(snapshot.policy.destructiveCommandAllowPaths).toEqual([]);
      expect(snapshot.policy.secretProtection.denyPaths).toEqual([]);
    },
  },
  {
    name: 'malformed JSON in the user policy',
    tree: { [USER_POLICY]: '{"version": 1, "safety":' },
    check: (snapshot) => {
      const reason = reasonOf(snapshot);
      expect(reason).toContain('Invalid JSON');
      expect(reason).toContain('Enforcing built-in protective defaults');
      expect(snapshot.policy.destructiveCommandProtectionEnabled).toBeTrue();
      expect(snapshot.policy.secretProtection.enabled).toBeTrue();
      expect(snapshot.policy.destructiveCommandAllowPaths).toEqual([]);
    },
  },
  {
    name: 'a whitespace-only user policy',
    tree: { [USER_POLICY]: '  \n\t\n' },
    check: (snapshot) => {
      const reason = reasonOf(snapshot);
      expect(reason).toContain('Config file is empty');
      expect(reason).toContain('Enforcing built-in protective defaults');
    },
  },
  {
    name: 'a user policy holding a JSON array',
    tree: { [USER_POLICY]: '[]\n' },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Enforcing built-in protective defaults');
      expect(snapshot.policy.safety).toEqual({ level: 'standard' });
    },
  },
  {
    name: 'a user policy holding JSON null',
    tree: { [USER_POLICY]: 'null\n' },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Enforcing built-in protective defaults');
      expect(snapshot.policy.safety).toEqual({ level: 'standard' });
    },
  },
  {
    name: 'a directory where the user policy file belongs',
    tree: { [USER_POLICY]: null },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Enforcing built-in protective defaults');
      expect(snapshot.policy.secretProtection.enabled).toBeTrue();
    },
  },
  {
    name: 'a project policy that weakens the user policy',
    tree: {
      [USER_POLICY]: json({
        version: 1,
        safety: { level: 'strict', overrides: { fail_closed: true } },
        destructive_command_protection: { enabled: true, overrides: { 'git.ssh-env': 'on' } },
        secret_protection: { enabled: true, overrides: { 'secret.cli.codex.config': 'on' } },
      }),
      [PROJECT_POLICY]: json({
        version: 1,
        safety: { level: 'standard', overrides: { fail_closed: false } },
        workflow: { worktree_mode: true },
        destructive_command_protection: {
          overrides: { 'git.ssh-env': 'off' },
          allow_paths: ['/srv/build'],
        },
        secret_protection: { enabled: false },
      }),
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policy.safety.level).toBe('standard');
      expect(snapshot.policy.worktreeMode).toBeTrue();
      expect(snapshot.policy.secretProtection.enabled).toBeFalse();
      expect(snapshot.policyScopes?.levelScope).toBe('project');
      expect(snapshot.policyScopes?.weakenings.length).toBeGreaterThan(0);
    },
  },
  {
    name: 'unknown and invalid fields beside a valid level in the project policy',
    tree: {
      [USER_POLICY]: json({ version: 1, safety: { level: 'paranoid' } }),
      [PROJECT_POLICY]: json({
        version: 1,
        tier: 'silver',
        safety: { level: 'strict' },
        workflow: { worktree_mode: 'maybe' },
        secret_protection: { allow_paths: ['~'] },
      }),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('the salvaged policy with protective defaults');
      expect(snapshot.policy.safety.level).toBe('strict');
      expect(snapshot.policyScopes?.levelScope).toBe('project');
    },
  },
  {
    name: 'malformed JSON in the project policy under a strict user policy',
    tree: {
      [USER_POLICY]: json({ version: 1, safety: { level: 'strict' } }),
      [PROJECT_POLICY]: '{"version": 1,',
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Invalid JSON');
      expect(snapshot.policy.safety.level).toBe('strict');
      expect(snapshot.policyScopes?.weakenings).toEqual([]);
    },
  },
  {
    name: 'an empty project policy under a strict user policy',
    tree: {
      [USER_POLICY]: json({ version: 1, safety: { level: 'strict' } }),
      [PROJECT_POLICY]: '',
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Config file is empty');
      expect(snapshot.policy.safety.level).toBe('strict');
    },
  },
  {
    name: 'an audit section in the project policy',
    tree: {
      [USER_POLICY]: json({ version: 1, audit: { retention_days: 45 } }),
      [PROJECT_POLICY]: json({ version: 1, audit: { retention_days: 2 } }),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain(
        'project policy audit settings are ignored; audit is user scope only',
      );
    },
  },
  {
    name: 'a valid project policy while the user policy is malformed',
    tree: {
      [USER_POLICY]: 'not json at all',
      [PROJECT_POLICY]: json({ version: 1, safety: { level: 'paranoid' } }),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('the salvaged policy with protective defaults');
      expect(snapshot.policy.safety.level).toBe('paranoid');
    },
  },
  {
    name: 'a project policy with no user policy at all',
    tree: {
      [PROJECT_POLICY]: json({
        version: 1,
        safety: { level: 'strict' },
        workflow: { worktree_mode: true },
      }),
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policy.safety.level).toBe('strict');
      expect(snapshot.policy.worktreeMode).toBeTrue();
    },
  },
  {
    // The only row where an unreadable project file decides the fallback on its own:
    // with a user policy present the user scope answers first.
    name: 'a malformed project policy with no user policy',
    tree: { [PROJECT_POLICY]: '{"version": 1,' },
    check: (snapshot) => {
      const reason = reasonOf(snapshot);
      expect(reason).toContain('Invalid JSON');
      expect(reason).toContain('Enforcing built-in protective defaults');
      expect(snapshot.policyScopes).toEqual({ levelScope: 'default', weakenings: [] });
    },
  },
  {
    name: 'a project policy repeating the user level',
    tree: {
      [USER_POLICY]: json({ version: 1, safety: { level: 'strict' } }),
      [PROJECT_POLICY]: json({ version: 1, safety: { level: 'strict' } }),
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policyScopes).toEqual({ levelScope: 'project', weakenings: [] });
    },
  },
  {
    name: 'an unknown override key in the project rules config',
    tree: IGNORED_OVERRIDE_PROJECT,
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('unknown override key "extra/no-such-rule"');
      expect(ruleNames(snapshot)).toEqual(['extra/block-schema-wipe']);
    },
  },
  {
    name: 'a dropped source, an ignored override and an invalid user policy at once',
    tree: {
      [USER_POLICY]: json({ version: 1, tier: 'gold' }),
      [USER_RULES]: json({ version: 1, rules: ['gone'] }),
      ...IGNORED_OVERRIDE_PROJECT,
    },
    check: (snapshot) => {
      // Dropped sources come first, then the parts that were ignored, then the policy file.
      const reason = reasonOf(snapshot);
      expect(reason.indexOf(DROPPED_SOURCE_ADVICE)).toBeLessThan(
        reason.indexOf('unknown override key'),
      );
      expect(reason.indexOf('unknown override key')).toBeLessThan(
        reason.indexOf('invalid policy config:'),
      );
    },
  },
  {
    name: 'a project override naming a user-scoped rule',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE]),
      [PROJECT_RULES]: json({
        version: 1,
        overrides: { 'team/block-prod-release': { reason: 'project wants a softer message' } },
      }),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain(
        'project override cannot target user-scoped rule "team/block-prod-release"',
      );
      expect(snapshot.policy.rules[0]?.reason).toBe(DEPLOY_RULE.reason);
    },
  },
  {
    name: 'a rulebook name claimed by both scopes',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['shared'] }),
      [userRulebook('shared')]: localRulebook('shared', [DEPLOY_RULE]),
      [PROJECT_RULES]: json({ version: 1, rules: ['shared'] }),
      [projectRulebook('shared')]: localRulebook('shared', [WIPE_RULE], '9.9.9'),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('duplicate active rulebook name "shared"');
      expect(ruleNames(snapshot)).toEqual(['shared/block-prod-release']);
    },
  },
  {
    name: 'a rulebook name claimed twice inside one scope',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['shared', 'acme/rules#main/shared'] }),
      [userRulebook('shared')]: localRulebook('shared', [DEPLOY_RULE]),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('for acme/rules#main/shared');
      expect(ruleNames(snapshot)).toEqual(['shared/block-prod-release']);
    },
  },
  {
    name: 'a configured local source with no rulebook file',
    tree: { [USER_RULES]: json({ version: 1, rules: ['team'] }) },
    check: (snapshot) => {
      const reason = reasonOf(snapshot);
      expect(reason).toContain('missing rulebook file');
      expect(reason).toContain('create that file or remove that source from the rules config');
      expect(ruleNames(snapshot)).toEqual([]);
    },
  },
  {
    name: 'a remote source with nothing vendored yet',
    tree: { [USER_RULES]: json({ version: 1, rules: ['acme/rules#main/remote'] }) },
    check: (snapshot) => droppedSource(snapshot, '`cc-safety-net rule update`'),
  },
  {
    name: 'a rulebook file that is not valid JSON',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: '{ "rulebook_version": 1,',
    },
    check: (snapshot) => droppedSource(snapshot, 'Invalid JSON; fix that file'),
  },
  {
    name: 'a rulebook failing several schema checks at once',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: json({
        rulebook_version: 3,
        name: 'team',
        version: '',
        allowed_commands: ['deploybot'],
        rules: [{ name: 'has spaces', command: 'deploybot', block_args: [], reason: '' }],
      }),
    },
    check: (snapshot) => droppedSource(snapshot, 'rulebook_version must be 1 or 2'),
  },
  {
    name: 'a rulebook whose name does not match its source',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: localRulebook('renamed', [DEPLOY_RULE]),
    },
    check: (snapshot) => {
      droppedSource(snapshot, 'rulebook name "renamed"');
      expect(reasonOf(snapshot)).toContain('must match source "team"; fix that file');
    },
  },
  {
    name: 'a rulebook over the acceptance limits',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: json({
        rulebook_version: 1,
        name: 'team',
        version: '1.0.0',
        allowed_commands: ['deploybot'],
        rules: Array.from({ length: 1_025 }, (_unused, index) => ({ name: `over-${index}` })),
      }),
    },
    check: (snapshot) =>
      droppedSource(snapshot, "Rulebook exceeds CC Safety Net's safe validation limits."),
  },
  {
    name: 'a malformed user rules config whose wrappers vanish with it',
    tree: {
      [USER_RULES]: '{"version": 1, "transparent_wrappers": ["userwrap"',
      [PROJECT_RULES]: json({ version: 1, transparent_wrappers: ['projwrap'] }),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Invalid JSON');
      expect(snapshot.policy.transparentWrappers).toEqual(['projwrap']);
    },
  },
  {
    name: 'a malformed project rules config whose wrappers vanish with it',
    tree: {
      [USER_RULES]: json({ version: 1, transparent_wrappers: ['userwrap'] }),
      [PROJECT_RULES]: 'nope',
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain('Invalid JSON');
      expect(snapshot.policy.transparentWrappers).toEqual(['userwrap']);
    },
  },
  {
    name: 'an empty rules config',
    tree: { [USER_RULES]: '\n' },
    check: (snapshot) => droppedSource(snapshot, 'Config file is empty'),
  },
  {
    name: 'a rules config declaring version 2',
    tree: { [USER_RULES]: json({ version: 2, rules: [] }) },
    check: (snapshot) => droppedSource(snapshot, 'rule.json: version must be 1'),
  },
  {
    name: 'a rules config failing several schema checks at once',
    tree: {
      [USER_RULES]: json({
        version: 1,
        rules: ['team', 'team', 'not a name'],
        overrides: { 'no-slash-key': 'off', 'team/block-prod-release': { reason: '' } },
        transparent_wrappers: ['git', 'runner'],
      }),
    },
    check: (snapshot) => {
      const reason = reasonOf(snapshot);
      expect(reason).toContain('duplicate rulebook source "team"');
      expect(reason).toContain('reserved command "git" cannot be a wrapper');
      expect(snapshot.policy.transparentWrappers).toEqual([]);
    },
  },
  {
    name: 'a rules config over the source limit',
    tree: {
      [USER_RULES]: json({
        version: 1,
        rules: Array.from({ length: 65 }, (_unused, index) => `book${index}`),
      }),
    },
    check: (snapshot) =>
      droppedSource(snapshot, "Rule config exceeds CC Safety Net's safe source limit."),
  },
  {
    name: 'a project rules config that is a symlink out of the project',
    tree: {
      'outside/rule.json': json({ version: 1, rules: [] }),
      'project/.cc-safety-net/rules': null,
      [PROJECT_RULES]: { symlink: '../../../outside/rule.json' },
    },
    check: (snapshot) =>
      droppedSource(snapshot, 'Unable to access project policy filesystem safely.'),
  },
  {
    name: 'a user rules config that is a symlink',
    tree: {
      'outside/rule.json': json({ version: 1, rules: [] }),
      'home/.cc-safety-net/rules': null,
      [USER_RULES]: { symlink: '../../../outside/rule.json' },
      [PROJECT_RULES]: json({ version: 1, rules: [] }),
    },
    check: (snapshot) => droppedSource(snapshot, 'Unable to access user policy filesystem safely.'),
  },
  {
    name: 'a directory where a rulebook file belongs',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: null,
    },
    check: (snapshot) => droppedSource(snapshot, 'Unable to access user policy filesystem safely.'),
  },
  {
    name: 'a rulebook file that is a symlink',
    tree: {
      'outside/rulebook.json': localRulebook('team', [DEPLOY_RULE]),
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      'home/.cc-safety-net/rules/team': null,
      [userRulebook('team')]: { symlink: '../../../../outside/rulebook.json' },
    },
    check: (snapshot) => droppedSource(snapshot, 'Unable to access user policy filesystem safely.'),
  },
  {
    name: 'a dropped rulebook beside a sibling that stays active',
    tree: {
      [USER_RULES]: json({
        version: 1,
        rules: ['team', 'gone'],
        transparent_wrappers: ['runner'],
      }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE]),
    },
    check: (snapshot) => {
      expect(reasonOf(snapshot)).toContain(DROPPED_SOURCE_ADVICE);
      expect(ruleNames(snapshot)).toEqual(['team/block-prod-release']);
      expect(snapshot.policy.transparentWrappers).toEqual(['runner']);
    },
  },
  {
    name: 'overrides that disable one rule and rewrite another',
    tree: {
      [USER_RULES]: json({
        version: 1,
        rules: ['team'],
        overrides: {
          'team/block-prod-release': 'off',
          'team/block-schema-wipe': { reason: 'Ask the on-call DBA first.', intent: 'hard_stop' },
        },
      }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE, WIPE_RULE]),
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(ruleNames(snapshot)).toEqual(['team/block-schema-wipe']);
      expect(snapshot.policy.rules[0]?.reason).toBe('Ask the on-call DBA first.');
      expect(snapshot.policy.rules[0]?.intent).toBe('hard_stop');
      expect(snapshot.ruleMetadata['team/block-schema-wipe']).toEqual({
        id: 'team/block-schema-wipe',
        rulebook: { name: 'team', version: '1.4.0' },
        source: 'team',
        override: { type: 'reason', reason: 'Ask the on-call DBA first.' },
      });
    },
  },
  {
    name: 'a project directory whose rules config is the user one',
    tree: {
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE]),
    },
    options: (sub) => ({
      cwd: join(sub, 'home'),
      userConfigDir: join(sub, 'home', '.cc-safety-net', 'rules'),
    }),
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(ruleNames(snapshot)).toEqual(['team/block-prod-release']);
    },
  },
  {
    name: 'default user paths resolved through CC_SAFETY_NET_HOME',
    tree: {
      [USER_POLICY]: json({ version: 1, safety: { level: 'paranoid' } }),
      [USER_RULES]: json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE]),
    },
    env: (sub) => ({ CC_SAFETY_NET_HOME: join(sub, 'home', '.cc-safety-net') }),
    options: (sub) => ({ cwd: join(sub, 'project') }),
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policy.safety.level).toBe('paranoid');
      expect(ruleNames(snapshot)).toEqual(['team/block-prod-release']);
    },
  },
  {
    name: 'rules configs at explicitly named paths',
    tree: {
      'home/.cc-safety-net/rules/user-rules.json': json({ version: 1, rules: ['team'] }),
      [userRulebook('team')]: localRulebook('team', [DEPLOY_RULE]),
      'project/.cc-safety-net/rules/team-rules.json': json({ version: 1, rules: ['extra'] }),
      [projectRulebook('extra')]: localRulebook('extra', [WIPE_RULE]),
    },
    options: (sub) => ({
      cwd: join(sub, 'project'),
      userConfigPath: join(sub, 'home', '.cc-safety-net', 'rules', 'user-rules.json'),
      projectConfigPath: join(sub, 'project', '.cc-safety-net', 'rules', 'team-rules.json'),
    }),
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(ruleNames(snapshot)).toEqual(['team/block-prod-release', 'extra/block-schema-wipe']);
    },
  },
  {
    name: 'an embedded policy with no user policy file',
    tree: {},
    embedded: {
      version: 1,
      safety: { level: 'paranoid' },
      secret_protection: { enabled: false },
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policy.safety.level).toBe('paranoid');
      expect(snapshot.policy.secretProtection.enabled).toBeFalse();
    },
  },
  {
    name: 'an embedded policy overruled by a user policy file',
    tree: { [USER_POLICY]: json({ version: 1, safety: { level: 'strict' } }) },
    embedded: { version: 1, safety: { level: 'paranoid' } },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policy.safety.level).toBe('strict');
    },
  },
  {
    name: 'a deny path whose surrounding whitespace is preserved',
    tree: {
      [USER_POLICY]: json({
        version: 1,
        secret_protection: { deny_paths: ['  spaced/secret.env '] },
      }),
    },
    check: (snapshot) => {
      expect(snapshot.state).toBe('ready');
      expect(snapshot.policy.secretProtection.denyPaths).toEqual(['  spaced/secret.env ']);
    },
  },
];

describe('the policy loader port reproduces every configuration recovery row', () => {
  const root = mkdtempSync(join(tmpdir(), 'next-policy-loader-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  test.each(
    ROWS.map((row, index) => [row.name, row, index] as const),
  )('loads %s identically', (_label, row, index) => {
    const sub = join(root, String(index));
    writeTree(sub, { project: null, 'home/.cc-safety-net': null, ...row.tree });
    const options = row.options?.(sub) ?? {
      cwd: join(sub, 'project'),
      userConfigDir: join(sub, 'home', '.cc-safety-net', 'rules'),
    };
    const env = row.env?.(sub) ?? {};
    const before = snapshotTree(sub);
    const globals = globalThis as Record<string, unknown>;
    const restored = globals.__CC_SAFETY_NET_EMBEDDED_POLICY__;
    try {
      globals.__CC_SAFETY_NET_EMBEDDED_POLICY__ = row.embedded;
      const actual = loadPortedSnapshot(
        createTestEnvironment({
          env: new Map(Object.entries(env)),
          home: HOME,
          paths: processPathResolver,
        }),
        options,
      );
      expect(Object.isFrozen(actual)).toBeTrue();
      expect(Object.isFrozen(actual.policy)).toBeTrue();
      expect(Object.isFrozen(actual.policy.rules)).toBeTrue();
      expect(Object.isFrozen(actual.ruleMetadata)).toBeTrue();
      if (actual.policyScopes) expect(Object.isFrozen(actual.policyScopes)).toBeTrue();
      row.check(actual);
    } finally {
      globals.__CC_SAFETY_NET_EMBEDDED_POLICY__ = restored;
    }
    expect(snapshotTree(sub)).toStrictEqual(before);
  });
});
