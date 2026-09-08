import { describe, expect, spyOn, test } from 'bun:test';
import {
  deriveEffectiveSafetyLevel,
  ENV_FLAGS,
  type EnvFlag,
  envFlagIsSet,
  envTruthy,
  getCCSafetyNetEnvModes,
  getEnvFlagValue,
  resolveAuditScope,
  shouldRecordAllowedCommands,
} from '@/core/policy/env';
import type { PolicySafety } from '@/core/policy/types';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';

/**
 * The readers take an injected map, so each case stages only the variables it sets. Every read
 * runs under a `console.error` spy, because an invalid level is reported on stderr and that
 * warning is part of the behavior.
 */

const FLAGS: readonly EnvFlag[] = Object.values(ENV_FLAGS);

const ENV_NAMES: readonly string[] = FLAGS.flatMap((flag) =>
  flag.legacyName ? [flag.name, flag.legacyName] : [flag.name],
);

type Staged = Readonly<Record<string, string | undefined>>;
type PolicyInput = { safety?: PolicySafety; worktreeMode?: boolean } | undefined;
type EnvCase = { readonly env: Staged; readonly policy: PolicyInput };

const pick = <T>(random: () => number, values: readonly [T, ...T[]]): T =>
  values[Math.floor(random() * values.length)] ?? values[0];

const injectedFrom = (env: Staged) =>
  new Map(
    ENV_NAMES.flatMap((name) => {
      const value = env[name];
      return value === undefined ? [] : [[name, value] as const];
    }),
  );

function capture<T>(run: () => T) {
  const messages: string[] = [];
  const spy = spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    messages.push(parts.map(String).join(' '));
  });
  const value = run();
  spy.mockRestore();
  return { value, messages };
}

const modesFor = (subject: EnvCase) =>
  capture(() => getCCSafetyNetEnvModes(subject.policy, injectedFrom(subject.env)));

/**
 * One resolved environment. `stderr` is the warning the reader prints, and an empty list means it
 * printed nothing — an invalid level is reported once and then ignored, never enforced.
 */
type Resolved = {
  readonly behavior: string;
  readonly env: Staged;
  readonly policy: PolicyInput;
  readonly strict: boolean;
  readonly paranoidRm: boolean;
  readonly paranoidInterpreters: boolean;
  readonly worktreeMode: boolean;
  readonly effectiveLevel: 'standard' | 'strict' | 'paranoid' | 'custom';
  readonly stderr?: readonly string[];
};

