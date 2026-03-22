import { extractShortOpts, getBasename } from '@/core/shell';
import { getReason } from './reasons';

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

export function analyzeGit(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);

  if (!subcommand) {
    return null;
  }

  switch (subcommand.toLowerCase()) {
    case 'checkout':
      return analyzeGitCheckout(rest, reasons);
    case 'switch':
      return analyzeGitSwitch(rest, reasons);
    case 'restore':
      return analyzeGitRestore(rest, reasons);
    case 'reset':
      return analyzeGitReset(rest, reasons);
    case 'clean':
      return analyzeGitClean(rest, reasons);
    case 'push':
      return analyzeGitPush(rest, reasons);
    case 'branch':
      return analyzeGitBranch(rest, reasons);
    case 'stash':
      return analyzeGitStash(rest, reasons);
    case 'worktree':
      return analyzeGitWorktree(rest, reasons);
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

function analyzeGitCheckout(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  const { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(beforeDash, {
    shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE,
  });

  if (beforeDash.includes('--force') || shortOpts.has('-f')) {
    return getReason('checkout_force', reasons);
  }

  for (const token of tokens) {
    if (token === '-b' || token === '-B' || token === '--orphan') {
      return null;
    }
    if (token === '--pathspec-from-file') {
      return getReason('checkout_pathspec_from_file', reasons);
    }
    if (token.startsWith('--pathspec-from-file=')) {
      return getReason('checkout_pathspec_from_file', reasons);
    }
  }

  if (doubleDashIdx !== -1) {
    const hasRefBeforeDash = beforeDash.some((t) => !t.startsWith('-'));

    if (hasRefBeforeDash) {
      return getReason('checkout_ref_path', reasons);
    }
    return getReason('checkout_double_dash', reasons);
  }

  const positionalArgs = getCheckoutPositionalArgs(tokens);
  if (positionalArgs.length >= 2) {
    return getReason('checkout_ambiguous', reasons);
  }

  return null;
}

function analyzeGitSwitch(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  const { before } = splitAtDoubleDash(tokens);

  if (before.includes('--discard-changes')) {
    return getReason('switch_discard_changes', reasons);
  }

  const shortOpts = extractShortOpts(before, {
    shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE,
  });
  if (before.includes('--force') || shortOpts.has('-f')) {
    return getReason('switch_force', reasons);
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

function analyzeGitRestore(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  let hasStaged = false;
  for (const token of tokens) {
    if (token === '--help' || token === '--version') {
      return null;
    }
    // --worktree explicitly discards working tree changes, even with --staged
    if (token === '--worktree' || token === '-W') {
      return getReason('restore_worktree', reasons);
    }
    if (token === '--staged' || token === '-S') {
      hasStaged = true;
    }
  }
  // Only safe if --staged is present (and --worktree is not)
  return hasStaged ? null : getReason('restore', reasons);
}

function analyzeGitReset(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  for (const token of tokens) {
    if (token === '--hard') {
      return getReason('reset_hard', reasons);
    }
    if (token === '--merge') {
      return getReason('reset_merge', reasons);
    }
  }
  return null;
}

function analyzeGitClean(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  for (const token of tokens) {
    if (token === '-n' || token === '--dry-run') {
      return null;
    }
  }

  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (tokens.includes('--force') || shortOpts.has('-f')) {
    return getReason('clean', reasons);
  }

  return null;
}

function analyzeGitPush(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  let hasForceWithLease = false;
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  const hasForce = tokens.includes('--force') || shortOpts.has('-f');

  for (const token of tokens) {
    if (token === '--force-with-lease' || token.startsWith('--force-with-lease=')) {
      hasForceWithLease = true;
    }
  }

  if (hasForce && !hasForceWithLease) {
    return getReason('push_force', reasons);
  }

  return null;
}

function analyzeGitBranch(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (shortOpts.has('-D')) {
    return getReason('branch_delete', reasons);
  }
  return null;
}

function analyzeGitStash(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  for (const token of tokens) {
    if (token === 'drop') {
      return getReason('stash_drop', reasons);
    }
    if (token === 'clear') {
      return getReason('stash_clear', reasons);
    }
  }
  return null;
}

function analyzeGitWorktree(
  tokens: readonly string[],
  reasons?: Record<string, string>,
): string | null {
  const hasRemove = tokens.includes('remove');
  if (!hasRemove) return null;

  const { before } = splitAtDoubleDash(tokens);
  for (const token of before) {
    if (token === '--force' || token === '-f') {
      return getReason('worktree_remove_force', reasons);
    }
  }

  return null;
}

/** @internal Exported for testing */
export {
  extractGitSubcommandAndRest as _extractGitSubcommandAndRest,
  getCheckoutPositionalArgs as _getCheckoutPositionalArgs,
};
