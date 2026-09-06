import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import { extractShortOpts } from '@/core/shell/tokens';
import { extractGitSubcommandAndRest, splitAtDoubleDash } from './parse';

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
const REASON_RM_FORCE =
  "git rm --force removes tracked files from the working tree. Use 'git rm --cached' to keep the files, or 'git rm --dry-run' to preview first.";
const REASON_PUSH_FORCE =
  'git push --force destroys remote history. Use --force-with-lease for safer force push.';
const REASON_PUSH_DELETE =
  'git push deletes remote refs. Ask the user to run it manually if deletion is intended.';
const REASON_PUSH_MIRROR =
  'git push ' +
  '--mirror can force-update and delete remote refs. Ask the user to run it manually if mirror push is intended.';
const REASON_BRANCH_DELETE =
  'git branch -D force-deletes without merge check. Use -d for safe delete.';
const REASON_REBASE_ABORT =
  "git rebase --abort discards rebase conflict resolutions. Use 'git status' first.";
const REASON_MERGE_ABORT =
  "git merge --abort discards merge conflict resolutions. Use 'git status' first.";
const REASON_TAG_DELETE =
  'git tag -d permanently deletes tags. Ask the user to run it manually if deletion is intended.';
const REASON_REFLOG_DELETE =
  'git reflog delete removes recovery history. Ask the user to run it manually if deletion is intended.';
const REASON_STASH_DROP =
  "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.";
const REASON_STASH_CLEAR =
  "git stash clear deletes ALL stashed changes permanently. Use 'git stash list' to review; ask the user to run it manually if intended.";
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
export const CHECKOUT_SHORT_OPTS_WITH_VALUE = new Set(['-b', '-B', '-U']);
export const SWITCH_SHORT_OPTS_WITH_VALUE = new Set(['-c', '-C']);

const RESTORE_OPTS_WITH_VALUE = new Set([
  '--source',
  '--conflict',
  '--unified',
  '--inter-hunk-context',
]);

export interface GitRuleMatch extends DestructiveCommandRuleMatch {
  reason: string;
  localDiscard: boolean;
}

export function matchesGitLongOption(token: string, option: string): boolean {
  const optionName = token.split('=', 1)[0] ?? token;
  return (
    optionName.length >= 4 &&
    option.startsWith(optionName) &&
    optionName.startsWith('--') &&
    optionName.slice(2).length >= 2
  );
}

/** The git subcommands `analyzeGitRule` dispatches on, for callers that gate before dispatching. */
export const GIT_RULE_SUBCOMMANDS = new Set([
  'branch',
  'checkout',
  'clean',
  'merge',
  'push',
  'rebase',
  'reflog',
  'reset',
  'restore',
  'rm',
  'stash',
  'switch',
  'tag',
  'worktree',
]);

export function analyzeGitRule(tokens: readonly string[]): GitRuleMatch | null {
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
    case 'rm':
      return localDiscard(analyzeGitRm(rest));
    case 'push':
      return sharedState(analyzeGitPush(rest));
    case 'branch':
      return sharedState(analyzeGitBranch(rest));
    case 'stash':
      return sharedState(analyzeGitStash(rest));
    case 'worktree':
      return sharedState(analyzeGitWorktree(rest));
    case 'rebase':
      return localDiscard(analyzeGitRebase(rest));
    case 'merge':
      return localDiscard(analyzeGitMerge(rest));
    case 'tag':
      return sharedState(analyzeGitTag(rest));
    case 'reflog':
      return sharedState(analyzeGitReflog(rest));
    default:
      return null;
  }
}

function localDiscard(match: DestructiveCommandRuleMatch | null): GitRuleMatch | null {
  return match ? { ...match, localDiscard: true } : null;
}

function sharedState(match: DestructiveCommandRuleMatch | null): GitRuleMatch | null {
  return match ? { ...match, localDiscard: false } : null;
}

function analyzeGitCheckout(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(beforeDash, {
    shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE,
  });

  if (beforeDash.some((token) => matchesGitLongOption(token, '--force')) || shortOpts.has('-f')) {
    return destructiveCommandMatch('git.checkout-force', REASON_CHECKOUT_FORCE);
  }

  for (const token of tokens) {
    if (token === '-b' || token === '-B' || token === '--orphan') {
      return null;
    }
    if (matchesGitLongOption(token, '--pathspec-from-file')) {
      return destructiveCommandMatch(
        'git.checkout-pathspec-from-file',
        REASON_CHECKOUT_PATHSPEC_FROM_FILE,
      );
    }
  }

  if (doubleDashIdx !== -1) {
    const hasRefBeforeDash = beforeDash.some((t) => !t.startsWith('-'));

    if (hasRefBeforeDash) {
      return destructiveCommandMatch('git.checkout-ref-path', REASON_CHECKOUT_REF_PATH);
    }
    return destructiveCommandMatch('git.checkout-double-dash', REASON_CHECKOUT_DOUBLE_DASH);
  }

  const positionalArgs = getCheckoutPositionalArgs(tokens);
  if (positionalArgs.length >= 2) {
    return destructiveCommandMatch('git.checkout-ambiguous', REASON_CHECKOUT_AMBIGUOUS);
  }

  return null;
}