const RESOLVED: readonly Resolved[] = [
  {
    behavior: 'the level variable raises a standard policy to strict',
    env: { CC_SAFETY_NET_LEVEL: 'strict' },
    policy: { safety: { level: 'standard' } },
    strict: true,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'strict',
  },
  {
    behavior: 'the level variable raises a standard policy to paranoid',
    env: { CC_SAFETY_NET_LEVEL: 'paranoid' },
    policy: { safety: { level: 'standard' } },
    strict: true,
    paranoidRm: true,
    paranoidInterpreters: true,
    worktreeMode: false,
    effectiveLevel: 'paranoid',
  },
  {
    behavior: 'the level variable can only raise, so standard cannot lower a paranoid policy',
    env: { CC_SAFETY_NET_LEVEL: 'standard' },
    policy: { safety: { level: 'paranoid' } },
    strict: true,
    paranoidRm: true,
    paranoidInterpreters: true,
    worktreeMode: false,
    effectiveLevel: 'paranoid',
  },
  {
    behavior: 'the level variable cannot lower a paranoid policy to strict either',
    env: { CC_SAFETY_NET_LEVEL: 'strict' },
    policy: { safety: { level: 'paranoid' } },
    strict: true,
    paranoidRm: true,
    paranoidInterpreters: true,
    worktreeMode: false,
    effectiveLevel: 'paranoid',
  },
  {
    behavior: 'the legacy paranoid variable still turns both paranoid capabilities on',
    env: { SAFETY_NET_PARANOID: '1' },
    policy: undefined,
    strict: false,
    paranoidRm: true,
    paranoidInterpreters: true,
    worktreeMode: false,
    effectiveLevel: 'custom',
  },
  {
    behavior: 'the canonical name wins over the legacy one, even when it turns the flag off',
    env: { CC_SAFETY_NET_PARANOID: '0', SAFETY_NET_PARANOID: '1' },
    policy: undefined,
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'standard',
  },
  {
    behavior: 'the canonical strict name wins over the legacy one the same way',
    env: { CC_SAFETY_NET_STRICT: '0', SAFETY_NET_STRICT: '1' },
    policy: undefined,
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'standard',
  },
  {
    behavior: 'the string "true" is truthy for a flag',
    env: { SAFETY_NET_PARANOID_RM: 'true' },
    policy: undefined,
    strict: false,
    paranoidRm: true,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'custom',
  },
  {
    behavior: 'truthiness ignores case',
    env: { SAFETY_NET_PARANOID_INTERPRETERS: 'True' },
    policy: undefined,
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: true,
    worktreeMode: false,
    effectiveLevel: 'custom',
  },
  {
    behavior: 'a flag overrules a policy capability override that had turned it off',
    env: { CC_SAFETY_NET_STRICT: '1' },
    policy: { safety: { level: 'standard', overrides: { failClosed: false } } },
    strict: true,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'strict',
  },
  {
    behavior: 'the paranoid flag overrules both paranoid capability overrides',
    env: { CC_SAFETY_NET_PARANOID: '1' },
    policy: {
      safety: { level: 'paranoid', overrides: { paranoidRm: false, paranoidInterpreters: false } },
    },
    strict: true,
    paranoidRm: true,
    paranoidInterpreters: true,
    worktreeMode: false,
    effectiveLevel: 'paranoid',
  },
  {
    behavior: 'an unrecognized level is reported on stderr and then ignored',
    env: { CC_SAFETY_NET_LEVEL: 'bananas' },
    policy: { safety: { level: 'standard' } },
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'standard',
    stderr: [
      'CC Safety Net: ignored invalid CC_SAFETY_NET_LEVEL="bananas". Use standard, strict, paranoid.',
    ],
  },
  {
    behavior: 'an empty level is unset rather than invalid, so nothing is printed',
    env: { CC_SAFETY_NET_LEVEL: '' },
    policy: { safety: { level: 'strict' } },
    strict: true,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'strict',
  },
  {
    behavior: 'a long invalid level is truncated in the warning it prints',
    env: { CC_SAFETY_NET_LEVEL: 'x'.repeat(60) },
    policy: undefined,
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'standard',
    stderr: [
      `CC Safety Net: ignored invalid CC_SAFETY_NET_LEVEL="${'x'.repeat(40)}". Use standard, strict, paranoid.`,
    ],
  },
  {
    behavior: 'nothing set at all is the standard preset',
    env: {},
    policy: undefined,
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'standard',
  },
  {
    behavior: 'the policy alone can turn worktree mode on',
    env: {},
    policy: { worktreeMode: true },
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: true,
    effectiveLevel: 'standard',
  },
  {
    behavior: 'the worktree variable turns it on over a policy that left it off',
    env: { CC_SAFETY_NET_WORKTREE: 'true' },
    policy: { worktreeMode: false },
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: true,
    effectiveLevel: 'standard',
  },
  {
    behavior: 'the legacy worktree variable does the same',
    env: { SAFETY_NET_WORKTREE: '1' },
    policy: {},
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: true,
    effectiveLevel: 'standard',
  },
  {
    behavior: 'the debug variable changes no capability',
    env: { CC_SAFETY_NET_DEBUG: '1' },
    policy: { safety: {} },
    strict: false,
    paranoidRm: false,
    paranoidInterpreters: false,
    worktreeMode: false,
    effectiveLevel: 'standard',
  },
];

describe('the environment variables that resolve safety capabilities', () => {
  test('the flag table names every variable and its legacy spelling', () => {
    // Spelled as one line per flag rather than as the table's own shape, so the assertion is a
    // reading of the table and not a copy of it.
    expect(
      Object.entries(ENV_FLAGS).map(
        ([capability, flag]) =>
          `${capability} ${flag.name} ${'legacyName' in flag ? flag.legacyName : '(no legacy name)'}`,
      ),
    ).toEqual([
      'level CC_SAFETY_NET_LEVEL (no legacy name)',
      'strict CC_SAFETY_NET_STRICT SAFETY_NET_STRICT',
      'paranoid CC_SAFETY_NET_PARANOID SAFETY_NET_PARANOID',
      'paranoidRm CC_SAFETY_NET_PARANOID_RM SAFETY_NET_PARANOID_RM',
      'paranoidInterpreters CC_SAFETY_NET_PARANOID_INTERPRETERS SAFETY_NET_PARANOID_INTERPRETERS',
      'worktree CC_SAFETY_NET_WORKTREE SAFETY_NET_WORKTREE',
      'debug CC_SAFETY_NET_DEBUG (no legacy name)',
      'auditScope CC_SAFETY_NET_AUDIT_SCOPE (no legacy name)',
    ]);
    expect(ENV_NAMES).toHaveLength(13);
  });

  test.each(RESOLVED.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    const read = modesFor(row);
    expect({
      strict: read.value.strict,
      paranoidRm: read.value.paranoidRm,
      paranoidInterpreters: read.value.paranoidInterpreters,
      worktreeMode: read.value.worktreeMode,
      effectiveLevel: read.value.effectiveLevel,
    }).toEqual({
      strict: row.strict,
      paranoidRm: row.paranoidRm,
      paranoidInterpreters: row.paranoidInterpreters,
      worktreeMode: row.worktreeMode,
      effectiveLevel: row.effectiveLevel,
    });
    expect(read.messages).toEqual([...(row.stderr ?? [])]);
  });
});

