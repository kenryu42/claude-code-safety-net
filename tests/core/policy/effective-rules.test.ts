import { describe, expect, test } from 'bun:test';
import { resolveCommandAnalysisContext } from '@/core/policy/analysis-context';
import {
  createCommandAnalysisPolicy,
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
  resolveEffectiveDestructiveCommandRules,
} from '@/core/policy/effective-rules';
import { deriveEffectiveSafetyLevel, getCCSafetyNetEnvModes } from '@/core/policy/env';
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

/**
 * Rule activation is a pure function of the resolved capabilities and the policy overrides. The
 * capability objects come from the resolver itself, so the provenance they carry is real.
 *
 * Two gates read the result: the analyzer filters a match through `filterDestructiveCommandMatch`
 * and every reporting surface asks `destructiveCommandRuleIsEnabled`. They must never disagree
 * about the same rule, which is the property the whole cross product is checked against below.
 */

const CAPABILITY_SETS: readonly {
  readonly label: string;
  readonly env: Record<string, string>;
  readonly policy: Parameters<typeof getCCSafetyNetEnvModes>[0];
}[] = [
  { label: 'no policy at all', env: {}, policy: undefined },
  { label: 'the strict preset', env: {}, policy: { safety: { level: 'strict' } } },
  { label: 'the paranoid preset', env: {}, policy: { safety: { level: 'paranoid' } } },
  {
    label: 'the level raised to strict',
    env: { CC_SAFETY_NET_LEVEL: 'strict' },
    policy: undefined,
  },
  {
    label: 'the level raised to paranoid',
    env: { CC_SAFETY_NET_LEVEL: 'paranoid' },
    policy: undefined,
  },
  { label: 'the strict flag', env: { CC_SAFETY_NET_STRICT: '1' }, policy: undefined },
  { label: 'the paranoid flag', env: { CC_SAFETY_NET_PARANOID: '1' }, policy: undefined },
  { label: 'the paranoid rm flag', env: { CC_SAFETY_NET_PARANOID_RM: '1' }, policy: undefined },
  {
    label: 'the paranoid interpreters flag',
    env: { CC_SAFETY_NET_PARANOID_INTERPRETERS: '1' },
    policy: undefined,
  },
  {
    label: 'fail_closed forced on above the standard preset',
    env: {},
    policy: { safety: { level: 'standard', overrides: { failClosed: true } } },
  },
  {
    label: 'paranoid rm forced off below the paranoid preset',
    env: {},
    policy: { safety: { level: 'paranoid', overrides: { paranoidRm: false } } },
  },
  {
    label: 'every capability forced off below the paranoid preset',
    env: {},
    policy: {
      safety: {
        level: 'paranoid',
        overrides: { failClosed: false, paranoidRm: false, paranoidInterpreters: false },
      },
    },
  },
];

const CAPABILITIES: readonly EffectiveSafetyCapabilities[] = CAPABILITY_SETS.map(
  (set) => getCCSafetyNetEnvModes(set.policy, new Map(Object.entries(set.env))).capabilities,
);

const capabilitiesFor = (label: string) => {
  const index = CAPABILITY_SETS.findIndex((set) => set.label === label);
  return CAPABILITIES[index] as EffectiveSafetyCapabilities;
};

/** One catalog rule per activation class, so a row can name the behavior it pins. */
const CATASTROPHIC_ID = 'rm.recursive-force-root-or-home';
const FAIL_CLOSED_ID = 'rm.recursive-force-dynamic-target';
const PARANOID_RM_ID = 'rm.recursive-force-paranoid';
const PARANOID_INTERPRETERS_ID = 'interpreter.one-liner-paranoid';
const ALWAYS_ON_ID = 'git.ssh-env';

const CATALOG_IDS = DESTRUCTIVE_COMMAND_RULE_METADATA.map(
  (rule) => rule.id as DestructiveCommandRuleId,
);

