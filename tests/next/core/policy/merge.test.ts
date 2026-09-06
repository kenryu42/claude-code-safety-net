import { describe, expect, test } from 'bun:test';
import type { ProjectPolicyProjection } from '@next/core/policy/merge';
import { mergeProjectPolicy as mergeWithNext } from '@next/core/policy/merge';
import type { DestructiveCommandRuleOverride, GuiPolicy } from '@next/core/policy/types';
import { mergeProjectPolicy as mergeWithSrc } from '@/policy/merge';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';

/**
 * The project layer is pure data folding: the merged policy plus the preformatted
 * weakening lines. The same user policy and project projection go to both
 * implementations, over hand-picked pairs that hit every weakening line and a
 * seeded sample over the whole field product.
 */

/** One named alphabet, wrapped as the draw that reads from it. */
const chooser =
  <T>(...values: [T, ...T[]]) =>
  (random: () => number): T =>
    values[Math.floor(random() * values.length)] ?? values[0];

const LEVELS = chooser<GuiPolicy['safety']['level']>('standard', 'strict', 'paranoid');
const BOOLEANS = chooser<boolean>(true, false);
const TRISTATE = chooser<boolean | undefined>(undefined, true, false);
const RETENTIONS = chooser<number>(30, 7, 365);
const PATH_SETS = chooser<string[]>([], ['~/u'], ['~/p'], ['~/u', '~/p']);

const USER_DESTRUCTIVE_OVERRIDES = chooser<Record<string, DestructiveCommandRuleOverride>>(
  {},
  { 'git.reset-hard': 'off' },
  { 'git.clean-force': 'on' },
);

const USER_SECRET_OVERRIDES = chooser<Record<string, DestructiveCommandRuleOverride>>(
  {},
  { 'secret.ext.pem': 'off' },
  { 'secret.cli.codex.config': 'on' },
);

const PROJECT_DESTRUCTIVE_OVERRIDES = chooser<Record<string, DestructiveCommandRuleOverride>>(
  {},
  { 'git.reset-hard': 'off' },
  { 'git.clean-force': 'off' },
  { 'git.reset-hard': 'on' },
  { 'git.clean-force': 'on', 'git.reset-hard': 'off' },
);

const PROJECT_SECRET_OVERRIDES = chooser<Record<string, DestructiveCommandRuleOverride>>(
  {},
  { 'secret.ext.pem': 'off' },
  { 'secret.ext.pem': 'on' },
  { 'secret.cli.codex.config': 'off' },
  { 'secret.cli.claude-code.config': 'off' },
  { 'secret.cli.codex.config': 'on' },
);

function sampledUser(random: () => number): GuiPolicy {
  return {
    version: 1,
    safety: {
      level: LEVELS(random),
      overrides: {
        fail_closed: TRISTATE(random),
        paranoid_rm: TRISTATE(random),
        paranoid_interpreters: TRISTATE(random),
      },
    },
    workflow: { worktree_mode: BOOLEANS(random) },
    destructive_command_protection: {
      enabled: BOOLEANS(random),
      overrides: USER_DESTRUCTIVE_OVERRIDES(random),
      allow_paths: PATH_SETS(random),
    },
    secret_protection: {
      enabled: BOOLEANS(random),
      overrides: USER_SECRET_OVERRIDES(random),
      deny_paths: PATH_SETS(random),
      allow_paths: PATH_SETS(random),
    },
    audit: { retention_days: RETENTIONS(random) },
  };
}