function analyzeGitSwitch(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before } = splitAtDoubleDash(tokens);

  if (before.some((token) => matchesGitLongOption(token, '--discard-changes'))) {
    return destructiveCommandMatch('git.switch-discard-changes', REASON_SWITCH_DISCARD_CHANGES);
  }

  const shortOpts = extractShortOpts(before, {
    shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE,
  });
  if (before.some((token) => matchesGitLongOption(token, '--force')) || shortOpts.has('-f')) {
    return destructiveCommandMatch('git.switch-force', REASON_SWITCH_FORCE);
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

    if (!token.startsWith('-')) {
      positional.push(token);
      i++;
      continue;
    }

    if (CHECKOUT_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    // The option names carrying an optional value never contain `=`, so the attached-value form
    // the shipped chain tested before this branch cannot reach it.
    if (CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
      const nextToken = tokens[i + 1];
      const validModes =
        token === '--recurse-submodules' ? ['checkout', 'on-demand'] : ['direct', 'inherit'];
      i += nextToken && !nextToken.startsWith('-') && validModes.includes(nextToken) ? 2 : 1;
      continue;
    }

    // Every remaining option, known or not, consumes only itself.
    i++;
  }

  return positional;
}

function analyzeGitRestore(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const facts = parseGitRestoreFacts(tokens);
  if (facts.isTerminal || (!facts.hasPathspec && !facts.hasPatch) || !facts.hasWorktree) {
    return null;
  }
  return facts.hasExplicitLocation
    ? destructiveCommandMatch('git.restore-worktree', REASON_RESTORE_WORKTREE)
    : destructiveCommandMatch('git.restore-unstaged', REASON_RESTORE);
}

function parseGitRestoreFacts(tokens: readonly string[]) {
  let hasPathspec = false;
  let hasPatch = false;
  let hasWorktree = true;
  let hasExplicitLocation = false;

  const setLocation = (worktree?: boolean) => {
    if (!hasExplicitLocation) {
      hasWorktree = false;
      hasExplicitLocation = true;
    }
    if (worktree !== undefined) {
      hasWorktree = worktree;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) break;
    if (token === '--') {
      hasPathspec ||= i + 1 < tokens.length;
      break;
    }
    if (token === '--pathspec-from-file') {
      hasPathspec = true;
      i++;
      continue;
    }
    if (token.startsWith('--pathspec-from-file=')) {
      hasPathspec = true;
      continue;
    }
    if (token === '-h' || token === '--help' || token === '--version') {
      return {
        hasPathspec,
        hasPatch,
        hasWorktree,
        hasExplicitLocation,
        isTerminal: true,
      };
    }
    if (token === '--staged') {
      setLocation();
      continue;
    }
    if (token === '--no-staged') {
      setLocation();
      continue;
    }
    if (token === '--worktree') {
      setLocation(true);
      continue;
    }
    if (token === '--no-worktree') {
      setLocation(false);
      continue;
    }
    if (token === '--patch') {
      hasPatch = true;
      continue;
    }
    if (token === '--no-patch') {
      hasPatch = false;
      continue;
    }
    if (RESTORE_OPTS_WITH_VALUE.has(token)) {
      i++;
      continue;
    }
    if (token.startsWith('--')) {
      continue;
    }
    if (token === '-') {
      hasPathspec = true;
      continue;
    }
    if (!token.startsWith('-')) {
      hasPathspec = true;
      continue;
    }

    for (let j = 1; j < token.length; j++) {
      const option = token.charAt(j);
      if (option === 'h') {
        return {
          hasPathspec,
          hasPatch,
          hasWorktree,
          hasExplicitLocation,
          isTerminal: true,
        };
      }
      if (option === 'S') {
        setLocation();
        continue;
      }
      if (option === 'W') {
        setLocation(true);
        continue;
      }
      if (option === 'p') {
        hasPatch = true;
        continue;
      }
      if (option === 's' || option === 'U') {
        if (j === token.length - 1) {
          i++;
        }
        break;
      }
    }
  }

  return { hasPathspec, hasPatch, hasWorktree, hasExplicitLocation, isTerminal: false };
}

