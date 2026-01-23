/**
 * Environment variable checking for the doctor command.
 */

import type { EnvVarInfo } from '@/bin/doctor/types';

const ENV_VARS: Array<{
  name: string;
  description: string;
  defaultBehavior: string;
}> = [
  {
    name: 'SAFETY_NET_STRICT',
    description: 'Fail-closed on unparseable commands',
    defaultBehavior: 'permissive',
  },
  {
    name: 'SAFETY_NET_PARANOID',
    description: 'Enable all paranoid checks',
    defaultBehavior: 'off',
  },
  {
    name: 'SAFETY_NET_PARANOID_RM',
    description: 'Block rm -rf even within cwd',
    defaultBehavior: 'off',
  },
  {
    name: 'SAFETY_NET_PARANOID_INTERPRETERS',
    description: 'Block interpreter one-liners',
    defaultBehavior: 'off',
  },
];

export function getEnvironmentInfo(): EnvVarInfo[] {
  return ENV_VARS.map((v) => ({
    ...v,
    value: process.env[v.name],
    isSet: v.name in process.env,
  }));
}