const CHOSEN_IDS: readonly string[] = [
  CATASTROPHIC_ID,
  FAIL_CLOSED_ID,
  PARANOID_RM_ID,
  PARANOID_INTERPRETERS_ID,
  ALWAYS_ON_ID,
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

const policyWith = (
  enabled: boolean,
  overrides: Record<string, DestructiveCommandRuleOverride> = {},
): EffectivePolicy => ({
  ...BASE_POLICY,
  destructiveCommandProtectionEnabled: enabled,
  destructiveCommandRuleOverrides: overrides,
});

const POLICIES: readonly EffectivePolicy[] = [true, false].flatMap((enabled) =>
  OVERRIDE_MAPS.map((overrides) => policyWith(enabled, overrides)),
);

const ANALYSIS_POLICIES = CAPABILITIES.flatMap((capabilities) =>
  POLICIES.map((policy) => createCommandAnalysisPolicy(policy, capabilities)),
);

describe('the capability sets these rules are resolved against', () => {
  test('cover every provenance a capability can carry', () => {
    const sources = new Set(
      CAPABILITIES.flatMap((capabilities) => Object.values(capabilities).map((one) => one.source)),
    );
    expect([...sources].sort()).toStrictEqual(['capability_override', 'environment', 'preset']);
  });
});

describe('resolving one rule against a policy and a capability set', () => {
  test('a catastrophic rule is always enforced, whatever the level says', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true),
        capabilitiesFor('no policy at all'),
      )[CATASTROPHIC_ID],
    ).toEqual({
      enabled: true,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'catastrophic',
    });
  });

  test('a catastrophic rule survives the master switch being off, and echoes the override it ignored', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(false, { [CATASTROPHIC_ID]: 'off' }),
        capabilitiesFor('no policy at all'),
      )[CATASTROPHIC_ID],
    ).toEqual({
      enabled: true,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'catastrophic',
      override: 'off',
    });
  });

  test('a rule with no activation capability is on by default and says so', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true),
        capabilitiesFor('no policy at all'),
      )[ALWAYS_ON_ID],
    ).toEqual({
      enabled: true,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'built_in_default',
    });
  });

  test('a capability-gated rule inherits the preset that gates it', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true),
        capabilitiesFor('no policy at all'),
      )[FAIL_CLOSED_ID],
    ).toEqual({
      enabled: false,
      inheritedEnabled: false,
      changesInherited: false,
      source: 'preset',
      activationCapability: 'fail_closed',
    });
  });

  test('raising the level through the environment moves the provenance to the environment', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true),
        capabilitiesFor('the level raised to paranoid'),
      )[PARANOID_RM_ID],
    ).toEqual({
      enabled: true,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'environment',
      activationCapability: 'paranoid_rm',
    });
  });

  test('a capability forced off by the policy is reported as a capability override', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true),
        capabilitiesFor('paranoid rm forced off below the paranoid preset'),
      )[PARANOID_RM_ID],
    ).toEqual({
      enabled: false,
      inheritedEnabled: false,
      changesInherited: false,
      source: 'capability_override',
      activationCapability: 'paranoid_rm',
    });
  });

  test('a rule override that turns a gated rule on records that it changed what it inherited', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true, { [PARANOID_INTERPRETERS_ID]: 'on' }),
        capabilitiesFor('no policy at all'),
      )[PARANOID_INTERPRETERS_ID],
    ).toEqual({
      enabled: true,
      inheritedEnabled: false,
      changesInherited: true,
      source: 'rule_override',
      activationCapability: 'paranoid_interpreters',
      override: 'on',
    });
  });

  test('a rule override that repeats what was inherited changes nothing', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true, { [ALWAYS_ON_ID]: 'on' }),
        capabilitiesFor('no policy at all'),
      )[ALWAYS_ON_ID],
    ).toEqual({
      enabled: true,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'rule_override',
      override: 'on',
    });
  });

  test('the master switch off disables every non-catastrophic rule and keeps the override visible', () => {
    const rules = resolveEffectiveDestructiveCommandRules(
      policyWith(false, { [ALWAYS_ON_ID]: 'on' }),
      capabilitiesFor('the paranoid preset'),
    );
    expect(rules[ALWAYS_ON_ID]).toEqual({
      enabled: false,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'master_disabled',
      override: 'on',
    });
    expect(rules[PARANOID_RM_ID]).toEqual({
      enabled: false,
      inheritedEnabled: true,
      changesInherited: false,
      source: 'master_disabled',
      activationCapability: 'paranoid_rm',
    });
  });

  test('an override naming no catalog rule contributes no entry', () => {
    expect(
      resolveEffectiveDestructiveCommandRules(
        policyWith(true, { 'custom.nope': 'on' }),
        capabilitiesFor('no policy at all'),
      )['custom.nope'],
    ).toBeUndefined();
  });
});

