import { isGitConfigEnvName } from '@/core/git/worktree';

export const GIT_CONTEXT_ENV_OVERRIDES = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_COMMON_DIR',
  'GIT_INDEX_FILE',
] as const;

const GIT_CONTEXT_ENV_OVERRIDE_NAMES: ReadonlySet<string> = new Set(GIT_CONTEXT_ENV_OVERRIDES);

const MAX_GIT_CONFIG_COUNT = 1024;

export type GitConfigCountResolution =
  | { state: 'absent' }
  | { state: 'invalid' }
  | { state: 'valid'; count: number };

/** @internal - exported for test coverage */
export const GIT_CONFIG_AFFECTING_ENV_NAMES: ReadonlySet<string> = new Set([
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_NOSYSTEM',
  'GIT_CONFIG_SYSTEM',
  'HOME',
  'XDG_CONFIG_HOME',
]);

export const GIT_SSH_ENV_NAMES: ReadonlySet<string> = new Set([
  'GIT_SSH_COMMAND',
  'GIT_SSH',
  'GIT_SSH_VARIANT',
]);

const GIT_CONTEXT_APPEND_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\+=/;

export function isGitContextEnvOverrideName(name: string): boolean {
  return GIT_CONTEXT_ENV_OVERRIDE_NAMES.has(name);
}

export function isTrackedGitEnvName(name: string): boolean {
  return (
    isGitContextEnvOverrideName(name) ||
    GIT_CONFIG_AFFECTING_ENV_NAMES.has(name) ||
    GIT_SSH_ENV_NAMES.has(name) ||
    isGitConfigEnvName(name)
  );
}

export function getGitEnvValue(
  name: string,
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): string | undefined {
  return envAssignments?.has(name) ? envAssignments.get(name) : env.get(name);
}

export function resolveGitConfigCount(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigCountResolution {
  const value = getGitEnvValue('GIT_CONFIG_COUNT', env, envAssignments);
  if (value === undefined) {
    return { state: 'absent' };
  }
  if (value === '') {
    return { state: 'valid', count: 0 };
  }
  if (!/^\d+$/.test(value)) {
    return { state: 'invalid' };
  }
  const count = Number(value);
  return Number.isSafeInteger(count) && count <= MAX_GIT_CONFIG_COUNT
    ? { state: 'valid', count }
    : { state: 'invalid' };
}

export function parseGitContextAppendEnvAssignment(
  token: string,
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): { name: string; value: string } | null {
  const match = token.match(GIT_CONTEXT_APPEND_ASSIGNMENT_RE);
  const name = match?.[1];
  if (!name || !isTrackedGitEnvName(name)) {
    return null;
  }
  const eqIdx = token.indexOf('=');
  return {
    name,
    value: `${getGitEnvValue(name, env, envAssignments) ?? ''}${token.slice(eqIdx + 1)}`,
  };
}

export function hasGitSshEnvAssignment(envAssignments?: ReadonlyMap<string, string>): boolean {
  return hasAnyEnvAssignment(envAssignments, GIT_SSH_ENV_NAMES);
}

export function hasConfigAffectingEnvAssignment(
  envAssignments?: ReadonlyMap<string, string>,
): boolean {
  return hasAnyEnvAssignment(envAssignments, GIT_CONFIG_AFFECTING_ENV_NAMES);
}

function hasAnyEnvAssignment(
  envAssignments: ReadonlyMap<string, string> | undefined,
  names: ReadonlySet<string>,
): boolean {
  if (!envAssignments) {
    return false;
  }
  for (const key of envAssignments.keys()) {
    if (names.has(key)) {
      return true;
    }
  }
  return false;
}
