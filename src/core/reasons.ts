/**
 * Reasons module - externalizes hard-coded reason strings.
 */

const DEFAULT_REASONS: Record<string, string> = {
  // Git checkout reasons
  checkout_double_dash:
    "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.",
  checkout_force: "git checkout --force discards uncommitted changes. Use 'git stash' first.",
  checkout_ref_path:
    "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.",
  checkout_pathspec_from_file:
    "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.",
  checkout_ambiguous:
    "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.",
  // Git switch reasons
  switch_discard_changes:
    "git switch --discard-changes discards uncommitted changes. Use 'git stash' first.",
  switch_force: "git switch --force discards uncommitted changes. Use 'git stash' first.",
  // Git restore reasons
  restore:
    "git restore discards uncommitted changes. Use 'git stash' first, or use --staged to only unstage.",
  restore_worktree:
    "git restore --worktree explicitly discards working tree changes. Use 'git stash' first.",
  // Git reset reasons
  reset_hard:
    "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.",
  reset_merge: "git reset --merge can lose uncommitted changes. Use 'git stash' first.",
  // Git clean reasons
  clean: "git clean -f removes untracked files permanently. Use 'git clean -n' to preview first.",
  // Git push reasons
  push_force:
    'git push --force destroys remote history. Use --force-with-lease for safer force push.',
  // Git branch reasons
  branch_delete: 'git branch -D force-deletes without merge check. Use -d for safe delete.',
  // Git stash reasons
  stash_drop:
    "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.",
  stash_clear: 'git stash clear deletes ALL stashed changes permanently.',
  // Git worktree reasons
  worktree_remove_force:
    'git worktree remove --force can delete uncommitted changes. Remove --force flag.',
  // rm reasons
  rm_rf_blocked:
    'rm -rf outside cwd is blocked. Use explicit paths within the current directory, or delete manually.',
  rm_rf_root_home:
    'rm -rf targeting root or home directory is extremely dangerous and always blocked.',
  // find reasons
  find_delete_reason: 'find -delete permanently removes files. Use -print first to preview.',
  find_exec_rm_rf: 'find -exec rm -rf is dangerous. Use explicit file list instead.',
  // xargs reasons
  xargs_rm: 'xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.',
  xargs_shell: 'xargs with shell -c can execute arbitrary commands from dynamic input.',
  // parallel reasons
  parallel_rm: 'parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.',
  parallel_shell: 'parallel with shell -c can execute arbitrary commands from dynamic input.',
  // interpreter reasons
  interpreter_dangerous: 'Detected potentially dangerous command in interpreter code.',
  interpreter_blocked: 'Interpreter one-liners are blocked in paranoid mode.',
  // rm home cwd reason
  rm_home_cwd: 'rm -rf in home directory is dangerous. Change to a project directory first.',
  // strict/unparseable reasons
  strict_unparseable: 'Command could not be safely analyzed (strict mode). Verify manually.',
  recursion_limit: 'Command exceeds maximum recursion depth and cannot be safely analyzed.',
};

/**
 * Get a reason string by key, with optional overrides from config.
 * @param key - reason key (e.g., 'checkout_double_dash')
 * @param configReasons - optional mapping of keys to custom strings from config
 * @returns the reason string (config override if present, otherwise default)
 */
export function getReason(key: string, configReasons?: Record<string, string>): string {
  if (configReasons && key in configReasons) {
    return configReasons[key] as string;
  }
  if (key in DEFAULT_REASONS) {
    return DEFAULT_REASONS[key] as string;
  }
  // Fallback: return key as reason (should not happen)
  return key;
}