/**
 * The generated cross product is here for the properties that must hold for every one of its
 * cells; the rows above pin what each individual resolution reports.
 */
describe('properties every policy and capability set must satisfy', () => {
  test('the resolved table is frozen and holds exactly the catalog, one entry per rule', () => {
    for (const capabilities of CAPABILITIES) {
      for (const policy of POLICIES) {
        const rules = resolveEffectiveDestructiveCommandRules(policy, capabilities);
        expect(Object.isFrozen(rules)).toBeTrue();
        expect(Object.keys(rules)).toEqual(CATALOG_IDS);
        for (const state of Object.values(rules)) expect(Object.isFrozen(state)).toBeTrue();
      }
    }
  });

  test('a catastrophic rule is enabled in every cell of the product', () => {
    const catastrophic = DESTRUCTIVE_COMMAND_RULE_METADATA.filter((rule) => rule.catastrophic);
    expect(catastrophic.length).toBeGreaterThan(0);
    for (const capabilities of CAPABILITIES) {
      for (const policy of POLICIES) {
        const rules = resolveEffectiveDestructiveCommandRules(policy, capabilities);
        for (const rule of catastrophic) {
          expect(rules[rule.id]?.enabled).toBeTrue();
          expect(rules[rule.id]?.source).toBe('catastrophic');
        }
      }
    }
  });

  test('while protection is on, changesInherited says exactly whether the state left its inheritance', () => {
    for (const capabilities of CAPABILITIES) {
      for (const overrides of OVERRIDE_MAPS) {
        const rules = resolveEffectiveDestructiveCommandRules(
          policyWith(true, overrides),
          capabilities,
        );
        for (const state of Object.values(rules)) {
          expect(state.changesInherited).toBe(state.enabled !== state.inheritedEnabled);
        }
      }
    }
  });

  test('turning the master switch off disables everything the catalog does not call catastrophic', () => {
    for (const capabilities of CAPABILITIES) {
      for (const overrides of OVERRIDE_MAPS) {
        const rules = resolveEffectiveDestructiveCommandRules(
          policyWith(false, overrides),
          capabilities,
        );
        for (const rule of DESTRUCTIVE_COMMAND_RULE_METADATA) {
          expect(rules[rule.id]?.enabled).toBe(rule.catastrophic === true);
        }
      }
    }
  });

  test('a rule states the capability that gates it exactly when the catalog gives it one', () => {
    for (const capabilities of CAPABILITIES) {
      for (const policy of POLICIES) {
        const rules = resolveEffectiveDestructiveCommandRules(policy, capabilities);
        for (const rule of DESTRUCTIVE_COMMAND_RULE_METADATA) {
          expect('activationCapability' in (rules[rule.id] ?? {})).toBe(
            rule.catastrophic !== true && rule.activationCapability !== undefined,
          );
        }
      }
    }
  });

  test('the analysis policy carries the resolved table and is frozen with the policy it came from', () => {
    for (const capabilities of CAPABILITIES) {
      for (const policy of POLICIES) {
        const analysis = createCommandAnalysisPolicy(policy, capabilities);
        expect(Object.isFrozen(analysis)).toBeTrue();
        expect(analysis.effectiveDestructiveCommandRules).toEqual(
          resolveEffectiveDestructiveCommandRules(policy, capabilities),
        );
        expect(analysis.destructiveCommandProtectionEnabled).toBe(
          policy.destructiveCommandProtectionEnabled,
        );
      }
    }
  });

  test('the analyzer gate and the reporting gate never disagree about a rule', () => {
    for (const policy of [...ANALYSIS_POLICIES, undefined]) {
      for (const id of CATALOG_IDS) {
        expect(
          filterDestructiveCommandMatch(destructiveCommandMatch(id, 'r'), policy) !== null,
        ).toBe(destructiveCommandRuleIsEnabled(policy, id, true));
      }
    }
  });

  test('a match that never happened stays null through the filter', () => {
    for (const policy of [...ANALYSIS_POLICIES, undefined]) {
      expect(filterDestructiveCommandMatch(null, policy)).toBeNull();
    }
  });

  test('a filtered match passes through untouched rather than being rebuilt', () => {
    const match = destructiveCommandMatch(CATASTROPHIC_ID, 'r');
    expect(filterDestructiveCommandMatch(match, ANALYSIS_POLICIES[0])).toBe(match);
  });

  test('with no policy at all a rule falls back to what the caller inherited', () => {
    for (const id of CATALOG_IDS) {
      const catastrophic =
        DESTRUCTIVE_COMMAND_RULE_METADATA.find((rule) => rule.id === id)?.catastrophic === true;
      expect(destructiveCommandRuleIsEnabled(undefined, id, false)).toBe(catastrophic);
      expect(destructiveCommandRuleIsEnabled(undefined, id, true)).toBeTrue();
    }
  });
});

