/**
 * Configuration display with source tracking and shadow detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { ConfigSourceInfo, EffectiveRule, ShadowedRule } from '@/bin/doctor/types';
import { getProjectConfigPath, getUserConfigPath, validateConfigFile } from '@/core/config';
import type { CustomRule } from '@/types';

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

function getConfigSourceInfo(path: string): ConfigSourceInfo {
  if (!existsSync(path)) {
    return { path, exists: false, valid: false, ruleCount: 0 };
  }

  const validation = validateConfigFile(path);

  if (validation.errors.length > 0) {
    return {
      path,
      exists: true,
      valid: false,
      ruleCount: 0,
      errors: validation.errors,
    };
  }

  return {
    path,
    exists: true,
    valid: true,
    ruleCount: validation.ruleNames.size,
  };
}

/**
 * Validate that a rule has the minimum required shape.
 * Returns true if the rule is valid enough to display.
 */
function isValidRule(rule: unknown): rule is CustomRule {
  if (typeof rule !== 'object' || rule === null) return false;
  const r = rule as Record<string, unknown>;
  return (
    typeof r.name === 'string' &&
    typeof r.command === 'string' &&
    Array.isArray(r.block_args) &&
    typeof r.reason === 'string'
  );
}

function loadSingleConfigRules(path: string): CustomRule[] {
  if (!existsSync(path)) return [];

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) return [];

    const parsed = JSON.parse(content) as { rules?: unknown };

    // Validate that rules is an array
    if (!Array.isArray(parsed.rules)) return [];

    // Filter to only valid rules
    return parsed.rules.filter(isValidRule);
  } catch {
    return [];
  }
}

/**
 * Merge user and project rules, tracking source and detecting shadows.
 * Project rules override (shadow) user rules with the same name.
 */
function mergeRulesWithTracking(
  userRules: CustomRule[],
  projectRules: CustomRule[],
): { effectiveRules: EffectiveRule[]; shadowedRules: ShadowedRule[] } {
  const projectRuleNames = new Set(projectRules.map((r) => r.name.toLowerCase()));
  const shadowedRules: ShadowedRule[] = [];
  const effectiveRules: EffectiveRule[] = [];

  // Add user rules that aren't shadowed
  for (const rule of userRules) {
    if (projectRuleNames.has(rule.name.toLowerCase())) {
      shadowedRules.push({ name: rule.name, shadowedBy: 'project' });
    } else {
      effectiveRules.push({
        source: 'user',
        name: rule.name,
        command: rule.command,
        subcommand: rule.subcommand,
        blockArgs: rule.block_args,
        reason: rule.reason,
      });
    }
  }

  // Add all project rules
  for (const rule of projectRules) {
    effectiveRules.push({
      source: 'project',
      name: rule.name,
      command: rule.command,
      subcommand: rule.subcommand,
      blockArgs: rule.block_args,
      reason: rule.reason,
    });
  }

  return { effectiveRules, shadowedRules };
}

export function getConfigInfo(cwd: string, options?: ConfigInfoOptions): ConfigInfo {
  const userPath = options?.userConfigPath ?? getUserConfigPath();
  const projectPath = options?.projectConfigPath ?? getProjectConfigPath(cwd);

  const userConfig = getConfigSourceInfo(userPath);
  const projectConfig = getConfigSourceInfo(projectPath);

  // Load individual configs for source tracking (only if valid)
  // Invalid configs are ignored by the core analyzer, so we must match that behavior
  const userRules = userConfig.valid ? loadSingleConfigRules(userPath) : [];
  const projectRules = projectConfig.valid ? loadSingleConfigRules(projectPath) : [];

  // Build effective rules with source tracking
  const { effectiveRules, shadowedRules } = mergeRulesWithTracking(userRules, projectRules);

  return {
    userConfig,
    projectConfig,
    effectiveRules,
    shadowedRules,
  };
}
