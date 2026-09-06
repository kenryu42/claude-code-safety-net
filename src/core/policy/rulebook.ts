import type { BlockIntent } from '@/core/decision';
import type { CustomRuleMatch } from '@/core/rules/types';
import type { CustomRule } from './types';
import { validateRulebook } from './validate';

interface RulebookFixture {
  command: string;
  expect: 'blocked' | 'allowed';
  rule?: string;
}

interface CustomRuleV2 {
  name: string;
  command: string;
  match: CustomRuleMatch;
  reason: string;
  intent?: BlockIntent;
}

interface RulebookBase {
  name: string;
  version: string;
  description?: string;
  author?: string;
  allowed_commands: string[];
  tests?: RulebookFixture[];
}

export type Rulebook =
  | (RulebookBase & { rulebook_version: 1; rules: CustomRule[] })
  | (RulebookBase & { rulebook_version: 2; rules: CustomRuleV2[] });

export function assertValidRulebook(rulebook: unknown): Rulebook {
  const result = validateRulebook(rulebook);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join('; '));
  }
  return rulebook as Rulebook;
}
