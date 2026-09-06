import { describe, expect, spyOn, test } from 'bun:test';
import {
  deriveEffectiveSafetyLevel as deriveWithNext,
  envFlagIsSet as flagIsSetWithNext,
  getEnvFlagValue as flagValueWithNext,
  getCCSafetyNetEnvModes as modesWithNext,
  ENV_FLAGS as NEXT_ENV_FLAGS,
  shouldRecordAllowedCommands as recordAllowedWithNext,
  resolveAuditScope as scopeWithNext,
  envTruthy as truthyWithNext,
} from '@next/core/policy/env';
import type { PolicySafety } from '@next/core/policy/types';
import {
  deriveEffectiveSafetyLevel as deriveWithSrc,
  ENV_FLAGS,
  type EnvFlag,
  envFlagIsSet as flagIsSetWithSrc,
  getEnvFlagValue as flagValueWithSrc,
  getCCSafetyNetEnvModes as modesWithSrc,
  shouldRecordAllowedCommands as recordAllowedWithSrc,
  resolveAuditScope as scopeWithSrc,
  envTruthy as truthyWithSrc,
} from '@/policy/env';
import { withEnv } from '../../../helpers';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';

/**
 * `src` reads `process.env` ambiently; `next` reads an injected map. The same
 * variables therefore have to be staged two ways: `withEnv` names every flag the
 * module knows (unset ones as `undefined`) around the `src` call, and the `next`
 * call receives a map holding only the set ones. Both sides are run under a
 * `console.error` spy, because an invalid level is reported on stderr and that
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

function capture<T>(run: () => T) {
  const messages: string[] = [];
  const spy = spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    messages.push(parts.map(String).join(' '));
  });
  const value = run();
  spy.mockRestore();
  return { value, messages };
}

function readWithSrc(subject: EnvCase) {
  const staged = Object.fromEntries(ENV_NAMES.map((name) => [name, subject.env[name]]));
  return capture(() =>
    withEnv(staged, () => ({
      modes: modesWithSrc(subject.policy),
      truthyFlags: FLAGS.map((flag) => truthyWithSrc(flag)),
      truthyNames: ENV_NAMES.map((name) => truthyWithSrc(name)),
      flagValues: FLAGS.map((flag) => flagValueWithSrc(flag)),
      flagsSet: FLAGS.map((flag) => flagIsSetWithSrc(flag)),
      auditScope: scopeWithSrc(flagValueWithSrc(ENV_FLAGS.auditScope)),
      recordAllowed: recordAllowedWithSrc(),
    })),
  );
}

function readWithNext(subject: EnvCase) {
  const injected = new Map(
    ENV_NAMES.flatMap((name) => {
      const value = subject.env[name];
      return value === undefined ? [] : [[name, value] as const];
    }),
  );
  return capture(() => ({
    modes: modesWithNext(subject.policy, injected),
    truthyFlags: FLAGS.map((flag) => truthyWithNext(flag, injected)),
    truthyNames: ENV_NAMES.map((name) => truthyWithNext(name, injected)),
    flagValues: FLAGS.map((flag) => flagValueWithNext(flag, injected)),
    flagsSet: FLAGS.map((flag) => flagIsSetWithNext(flag, injected)),
    auditScope: scopeWithNext(flagValueWithNext(NEXT_ENV_FLAGS.auditScope, injected)),
    recordAllowed: recordAllowedWithNext(injected),
  }));
}

const FIXED_CASES: readonly EnvCase[] = [
  { env: { CC_SAFETY_NET_LEVEL: 'strict' }, policy: { safety: { level: 'standard' } } },
  { env: { CC_SAFETY_NET_LEVEL: 'paranoid' }, policy: { safety: { level: 'standard' } } },
  { env: { CC_SAFETY_NET_LEVEL: 'standard' }, policy: { safety: { level: 'paranoid' } } },
  { env: { CC_SAFETY_NET_LEVEL: 'strict' }, policy: { safety: { level: 'paranoid' } } },
  { env: { SAFETY_NET_PARANOID: '1' }, policy: undefined },
  { env: { CC_SAFETY_NET_PARANOID: '0', SAFETY_NET_PARANOID: '1' }, policy: undefined },
  { env: { CC_SAFETY_NET_STRICT: '0', SAFETY_NET_STRICT: '1' }, policy: undefined },
  { env: { SAFETY_NET_PARANOID_RM: 'true' }, policy: undefined },
  { env: { SAFETY_NET_PARANOID_INTERPRETERS: 'True' }, policy: undefined },
  {
    env: { CC_SAFETY_NET_STRICT: '1' },
    policy: { safety: { level: 'standard', overrides: { failClosed: false } } },
  },
  {
    env: { CC_SAFETY_NET_PARANOID: '1' },
    policy: {
      safety: { level: 'paranoid', overrides: { paranoidRm: false, paranoidInterpreters: false } },
    },
  },
  { env: { CC_SAFETY_NET_LEVEL: 'bananas' }, policy: { safety: { level: 'standard' } } },
  { env: { CC_SAFETY_NET_LEVEL: '' }, policy: { safety: { level: 'strict' } } },
  { env: { CC_SAFETY_NET_LEVEL: `${'x'.repeat(60)}` }, policy: undefined },
  { env: { CC_SAFETY_NET_AUDIT_SCOPE: 'all' }, policy: undefined },
  { env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' }, policy: undefined },
  { env: { CC_SAFETY_NET_AUDIT_SCOPE: 'bananas' }, policy: undefined },
  { env: {}, policy: undefined },
  { env: {}, policy: { worktreeMode: true } },
  { env: { CC_SAFETY_NET_WORKTREE: 'true' }, policy: { worktreeMode: false } },
  { env: { SAFETY_NET_WORKTREE: '1' }, policy: {} },
  { env: { CC_SAFETY_NET_DEBUG: '1' }, policy: { safety: {} } },
];

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

describe('policy environment modes', () => {
  test('the flag table is the same in both implementations', () => {
    expect(NEXT_ENV_FLAGS).toStrictEqual(ENV_FLAGS);
    expect(NEXT_ENV_FLAGS).toMatchSnapshot();
    expect(ENV_NAMES).toHaveLength(13);
  });

  test('the fixed environments agree on every reader and on stderr', () => {
    for (const subject of FIXED_CASES) {
      const read = readWithNext(subject);
      expect(read).toStrictEqual(readWithSrc(subject));
      expect(read).toMatchSnapshot();
    }
  });

  test('a seeded sample of environments and policies agrees on every reader', () => {
    const recorded = sampledCases(300).map((subject, row) => {
      const read = readWithNext(subject);
      expect(read).toStrictEqual(readWithSrc(subject));
      return [`${row}`, read] as const;
    });
    expectRecordedDigest('core-policy-env/sampled-cases', recorded);
  });

  test('resolveAuditScope agrees on raw values', () => {
    for (const value of ['all', 'blocked', 'invalid', '', 'ALL', 'Blocked', undefined]) {
      const scope = scopeWithNext(value);
      expect(scope).toStrictEqual(scopeWithSrc(value));
      expect(scope).toMatchSnapshot();
    }
  });

  test('deriveEffectiveSafetyLevel agrees on all eight capability combinations', () => {
    const combinations = [false, true].flatMap((failClosed) =>
      [false, true].flatMap((paranoidRm) =>
        [false, true].map((paranoidInterpreters) => ({
          failClosed,
          paranoidRm,
          paranoidInterpreters,
        })),
      ),
    );
    expect(combinations).toHaveLength(8);
    for (const values of combinations) {
      const derived = deriveWithNext(values);
      expect(derived).toStrictEqual(deriveWithSrc(values));
      expect(derived).toMatchSnapshot();
    }
  });
});
