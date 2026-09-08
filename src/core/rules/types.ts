import type { BlockIntent } from '@/core/decision';

/** Exact-token matching contract for rulebook_version 2 rules. */
export interface CustomRuleMatch {
  /** Command words that must follow the command, after global options are skipped */
  readonly command_path: readonly string[];
  /** At least one of these exact argument tokens must be present */
  readonly any_args?: readonly string[];
  /** Any of these exact argument tokens prevents the match */
  readonly exclude_args?: readonly string[];
}

export type RuleActivationCapability = 'fail_closed' | 'paranoid_rm' | 'paranoid_interpreters';

export type PolicyRule = {
  readonly name: string;
  readonly command: string;
  readonly subcommand?: string;
  readonly block_args: readonly string[];
  readonly match?: CustomRuleMatch;
  readonly reason: string;
  readonly intent?: BlockIntent;
};

export interface DestructiveCommandRuleMatch {
  id: string;
  reason: string;
  intent: BlockIntent;
}
