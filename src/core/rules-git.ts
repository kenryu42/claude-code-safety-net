import { extractShortOpts, getBasename } from '@/core/shell';
import {
  GIT_GLOBAL_OPTS_WITH_VALUE,
  getGitExecutionContext,
  hasGitContextEnvOverride,
  isLinkedWorktree,
} from '@/core/worktree';

const REASON_CHECKOUT_DOUBLE_DASH =
  "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.";
const REASON_CHECKOUT_FORCE =
  "git checkout --force discards uncommitted changes. Use 'git stash' first.";
const REASON_CHECKOUT_REF_PATH =
  "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.";
const REASON_CHECKOUT_PATHSPEC_FROM_FILE =
  "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.";
const REASON_CHECKOUT_AMBIGUOUS =
  "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.";
const REASON_SWITCH_DISCARD_CHANGES =
  "git switch --discard-changes discards uncommitted changes. Use 'git stash' first.";
const REASON_SWITCH_FORCE =
  "git switch --force discards uncommitted changes. Use 'git stash' first.";
const REASON_RESTORE =
  "git restore discards uncommitted changes. Use 'git stash' first, or use --staged to only unstage.";
const REASON_RESTORE_WORKTREE =
  "git restore --worktree explicitly discards working tree changes. Use 'git stash' first.";
const REASON_RESET_HARD =
  "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.";
const REASON_RESET_MERGE = "git reset --merge can lose uncommitted changes. Use 'git stash' first.";
const REASON_CLEAN =
  "git clean -f removes untracked files permanently. Use 'git clean -n' to preview first.";
const REASON_PUSH_FORCE =
  'git push --force destroys remote history. Use --force-with-lease for safer force push.';
const REASON_BRANCH_DELETE =
  'git branch -D force-deletes without merge check. Use -d for safe delete.';
const REASON_STASH_DROP =
  "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.";
const REASON_STASH_CLEAR = 'git stash clear deletes ALL stashed changes permanently.';
const REASON_WORKTREE_REMOVE_FORCE =
  'git worktree remove --force can delete uncommitted changes. Remove --force flag.';

const CHECKOUT_OPTS_WITH_VALUE = new Set([
  '-b',
  '-B',
  '--orphan',
  '--conflict',
  '--inter-hunk-context',
  '--pathspec-from-file',
  '--unified',
]);

const CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = new Set(['--recurse-submodules', '--track', '-t']);
const CHECKOUT_SHORT_OPTS_WITH_VALUE = new Set(['-b', '-B', '-U']);
const SWITCH_SHORT_OPTS_WITH_VALUE = new Set(['-c', '-C']);

const CHECKOUT_KNOWN_OPTS_NO_VALUE = new Set([
  '-q',
  '--quiet',
  '--no-quiet',
  '-f',
  '--force',
  '--no-force',
  '-d',
  '--detach',
  '--no-detach',
  '-m',
  '--merge',
  '--no-merge',
  '-p',
  '--patch',
  '--no-patch',
  '--guess',
  '--no-guess',
  '--overlay',
  '--no-overlay',
  '--ours',
  '--theirs',
  '--ignore-skip-worktree-bits',
  '--no-ignore-skip-worktree-bits',
  '--no-track',
  '--overwrite-ignore',
  '--no-overwrite-ignore',
  '--ignore-other-worktrees',
  '--no-ignore-other-worktrees',
  '--progress',
  '--no-progress',
  '--pathspec-file-nul',
  '--no-pathspec-file-nul',
  '--no-recurse-submodules',
]);

function splitAtDoubleDash(tokens: readonly string[]): {
  index: number;
  before: readonly string[];
  after: readonly string[];
} {
  const index = tokens.indexOf('--');
  if (index === -1) {
    return { index: -1, before: tokens, after: [] };
  }
  return {
    index,
    before: tokens.slice(0, index),
    after: tokens.slice(index + 1),
  };
}

export interface GitAnalyzeOptions {
  cwd?: string;
  envAssignments?: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
}

export interface GitWorktreeRelaxation {
  originalReason: string;
  gitCwd: string;
}

interface GitRuleMatch {
  reason: string;
  localDiscard: boolean;
}

export function analyzeGit(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): string | null {
  const match = analyzeGitRule(tokens);

  if (!match) {
    return null;
  }

  if (getGitWorktreeRelaxationForMatch(tokens, match, options)) {
    return null;
  }

  return match.reason;
}

export function getGitWorktreeRelaxation(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): GitWorktreeRelaxation | null {
  const match = analyzeGitRule(tokens);
  if (!match) {
    return null;
  }
  return getGitWorktreeRelaxationForMatch(tokens, match, options);
}

