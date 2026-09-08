import { describe, expect, test } from 'bun:test';
import type { ProjectPolicyProjection } from '@/core/policy/merge';
import { mergeProjectPolicy } from '@/core/policy/merge';
import type { DestructiveCommandRuleOverride, GuiPolicy } from '@/core/policy/types';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';

/**
 * The project layer is pure data folding: the merged policy plus the preformatted weakening
 * lines. Those lines are printed verbatim by `status`, `doctor` and the GUI banner, so each row
 * below states exactly which ones a pair must raise — and, just as importantly, which relaxations
 * are not weakenings because the user scope had already given that protection away.
 */

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

const PAIRS: readonly {
  readonly behavior: string;
  readonly user: GuiPolicy;
  readonly project: ProjectPolicyProjection;
  readonly weakenings: readonly string[];
}[] = [
  {
    behavior: 'a project file that sets nothing weakens nothing',
    user: STRONG_USER,
    project: {},
    weakenings: [],
  },
  {
    behavior: 'a lower project level is a weakening that names both levels',
    user: STRONG_USER,
    project: { safety: { level: 'standard' } },
    weakenings: ['project policy lowers level: paranoid -> standard'],
  },
  {
    behavior: 'a higher project level is not a weakening',
    user: OPEN_USER,
    project: { safety: { level: 'paranoid' } },
    weakenings: [],
  },
  {
    behavior: 'turning off capabilities the user level had on raises one line each, in table order',
    user: STRONG_USER,
    project: {
      safety: {
        overrides: { fail_closed: false, paranoid_rm: false, paranoid_interpreters: false },
      },
    },
    weakenings: [
      'project policy disables fail_closed',
      'project policy disables paranoid_rm',
      'project policy disables paranoid_interpreters',
    ],
  },
  {
    behavior:
      'turning off a capability the user had explicitly enabled above its preset is a weakening',
    user: OPEN_USER,
    project: { safety: { overrides: { fail_closed: false } } },
    weakenings: ['project policy disables fail_closed'],
  },
  {
    behavior: 'enabling worktree relaxations the user left off is a weakening',
    user: STRONG_USER,
    project: { workflow: { worktree_mode: true } },
    weakenings: ['project policy enables worktree mode relaxations'],
  },
  {
    behavior: 'disabling destructive command protection is a weakening',
    user: STRONG_USER,
    project: { destructive_command_protection: { enabled: false } },
    weakenings: ['project policy disables destructive command protection'],
  },
  {
    behavior: 'enabling a protection the user had off is not a weakening',
    user: OPEN_USER,
    project: { destructive_command_protection: { enabled: true } },
    weakenings: [],
  },
  {
    behavior: 'disabling secret protection is a weakening',
    user: STRONG_USER,
    project: { secret_protection: { enabled: false } },
    weakenings: ['project policy disables secret protection'],
  },
  {
    behavior: 'disabling a destructive rule the user left in force is a weakening',
    user: STRONG_USER,
    project: { destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } } },
    weakenings: ['project policy disables rule git.reset-hard'],
  },
  {
    behavior:
      'disabling a destructive rule under a user scope that already disabled the whole protection is not a weakening',
    user: OPEN_USER,
    project: { destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } } },
    weakenings: [],
  },
  {
    behavior: 'disabling a secret rule that was on by default is a weakening',
    user: STRONG_USER,
    project: { secret_protection: { overrides: { 'secret.ext.pem': 'off' } } },
    weakenings: ['project policy disables rule secret.ext.pem'],
  },
  {
    behavior:
      'only the rule the user had actually opted into counts: one already off, one default-off, one opted in',
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
    weakenings: ['project policy disables rule secret.cli.codex.config'],
  },
  {
    behavior: 'a destructive allow path the user did not vouch for is a weakening',
    user: STRONG_USER,
    project: { destructive_command_protection: { allow_paths: ['~/u', '~/p'] } },
    weakenings: ['project policy adds destructive allow path: ~/p'],
  },
  {
    behavior: 'a secret allow path the user did not vouch for is a weakening',
    user: STRONG_USER,
    project: { secret_protection: { allow_paths: ['~/a', '~/p'] } },
    weakenings: ['project policy adds secret allow path: ~/p'],
  },
  {
    behavior: 'an allow path below a protection the user had already turned off is not a weakening',
    user: OPEN_USER,
    project: { secret_protection: { allow_paths: ['~/p'] } },
    weakenings: [],
  },
];

