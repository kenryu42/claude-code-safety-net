import { extractShortOpts, getBasename } from '@/core/shell';

const REASON_CHECKOUT_DOUBLE_DASH =
  "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.";
const REASON_CHECKOUT_REF_PATH =
  "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.";
const REASON_CHECKOUT_PATHSPEC_FROM_FILE =
  "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.";
const REASON_CHECKOUT_AMBIGUOUS =
  "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.";
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

const GIT_GLOBAL_OPTS_WITH_VALUE = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
]);

const CHECKOUT_OPTS_WITH_VALUE = new Set([
  '-b',
  '-B',
  '--orphan',
  '--conflict',
  '--pathspec-from-file',
  '--unified',
]);

const CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = new Set(['--recurse-submodules', '--track', '-t']);

const CHECKOUT_KNOWN_OPTS_NO_VALUE = new Set([
  '-q',
  '--quiet',
  '-f',
  '--force',
  '-d',
  '--detach',
  '-m',
  '--merge',
  '-p',
  '--patch',
  '--ours',
  '--theirs',
  '--no-track',
  '--overwrite-ignore',
  '--no-overwrite-ignore',
  '--ignore-other-worktrees',
  '--progress',
  '--no-progress',
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

export function analyzeGit(tokens: readonly string[]): string | null {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);

  if (!subcommand) {
    return null;
  }

  switch (subcommand.toLowerCase()) {
    case 'checkout':
      return analyzeGitCheckout(rest);
    case 'restore':
      return analyzeGitRestore(rest);
    case 'reset':
      return analyzeGitReset(rest);
    case 'clean':
      return analyzeGitClean(rest);
    case 'push':
      return analyzeGitPush(rest);
    case 'branch':
      return analyzeGitBranch(rest);
    case 'stash':
      return analyzeGitStash(rest);
    case 'worktree':
      return analyzeGitWorktree(rest);
    default:
      return null;
  }
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
        const nextToken = tokens[i + 1];
        if (nextToken && !nextToken.startsWith('-')) {
          i += 2;
        } else {
          i++;
        }
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

function analyzeGitReset(tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if (token === '--hard') {
      return REASON_RESET_HARD;
    }
    if (token === '--merge') {
      return REASON_RESET_MERGE;
    }
  }
  return null;
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
