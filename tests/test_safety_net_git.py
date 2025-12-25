"""Tests for safety-net git command handling."""

from .safety_net_test_base import SafetyNetTestCase


class GitCheckoutTests(SafetyNetTestCase):
    # git checkout -- (discards uncommitted changes)
    def test_git_checkout_double_dash_blocked(self) -> None:
        self._assert_blocked("git checkout -- file.txt", "git checkout --")

    def test_git_checkout_double_dash_multiple_files_blocked(self) -> None:
        self._assert_blocked("git checkout -- file1.txt file2.txt", "git checkout --")

    def test_git_checkout_double_dash_dot_blocked(self) -> None:
        self._assert_blocked("git checkout -- .", "git checkout --")

    # git checkout -b (create branch)
    def test_git_checkout_b_allowed(self) -> None:
        self._assert_allowed("git checkout -b new-branch")

    def test_git_checkout_orphan_allowed(self) -> None:
        self._assert_allowed("git checkout --orphan orphan-branch")


class GitRestoreTests(SafetyNetTestCase):
    # git restore (discards uncommitted changes)
    def test_git_restore_file_blocked(self) -> None:
        self._assert_blocked("git restore file.txt", "git restore")

    def test_git_restore_multiple_files_blocked(self) -> None:
        self._assert_blocked("git restore a.txt b.txt", "git restore")

    def test_git_restore_worktree_blocked(self) -> None:
        self._assert_blocked(
            "git restore --worktree file.txt", "git restore --worktree"
        )

    # git restore --staged (safe, only unstages)
    def test_git_restore_staged_allowed(self) -> None:
        self._assert_allowed("git restore --staged file.txt")

    def test_git_restore_staged_dot_allowed(self) -> None:
        self._assert_allowed("git restore --staged .")


class GitResetTests(SafetyNetTestCase):
    # git reset --hard
    def test_git_reset_hard_blocked(self) -> None:
        self._assert_blocked("git reset --hard", "git reset --hard")

    def test_git_reset_hard_head_blocked(self) -> None:
        self._assert_blocked("git reset --hard HEAD~1", "git reset --hard")

    def test_git_reset_hard_with_flags_blocked(self) -> None:
        self._assert_blocked("git reset -q --hard", "git reset --hard")

    def test_git_reset_hard_pipeline_bypass_blocked(self) -> None:
        self._assert_blocked("echo ok | git reset --hard", "git reset --hard")

    def test_git_reset_hard_global_options_blocked(self) -> None:
        self._assert_blocked("git -C repo reset --hard", "git reset --hard")

    def test_git_reset_hard_global_option_git_dir_blocked(self) -> None:
        self._assert_blocked(
            "git --git-dir=repo/.git reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_nested_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "sudo env VAR=1 git reset --hard",
            "git reset --hard",
        )

    def test_git_reset_hard_env_double_dash_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked("env -- git reset --hard", "git reset --hard")

    def test_git_reset_hard_command_double_dash_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked("command -- git reset --hard", "git reset --hard")

    def test_git_reset_hard_env_unset_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked("env -u PATH git reset --hard", "git reset --hard")

    # git reset --merge
    def test_git_reset_merge_blocked(self) -> None:
        self._assert_blocked("git reset --merge", "git reset --merge")

    def test_git_reset_hard_sh_c_blocked(self) -> None:
        self._assert_blocked("sh -c 'git reset --hard'", "git reset --hard")


