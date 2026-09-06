/**
 * Rulebook-backed configuration display with source tracking.
 */

import { dirname } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from '@/core/io/safe-read';
import { type ValidationResult, validateRulesConfigFile } from '@/core/policy/config-file';
import {
  getPolicyPaths,
  getProjectRulesConfigPath,
  getUserRulesConfigPath,
} from '@/core/policy/paths';
import { getRulesConfigRuntimeErrorsForConfig, loadRulesPolicy } from '@/core/policy/scope-policy';
import type { CustomRule } from '@/core/policy/types';
import type { ConfigSourceInfo, EffectiveRule, ShadowedRule } from '@/hosts/doctor-types';

export interface ConfigInfo {
  userConfig: ConfigSourceInfo;
  projectConfig: ConfigSourceInfo;
  effectiveRules: EffectiveRule[];
  shadowedRules: ShadowedRule[];
}

export interface ConfigInfoOptions {
  userConfigPath?: string;
  projectConfigPath?: string;
}

function getConfigSourceInfo(
  path: string,
  target: PolicyFilesystemTarget,
  filesystemScope: PolicyFilesystemScope,
): ConfigSourceInfo {
  let validation: ValidationResult;
  try {
    if (readPolicyFile(target) === null) {
      return { path, exists: false, valid: false, ruleCount: 0 };
    }
    validation = validateRulesConfigFile(target);
    validation.errors.push(...getRulesConfigRuntimeErrorsForConfig(path, filesystemScope));
  } catch (error) {
    if (!(error instanceof PolicyFilesystemError)) throw error;
    validation = { errors: [error.message], ruleNames: new Set<string>() };
  }

  return {
    path,
    exists: true,
    valid: validation.errors.length === 0,
    ruleCount: validation.ruleNames.size,
    ...(validation.errors.length > 0 ? { errors: validation.errors } : {}),
  };
}

function toEffectiveRule(rule: CustomRule, source: 'user' | 'project'): EffectiveRule {
  return {
    source,
    name: rule.name,
    command: rule.command,
    subcommand: rule.subcommand,
    blockArgs: [...rule.block_args],
    reason: rule.reason,
  };
}

export function getConfigInfo(
  environment: Environment,
  cwd: string,
  options?: ConfigInfoOptions,
): ConfigInfo {
  const userPath = options?.userConfigPath ?? getUserRulesConfigPath(environment);
  const projectPath = options?.projectConfigPath ?? getProjectRulesConfigPath(cwd);
  const userConfigDir = dirname(userPath);
  const policy = loadRulesPolicy(environment, {
    cwd,
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    userConfigDir,
  });
  const paths = getPolicyPaths(environment, {
    cwd,
    userConfigPath: userPath,
    projectConfigPath: projectPath,
    userConfigDir,
  });
  const rulebookSources = new Map(
    policy.rulebooks.flatMap((rulebook) =>
      rulebook.rules.map((rule) => [rule, rulebook.source] as const),
    ),
  );

  return {
    userConfig: getConfigSourceInfo(userPath, paths.userConfigTarget, paths.userScope),
    projectConfig: getConfigSourceInfo(projectPath, paths.projectConfigTarget, paths.projectScope),
    effectiveRules: policy.rules.map((rule) =>
      toEffectiveRule(rule, rulebookSources.get(rule.name) ?? 'project'),
    ),
    shadowedRules: [],
  };
}
