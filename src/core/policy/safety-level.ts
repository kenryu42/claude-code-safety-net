import type { PolicySafetyLevel } from './types';

export const SAFETY_OVERRIDE_KEYS = [
  'fail_closed',
  'paranoid_rm',
  'paranoid_interpreters',
] as const;

export type SafetyLevelCapability = (typeof SAFETY_OVERRIDE_KEYS)[number];

export const SAFETY_LEVEL_CAPABILITIES = {
  standard: { fail_closed: false, paranoid_rm: false, paranoid_interpreters: false },
  strict: { fail_closed: true, paranoid_rm: false, paranoid_interpreters: false },
  paranoid: { fail_closed: true, paranoid_rm: true, paranoid_interpreters: true },
} as const satisfies Record<PolicySafetyLevel, Record<SafetyLevelCapability, boolean>>;
