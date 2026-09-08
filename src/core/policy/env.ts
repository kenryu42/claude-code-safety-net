import { SAFETY_LEVEL_CAPABILITIES } from './safety-level';
import type {
  EffectiveCapabilitySource,
  EffectiveSafetyLevel,
  PolicySafety,
  PolicySafetyLevel,
} from './types';

export interface EnvFlag {
  name: string;
  legacyName?: string;
}

export const ENV_FLAGS = {
  level: { name: 'CC_SAFETY_NET_LEVEL' },
  strict: { name: 'CC_SAFETY_NET_STRICT', legacyName: 'SAFETY_NET_STRICT' },
  paranoid: { name: 'CC_SAFETY_NET_PARANOID', legacyName: 'SAFETY_NET_PARANOID' },
  paranoidRm: { name: 'CC_SAFETY_NET_PARANOID_RM', legacyName: 'SAFETY_NET_PARANOID_RM' },
  paranoidInterpreters: {
    name: 'CC_SAFETY_NET_PARANOID_INTERPRETERS',
    legacyName: 'SAFETY_NET_PARANOID_INTERPRETERS',
  },
  worktree: { name: 'CC_SAFETY_NET_WORKTREE', legacyName: 'SAFETY_NET_WORKTREE' },
  debug: { name: 'CC_SAFETY_NET_DEBUG' },
  auditScope: { name: 'CC_SAFETY_NET_AUDIT_SCOPE' },
} as const satisfies Record<string, EnvFlag>;

const SAFETY_LEVELS: PolicySafetyLevel[] = ['standard', 'strict', 'paranoid'];

type Capability = 'failClosed' | 'paranoidRm' | 'paranoidInterpreters';

function maxSafetyLevel(policyLevel: PolicySafetyLevel, envLevel: PolicySafetyLevel | undefined) {
  if (!envLevel) return policyLevel;
  return SAFETY_LEVELS.indexOf(envLevel) > SAFETY_LEVELS.indexOf(policyLevel)
    ? envLevel
    : policyLevel;
}

function parseEnvLevel(env: ReadonlyMap<string, string>): PolicySafetyLevel | undefined {
  const value = getEnvFlagValue(ENV_FLAGS.level, env);
  if (value === undefined || value === '') return undefined;
  if (SAFETY_LEVELS.includes(value as PolicySafetyLevel)) return value as PolicySafetyLevel;
  console.error(
    `CC Safety Net: ignored invalid ${ENV_FLAGS.level.name}=${JSON.stringify(value.slice(0, 40))}. Use ${SAFETY_LEVELS.join(', ')}.`,
  );
  return undefined;
}

export function resolveAuditScope(value: string | undefined): 'all' | 'blocked' | 'invalid' {
  if (value === undefined || value === 'all') return 'all';
  if (value === 'blocked') return 'blocked';
  return 'invalid';
}

/** Denials are always recorded; an invalid scope falls back to blocked-only recording. */
export function shouldRecordAllowedCommands(env: ReadonlyMap<string, string>): boolean {
  return resolveAuditScope(getEnvFlagValue(ENV_FLAGS.auditScope, env)) === 'all';
}

export function deriveEffectiveSafetyLevel(
  values: Record<Capability, boolean>,
): EffectiveSafetyLevel {
  if (values.failClosed && values.paranoidRm && values.paranoidInterpreters) return 'paranoid';
  if (values.failClosed && !values.paranoidRm && !values.paranoidInterpreters) return 'strict';
  if (!values.failClosed && !values.paranoidRm && !values.paranoidInterpreters) return 'standard';
  return 'custom';
}