describe('where a capability came from', () => {
  test('an unraised policy level is the preset, and names the level it came from', () => {
    expect(
      modesFor({ env: {}, policy: { safety: { level: 'strict' } } }).value.capabilities.fail_closed,
    ).toEqual({
      enabled: true,
      source: 'preset',
      sources: ['policy safety.level=strict'],
    });
  });

  test('a level raised by the environment names both the policy level and the variable', () => {
    expect(
      modesFor({
        env: { CC_SAFETY_NET_LEVEL: 'paranoid' },
        policy: { safety: { level: 'strict' } },
      }).value.capabilities.paranoid_rm,
    ).toEqual({
      enabled: true,
      source: 'environment',
      sources: ['policy safety.level=strict', 'env CC_SAFETY_NET_LEVEL=paranoid'],
    });
  });

  test('a policy capability override names itself over the preset it replaced', () => {
    expect(
      modesFor({
        env: {},
        policy: { safety: { level: 'paranoid', overrides: { paranoidRm: false } } },
      }).value.capabilities.paranoid_rm,
    ).toEqual({
      enabled: false,
      source: 'capability_override',
      sources: ['policy safety.level=paranoid', 'policy safety.overrides.paranoid_rm'],
    });
  });

  test('a flag that overrules an override appends itself to the same trail', () => {
    expect(
      modesFor({
        env: { CC_SAFETY_NET_PARANOID_RM: '1' },
        policy: { safety: { level: 'paranoid', overrides: { paranoidRm: false } } },
      }).value.capabilities.paranoid_rm,
    ).toEqual({
      enabled: true,
      source: 'environment',
      sources: [
        'policy safety.level=paranoid',
        'policy safety.overrides.paranoid_rm',
        'env CC_SAFETY_NET_PARANOID_RM',
      ],
    });
  });
});

describe('the effective level a capability triple derives to', () => {
  test.each([
    ['nothing on is the standard preset', false, false, false, 'standard'],
    ['fail-closed alone is the strict preset', true, false, false, 'strict'],
    ['everything on is the paranoid preset', true, true, true, 'paranoid'],
    ['paranoid interpreters alone matches no preset', false, false, true, 'custom'],
    ['paranoid rm alone matches no preset', false, true, false, 'custom'],
    [
      'both paranoid capabilities without fail-closed matches no preset',
      false,
      true,
      true,
      'custom',
    ],
    ['fail-closed with paranoid interpreters matches no preset', true, false, true, 'custom'],
    ['fail-closed with paranoid rm matches no preset', true, true, false, 'custom'],
  ] as const)('%s', (_behavior, failClosed, paranoidRm, paranoidInterpreters, expected) => {
    expect(deriveEffectiveSafetyLevel({ failClosed, paranoidRm, paranoidInterpreters })).toBe(
      expected,
    );
  });
});

describe('the audit scope variable', () => {
  test.each([
    ['an unset scope records everything', undefined, 'all', true],
    ['all records everything', 'all', 'all', true],
    ['blocked records denials only', 'blocked', 'blocked', false],
    ['an unrecognized scope falls back to denials only', 'invalid', 'invalid', false],
    ['an empty scope is not the same as unset', '', 'invalid', false],
    ['the scope is case sensitive', 'ALL', 'invalid', false],
    ['blocked is case sensitive too', 'Blocked', 'invalid', false],
  ] as const)('%s', (_behavior, value, scope, recordsAllowed) => {
    expect(resolveAuditScope(value)).toBe(scope);
    expect(
      shouldRecordAllowedCommands(
        new Map(value === undefined ? [] : [[ENV_FLAGS.auditScope.name, value]]),
      ),
    ).toBe(recordsAllowed);
  });
});

const VALUE_CHOICES = [
  '',
  '0',
  '1',
  'true',
  'TRUE',
  'True',
  'false',
  'yes',
  'standard',
  'strict',
  'paranoid',
  'bananas',
  'x'.repeat(60),
] as const;