function analyzeGitReset(tokens: readonly string[]): GitRuleMatch | null {
  let match: DestructiveCommandRuleMatch | null = null;

  for (const token of tokens) {
    if (matchesGitLongOption(token, '--hard')) {
      match = destructiveCommandMatch('git.reset-hard', REASON_RESET_HARD);
      break;
    }
    if (matchesGitLongOption(token, '--merge')) {
      match = destructiveCommandMatch('git.reset-merge', REASON_RESET_MERGE);
      break;
    }
  }

  if (!match) {
    return null;
  }

  return resetHasRef(tokens) ? sharedState(match) : localDiscard(match);
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

function analyzeGitClean(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  for (const token of tokens) {
    if (token === '-n' || matchesGitLongOption(token, '--dry-run')) {
      return null;
    }
  }

  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (tokens.some((token) => matchesGitLongOption(token, '--force')) || shortOpts.has('-f')) {
    return destructiveCommandMatch('git.clean-force', REASON_CLEAN);
  }

  return null;
}

function analyzeGitRm(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  let hasForce = false;
  let hasCached = false;
  let hasDryRun = false;

  for (const token of splitAtDoubleDash(tokens).before) {
    if (matchesGitLongOption(token, '--no-force')) {
      hasForce = false;
      continue;
    }
    if (matchesGitLongOption(token, '--force')) {
      hasForce = true;
      continue;
    }
    if (matchesGitLongOption(token, '--no-cached')) {
      hasCached = false;
      continue;
    }
    if (matchesGitLongOption(token, '--cached')) {
      hasCached = true;
      continue;
    }
    if (matchesGitLongOption(token, '--no-dry-run')) {
      hasDryRun = false;
      continue;
    }
    if (matchesGitLongOption(token, '--dry-run')) {
      hasDryRun = true;
      continue;
    }

    const shortOpts = extractShortOpts([token]);
    hasForce ||= shortOpts.has('-f');
    hasDryRun ||= shortOpts.has('-n');
  }

  return hasForce && !hasCached && !hasDryRun
    ? destructiveCommandMatch('git.rm-force', REASON_RM_FORCE)
    : null;
}

function analyzeGitPush(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before, after } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(before);
  if (before.some((token) => matchesGitLongOption(token, '--mirror'))) {
    return destructiveCommandMatch('git.push-mirror', REASON_PUSH_MIRROR);
  }

  const hasForce =
    before.some((token) => matchesGitLongOption(token, '--force')) ||
    shortOpts.has('-f') ||
    getPushRefspecCandidates(before, after).some(isForcePushRefspec);

  if (hasForce) {
    return destructiveCommandMatch('git.push-force', REASON_PUSH_FORCE);
  }

  const hasDelete =
    before.some((token) => matchesGitLongOption(token, '--delete')) ||
    shortOpts.has('-d') ||
    getPushRefspecCandidates(before, after).some(isDeletePushRefspec);

  if (hasDelete) {
    return destructiveCommandMatch('git.push-delete', REASON_PUSH_DELETE);
  }

  return null;
}

function getPushRefspecCandidates(
  beforeDoubleDash: readonly string[],
  afterDoubleDash: readonly string[],
): string[] {
  return [
    ...beforeDoubleDash.filter((token) => token !== '' && !token.startsWith('-')),
    ...afterDoubleDash,
  ];
}

function isForcePushRefspec(token: string): boolean {
  return token.startsWith('+') || token.includes(':+');
}

function isDeletePushRefspec(token: string): boolean {
  return token.length > 1 && token.startsWith(':');
}

function analyzeGitBranch(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(before);
  const hasDelete =
    shortOpts.has('-D') ||
    shortOpts.has('-d') ||
    before.some((token) => matchesGitLongOption(token, '--delete'));
  const hasForce =
    shortOpts.has('-D') ||
    shortOpts.has('-f') ||
    before.some((token) => matchesGitLongOption(token, '--force'));
  if (hasDelete && hasForce) {
    return destructiveCommandMatch('git.branch-force-delete', REASON_BRANCH_DELETE);
  }
  return null;
}

function analyzeGitRebase(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before } = splitAtDoubleDash(tokens);
  return before.some((token) => matchesGitLongOption(token, '--abort'))
    ? destructiveCommandMatch('git.rebase-abort', REASON_REBASE_ABORT)
    : null;
}

function analyzeGitMerge(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before } = splitAtDoubleDash(tokens);
  return before.some((token) => matchesGitLongOption(token, '--abort'))
    ? destructiveCommandMatch('git.merge-abort', REASON_MERGE_ABORT)
    : null;
}

function analyzeGitTag(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(before);
  return shortOpts.has('-d') || before.some((token) => matchesGitLongOption(token, '--delete'))
    ? destructiveCommandMatch('git.tag-delete', REASON_TAG_DELETE)
    : null;
}

function analyzeGitReflog(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  return tokens[0] === 'delete'
    ? destructiveCommandMatch('git.reflog-delete', REASON_REFLOG_DELETE)
    : null;
}

function analyzeGitStash(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  for (const token of tokens) {
    if (token === 'drop') {
      return destructiveCommandMatch('git.stash-drop', REASON_STASH_DROP);
    }
    if (token === 'clear') {
      return destructiveCommandMatch('git.stash-clear', REASON_STASH_CLEAR);
    }
  }
  return null;
}

function analyzeGitWorktree(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  const { before } = splitAtDoubleDash(tokens);
  const hasRemove = before.includes('remove');
  if (!hasRemove) return null;

  const shortOpts = extractShortOpts(before);
  if (before.some((token) => matchesGitLongOption(token, '--force')) || shortOpts.has('-f')) {
    return destructiveCommandMatch('git.worktree-remove-force', REASON_WORKTREE_REMOVE_FORCE);
  }

  return null;
}