export function getCCSafetyNetEnvModes(
  policy: { safety?: PolicySafety; worktreeMode?: boolean } = {},
  env: ReadonlyMap<string, string>,
) {
  const policyLevel = policy.safety?.level ?? 'standard';
  const envLevel = parseEnvLevel(env);
  const baseLevel = maxSafetyLevel(policyLevel, envLevel);
  const presetCapabilities = SAFETY_LEVEL_CAPABILITIES[baseLevel];
  const values = {
    failClosed: presetCapabilities.fail_closed,
    paranoidRm: presetCapabilities.paranoid_rm,
    paranoidInterpreters: presetCapabilities.paranoid_interpreters,
  };
  const capabilitySources: Record<Capability, EffectiveCapabilitySource> = {
    failClosed: baseLevel === policyLevel ? 'preset' : 'environment',
    paranoidRm: baseLevel === policyLevel ? 'preset' : 'environment',
    paranoidInterpreters: baseLevel === policyLevel ? 'preset' : 'environment',
  };
  const sources: Record<Capability, string[]> = {
    failClosed: [`policy safety.level=${policyLevel}`],
    paranoidRm: [`policy safety.level=${policyLevel}`],
    paranoidInterpreters: [`policy safety.level=${policyLevel}`],
  };

  if (baseLevel !== policyLevel) {
    sources.failClosed.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
    sources.paranoidRm.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.level.name}=${envLevel}`);
  }

  if (policy.safety?.overrides?.failClosed !== undefined) {
    values.failClosed = policy.safety.overrides.failClosed;
    capabilitySources.failClosed = 'capability_override';
    sources.failClosed.push('policy safety.overrides.fail_closed');
  }
  if (policy.safety?.overrides?.paranoidRm !== undefined) {
    values.paranoidRm = policy.safety.overrides.paranoidRm;
    capabilitySources.paranoidRm = 'capability_override';
    sources.paranoidRm.push('policy safety.overrides.paranoid_rm');
  }
  if (policy.safety?.overrides?.paranoidInterpreters !== undefined) {
    values.paranoidInterpreters = policy.safety.overrides.paranoidInterpreters;
    capabilitySources.paranoidInterpreters = 'capability_override';
    sources.paranoidInterpreters.push('policy safety.overrides.paranoid_interpreters');
  }

  if (envTruthy(ENV_FLAGS.strict, env)) {
    values.failClosed = true;
    capabilitySources.failClosed = 'environment';
    sources.failClosed.push(`env ${ENV_FLAGS.strict.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoid, env)) {
    values.paranoidRm = true;
    values.paranoidInterpreters = true;
    capabilitySources.paranoidRm = 'environment';
    capabilitySources.paranoidInterpreters = 'environment';
    sources.paranoidRm.push(`env ${ENV_FLAGS.paranoid.name}`);
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoid.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoidRm, env)) {
    values.paranoidRm = true;
    capabilitySources.paranoidRm = 'environment';
    sources.paranoidRm.push(`env ${ENV_FLAGS.paranoidRm.name}`);
  }
  if (envTruthy(ENV_FLAGS.paranoidInterpreters, env)) {
    values.paranoidInterpreters = true;
    capabilitySources.paranoidInterpreters = 'environment';
    sources.paranoidInterpreters.push(`env ${ENV_FLAGS.paranoidInterpreters.name}`);
  }

  const worktreeMode = !!policy.worktreeMode || envTruthy(ENV_FLAGS.worktree, env);

  return {
    strict: values.failClosed,
    paranoidRm: values.paranoidRm,
    paranoidInterpreters: values.paranoidInterpreters,
    worktreeMode,
    effectiveLevel: deriveEffectiveSafetyLevel(values),
    capabilities: {
      fail_closed: {
        enabled: values.failClosed,
        source: capabilitySources.failClosed,
        sources: sources.failClosed,
      },
      paranoid_rm: {
        enabled: values.paranoidRm,
        source: capabilitySources.paranoidRm,
        sources: sources.paranoidRm,
      },
      paranoid_interpreters: {
        enabled: values.paranoidInterpreters,
        source: capabilitySources.paranoidInterpreters,
        sources: sources.paranoidInterpreters,
      },
    },
  };
}

export function envTruthy(flag: string | EnvFlag, env: ReadonlyMap<string, string>): boolean {
  const value = typeof flag === 'string' ? getOwnEnvValue(flag, env) : getEnvFlagValue(flag, env);
  return value === '1' || value?.toLowerCase() === 'true';
}

/** @internal */
export function getOwnEnvValue(name: string, env: ReadonlyMap<string, string>): string | undefined {
  return env.get(name);
}

export function getEnvFlagValue(
  flag: EnvFlag,
  env: ReadonlyMap<string, string>,
): string | undefined {
  const value = getOwnEnvValue(flag.name, env);
  if (value !== undefined) return value;
  if (flag.legacyName) {
    return getOwnEnvValue(flag.legacyName, env);
  }
  return undefined;
}

export function envFlagIsSet(flag: EnvFlag, env: ReadonlyMap<string, string>): boolean {
  return (
    getOwnEnvValue(flag.name, env) !== undefined ||
    (!!flag.legacyName && getOwnEnvValue(flag.legacyName, env) !== undefined)
  );
}
