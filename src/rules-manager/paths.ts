import { dirname, join, resolve } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
} from '@/core/io/safe-read';
import {
  getProjectPolicyFilesystemScope,
  getProjectRulesConfigPath,
  getProjectRulesDir,
  getUserPolicyFilesystemScope,
  getUserRulesConfigPath,
  getUserRulesDir,
  type RulesPolicyOptions,
  type UserScopeOptions,
} from '@/core/policy/paths';
import type { SyncRulesConfigOptions } from './types';

/** Retired in version 3: kept only so the migration command can find and prune it. */
const RULES_LOCK_FILE = 'rule.lock';

export interface ScopePaths {
  configDir: string;
  configPath: string;
  /** The retired v2 lockfile, carried only so the migration command can prune it. */
  lockPath: string;
  filesystemScope: PolicyFilesystemScope;
  configTarget: PolicyFilesystemTarget;
  lockTarget: PolicyFilesystemTarget;
}

/** @internal - exported for test coverage */
export function getProjectRulesLockPath(cwd: string): string {
  return join(getProjectRulesDir(cwd), RULES_LOCK_FILE);
}

/** @internal Where a v2 install published its lockfile; kept for reading those leftovers. */
export function getUserRulesLockPath(
  environment: Environment,
  options: UserScopeOptions = {},
): string {
  return join(getUserRulesDir(environment, options), RULES_LOCK_FILE);
}

/** @internal Where a v2 install published its lockfile; kept for reading those leftovers. */
export function getRulesLockPathForConfigPath(configPath: string): string {
  return join(dirname(configPath), RULES_LOCK_FILE);
}

export function getLegacyProjectRulesConfigPath(options: Partial<RulesPolicyOptions> = {}): string {
  return resolve(options.cwd ?? process.cwd(), '.safety-net.json');
}

export function getScopePaths(
  environment: Environment,
  options: SyncRulesConfigOptions,
): ScopePaths {
  const configPath = options.global
    ? (options.userConfigPath ?? getUserRulesConfigPath(environment, options))
    : (options.projectConfigPath ?? getProjectRulesConfigPath(options.cwd ?? process.cwd()));
  const filesystemScope = options.global
    ? getUserPolicyFilesystemScope(environment, options)
    : getProjectPolicyFilesystemScope(configPath, options.cwd ?? process.cwd());
  const lockPath = getRulesLockPathForConfigPath(configPath);
  return {
    configDir: dirname(configPath),
    configPath,
    lockPath,
    filesystemScope,
    configTarget: getPolicyFilesystemTargetForPath(filesystemScope, configPath),
    lockTarget: getPolicyFilesystemTargetForPath(filesystemScope, lockPath),
  };
}