class GitCleanTests(SafetyNetTestCase):
    # git clean -f
    def test_git_clean_f_blocked(self) -> None:
        self._assert_blocked("git clean -f", "git clean")

    def test_git_clean_force_long_blocked(self) -> None:
        self._assert_blocked("git clean --force", "git clean -f")

    def test_git_clean_nf_blocked(self) -> None:
        self._assert_blocked("git clean -nf", "git clean -f")

    def test_allowlist_substring_bypass_blocked(self) -> None:
        self._assert_blocked("git clean -n && git clean -f", "git clean -f")

    def test_git_clean_fd_blocked(self) -> None:
        self._assert_blocked("git clean -fd", "git clean")

    def test_git_clean_xf_blocked(self) -> None:
        self._assert_blocked("git clean -xf", "git clean")

    # git clean dry run
    def test_git_clean_n_allowed(self) -> None:
        self._assert_allowed("git clean -n")

    def test_git_clean_dry_run_allowed(self) -> None:
        self._assert_allowed("git clean --dry-run")

    def test_git_clean_nd_allowed(self) -> None:
        self._assert_allowed("git clean -nd")


class GitPushTests(SafetyNetTestCase):
    # git push --force
    def test_git_push_force_blocked(self) -> None:
        self._assert_blocked("git push --force", "Force push")

    def test_git_push_force_origin_blocked(self) -> None:
        self._assert_blocked("git push --force origin main", "Force push")

    def test_git_push_f_blocked(self) -> None:
        self._assert_blocked("git push -f", "Force push")

    def test_git_push_f_origin_blocked(self) -> None:
        self._assert_blocked("git push -f origin main", "Force push")

    # git push --force-with-lease (safe force)
    def test_git_push_force_with_lease_allowed(self) -> None:
        self._assert_allowed("git push --force-with-lease")

    def test_git_push_force_with_lease_origin_allowed(self) -> None:
        self._assert_allowed("git push --force-with-lease origin main")

    def test_git_push_allowed(self) -> None:
        self._assert_allowed("git push origin main")


class GitBranchTests(SafetyNetTestCase):
    # git branch -D
    def test_git_branch_D_blocked(self) -> None:
        self._assert_blocked("git branch -D feature", "git branch -D")

    def test_git_branch_D_combined_short_options_blocked(self) -> None:
        self._assert_blocked("git branch -Dv feature", "git branch -D")

    def test_git_branch_d_lowercase_allowed(self) -> None:
        self._assert_allowed("git branch -d feature")


class GitStashTests(SafetyNetTestCase):
    # git stash drop/clear
    def test_git_stash_drop_blocked(self) -> None:
        self._assert_blocked("git stash drop", "git stash drop")

    def test_git_stash_drop_index_blocked(self) -> None:
        self._assert_blocked("git stash drop stash@{0}", "git stash drop")

    def test_git_stash_clear_blocked(self) -> None:
        self._assert_blocked("git stash clear", "git stash clear")

    def test_git_stash_allowed(self) -> None:
        self._assert_allowed("git stash")

    def test_git_stash_list_allowed(self) -> None:
        self._assert_allowed("git stash list")

    def test_git_stash_pop_allowed(self) -> None:
        self._assert_allowed("git stash pop")


class SafeCommandsTests(SafetyNetTestCase):
    # Regular safe commands
    def test_git_status_allowed(self) -> None:
        self._assert_allowed("git status")

    def test_git_status_global_option_C_allowed(self) -> None:
        self._assert_allowed("git -C repo status")

    def test_git_status_nested_wrapper_allowed(self) -> None:
        self._assert_allowed("sudo env VAR=1 git status")

    def test_git_diff_allowed(self) -> None:
        self._assert_allowed("git diff")

    def test_git_log_allowed(self) -> None:
        self._assert_allowed("git log --oneline -10")

    def test_git_add_allowed(self) -> None:
        self._assert_allowed("git add .")

    def test_git_commit_allowed(self) -> None:
        self._assert_allowed("git commit -m 'test'")

    def test_git_pull_allowed(self) -> None:
        self._assert_allowed("git pull")

    def test_bash_c_safe_allowed(self) -> None:
        self._assert_allowed("bash -c 'echo ok'")

    def test_python_c_safe_allowed(self) -> None:
        self._assert_allowed("python -c \"print('ok')\"")

    def test_ls_allowed(self) -> None:
        self._assert_allowed("ls -la")

    def test_cat_allowed(self) -> None:
        self._assert_allowed("cat file.txt")