describe('the weakening lines a project policy raises', () => {
  test.each(PAIRS.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    expect(mergeProjectPolicy(row.user, row.project).weakenings).toEqual([...row.weakenings]);
  });

  test('the pairs above raise every line the merge can report', () => {
    const lines = PAIRS.flatMap((pair) => mergeProjectPolicy(pair.user, pair.project).weakenings);
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
});

describe('what the merged policy holds', () => {
  test('a project level replaces the user level', () => {
    expect(
      mergeProjectPolicy(STRONG_USER, { safety: { level: 'standard' } }).policy.safety.level,
    ).toBe('standard');
  });

  test('path lists are the union of both scopes, user entries first and deduplicated', () => {
    expect(
      mergeProjectPolicy(STRONG_USER, {
        destructive_command_protection: { allow_paths: ['~/u', '~/p'] },
      }).policy.destructive_command_protection.allow_paths,
    ).toEqual(['~/u', '~/p']);
  });

  test('per-rule overrides merge by rule id, with the project value winning on a collision', () => {
    expect(
      mergeProjectPolicy(TIER_USER, {
        secret_protection: {
          overrides: { 'secret.ext.pem': 'on', 'secret.cli.claude-code.config': 'off' },
        },
      }).policy.secret_protection.overrides,
    ).toEqual({
      'secret.cli.codex.config': 'on',
      'secret.ext.pem': 'on',
      'secret.cli.claude-code.config': 'off',
    });
  });

  test('audit is user scope only and survives any project projection', () => {
    expect(mergeProjectPolicy(STRONG_USER, { safety: { level: 'standard' } }).policy.audit).toEqual(
      { retention_days: 30 },
    );
  });
});

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

const SAMPLED = (() => {
  const random = createSeededRandom(FUZZ_SEED);
  return Array.from({ length: 400 }, () => ({
    user: sampledUser(random),
    project: sampledProject(random),
  }));
})();

/** The whole vocabulary of weakening lines, as the shapes each one must take. */
const WEAKENING_PATTERNS = [
  /^project policy lowers level: (standard|strict|paranoid) -> (standard|strict|paranoid)$/,
  /^project policy disables (fail_closed|paranoid_rm|paranoid_interpreters)$/,
  /^project policy enables worktree mode relaxations$/,
  /^project policy disables (destructive command|secret) protection$/,
  /^project policy disables rule \S+$/,
  /^project policy adds (destructive|secret) allow path: \S+$/,
];

/**
 * The generated pairs are here for the properties that must hold for every one of them; the rows
 * above pin what each individual pair reports.
 */
describe('properties every user and project pair must satisfy', () => {
  test('audit belongs to the user scope and is never touched by the merge', () => {
    for (const pair of SAMPLED) {
      const merged = mergeProjectPolicy(pair.user, pair.project);
      expect(merged.policy.audit).toEqual(pair.user.audit);
      expect(merged.policy.version).toBe(1);
    }
  });

  test('every path the user vouched for survives, and no list gains a duplicate', () => {
    for (const pair of SAMPLED) {
      const merged = mergeProjectPolicy(pair.user, pair.project).policy;
      const lists = [
        [
          pair.user.destructive_command_protection.allow_paths,
          merged.destructive_command_protection.allow_paths,
        ],
        [pair.user.secret_protection.deny_paths, merged.secret_protection.deny_paths],
        [pair.user.secret_protection.allow_paths, merged.secret_protection.allow_paths],
      ] as const;
      for (const [before, after] of lists) {
        expect(after).toEqual(expect.arrayContaining(before));
        expect(after).toHaveLength(new Set(after).size);
      }
    }
  });

  test('every weakening line is one of the shapes the surfaces know how to read', () => {
    for (const pair of SAMPLED) {
      for (const line of mergeProjectPolicy(pair.user, pair.project).weakenings) {
        expect(WEAKENING_PATTERNS.some((pattern) => pattern.test(line))).toBeTrue();
      }
    }
  });

  test('a reported level drop is a real drop, and the merged policy is at the lower level', () => {
    const rank = { standard: 0, strict: 1, paranoid: 2 };
    for (const pair of SAMPLED) {
      const merged = mergeProjectPolicy(pair.user, pair.project);
      const line = merged.weakenings.find((one) => one.startsWith('project policy lowers level'));
      if (line === undefined) continue;
      expect(line).toBe(
        `project policy lowers level: ${pair.user.safety.level} -> ${merged.policy.safety.level}`,
      );
      expect(rank[merged.policy.safety.level]).toBeLessThan(rank[pair.user.safety.level]);
    }
  });

  test('a rule reported as disabled is off in the merged policy and was not off before', () => {
    for (const pair of SAMPLED) {
      const merged = mergeProjectPolicy(pair.user, pair.project);
      const overrides = {
        ...merged.policy.destructive_command_protection.overrides,
        ...merged.policy.secret_protection.overrides,
      };
      const before = {
        ...pair.user.destructive_command_protection.overrides,
        ...pair.user.secret_protection.overrides,
      };
      for (const line of merged.weakenings) {
        if (!line.startsWith('project policy disables rule ')) continue;
        const id = line.slice('project policy disables rule '.length);
        expect(overrides[id]).toBe('off');
        expect(before[id]).not.toBe('off');
      }
    }
  });

  test('an empty project projection is the identity: the user policy back, and no weakenings', () => {
    for (const pair of SAMPLED) {
      expect(mergeProjectPolicy(pair.user, {})).toEqual({
        policy: pair.user,
        weakenings: [],
      });
    }
  });

  test('a project file that restates the user policy weakens nothing', () => {
    for (const pair of SAMPLED) {
      const restated: ProjectPolicyProjection = {
        safety: { level: pair.user.safety.level, overrides: pair.user.safety.overrides },
        workflow: { worktree_mode: pair.user.workflow.worktree_mode },
        destructive_command_protection: {
          enabled: pair.user.destructive_command_protection.enabled,
          overrides: pair.user.destructive_command_protection.overrides,
          allow_paths: pair.user.destructive_command_protection.allow_paths,
        },
        secret_protection: {
          enabled: pair.user.secret_protection.enabled,
          overrides: pair.user.secret_protection.overrides,
          deny_paths: pair.user.secret_protection.deny_paths,
          allow_paths: pair.user.secret_protection.allow_paths,
        },
      };
      expect(mergeProjectPolicy(pair.user, restated)).toEqual({
        policy: pair.user,
        weakenings: [],
      });
    }
  });
});
