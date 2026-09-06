import { describe, expect, test } from 'bun:test';
import { resolveCommandAnalysisContext as contextWithNext } from '@/core/policy/analysis-context';
import {
  createCommandAnalysisPolicy as analysisPolicyWithNext,
  filterDestructiveCommandMatch as filterWithNext,
  resolveEffectiveDestructiveCommandRules as resolveWithNext,
  destructiveCommandRuleIsEnabled as ruleEnabledWithNext,
} from '@/core/policy/effective-rules';
import { getCCSafetyNetEnvModes } from '@/core/policy/env';
import { createPolicySnapshot } from '@/core/policy/snapshot';
import type {
  DestructiveCommandRuleOverride,
  EffectivePolicy,
  EffectiveSafetyCapabilities,
} from '@/core/policy/types';
import {
  DESTRUCTIVE_COMMAND_RULE_METADATA,
  type DestructiveCommandRuleId,
  destructiveCommandMatch,
} from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import { expectRecordedDigest } from '../../helpers/gate-differential';

/**
 * Rule activation is a pure function of the resolved capabilities and the policy overrides. The
 * capability objects come from the resolver itself, so the provenance they carry is real.
 */

const CAPABILITIES: readonly EffectiveSafetyCapabilities[] = [
  { env: {}, policy: undefined },
  { env: {}, policy: { safety: { level: 'strict' as const } } },
  { env: {}, policy: { safety: { level: 'paranoid' as const } } },
  { env: { CC_SAFETY_NET_LEVEL: 'strict' }, policy: undefined },
  { env: { CC_SAFETY_NET_LEVEL: 'paranoid' }, policy: undefined },
  { env: { CC_SAFETY_NET_STRICT: '1' }, policy: undefined },
  { env: { CC_SAFETY_NET_PARANOID: '1' }, policy: undefined },
  { env: { CC_SAFETY_NET_PARANOID_RM: '1' }, policy: undefined },
  { env: { CC_SAFETY_NET_PARANOID_INTERPRETERS: '1' }, policy: undefined },
  { env: {}, policy: { safety: { level: 'standard' as const, overrides: { failClosed: true } } } },
  {
    env: {},
    policy: { safety: { level: 'paranoid' as const, overrides: { paranoidRm: false } } },
  },
  {
    env: {},
    policy: {
      safety: {
        level: 'paranoid' as const,
        overrides: { failClosed: false, paranoidRm: false, paranoidInterpreters: false },
      },
    },
  },
].map(
  (pair) => getCCSafetyNetEnvModes(pair.policy, new Map(Object.entries(pair.env))).capabilities,
);

function firstRuleId(
  predicate: (rule: (typeof DESTRUCTIVE_COMMAND_RULE_METADATA)[number]) => boolean,
) {
  const rule = DESTRUCTIVE_COMMAND_RULE_METADATA.find(predicate);
  if (!rule) throw new Error('the catalog no longer holds a rule for this predicate');
  return rule.id;
}

const CHOSEN_IDS: readonly string[] = [
  firstRuleId((rule) => rule.catastrophic === true),
  firstRuleId((rule) => rule.activationCapability === 'fail_closed'),
  firstRuleId((rule) => rule.activationCapability === 'paranoid_rm'),
  firstRuleId((rule) => rule.activationCapability === 'paranoid_interpreters'),
  firstRuleId((rule) => !rule.catastrophic && rule.activationCapability === undefined),
  'custom.nope',
];

const MIXED_OVERRIDES: Record<string, DestructiveCommandRuleOverride> = Object.fromEntries(
  CHOSEN_IDS.map((id, index) => [id, index % 2 === 0 ? 'off' : 'on'] as const),
);

const OVERRIDE_MAPS: readonly Record<string, DestructiveCommandRuleOverride>[] = [
  {},
  ...CHOSEN_IDS.map((id) => ({ [id]: 'on' as const })),
  ...CHOSEN_IDS.map((id) => ({ [id]: 'off' as const })),
  MIXED_OVERRIDES,
];

const BASE_POLICY: EffectivePolicy = {
  rules: [],
  transparentWrappers: [],
  safety: {},
  worktreeMode: false,
  destructiveCommandProtectionEnabled: true,
  destructiveCommandRuleOverrides: {},
  destructiveCommandAllowPaths: [],
  secretProtection: { enabled: true, disabledRules: [], denyPaths: [], allowPaths: [] },
};