const SNAPSHOT = createPolicySnapshot({
  ...BASE_POLICY,
  destructiveCommandRuleOverrides: MIXED_OVERRIDES,
});

const contextWith = (
  effectiveCapabilities: EffectiveSafetyCapabilities,
  options: {
    strict?: boolean;
    paranoidRm?: boolean;
    paranoidInterpreters?: boolean;
    worktreeMode?: boolean;
  },
) => resolveCommandAnalysisContext({ policySnapshot: SNAPSHOT, effectiveCapabilities, ...options });

describe('the analysis context an evaluation runs under', () => {
  test('with no options the capabilities pass through unchanged and worktree mode is off', () => {
    const capabilities = capabilitiesFor('the strict preset');
    const context = contextWith(capabilities, {});
    expect(context.effectiveCapabilities).toEqual(capabilities);
    expect(context.strict).toBeTrue();
    expect(context.paranoidRm).toBeFalse();
    expect(context.paranoidInterpreters).toBeFalse();
    expect(context.worktreeMode).toBeFalse();
    expect(context.effectiveLevel).toBe('strict');
  });

  test('an option that repeats what the capability already said leaves its provenance alone', () => {
    const capabilities = capabilitiesFor('the strict preset');
    expect(contextWith(capabilities, { strict: true }).effectiveCapabilities.fail_closed).toEqual(
      capabilities.fail_closed,
    );
  });

  test('an option that contradicts the capability replaces it and names itself in the trail', () => {
    const capabilities = capabilitiesFor('the strict preset');
    expect(contextWith(capabilities, { strict: false }).effectiveCapabilities.fail_closed).toEqual({
      enabled: false,
      source: 'capability_override',
      sources: [...capabilities.fail_closed.sources, 'analysis options.strict'],
    });
  });

  test('worktree mode comes from the option alone', () => {
    expect(
      contextWith(capabilitiesFor('no policy at all'), { worktreeMode: true }).worktreeMode,
    ).toBeTrue();
  });

  test('every option combination resolves consistently with the capabilities it started from', () => {
    const TRISTATE = [undefined, true, false] as const;
    const combinations = TRISTATE.flatMap((strict) =>
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
    expect(combinations).toHaveLength(81);
    for (const capabilities of CAPABILITIES) {
      for (const options of combinations) {
        const context = contextWith(capabilities, options);
        expect(context.strict).toBe(options.strict ?? capabilities.fail_closed.enabled);
        expect(context.paranoidRm).toBe(options.paranoidRm ?? capabilities.paranoid_rm.enabled);
        expect(context.paranoidInterpreters).toBe(
          options.paranoidInterpreters ?? capabilities.paranoid_interpreters.enabled,
        );
        expect(context.worktreeMode).toBe(options.worktreeMode ?? false);
        expect(context.effectiveCapabilities.fail_closed.enabled).toBe(context.strict);
        expect(context.effectiveCapabilities.paranoid_rm.enabled).toBe(context.paranoidRm);
        expect(context.effectiveCapabilities.paranoid_interpreters.enabled).toBe(
          context.paranoidInterpreters,
        );
        expect(context.effectiveLevel).toBe(
          deriveEffectiveSafetyLevel({
            failClosed: context.strict,
            paranoidRm: context.paranoidRm,
            paranoidInterpreters: context.paranoidInterpreters,
          }),
        );
        expect(Object.isFrozen(context.policy)).toBeTrue();
      }
    }
  });
});
