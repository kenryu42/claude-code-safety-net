import type { RulesPolicyOptions } from '@/core/policy/paths';
import type { ActiveRulebookSummary } from '@/core/policy/rules-config';

export interface SyncRulesConfigOptions extends Partial<RulesPolicyOptions> {
  global?: boolean;
  check?: boolean;
  only?: string;
  refresh?: boolean;
}

export interface AddRulebookSourceOptions extends SyncRulesConfigOptions {
  ref?: string;
  rulebooks?: readonly string[];
}

export interface SyncRulesConfigResult {
  ok: boolean;
  errors: string[];
  entries: ActiveRulebookSummary[];
  /** Preformatted lines describing what vendoring changed on disk, if anything. */
  changes?: string[];
}

export interface AddRulebookSourceResult extends SyncRulesConfigResult {
  add?: {
    source: string;
    ref: string;
    selected: string[];
    added: string[];
    alreadyConfigured: string[];
    commits: string[];
  };
}
