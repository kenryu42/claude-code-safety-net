import { createPolicySnapshot } from '@/core/policy/snapshot';
import type {
  CustomRule,
  CustomRuleMetadata,
  DestructiveCommandRuleOverride,
  PolicySafety,
  PolicySafetyLevel,
  PolicySnapshot,
  SecretProtectionConfig,
} from '@/core/policy/types';

export interface TestPolicyInput {
  version?: number;
  rules?: readonly CustomRule[];
  transparent_wrappers?: readonly string[];
  safety?: PolicySafety;
  worktreeMode?: boolean;
  destructiveCommandProtectionEnabled?: boolean;
  destructiveCommandRuleOverrides?: Readonly<Record<string, DestructiveCommandRuleOverride>>;
  destructiveCommandAllowPaths?: readonly string[];
  secretProtection?: SecretProtectionConfig;
  configFallbackReason?: string;
  ruleMetadata?: Readonly<Record<string, CustomRuleMetadata>>;
}

export function testModes(level: PolicySafetyLevel = 'standard') {
  const strict = level === 'strict' || level === 'paranoid';
  const paranoid = level === 'paranoid';
  return {
    strict,
    paranoidRm: paranoid,
    paranoidInterpreters: paranoid,
    worktreeMode: false,
    effectiveLevel: level,
    capabilities: {
      fail_closed: { enabled: strict, source: 'preset' as const, sources: [] },
      paranoid_rm: { enabled: paranoid, source: 'preset' as const, sources: [] },
      paranoid_interpreters: { enabled: paranoid, source: 'preset' as const, sources: [] },
    },
  };
}

export function policySnapshot(input: TestPolicyInput = {}): PolicySnapshot {
  const policy = {
    rules: input.rules ?? [],
    transparentWrappers: input.transparent_wrappers ?? [],
    safety: input.safety ?? {},
    worktreeMode: input.worktreeMode ?? false,
    destructiveCommandProtectionEnabled: input.destructiveCommandProtectionEnabled ?? true,
    destructiveCommandRuleOverrides: { ...input.destructiveCommandRuleOverrides },
    destructiveCommandAllowPaths: [...(input.destructiveCommandAllowPaths ?? [])],
    secretProtection: {
      enabled: input.secretProtection?.enabled ?? true,
      disabledRules: Array.from(input.secretProtection?.disabledRules ?? []),
      denyPaths: [...(input.secretProtection?.denyPaths ?? [])],
      allowPaths: [...(input.secretProtection?.allowPaths ?? [])],
    },
  };
  return createPolicySnapshot(
    policy,
    input.configFallbackReason
      ? { diagnostics: [input.configFallbackReason], reason: input.configFallbackReason }
      : undefined,
    input.ruleMetadata,
  );
}
