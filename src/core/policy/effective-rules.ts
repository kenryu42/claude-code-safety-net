import {
  DESTRUCTIVE_COMMAND_RULE_METADATA,
  type DestructiveCommandRuleId,
} from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import type {
  CommandAnalysisPolicy,
  EffectiveDestructiveCommandRuleState,
  EffectivePolicy,
  EffectiveSafetyCapabilities,
} from './types';

const CATASTROPHIC_DESTRUCTIVE_COMMAND_RULE_IDS = new Set(
  DESTRUCTIVE_COMMAND_RULE_METADATA.filter((rule) => rule.catastrophic).map((rule) => rule.id),
);

/** Resolved policy fields the destructive-command rule gates read. */
export type DestructiveCommandRulePolicy = Pick<
  CommandAnalysisPolicy,
  'destructiveCommandProtectionEnabled' | 'effectiveDestructiveCommandRules'
>;

export function filterDestructiveCommandMatch(
  match: DestructiveCommandRuleMatch | null,
  policy: DestructiveCommandRulePolicy | undefined,
): DestructiveCommandRuleMatch | null {
  if (!match) return null;
  if (CATASTROPHIC_DESTRUCTIVE_COMMAND_RULE_IDS.has(match.id as DestructiveCommandRuleId)) {
    return match;
  }
  if (policy?.destructiveCommandProtectionEnabled === false) return null;
  const effectiveRule = policy?.effectiveDestructiveCommandRules[match.id];
  return effectiveRule && !effectiveRule.enabled ? null : match;
}

export function destructiveCommandRuleIsEnabled(
  policy: DestructiveCommandRulePolicy | undefined,
  id: DestructiveCommandRuleId,
  inheritedEnabled: boolean,
): boolean {
  if (CATASTROPHIC_DESTRUCTIVE_COMMAND_RULE_IDS.has(id)) return true;
  if (policy?.destructiveCommandProtectionEnabled === false) return false;
  return policy?.effectiveDestructiveCommandRules[id]?.enabled ?? inheritedEnabled;
}

export function resolveEffectiveDestructiveCommandRules(
  policy: Pick<
    EffectivePolicy,
    'destructiveCommandProtectionEnabled' | 'destructiveCommandRuleOverrides'
  >,
  capabilities: EffectiveSafetyCapabilities,
): Readonly<Record<string, EffectiveDestructiveCommandRuleState>> {
  return Object.freeze(
    Object.fromEntries(
      DESTRUCTIVE_COMMAND_RULE_METADATA.map((rule) => {
        const capability = rule.activationCapability
          ? capabilities[rule.activationCapability]
          : undefined;
        const inheritedEnabled = capability?.enabled ?? true;
        const override = policy.destructiveCommandRuleOverrides[rule.id];
        const state = rule.catastrophic
          ? {
              enabled: true,
              inheritedEnabled: true,
              changesInherited: false,
              source: 'catastrophic' as const,
              ...(override ? { override } : {}),
            }
          : policy.destructiveCommandProtectionEnabled
            ? override
              ? {
                  enabled: override === 'on',
                  inheritedEnabled,
                  changesInherited: (override === 'on') !== inheritedEnabled,
                  source: 'rule_override' as const,
                  ...(rule.activationCapability
                    ? { activationCapability: rule.activationCapability }
                    : {}),
                  override,
                }
              : {
                  enabled: inheritedEnabled,
                  inheritedEnabled,
                  changesInherited: false,
                  source: capability?.source ?? ('built_in_default' as const),
                  ...(rule.activationCapability
                    ? { activationCapability: rule.activationCapability }
                    : {}),
                }
            : {
                enabled: false,
                inheritedEnabled,
                changesInherited: false,
                source: 'master_disabled' as const,
                ...(rule.activationCapability
                  ? { activationCapability: rule.activationCapability }
                  : {}),
                ...(override ? { override } : {}),
              };
        return [rule.id, Object.freeze(state)];
      }),
    ),
  );
}

export function createCommandAnalysisPolicy(
  policy: EffectivePolicy,
  capabilities: EffectiveSafetyCapabilities,
): CommandAnalysisPolicy {
  return Object.freeze({
    ...policy,
    effectiveDestructiveCommandRules: resolveEffectiveDestructiveCommandRules(policy, capabilities),
  });
}
