/**
 * The legacy config validator and the atomic JSON writer the diagnostic surfaces need:
 * `doctor` reports on both rule configs and on a `.safety-net.json` left over from version 0,
 * `rule verify` and `policy apply` write through the same atomic path. It is the one module
 * outside `schema.ts` that loads the schema library, so nothing the hook path imports may
 * import it.
 */

import { dirname, join, resolve } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  bindDelegatedPolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyFile,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import { getUserRulesDir, type UserScopeOptions } from './paths';
import { formatSchemaIssues, getLegacyConfigSchema } from './schema';
import { collectCustomRuleNames, getRulesConfigValidation } from './validate';

const LEGACY_RULES_CONFIG_FILE = 'config.json';

export function writeJsonAtomic(
  path: string | PolicyFilesystemTarget,
  value: unknown,
  mode?: number,
  afterRename?: (path: string) => void,
): void {
  writePolicyFileAtomic(toTarget(path), `${JSON.stringify(value, null, 2)}\n`, mode, afterRename);
}

function toTarget(path: string | PolicyFilesystemTarget): PolicyFilesystemTarget {
  return typeof path === 'string' ? bindDelegatedPolicyFilesystemTarget(path) : path;
}

/** Result of config validation */
export interface ValidationResult {
  /** List of validation error messages */
  errors: string[];
  /** Set of rule names found (for duplicate detection) */
  ruleNames: Set<string>;
}

export function validateConfig(config: unknown): ValidationResult {
  const parsed = getLegacyConfigSchema().safeParse(config);
  return {
    errors: parsed.success ? [] : formatSchemaIssues(parsed.error.issues),
    ruleNames: new Set(collectCustomRuleNames(config).map((name) => name.toLowerCase())),
  };
}

export function validateConfigFile(path: string | PolicyFilesystemTarget): ValidationResult {
  const loaded = readConfigFileInput(path);
  if (!loaded.ok) return loaded.result;
  return validateConfig(loaded.parsed);
}

type ConfigFileInput = { ok: true; parsed: unknown } | { ok: false; result: ValidationResult };

function readConfigFileInput(path: string | PolicyFilesystemTarget): ConfigFileInput {
  const errors: string[] = [];
  const ruleNames = new Set<string>();

  try {
    const target = typeof path === 'string' ? bindDelegatedPolicyFilesystemTarget(path) : path;
    const content = readPolicyFile(target);
    if (content === null) {
      errors.push(`File not found: ${target.path}`);
      return { ok: false, result: { errors, ruleNames } };
    }
    if (!content.trim()) {
      errors.push('Config file is empty');
      return { ok: false, result: { errors, ruleNames } };
    }

    return { ok: true, parsed: JSON.parse(content) as unknown };
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      errors.push(error.message);
      return { ok: false, result: { errors, ruleNames } };
    }
    // Only a parse failure means malformed JSON; every other failure names itself.
    const message = error instanceof Error ? error.message : String(error);
    errors.push(error instanceof SyntaxError ? 'Invalid JSON' : message);
    return { ok: false, result: { errors, ruleNames } };
  }
}

export function getLegacyProjectConfigPath(cwd: string): string {
  return resolve(cwd, '.safety-net.json');
}

export function validateRulesConfigFile(path: string | PolicyFilesystemTarget): ValidationResult {
  const loaded = readConfigFileInput(path);
  if (!loaded.ok) return loaded.result;
  const result = getRulesConfigValidation(loaded.parsed);
  return { errors: result.errors, ruleNames: result.sources };
}

export function getLegacyUserRulesConfigPath(
  environment: Environment,
  options: UserScopeOptions = {},
): string {
  return join(dirname(getUserRulesDir(environment, options)), LEGACY_RULES_CONFIG_FILE);
}
