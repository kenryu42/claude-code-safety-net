/**
 * Configuration utilities for the explain command.
 * Handles config source detection and analysis options building.
 */

import { existsSync } from 'node:fs';
import {
  getProjectConfigPath,
  getUserConfigPath,
  loadConfig,
  validateConfigFile,
} from '@/core/config';
import { envTruthy } from '@/core/env';
import type { AnalyzeOptions, ExplainOptions } from '@/types';

export interface GetConfigSourceOptions {
  cwd?: string;
  /** Override user config path for testing */
  userConfigPath?: string;
}

/**
 * Get the config source path and validity status.
 * Checks project config first, falls back to user config.
 */
export function getConfigSource(options?: GetConfigSourceOptions): {
  configSource: string | null;
  configValid: boolean;
} {
  const projectPath = getProjectConfigPath(options?.cwd);
  let invalidProjectPath: string | null = null;

  if (existsSync(projectPath)) {
    const validation = validateConfigFile(projectPath);
    if (validation.errors.length === 0) {
      return { configSource: projectPath, configValid: true };
    }
    invalidProjectPath = projectPath;
  }

  const userPath = options?.userConfigPath ?? getUserConfigPath();
  if (existsSync(userPath)) {
    const validation = validateConfigFile(userPath);
    return { configSource: userPath, configValid: validation.errors.length === 0 };
  }

  if (invalidProjectPath) {
    return { configSource: invalidProjectPath, configValid: false };
  }

  return { configSource: null, configValid: true };
}

/**
 * Build AnalyzeOptions from ExplainOptions.
 * Merges user options with environment variable defaults.
 */
export function buildAnalyzeOptions(explainOptions?: ExplainOptions): AnalyzeOptions {
  const cwd = explainOptions?.cwd ?? process.cwd();
  const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
  return {
    cwd,
    effectiveCwd: cwd,
    config: explainOptions?.config ?? loadConfig(cwd),
    strict: explainOptions?.strict ?? envTruthy('SAFETY_NET_STRICT'),
    paranoidRm: paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM'),
    paranoidInterpreters: paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS'),
  };
}
