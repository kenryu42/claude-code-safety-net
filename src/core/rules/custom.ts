import { getMatchGlobalOptionsWithValues } from '@/core/rules/custom-match-options';
import { getCustomRuleOptionsWithValues } from '@/core/rules/custom-subcommand';
import type { CustomRuleMatch, DestructiveCommandRuleMatch, PolicyRule } from '@/core/rules/types';
import { extractShortOpts, normalizeCommandToken } from '@/core/shell/tokens';

export function checkPolicyRuleMatch(
  tokens: readonly string[],
  rules: readonly PolicyRule[],
): DestructiveCommandRuleMatch | null {
  if (tokens.length === 0 || rules.length === 0) {
    return null;
  }

  const command = normalizeCommandToken(tokens[0] ?? '');
  const shortOpts = extractShortOpts(tokens);

  for (const rule of rules) {
    if (!matchesCommand(command, rule.command)) {
      continue;
    }

    if (rule.match) {
      if (matchesCustomRuleMatch(command, tokens, rule.match)) {
        return toRuleMatch(rule);
      }
      continue;
    }

    if (!matchesCustomRuleSubcommand(command, tokens, rule.subcommand)) {
      continue;
    }

    if (matchesCustomRuleBlockArgs(tokens, new Set(rule.block_args), shortOpts)) {
      return toRuleMatch(rule);
    }
  }

  return null;
}

function toRuleMatch(rule: PolicyRule): DestructiveCommandRuleMatch {
  return {
    id: `custom.${rule.name}`,
    reason: `[${rule.name}] ${rule.reason}`,
    intent: rule.intent ?? 'manual_only',
  };
}

/**
 * Rulebook v2 matching: exact tokens only, with no short-option expansion and no
 * backtracking over an unrecognized option's possible value.
 */
function matchesCustomRuleMatch(
  command: string,
  tokens: readonly string[],
  match: CustomRuleMatch,
): boolean {
  const args = tokens.slice(1);
  if (match.exclude_args?.some((arg) => args.includes(arg))) {
    return false;
  }
  if (match.any_args && !match.any_args.some((arg) => args.includes(arg))) {
    return false;
  }
  return matchesCommandPath(args, match.command_path, getMatchGlobalOptionsWithValues(command));
}

function matchesCommandPath(
  args: readonly string[],
  commandPath: readonly string[],
  optionsWithValues: ReadonlySet<string>,
): boolean {
  let pathIndex = 0;
  let skipNext = false;
  for (const token of args) {
    if (pathIndex >= commandPath.length) {
      return true;
    }
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (token.startsWith('-')) {
      // An unrecognized option never consumes a value, and an `=`-joined value is part
      // of its own token; an unlisted value-taking option therefore misses, failing open.
      skipNext = !token.includes('=') && optionsWithValues.has(token);
      continue;
    }
    if (token !== commandPath[pathIndex]) {
      return false;
    }
    pathIndex++;
  }
  return pathIndex >= commandPath.length;
}

function matchesCommand(command: string, ruleCommand: string): boolean {
  return command === normalizeCommandToken(ruleCommand);
}

function matchesCustomRuleSubcommand(
  command: string,
  tokens: readonly string[],
  ruleSubcommand: string | undefined,
): boolean {
  if (!ruleSubcommand) {
    return true;
  }

  return matchesSubcommandFrom(tokens, 1, ruleSubcommand, getCustomRuleOptionsWithValues(command));
}

function matchesSubcommandFrom(
  tokens: readonly string[],
  startIndex: number,
  expectedSubcommand: string,
  optionsWithValues: ReadonlySet<string>,
): boolean {
  let skipNext = false;
  for (let i = startIndex; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (token === '--') {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return nextToken === expectedSubcommand;
      }
      return false;
    }

    if (optionsWithValues.has(token)) {
      skipNext = true;
      continue;
    }

    if (token.startsWith('-')) {
      if (
        !token.includes('=') &&
        shouldSkipPossibleOptionValue(tokens, i, expectedSubcommand, optionsWithValues)
      ) {
        return true;
      }
      continue;
    }

    return token === expectedSubcommand;
  }

  return false;
}

function shouldSkipPossibleOptionValue(
  tokens: readonly string[],
  optionIndex: number,
  expectedSubcommand: string,
  optionsWithValues: ReadonlySet<string>,
): boolean {
  const value = tokens[optionIndex + 1];
  if (!value || value.startsWith('-')) {
    return false;
  }

  return matchesSubcommandFrom(tokens, optionIndex + 2, expectedSubcommand, optionsWithValues);
}

function matchesCustomRuleBlockArgs(
  tokens: readonly string[],
  blockArgs: ReadonlySet<string>,
  shortOpts: ReadonlySet<string>,
): boolean {
  return (
    tokens.some((token) => blockArgs.has(token)) || [...shortOpts].some((opt) => blockArgs.has(opt))
  );
}