function sampledProject(random: () => number): ProjectPolicyProjection {
  return {
    ...(random() < 0.7
      ? {
          safety: {
            ...(random() < 0.7 ? { level: LEVELS(random) } : {}),
            ...(random() < 0.7
              ? {
                  overrides: {
                    fail_closed: TRISTATE(random),
                    paranoid_rm: TRISTATE(random),
                    paranoid_interpreters: TRISTATE(random),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(random() < 0.6 ? { workflow: { worktree_mode: BOOLEANS(random) } } : {}),
    ...(random() < 0.8
      ? {
          destructive_command_protection: {
            ...(random() < 0.6 ? { enabled: BOOLEANS(random) } : {}),
            ...(random() < 0.7 ? { overrides: PROJECT_DESTRUCTIVE_OVERRIDES(random) } : {}),
            ...(random() < 0.6 ? { allow_paths: PATH_SETS(random) } : {}),
          },
        }
      : {}),
    ...(random() < 0.8
      ? {
          secret_protection: {
            ...(random() < 0.6 ? { enabled: BOOLEANS(random) } : {}),
            ...(random() < 0.7 ? { overrides: PROJECT_SECRET_OVERRIDES(random) } : {}),
            ...(random() < 0.6 ? { deny_paths: PATH_SETS(random) } : {}),
            ...(random() < 0.6 ? { allow_paths: PATH_SETS(random) } : {}),
          },
        }
      : {}),
  };
}

const STRONG_USER: GuiPolicy = {
  version: 1,
  safety: { level: 'paranoid', overrides: {} },
  workflow: { worktree_mode: false },
  destructive_command_protection: { enabled: true, overrides: {}, allow_paths: ['~/u'] },
  secret_protection: { enabled: true, overrides: {}, deny_paths: ['~/d'], allow_paths: ['~/a'] },
  audit: { retention_days: 30 },
};

const OPEN_USER: GuiPolicy = {
  ...STRONG_USER,
  safety: { level: 'standard', overrides: { fail_closed: true } },
  destructive_command_protection: {
    enabled: false,
    overrides: { 'git.reset-hard': 'off' },
    allow_paths: [],
  },
  secret_protection: {
    enabled: false,
    overrides: { 'secret.cli.codex.config': 'on' },
    deny_paths: [],
    allow_paths: [],
  },
};

const TIER_USER: GuiPolicy = {
  ...STRONG_USER,
  secret_protection: {
    enabled: true,
    overrides: { 'secret.cli.codex.config': 'on', 'secret.ext.pem': 'off' },
    deny_paths: ['~/d'],
    allow_paths: ['~/a'],
  },
};

const FIXED_PAIRS: readonly { user: GuiPolicy; project: ProjectPolicyProjection }[] = [
  { user: STRONG_USER, project: {} },
  { user: STRONG_USER, project: { safety: { level: 'standard' } } },
  { user: OPEN_USER, project: { safety: { level: 'paranoid' } } },
  {
    user: STRONG_USER,
    project: {
      safety: {
        overrides: { fail_closed: false, paranoid_rm: false, paranoid_interpreters: false },
      },
    },
  },
  { user: OPEN_USER, project: { safety: { overrides: { fail_closed: false } } } },
  { user: STRONG_USER, project: { workflow: { worktree_mode: true } } },
  { user: STRONG_USER, project: { destructive_command_protection: { enabled: false } } },
  { user: OPEN_USER, project: { destructive_command_protection: { enabled: true } } },
  { user: STRONG_USER, project: { secret_protection: { enabled: false } } },
  {
    user: STRONG_USER,
    project: { destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } } },
  },
  {
    user: OPEN_USER,
    project: { destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } } },
  },
  {
    user: STRONG_USER,
    project: { secret_protection: { overrides: { 'secret.ext.pem': 'off' } } },
  },
  {
    user: TIER_USER,
    project: {
      secret_protection: {
        overrides: {
          'secret.ext.pem': 'off',
          'secret.cli.codex.config': 'off',
          'secret.cli.claude-code.config': 'off',
        },
      },
    },
  },
  {
    user: STRONG_USER,
    project: { destructive_command_protection: { allow_paths: ['~/u', '~/p'] } },
  },
  { user: STRONG_USER, project: { secret_protection: { allow_paths: ['~/a', '~/p'] } } },
  { user: OPEN_USER, project: { secret_protection: { allow_paths: ['~/p'] } } },
];

describe('project policy merge', () => {
  test('the hand-picked pairs agree on the merged policy and the weakening lines', () => {
    for (const pair of FIXED_PAIRS) {
      const merged = mergeWithNext(pair.user, pair.project);
      expect(merged).toStrictEqual(mergeWithSrc(pair.user, pair.project));
      expect(merged).toMatchSnapshot();
    }
  });

  test('the hand-picked pairs raise every weakening line the merge can report', () => {
    const lines = FIXED_PAIRS.flatMap((pair) => mergeWithSrc(pair.user, pair.project).weakenings);
    expect([...new Set(lines)].sort()).toStrictEqual([
      'project policy adds destructive allow path: ~/p',
      'project policy adds secret allow path: ~/p',
      'project policy disables destructive command protection',
      'project policy disables fail_closed',
      'project policy disables paranoid_interpreters',
      'project policy disables paranoid_rm',
      'project policy disables rule git.reset-hard',
      'project policy disables rule secret.cli.codex.config',
      'project policy disables rule secret.ext.pem',
      'project policy disables secret protection',
      'project policy enables worktree mode relaxations',
      'project policy lowers level: paranoid -> standard',
    ]);
  });

  test('a seeded sample of user and project pairs agrees', () => {
    const random = createSeededRandom(FUZZ_SEED);
    const recorded = Array.from({ length: 400 }, () => ({
      user: sampledUser(random),
      project: sampledProject(random),
    })).map((pair, row) => {
      const merged = mergeWithNext(pair.user, pair.project);
      expect(merged).toStrictEqual(mergeWithSrc(pair.user, pair.project));
      return [`${row}`, merged] as const;
    });
    expectRecordedDigest('core-policy-merge/sampled-pairs', recorded);
  });
});