function analyzeGitRule(tokens: readonly string[]): GitRuleMatch | null {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);

  if (!subcommand) {
    return null;
  }

  switch (subcommand.toLowerCase()) {
    case 'checkout':
      return localDiscard(analyzeGitCheckout(rest));
    case 'switch':
      return localDiscard(analyzeGitSwitch(rest));
    case 'restore':
      return localDiscard(analyzeGitRestore(rest));
    case 'reset':
      return analyzeGitReset(rest);
    case 'clean':
      return localDiscard(analyzeGitClean(rest));
    case 'push':
      return sharedState(analyzeGitPush(rest));
    case 'branch':
      return sharedState(analyzeGitBranch(rest));
    case 'stash':
      return sharedState(analyzeGitStash(rest));
    case 'worktree':
      return sharedState(analyzeGitWorktree(rest));
    default:
      return null;
  }
}

function localDiscard(reason: string | null): GitRuleMatch | null {
  return reason ? { reason, localDiscard: true } : null;
}

function sharedState(reason: string | null): GitRuleMatch | null {
  return reason ? { reason, localDiscard: false } : null;
}

function getGitWorktreeRelaxationForMatch(
  tokens: readonly string[],
  match: GitRuleMatch,
  options: GitAnalyzeOptions,
): GitWorktreeRelaxation | null {
  if (
    !match.localDiscard ||
    !options.worktreeMode ||
    hasGitContextEnvOverride(options.envAssignments) ||
    isNonRelaxableLocalDiscard(tokens)
  ) {
    return null;
  }

  const context = getGitExecutionContext(tokens, options.cwd);
  if (!context.gitCwd || context.hasExplicitGitContext) {
    return null;
  }

  if (!isLinkedWorktree(context.gitCwd)) {
    return null;
  }

  return {
    originalReason: match.reason,
    gitCwd: context.gitCwd,
  };
}

function extractGitSubcommandAndRest(tokens: readonly string[]): {
  subcommand: string | null;
  rest: string[];
} {
  if (tokens.length === 0) {
    return { subcommand: null, rest: [] };
  }

  const firstToken = tokens[0];
  const command = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command !== 'git') {
    return { subcommand: null, rest: [] };
  }

  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return { subcommand: nextToken, rest: tokens.slice(i + 2) };
      }
      return { subcommand: null, rest: tokens.slice(i + 1) };
    }

    if (token.startsWith('-')) {
      if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith('-c') && token.length > 2) {
        i++;
      } else if (token.startsWith('-C') && token.length > 2) {
        i++;
      } else {
        i++;
      }
    } else {
      return { subcommand: token, rest: tokens.slice(i + 1) };
    }
  }

  return { subcommand: null, rest: [] };
}

function analyzeGitCheckout(tokens: readonly string[]): string | null {
  const { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(beforeDash, {
    shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE,
  });

  if (beforeDash.includes('--force') || shortOpts.has('-f')) {
    return REASON_CHECKOUT_FORCE;
  }

  for (const token of tokens) {
    if (token === '-b' || token === '-B' || token === '--orphan') {
      return null;
    }
    if (token === '--pathspec-from-file') {
      return REASON_CHECKOUT_PATHSPEC_FROM_FILE;
    }
    if (token.startsWith('--pathspec-from-file=')) {
      return REASON_CHECKOUT_PATHSPEC_FROM_FILE;
    }
  }

  if (doubleDashIdx !== -1) {
    const hasRefBeforeDash = beforeDash.some((t) => !t.startsWith('-'));

    if (hasRefBeforeDash) {
      return REASON_CHECKOUT_REF_PATH;
    }
    return REASON_CHECKOUT_DOUBLE_DASH;
  }

  const positionalArgs = getCheckoutPositionalArgs(tokens);
  if (positionalArgs.length >= 2) {
    return REASON_CHECKOUT_AMBIGUOUS;
  }

  return null;
}

function analyzeGitSwitch(tokens: readonly string[]): string | null {
  const { before } = splitAtDoubleDash(tokens);

  if (before.includes('--discard-changes')) {
    return REASON_SWITCH_DISCARD_CHANGES;
  }

  const shortOpts = extractShortOpts(before, {
    shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE,
  });
  if (before.includes('--force') || shortOpts.has('-f')) {
    return REASON_SWITCH_FORCE;
  }

  return null;
}

function getCheckoutPositionalArgs(tokens: readonly string[]): string[] {
  const positional: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      break;
    }

    if (token.startsWith('-')) {
      if (CHECKOUT_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith('--') && token.includes('=')) {
        i++;
      } else if (CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        const nextToken = tokens[i + 1];
        if (
          nextToken &&
          !nextToken.startsWith('-') &&
          (token === '--recurse-submodules' || token === '--track' || token === '-t')
        ) {
          const validModes =
            token === '--recurse-submodules' ? ['checkout', 'on-demand'] : ['direct', 'inherit'];
          if (validModes.includes(nextToken)) {
            i += 2;
          } else {
            i++;
          }
        } else {
          i++;
        }
      } else if (
        token.startsWith('--') &&
        !CHECKOUT_KNOWN_OPTS_NO_VALUE.has(token) &&
        !CHECKOUT_OPTS_WITH_VALUE.has(token) &&
        !CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)
      ) {
        // Fail safe: unknown checkout long options must not hide the next token
        // from ambiguous ref/path detection.
        i++;
      } else {
        i++;
      }
    } else {
      positional.push(token);
      i++;
    }
  }

  return positional;
}

