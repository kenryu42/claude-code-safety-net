import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  COMMAND_PATTERN,
  type Config,
  MAX_REASON_LENGTH,
  NAME_PATTERN,
  type ValidationResult,
} from '@/types';

const DEFAULT_CONFIG: Config = {
  version: 1,
  rules: [],
};

export interface LoadConfigOptions {
  /** Override user config directory (for testing) */
  userConfigDir?: string;
}

export function loadConfig(cwd?: string, options?: LoadConfigOptions): Config {
  const safeCwd = typeof cwd === 'string' ? cwd : process.cwd();
  const userConfigDir = options?.userConfigDir ?? join(homedir(), '.cc-safety-net');
  const userConfigPath = join(userConfigDir, 'config.json');
  const projectConfigPath = join(safeCwd, '.safety-net.json');

  const userConfig = loadSingleConfig(userConfigPath);
  const projectConfig = loadSingleConfig(projectConfigPath);

  return mergeConfigs(userConfig, projectConfig);
}

function loadSingleConfig(path: string): Config | null {
  if (!existsSync(path)) {
    return null;
  }

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      return null;
    }

    const parsed = JSON.parse(content) as unknown;
    const result = validateConfig(parsed);

    if (result.errors.length > 0) {
      return null;
    }

    // Ensure rules array exists (may be undefined if not in input)
    const cfg = parsed as Record<string, unknown>;
    return {
      version: cfg.version as number,
      rules: (cfg.rules as Config['rules']) ?? [],
    };
  } catch {
    return null;
  }
}

function mergeConfigs(userConfig: Config | null, projectConfig: Config | null): Config {
  if (!userConfig && !projectConfig) {
    return DEFAULT_CONFIG;
  }

  if (!userConfig) {
    return projectConfig ?? DEFAULT_CONFIG;
  }

  if (!projectConfig) {
    return userConfig;
  }

  const projectRuleNames = new Set(projectConfig.rules.map((r) => r.name.toLowerCase()));

  const mergedRules = [
    ...userConfig.rules.filter((r) => !projectRuleNames.has(r.name.toLowerCase())),
    ...projectConfig.rules,
  ];

  return {
    version: 1,
    rules: mergedRules,
  };
}

/** @internal Exported for testing */
export function validateConfig(config: unknown): ValidationResult {
  const errors: string[] = [];
  const ruleNames = new Set<string>();

  if (!config || typeof config !== 'object') {
    errors.push('Config must be an object');
    return { errors, ruleNames };
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.version !== 1) {
    errors.push('version must be 1');
  }

  if (cfg.rules !== undefined) {
    if (!Array.isArray(cfg.rules)) {
      errors.push('rules must be an array');
    } else {
      for (let i = 0; i < cfg.rules.length; i++) {
        const rule = cfg.rules[i] as unknown;
        const ruleErrors = validateRule(rule, i, ruleNames);
        errors.push(...ruleErrors);
      }
    }
  }

  return { errors, ruleNames };
}

function validateRule(rule: unknown, index: number, ruleNames: Set<string>): string[] {
  const errors: string[] = [];
  const prefix = `rules[${index}]`;

  if (!rule || typeof rule !== 'object') {
    errors.push(`${prefix}: must be an object`);
    return errors;
  }

  const r = rule as Record<string, unknown>;

  if (typeof r.name !== 'string') {
    errors.push(`${prefix}.name: required string`);
  } else {
    if (!NAME_PATTERN.test(r.name)) {
      errors.push(
        `${prefix}.name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)`,
      );
    }
    const lowerName = r.name.toLowerCase();
    if (ruleNames.has(lowerName)) {
      errors.push(`${prefix}.name: duplicate rule name "${r.name}"`);
    } else {
      ruleNames.add(lowerName);
    }
  }

  if (typeof r.command !== 'string') {
    errors.push(`${prefix}.command: required string`);
  } else if (!COMMAND_PATTERN.test(r.command)) {
    errors.push(`${prefix}.command: must match pattern (letters, numbers, hyphens, underscores)`);
  }

  if (r.subcommand !== undefined) {
    if (typeof r.subcommand !== 'string') {
      errors.push(`${prefix}.subcommand: must be a string if provided`);
    } else if (!COMMAND_PATTERN.test(r.subcommand)) {
      errors.push(
        `${prefix}.subcommand: must match pattern (letters, numbers, hyphens, underscores)`,
      );
    }
  }

  if (!Array.isArray(r.block_args)) {
    errors.push(`${prefix}.block_args: required array`);
  } else {
    if (r.block_args.length === 0) {
      errors.push(`${prefix}.block_args: must have at least one element`);
    }
    for (let i = 0; i < r.block_args.length; i++) {
      const arg = r.block_args[i];
      if (typeof arg !== 'string') {
        errors.push(`${prefix}.block_args[${i}]: must be a string`);
      } else if (arg === '') {
        errors.push(`${prefix}.block_args[${i}]: must not be empty`);
      }
    }
  }

  if (typeof r.reason !== 'string') {
    errors.push(`${prefix}.reason: required string`);
  } else if (r.reason === '') {
    errors.push(`${prefix}.reason: must not be empty`);
  } else if (r.reason.length > MAX_REASON_LENGTH) {
    errors.push(`${prefix}.reason: must be at most ${MAX_REASON_LENGTH} characters`);
  }

  return errors;
}

export function validateConfigFile(path: string): ValidationResult {
  const errors: string[] = [];
  const ruleNames = new Set<string>();

  if (!existsSync(path)) {
    errors.push(`File not found: ${path}`);
    return { errors, ruleNames };
  }

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      errors.push('Config file is empty');
      return { errors, ruleNames };
    }

    const parsed = JSON.parse(content) as unknown;
    return validateConfig(parsed);
  } catch (e) {
    errors.push(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return { errors, ruleNames };
  }
}

export function getUserConfigPath(): string {
  return join(homedir(), '.cc-safety-net', 'config.json');
}

export function getProjectConfigPath(cwd?: string): string {
  return resolve(cwd ?? process.cwd(), '.safety-net.json');
}

export type { ValidationResult };
