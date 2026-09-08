import { filterDestructiveCommandMatch } from '@/core/policy/effective-rules';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import type { CommandWord } from '@/core/shell/model';
import { analysisWordText } from '../command-words';
import { hasGitSshEnvAssignment } from './env';
import {
  extractGitSubcommandAndRest,
  hasGitCommandLineSshCommandConfig,
  resolveGitCommandLineAliases,
  splitAtDoubleDash,
} from './parse';
import { analyzeGitRule, matchesGitLongOption } from './rules';
import {
  type GitAnalyzeOptions,
  type GitWorktreeRelaxation,
  getGitWorktreeRelaxationForMatch,
} from './worktree-relaxation';

const REASON_GIT_SSH_ENV =
  'Git SSH environment overrides can execute arbitrary commands during network operations. Run git without GIT_SSH/GIT_SSH_COMMAND overrides, or ask the user to run it manually.';
const GIT_NETWORK_SUBCOMMANDS = new Set([
  'clone',
  'fetch',
  'pull',
  'push',
  'ls-remote',
  'submodule',
]);

export function analyzeGitMatch(
  words: readonly CommandWord[],
  options: GitAnalyzeOptions,
): DestructiveCommandRuleMatch | null {
  return evaluateGit(words.map(analysisWordText), options);
}

function evaluateGit(
  tokens: readonly string[],
  options: GitAnalyzeOptions,
  onRelaxation?: (relaxation: GitWorktreeRelaxation) => void,
): DestructiveCommandRuleMatch | null {
  const aliasResolution = resolveGitCommandLineAliases(
    tokens,
    options.environment.env,
    options.envAssignments,
  );
  const aliasConfigMatch = aliasResolution.blockedReason
    ? filterDestructiveCommandMatch(
        destructiveCommandMatch('git.alias-config', aliasResolution.blockedReason),
        options.policy,
      )
    : null;
  if (aliasConfigMatch) return aliasConfigMatch;

  const resolvedTokens = aliasResolution.tokens;
  if (
    (hasGitSshEnvAssignment(options.envAssignments) ||
      hasGitCommandLineSshCommandConfig(tokens, options.environment.env, options.envAssignments)) &&
    isGitNetworkOperation(resolvedTokens)
  ) {
    return destructiveCommandMatch('git.ssh-env', REASON_GIT_SSH_ENV);
  }

  const match = analyzeGitRule(resolvedTokens);

  if (!match) {
    return null;
  }

  if (aliasResolution.expanded || aliasResolution.blockedReason) {
    return match;
  }

  const relaxation = getGitWorktreeRelaxationForMatch(tokens, match, options);
  if (!relaxation) return match;
  onRelaxation?.(relaxation);
  return null;
}

/** One-pass Git decision detail used by intrinsic command traces. */
export function analyzeGitDetailed(
  words: readonly CommandWord[],
  options: GitAnalyzeOptions,
): Readonly<{
  match: DestructiveCommandRuleMatch | null;
  relaxation: GitWorktreeRelaxation | null;
}> {
  let relaxation: GitWorktreeRelaxation | null = null;
  const match = evaluateGit(words.map(analysisWordText), options, (value) => {
    relaxation = value;
  });
  return { match, relaxation };
}

function isGitNetworkOperation(tokens: readonly string[]): boolean {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  const subcommandName = subcommand?.toLowerCase();
  if (!subcommandName) {
    return false;
  }
  if (GIT_NETWORK_SUBCOMMANDS.has(subcommandName)) {
    return true;
  }
  if (subcommandName === 'archive') {
    return splitAtDoubleDash(rest).before.some((token) => matchesGitLongOption(token, '--remote'));
  }
  return subcommandName === 'remote' && isGitRemoteUpdateOperation(rest);
}

function isGitRemoteUpdateOperation(tokens: readonly string[]): boolean {
  return tokens.find((token) => !isGitRemotePrefixOption(token))?.toLowerCase() === 'update';
}

function isGitRemotePrefixOption(token: string): boolean {
  return (
    token === '-v' ||
    matchesGitLongOption(token, '--verbose') ||
    matchesGitLongOption(token, '--no-verbose')
  );
}

/** @internal */
export function getGitWorktreeRelaxation(
  tokens: readonly string[],
  options: GitAnalyzeOptions,
): GitWorktreeRelaxation | null {
  const aliasResolution = resolveGitCommandLineAliases(
    tokens,
    options.environment.env,
    options.envAssignments,
  );
  if (aliasResolution.blockedReason || aliasResolution.expanded) {
    return null;
  }

  const match = analyzeGitRule(aliasResolution.tokens);
  if (!match) {
    return null;
  }
  return getGitWorktreeRelaxationForMatch(tokens, match, options);
}