function analyzeGitRestore(tokens: readonly string[]): string | null {
  let hasStaged = false;
  for (const token of tokens) {
    if (token === '--help' || token === '--version') {
      return null;
    }
    // --worktree explicitly discards working tree changes, even with --staged
    if (token === '--worktree' || token === '-W') {
      return REASON_RESTORE_WORKTREE;
    }
    if (token === '--staged' || token === '-S') {
      hasStaged = true;
    }
  }
  // Only safe if --staged is present (and --worktree is not)
  return hasStaged ? null : REASON_RESTORE;
}

function analyzeGitReset(tokens: readonly string[]): GitRuleMatch | null {
  let reason: string | null = null;

  for (const token of tokens) {
    if (token === '--hard') {
      reason = REASON_RESET_HARD;
      break;
    }
    if (token === '--merge') {
      reason = REASON_RESET_MERGE;
      break;
    }
  }

  if (!reason) {
    return null;
  }

  return resetHasRef(tokens) ? sharedState(reason) : localDiscard(reason);
}

function resetHasRef(tokens: readonly string[]): boolean {
  for (const token of tokens) {
    if (token === '--') {
      return false;
    }
    if (!token.startsWith('-')) {
      return true;
    }
  }
  return false;
}

function analyzeGitClean(tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if (token === '-n' || token === '--dry-run') {
      return null;
    }
  }

  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (tokens.includes('--force') || shortOpts.has('-f')) {
    return REASON_CLEAN;
  }

  return null;
}

function isNonRelaxableLocalDiscard(tokens: readonly string[]): boolean {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  const normalizedSubcommand = subcommand?.toLowerCase();

  if (hasRecurseSubmodulesOption(rest)) {
    return true;
  }

  return normalizedSubcommand === 'clean' && countCleanForceFlags(rest) > 1;
}

function hasRecurseSubmodulesOption(tokens: readonly string[]): boolean {
  return tokens.some(
    (token) => token === '--recurse-submodules' || token.startsWith('--recurse-submodules='),
  );
}

function countCleanForceFlags(tokens: readonly string[]): number {
  let count = 0;

  for (const token of tokens) {
    if (token === '--force') {
      count++;
      continue;
    }
    if (token.startsWith('-') && !token.startsWith('--')) {
      for (const opt of token.slice(1)) {
        if (opt === 'f') {
          count++;
        }
      }
    }
  }

  return count;
}

function analyzeGitPush(tokens: readonly string[]): string | null {
  let hasForceWithLease = false;
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  const hasForce = tokens.includes('--force') || shortOpts.has('-f');

  for (const token of tokens) {
    if (token === '--force-with-lease' || token.startsWith('--force-with-lease=')) {
      hasForceWithLease = true;
    }
  }

  if (hasForce && !hasForceWithLease) {
    return REASON_PUSH_FORCE;
  }

  return null;
}

function analyzeGitBranch(tokens: readonly string[]): string | null {
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (shortOpts.has('-D')) {
    return REASON_BRANCH_DELETE;
  }
  return null;
}

function analyzeGitStash(tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if (token === 'drop') {
      return REASON_STASH_DROP;
    }
    if (token === 'clear') {
      return REASON_STASH_CLEAR;
    }
  }
  return null;
}

function analyzeGitWorktree(tokens: readonly string[]): string | null {
  const hasRemove = tokens.includes('remove');
  if (!hasRemove) return null;

  const { before } = splitAtDoubleDash(tokens);
  for (const token of before) {
    if (token === '--force' || token === '-f') {
      return REASON_WORKTREE_REMOVE_FORCE;
    }
  }

  return null;
}

/** @internal Exported for testing */
export {
  extractGitSubcommandAndRest as _extractGitSubcommandAndRest,
  getCheckoutPositionalArgs as _getCheckoutPositionalArgs,
};
