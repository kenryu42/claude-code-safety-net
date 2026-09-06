/**
 * Environment variable checking for the doctor command.
 */

import type { Environment } from '@/core/environment';
import { ENV_FLAGS, type EnvFlag, envFlagIsSet, getEnvFlagValue } from '@/core/policy/env';
import type { EnvVarInfo } from '@/hosts/doctor-types';

const ENV_VARS: Array<{
  flag: EnvFlag;
  description: string;
  defaultBehavior: string;
}> = [
  {
    flag: ENV_FLAGS.level,
    description: 'Safety level preset: standard, strict, or paranoid',
    defaultBehavior: 'standard',
  },
  {
    flag: ENV_FLAGS.strict,
    description: 'Legacy; equivalent to safety.overrides.fail_closed',
    defaultBehavior: 'permissive',
  },
  {
    flag: ENV_FLAGS.paranoid,
    description: 'Legacy; equivalent to safety.overrides.paranoid_rm and paranoid_interpreters',
    defaultBehavior: 'off',
  },
  {
    flag: ENV_FLAGS.paranoidRm,
    description: 'Legacy; equivalent to safety.overrides.paranoid_rm',
    defaultBehavior: 'off',
  },
  {
    flag: ENV_FLAGS.paranoidInterpreters,
    description: 'Legacy; equivalent to safety.overrides.paranoid_interpreters',
    defaultBehavior: 'off',
  },
  {
    flag: ENV_FLAGS.worktree,
    description: 'Allow local git discards in linked worktrees',
    defaultBehavior: 'off',
  },
  {
    flag: ENV_FLAGS.debug,
    description: 'Print diagnostic messages to stderr',
    defaultBehavior: 'off',
  },
  {
    flag: ENV_FLAGS.auditScope,
    description: 'Command decisions recorded: all, or blocked (privacy-minimizing, denials only)',
    defaultBehavior: 'all',
  },
];

export function getEnvironmentInfo(environment: Environment): EnvVarInfo[] {
  return [
    ...ENV_VARS.map((v) => ({
      name: v.flag.name,
      value: getEnvFlagValue(v.flag, environment.env),
      isSet: envFlagIsSet(v.flag, environment.env),
      legacyName: v.flag.legacyName,
      legacyValue: v.flag.legacyName ? environment.env.get(v.flag.legacyName) : undefined,
      legacyIsSet: v.flag.legacyName
        ? environment.env.get(v.flag.legacyName) !== undefined
        : undefined,
      description: v.description,
      defaultBehavior: v.defaultBehavior,
    })),
    {
      name: 'CC_SAFETY_NET_HOME',
      value: environment.env.get('CC_SAFETY_NET_HOME'),
      isSet: environment.env.get('CC_SAFETY_NET_HOME') !== undefined,
      description: 'Override user-scope config/cache directory',
      defaultBehavior: '~/.cc-safety-net',
    },
  ];
}
