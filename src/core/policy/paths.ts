import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
} from '@/core/io/safe-read';
import { normalizeMsysDrivePath } from '@/core/paths/canonicalization';
import { RULEBOOK_FILE, RULES_DIR } from './source-syntax';

const RULES_CONFIG_FILE = 'rule.json';
/** Lives here rather than in the policy store so audit retention can resolve the
 *  policy path without importing the module that reads retention back. */
export const POLICY_FILE = 'policy.json';
const SAFETY_NET_DIR = '.cc-safety-net';
const RULES_SUBDIR = 'rules';
const CC_SAFETY_NET_HOME = 'CC_SAFETY_NET_HOME';
export const RULE_UPDATE_COMMAND = '`cc-safety-net rule update`';

/** Where the two scopes read their rule config from, and the capabilities that bound the reads. */
export interface PolicyPaths {
  userConfigPath: string;
  projectConfigPath: string;
  userScope: PolicyFilesystemScope;
  projectScope: PolicyFilesystemScope;
  userConfigTarget: PolicyFilesystemTarget;
  projectConfigTarget: PolicyFilesystemTarget;
}

/** The caller's scope selection: the project directory, and any overridden config locations. */
export type RulesPolicyOptions = {
  cwd: string;
  userConfigDir?: string;
  userConfigPath?: string;
  projectConfigPath?: string;
};

/** What the user scope alone needs, so retention can resolve it without a project directory. */
export type UserScopeOptions = Pick<RulesPolicyOptions, 'userConfigDir' | 'userConfigPath'>;

export function getProjectRulesDir(cwd: string): string {
  return resolve(cwd, RULES_DIR);
}

export function getProjectRulesConfigPath(cwd: string): string {
  return join(getProjectRulesDir(cwd), RULES_CONFIG_FILE);
}

/** Project twin of `getUserPolicyPath`, resolved from the same project directory
 *  the rules scope uses so the two scopes never disagree about the project. */
export function getProjectPolicyPath(cwd: string): string {
  return join(resolve(cwd), SAFETY_NET_DIR, POLICY_FILE);
}

export function getUserRulesDir(environment: Environment, options: UserScopeOptions = {}): string {
  return (
    options.userConfigDir ??
    (options.userConfigPath
      ? dirname(options.userConfigPath)
      : join(getUserSafetyNetHome(environment), RULES_SUBDIR))
  );
}

function getUserSafetyNetHome(environment: Environment): string {
  const home = environment.env.get(CC_SAFETY_NET_HOME);
  return home ? resolve(normalizeMsysDrivePath(home)) : join(environment.home, SAFETY_NET_DIR);
}

export function getUserRulesConfigPath(
  environment: Environment,
  options: UserScopeOptions = {},
): string {
  return join(getUserRulesDir(environment, options), RULES_CONFIG_FILE);
}

export function getUserPolicyPath(
  environment: Environment,
  options: UserScopeOptions = {},
): string {
  return join(dirname(getUserRulesDir(environment, options)), POLICY_FILE);
}

export function getPolicyPaths(environment: Environment, options: RulesPolicyOptions): PolicyPaths {
  const userConfigPath = options.userConfigPath ?? getUserRulesConfigPath(environment, options);
  const projectConfigPath = options.projectConfigPath ?? getProjectRulesConfigPath(options.cwd);
  const userScope = getUserPolicyFilesystemScope(environment, options);
  const projectScope = getProjectPolicyFilesystemScope(projectConfigPath, options.cwd);
  return {
    userConfigPath,
    projectConfigPath,
    userScope,
    projectScope,
    userConfigTarget: getPolicyFilesystemTargetForPath(userScope, userConfigPath),
    projectConfigTarget: getPolicyFilesystemTargetForPath(projectScope, projectConfigPath),
  };
}

export function getUserPolicyFilesystemScope(
  environment: Environment,
  options: UserScopeOptions,
): PolicyFilesystemScope {
  const root = options.userConfigPath
    ? dirname(dirname(resolve(options.userConfigPath)))
    : dirname(resolve(options.userConfigDir ?? getUserRulesDir(environment, options)));
  return bindPolicyFilesystemScope(root, 'user policy');
}

export function getProjectPolicyFilesystemScope(
  configPath: string,
  cwd: string,
): PolicyFilesystemScope {
  const projectRoot = resolve(cwd);
  const absoluteConfigPath = resolve(configPath);
  const fromCwd = relative(projectRoot, absoluteConfigPath);
  if (fromCwd !== '..' && !fromCwd.startsWith(`..${sep}`) && !isAbsolute(fromCwd)) {
    return bindPolicyFilesystemScope(projectRoot, 'project policy');
  }
  return bindPolicyFilesystemScope(dirname(dirname(absoluteConfigPath)), 'project policy');
}

/** Where a local source's live rulebook lives, relative to its scope config. */
export function getLocalRulebookPath(configDir: string, name: string): string {
  return join(configDir, name, RULEBOOK_FILE);
}