const POLICIES: readonly EffectivePolicy[] = [true, false].flatMap((enabled) =>
  OVERRIDE_MAPS.map((overrides) => ({
    ...BASE_POLICY,
    destructiveCommandProtectionEnabled: enabled,
    destructiveCommandRuleOverrides: overrides,
  })),
);

const CATALOG_IDS = DESTRUCTIVE_COMMAND_RULE_METADATA.map(
  (rule) => rule.id as DestructiveCommandRuleId,
);

const ANALYSIS_POLICIES = CAPABILITIES.flatMap((capabilities) =>
  POLICIES.map((policy) => analysisPolicyWithNext(policy, capabilities)),
);

/** Every catalog id against every resolved policy, plus the no-policy and no-match edges. */
function filteredMatches<P>(
  filter: (
    match: DestructiveCommandRuleMatch | null,
    policy: P | undefined,
  ) => DestructiveCommandRuleMatch | null,
  policies: readonly (P | undefined)[],
) {
  return policies.flatMap((policy) => [
    ...CATALOG_IDS.map((id) => filter(destructiveCommandMatch(id, 'r'), policy)),
    filter(null, policy),
  ]);
}

function enabledFlags<P>(
  isEnabled: (policy: P | undefined, id: DestructiveCommandRuleId, inherited: boolean) => boolean,
  policies: readonly (P | undefined)[],
) {
  return policies.flatMap((policy) =>
    [true, false].flatMap((inherited) => CATALOG_IDS.map((id) => isEnabled(policy, id, inherited))),
  );
}

const TRISTATE = [undefined, true, false] as const;

const OPTION_COMBINATIONS = TRISTATE.flatMap((strict) =>
  TRISTATE.flatMap((paranoidRm) =>
    TRISTATE.flatMap((paranoidInterpreters) =>
      TRISTATE.map((worktreeMode) => ({
        strict,
        paranoidRm,
        paranoidInterpreters,
        worktreeMode,
      })),
    ),
  ),
);

const SNAPSHOT = createPolicySnapshot({
  ...BASE_POLICY,
  destructiveCommandRuleOverrides: MIXED_OVERRIDES,
});

describe('effective destructive-command rules', () => {
  test('the capability sets cover every provenance', () => {
    const sources = new Set(
      CAPABILITIES.flatMap((capabilities) => Object.values(capabilities).map((one) => one.source)),
    );
    expect([...sources].sort()).toStrictEqual(['capability_override', 'environment', 'preset']);
  });

  test('resolveEffectiveDestructiveCommandRules agrees for every policy and capability set', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const [set, capabilities] of CAPABILITIES.entries()) {
      for (const [row, policy] of POLICIES.entries()) {
        recorded.push([`${set}-${row}`, resolveWithNext(policy, capabilities)]);
      }
    }
    expectRecordedDigest('core-effective-rules/resolved', recorded);
  });

  test('createCommandAnalysisPolicy agrees for every policy and capability set', () => {
    expectRecordedDigest(
      'core-effective-rules/analysis-policies',
      ANALYSIS_POLICIES.map((policy, row) => [`${row}`, policy] as const),
    );
  });

  test('filterDestructiveCommandMatch agrees for every catalog id', () => {
    const filtered = filteredMatches(filterWithNext, [...ANALYSIS_POLICIES, undefined]);
    expectRecordedDigest('core-effective-rules/filtered-matches', [['matches', filtered]]);
  });

  test('destructiveCommandRuleIsEnabled agrees for every catalog id and inherited value', () => {
    const flags = enabledFlags(ruleEnabledWithNext, [...ANALYSIS_POLICIES, undefined]);
    expectRecordedDigest('core-effective-rules/enabled-flags', [['flags', flags]]);
  });

  test('resolveCommandAnalysisContext agrees for every option and capability combination', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const [set, effectiveCapabilities] of CAPABILITIES.entries()) {
      for (const [row, options] of OPTION_COMBINATIONS.entries()) {
        recorded.push([
          `${set}-${row}`,
          contextWithNext({ policySnapshot: SNAPSHOT, effectiveCapabilities, ...options }),
        ]);
      }
    }
    expectRecordedDigest('core-effective-rules/analysis-context', recorded);
  });
});