const LEVELS = ['standard', 'strict', 'paranoid'] as const;
const TRISTATE = [undefined, true, false] as const;
const POLICY_SHAPES = ['none', 'plain', 'safetyEmpty', 'safetyLevel'] as const;

function sampledPolicy(random: () => number): PolicyInput {
  const shape = pick(random, POLICY_SHAPES);
  if (shape === 'none') return undefined;
  const worktreeMode = pick(random, TRISTATE);
  const workflow = worktreeMode === undefined ? {} : { worktreeMode };
  if (shape === 'plain') return workflow;
  return {
    ...workflow,
    safety: {
      ...(shape === 'safetyLevel' ? { level: pick(random, LEVELS) } : {}),
      ...(random() < 0.75
        ? {
            overrides: {
              failClosed: pick(random, TRISTATE),
              paranoidRm: pick(random, TRISTATE),
              paranoidInterpreters: pick(random, TRISTATE),
            },
          }
        : {}),
    },
  };
}

function sampledCases(count: number): readonly EnvCase[] {
  const random = createSeededRandom(FUZZ_SEED);
  return Array.from({ length: count }, () => ({
    env: Object.fromEntries(
      ENV_NAMES.map((name) => [name, random() < 0.45 ? undefined : pick(random, VALUE_CHOICES)]),
    ),
    policy: sampledPolicy(random),
  }));
}

/**
 * The generated environments are here for the properties that must hold for every one of them,
 * not for what any single one resolves to; the rows above pin the individual outcomes.
 */
const SAMPLED = sampledCases(300);

describe('properties every environment must satisfy', () => {
  test('the reported level is always the one the three capability values derive to', () => {
    for (const subject of SAMPLED) {
      const modes = modesFor(subject).value;
      expect(modes.effectiveLevel).toBe(
        deriveEffectiveSafetyLevel({
          failClosed: modes.strict,
          paranoidRm: modes.paranoidRm,
          paranoidInterpreters: modes.paranoidInterpreters,
        }),
      );
    }
  });

  test('every capability agrees with the flag it backs and carries a non-empty provenance trail', () => {
    for (const subject of SAMPLED) {
      const modes = modesFor(subject).value;
      expect(modes.capabilities.fail_closed.enabled).toBe(modes.strict);
      expect(modes.capabilities.paranoid_rm.enabled).toBe(modes.paranoidRm);
      expect(modes.capabilities.paranoid_interpreters.enabled).toBe(modes.paranoidInterpreters);
      for (const capability of Object.values(modes.capabilities)) {
        expect(['preset', 'environment', 'capability_override']).toContain(capability.source);
        expect(capability.sources[0]).toStartWith('policy safety.level=');
      }
    }
  });

  test('the level variable is raise-only: forcing paranoid never turns a capability off', () => {
    for (const subject of SAMPLED) {
      const before = modesFor(subject).value;
      const after = modesFor({
        ...subject,
        env: { ...subject.env, CC_SAFETY_NET_LEVEL: 'paranoid' },
      }).value;
      expect(after.strict || !before.strict).toBeTrue();
      expect(after.paranoidRm || !before.paranoidRm).toBeTrue();
      expect(after.paranoidInterpreters || !before.paranoidInterpreters).toBeTrue();
    }
  });

  test('a level is reported on stderr exactly when it is set and unrecognized', () => {
    for (const subject of SAMPLED) {
      const level = subject.env[ENV_FLAGS.level.name];
      const invalid =
        level !== undefined && level !== '' && !LEVELS.includes(level as (typeof LEVELS)[number]);
      expect(modesFor(subject).messages).toHaveLength(invalid ? 1 : 0);
    }
  });

  test('a flag reads its canonical name first and falls back to its legacy spelling', () => {
    for (const subject of SAMPLED) {
      const injected = injectedFrom(subject.env);
      for (const flag of FLAGS) {
        const own = injected.get(flag.name);
        const legacy = flag.legacyName ? injected.get(flag.legacyName) : undefined;
        expect(getEnvFlagValue(flag, injected)).toBe(own ?? legacy);
        expect(envFlagIsSet(flag, injected)).toBe(own !== undefined || legacy !== undefined);
        expect(envTruthy(flag, injected)).toBe(
          (own ?? legacy) === '1' || (own ?? legacy)?.toLowerCase() === 'true',
        );
        expect(envTruthy(flag.name, injected)).toBe(own === '1' || own?.toLowerCase() === 'true');
      }
    }
  });
});
