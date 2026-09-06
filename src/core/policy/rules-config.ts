import type { BlockIntent } from '@/core/decision';
import {
  bindDelegatedPolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyFile,
} from '@/core/io/safe-read';
import type { CustomRule } from './types';
import { getRulesConfigValidation } from './validate';

/** Disable a rule, or replace its block reason and intent. */
export type RuleOverride = 'off' | { reason: string; intent?: BlockIntent };

/** The validated shape of one scope's `rule.json`. */
export type RulesConfig = {
  version: 1;
  rules: string[];
  overrides: Record<string, RuleOverride>;
  transparent_wrappers: string[];
};

export const DEFAULT_CONFIG: RulesConfig = {
  version: 1,
  rules: [],
  overrides: {},
  transparent_wrappers: [],
};

/** What a rulebook contributes once it is loaded, for reports and command output. */
export interface ActiveRulebookSummary {
  spec: string;
  name: string;
  version: string;
  ruleCount: number;
}

export interface LoadedRulebookInfo {
  source: 'user' | 'project';
  spec: string;
  name: string;
  version: string;
  rules: string[];
}

export interface LoadedRulesPolicy {
  rules: CustomRule[];
  transparent_wrappers: string[];
  rulebooks: LoadedRulebookInfo[];
  /** Diagnostics whose failing source is dropped, so its rules are not enforced. */
  errors: string[];
  /** Diagnostics that leave the source active, with only the rejected part ignored. */
  warnings: string[];
  userConfig?: RulesConfig;
  projectConfig?: RulesConfig;
  userConfigPath: string;
  projectConfigPath: string;
}

export function readRulesConfig(path: string | PolicyFilesystemTarget): {
  config: RulesConfig | null;
  errors: string[];
} {
  try {
    const content = readPolicyFile(toTarget(path));
    if (content === null) return { config: null, errors: [] };
    if (!content.trim()) {
      return { config: null, errors: ['Config file is empty'] };
    }

    const parsed = JSON.parse(content) as Partial<RulesConfig>;
    const validation = getRulesConfigValidation(parsed);
    if (validation.errors.length > 0) {
      return { config: null, errors: validation.errors };
    }
    // Validation already accepted every recognized field, so the canonical config is
    // that pick with the loader's defaults for the fields the file left out.
    return {
      config: {
        version: 1,
        rules: parsed.rules ?? [],
        overrides: parsed.overrides ?? {},
        transparent_wrappers: parsed.transparent_wrappers ?? [],
      },
      errors: [],
    };
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { config: null, errors: [error.message] };
    }
    // Only a parse failure means the file is malformed; anything else — a schema
    // dependency that will not load, say — has to name itself instead of blaming
    // valid JSON.
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: null,
      errors: [error instanceof SyntaxError ? 'Invalid JSON' : message],
    };
  }
}

function toTarget(path: string | PolicyFilesystemTarget): PolicyFilesystemTarget {
  return typeof path === 'string' ? bindDelegatedPolicyFilesystemTarget(path) : path;
}
