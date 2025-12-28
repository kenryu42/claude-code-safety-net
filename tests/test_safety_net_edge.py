"""Tests for safety-net edge cases and strict modes."""

import io
import json
import os
import shlex
from unittest import mock

from scripts import safety_net
from scripts.safety_net_impl.hook import (
    _analyze_segment,
    _segment_changes_cwd,
    _xargs_replacement_tokens,
)

from .safety_net_test_base import SafetyNetTestCase


class EdgeCasesTests(SafetyNetTestCase):
    """Test edge cases and error handling."""

    def test_invalid_json_input_allows(self) -> None:
        """Invalid JSON input should allow the command (fail open)."""
        with mock.patch("sys.stdin", io.StringIO("not valid json")):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_non_dict_input_allows(self) -> None:
        """Non-dict JSON input should allow the command (fail open)."""
        with mock.patch("sys.stdin", io.StringIO(json.dumps([1, 2, 3]))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_non_bash_tool_allows(self) -> None:
        """Non-Bash tools should be allowed."""
        input_data = {"tool_name": "Read", "tool_input": {"path": "/etc/passwd"}}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_empty_command_allows(self) -> None:
        """Empty command should be allowed."""
        input_data = {"tool_name": "Bash", "tool_input": {"command": ""}}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_missing_tool_input_allows(self) -> None:
        """Missing tool_input should be allowed."""
        input_data = {"tool_name": "Bash"}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_non_dict_tool_input_allows(self) -> None:
        """Non-dict tool_input should be allowed."""
        input_data = {"tool_name": "Bash", "tool_input": ["command"]}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_missing_command_key_allows(self) -> None:
        """Missing command key should be allowed."""
        input_data = {"tool_name": "Bash", "tool_input": {}}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_non_string_command_allows(self) -> None:
        """Non-string command should be allowed."""
        input_data = {"tool_name": "Bash", "tool_input": {"command": {"x": 1}}}
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertEqual(output, "")

    def test_case_insensitive_matching(self) -> None:
        """Commands should be matched case-insensitively."""
        input_data = {
            "tool_name": "Bash",
            "tool_input": {"command": "GIT CHECKOUT -- file"},
        }
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        self.assertIn("deny", output)

    def test_strict_mode_invalid_json_denies(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            with mock.patch("sys.stdin", io.StringIO("not valid json")):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                    result = safety_net.main()
                    output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        self.assertEqual(parsed["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_strict_mode_non_dict_input_denies(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            with mock.patch("sys.stdin", io.StringIO(json.dumps([1, 2, 3]))):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                    result = safety_net.main()
                    output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        self.assertEqual(parsed["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_strict_mode_missing_tool_input_denies(self) -> None:
        input_data = {"tool_name": "Bash"}
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                    result = safety_net.main()
                    output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        self.assertEqual(parsed["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_strict_mode_non_dict_tool_input_denies(self) -> None:
        input_data = {"tool_name": "Bash", "tool_input": ["command"]}
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                    result = safety_net.main()
                    output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        self.assertEqual(parsed["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_strict_mode_parse_error_denies(self) -> None:
        input_data = {
            "tool_name": "Bash",
            "tool_input": {"command": "git reset --hard 'unterminated"},
        }
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
                with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                    result = safety_net.main()
                    output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        self.assertEqual(parsed["hookSpecificOutput"]["permissionDecision"], "deny")
        reason = parsed["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("strict mode", reason)
        self.assertIn("unset SAFETY_NET_STRICT", reason)

    def test_strict_mode_bash_c_without_arg_denies(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_blocked(
                "bash -c",
                "shell -c wrapper",
            )

    def test_non_strict_bash_c_without_arg_allows(self) -> None:
        self._assert_allowed("bash -c")

    def test_bash_double_dash_does_not_treat_dash_c_as_wrapper_allowed(self) -> None:
        self._assert_allowed("bash -- -c 'echo ok'")

    def test_sh_lc_wrapper_blocked(self) -> None:
        self._assert_blocked(
            "sh -lc 'git reset --hard'",
            "git reset --hard",
        )

    def test_non_strict_unparseable_rm_rf_still_blocked_by_heuristic(self) -> None:
        self._assert_blocked("rm -rf /some/path 'unterminated", "rm -rf")

    def test_non_strict_unparseable_git_push_f_still_blocked_by_heuristic(self) -> None:
        self._assert_blocked(
            "git push -f origin main 'unterminated",
            "Force push",
        )

    def test_non_strict_unparseable_find_delete_blocked_by_heuristic(self) -> None:
        self._assert_blocked(
            "find . -delete 'unterminated",
            "find -delete",
        )

    def test_non_strict_unparseable_non_dangerous_allows(self) -> None:
        self._assert_allowed("echo 'unterminated")

    def test_non_strict_unparseable_git_restore_help_allows(self) -> None:
        self._assert_allowed("git restore --help 'unterminated")

    def test_non_strict_unparseable_git_checkout_dash_dash_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git checkout -- file.txt 'unterminated",
            "git checkout --",
        )

    def test_non_strict_unparseable_git_restore_blocked_by_heuristic(self) -> None:
        self._assert_blocked(
            "git restore file.txt 'unterminated",
            "git restore discards",
        )

    def test_deny_output_redacts_url_credentials(self) -> None:
        input_data = {
            "tool_name": "Bash",
            "tool_input": {
                "command": (
                    "git push https://user:abc123@github.com/org/repo.git --force"
                )
            },
        }
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        reason = parsed["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertNotIn("abc123", reason)

    def test_deny_output_redacts_authorization_bearer_token(self) -> None:
        input_data = {
            "tool_name": "Bash",
            "tool_input": {
                "command": (
                    'curl -H "Authorization: Bearer abc123" https://example.com '
                    "&& git reset --hard"
                )
            },
        }
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        reason = parsed["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertNotIn("abc123", reason)

    def test_deny_output_redacts_authorization_basic_token(self) -> None:
        input_data = {
            "tool_name": "Bash",
            "tool_input": {
                "command": (
                    "curl -H 'Authorization: Basic abc123' https://example.com "
                    "&& git reset --hard"
                )
            },
        }
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        parsed: dict = json.loads(output)
        reason = parsed["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertNotIn("abc123", reason)

    def test_pipe_stderr_and_stdout_split_blocked(self) -> None:
        self._assert_blocked(
            "echo ok |& git reset --hard",
            "git reset --hard",
        )

    def test_command_substitution_git_reset_hard_blocked(self) -> None:
        self._assert_blocked("echo $(git reset --hard )", "git reset --hard")

    def test_command_substitution_find_delete_blocked(self) -> None:
        self._assert_blocked("echo $(find . -delete )", "find -delete")

    def test_command_substitution_rm_f_allowed(self) -> None:
        self._assert_allowed("echo $(rm -f /tmp/a )")

    def test_command_substitution_git_status_allowed(self) -> None:
        self._assert_allowed("echo $(git status )")

    def test_command_substitution_find_without_delete_allowed(self) -> None:
        self._assert_allowed("echo $(find . -name foo )")

    def test_xargs_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            "echo / | xargs rm -rf",
            "rm -rf",
        )

    def test_xargs_replace_I_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            "echo / | xargs -I{} rm -rf {}",
            "xargs",
            cwd=str(self.tmpdir),
        )

    def test_xargs_delimiter_option_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo / | xargs --delimiter '\\n' rm -rf",
            "rm -rf",
        )

    def test_xargs_dash_i_does_not_consume_child_cmd_still_blocks(self) -> None:
        self._assert_blocked(
            "echo / | xargs -i rm -rf",
            "rm -rf",
        )

    def test_xargs_attached_n_option_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo / | xargs -n1 rm -rf",
            "rm -rf",
        )

    def test_xargs_attached_P_option_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo / | xargs -P2 rm -rf",
            "rm -rf",
        )

    def test_xargs_long_opt_equals_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo / | xargs --arg-file=/tmp/paths rm -rf",
            "rm -rf",
        )

    def test_xargs_replace_long_option_enables_placeholder_analysis(self) -> None:
        self._assert_blocked(
            "echo / | xargs --replace bash -c 'rm -rf {}'",
            "xargs",
        )

    def test_xargs_replace_long_option_with_custom_token_enables_placeholder_analysis(
        self,
    ) -> None:
        self._assert_blocked(
            "echo / | xargs --replace=FOO bash -c 'rm -rf FOO'",
            "xargs",
        )

    def test_xargs_replace_long_option_empty_value_defaults_to_braces(self) -> None:
        self._assert_blocked(
            "echo / | xargs --replace= bash -c 'rm -rf {}'",
            "xargs",
        )

    def test_xargs_only_options_without_child_command_allowed(self) -> None:
        self._assert_allowed("echo ok | xargs -n1")

    def test_xargs_attached_i_option_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo / | xargs -i{} rm -rf",
            "rm -rf",
        )

    def test_xargs_replacement_token_parsing_ignores_unknown_options(self) -> None:
        self._assert_blocked(
            "echo / | xargs --replace -t bash -c 'rm -rf {}'",
            "xargs",
        )

    def test_xargs_replace_I_bash_c_script_is_input_denied_safe_input(self) -> None:
        self._assert_blocked(
            "echo ok | xargs -I{} bash -c {}",
            "arbitrary commands",
        )

    def test_xargs_bash_c_without_arg_denied_safe_input(self) -> None:
        self._assert_blocked(
            "echo ok | xargs bash -c",
            "arbitrary commands",
        )

    def test_xargs_bash_c_script_analyzed_blocks(self) -> None:
        self._assert_blocked(
            "echo ok | xargs bash -c 'git reset --hard'",
            "git reset --hard",
        )

    def test_xargs_child_wrappers_only_allowed(self) -> None:
        self._assert_allowed("echo ok | xargs sudo --")

    def test_xargs_busybox_rm_non_destructive_allowed(self) -> None:
        self._assert_allowed("echo ok | xargs busybox rm -f /tmp/test")

    def test_xargs_find_without_delete_allowed(self) -> None:
        self._assert_allowed("echo ok | xargs find . -name foo")

    def test_xargs_replace_I_bash_c_placeholder_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            "echo / | xargs -I{} bash -c 'rm -rf {}'",
            "xargs",
            cwd=str(self.tmpdir),
        )

    def test_xargs_replace_custom_token_bash_c_placeholder_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            "echo / | xargs -I% bash -c 'rm -rf %'",
            "xargs",
            cwd=str(self.tmpdir),
        )

    def test_xargs_replace_I_bash_c_script_is_input_denied(self) -> None:
        self._assert_blocked(
            "echo 'rm -rf /' | xargs -I{} bash -c {}",
            "xargs",
        )

    def test_xargs_print0_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            "find . -print0 | xargs -0 rm -rf",
            "rm -rf",
        )

    def test_xargs_arg_file_option_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo ok | xargs -a /tmp/paths rm -rf",
            "rm -rf",
        )

    def test_xargs_J_consumes_value_still_blocks_child_rm(self) -> None:
        self._assert_blocked(
            "echo / | xargs -J {} rm -rf {}",
            "rm -rf",
        )

    def test_xargs_rm_double_dash_prevents_dash_rf_as_option_allowed(self) -> None:
        self._assert_allowed(
            "echo ok | xargs rm -- -rf",
            cwd=str(self.tmpdir),
        )

    def test_xargs_bash_c_dynamic_denied(self) -> None:
        self._assert_blocked(
            "echo 'rm -rf /' | xargs bash -c",
            "xargs",
        )

    def test_xargs_echo_allowed(self) -> None:
        self._assert_allowed("echo ok | xargs echo")

    def test_xargs_busybox_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            "echo / | xargs busybox rm -rf",
            "rm -rf",
        )

    def test_xargs_busybox_find_delete_blocked(self) -> None:
        self._assert_blocked(
            "echo ok | xargs busybox find . -delete",
            "find -delete",
        )

    def test_xargs_without_child_command_allowed(self) -> None:
        self._assert_allowed("echo ok | xargs")

    def test_xargs_find_delete_blocked(self) -> None:
        self._assert_blocked(
            "echo ok | xargs find . -delete",
            "find -delete",
        )

    def test_xargs_git_reset_hard_blocked(self) -> None:
        self._assert_blocked(
            "echo ok | xargs git reset --hard",
            "git reset --hard",
        )

    def test_parallel_bash_c_dynamic_denied(self) -> None:
        self._assert_blocked(
            "parallel bash -c ::: 'rm -rf /'",
            "parallel",
        )

    def test_parallel_bash_c_script_is_input_denied(self) -> None:
        self._assert_blocked(
            "echo 'rm -rf /' | parallel bash -c {}",
            "parallel",
        )

    def test_parallel_bash_c_script_is_input_denied_safe_input(self) -> None:
        self._assert_blocked(
            "echo ok | parallel bash -c {}",
            "arbitrary",
        )

    def test_parallel_results_option_blocks_rm_rf(self) -> None:
        self._assert_blocked(
            "parallel --results out rm -rf {} ::: /",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_parallel_jobs_attached_option_blocks(self) -> None:
        self._assert_blocked(
            "parallel -j2 rm -rf {} ::: /",
            "root or home",
            cwd=str(self.tmpdir),
        )

    def test_parallel_jobs_long_equals_option_blocks(self) -> None:
        self._assert_blocked(
            "parallel --jobs=2 rm -rf {} ::: /",
            "root or home",
            cwd=str(self.tmpdir),
        )

    def test_parallel_unknown_long_option_is_ignored_for_template_parsing(self) -> None:
        self._assert_blocked(
            "parallel --eta rm -rf {} ::: /",
            "root or home",
            cwd=str(self.tmpdir),
        )

    def test_parallel_unknown_short_option_ignored_for_template_parsing(self) -> None:
        self._assert_blocked(
            "parallel -q rm -rf {} ::: /",
            "root or home",
            cwd=str(self.tmpdir),
        )

    def test_parallel_busybox_find_delete_blocked(self) -> None:
        self._assert_blocked(
            "parallel busybox find . -delete ::: ok",
            "find -delete",
        )

    def test_parallel_stdin_mode_blocks_rm_rf(self) -> None:
        self._assert_blocked(
            "echo / | parallel rm -rf",
            "rm -rf",
        )

    def test_parallel_busybox_stdin_mode_blocks_rm_rf(self) -> None:
        self._assert_blocked(
            "echo / | parallel busybox rm -rf",
            "rm -rf",
        )

    def test_parallel_bash_c_stdin_mode_blocks_rm_rf_placeholder(self) -> None:
        self._assert_blocked(
            "echo / | parallel bash -c 'rm -rf {}'",
            "rm -rf",
        )

    def test_parallel_commands_mode_blocks_rm_rf(self) -> None:
        self._assert_blocked(
            "parallel ::: 'rm -rf /'",
            "rm -rf",
        )

    def test_parallel_commands_mode_allows_when_all_commands_safe(self) -> None:
        self._assert_allowed("parallel ::: 'echo ok' 'true'")

    def test_parallel_rm_rf_args_after_marker_without_placeholder_blocked(self) -> None:
        self._assert_blocked(
            "parallel rm -rf ::: /",
            "root or home",
        )

    def test_parallel_rm_rf_with_replacement_args_analyzed(self) -> None:
        self._assert_blocked(
            "parallel rm -rf {} ::: /",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_parallel_bash_c_rm_rf_with_replacement_args_analyzed(self) -> None:
        self._assert_blocked(
            "parallel bash -c 'rm -rf {}' ::: /",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_parallel_busybox_rm_rf_with_replacement_args_analyzed(self) -> None:
        self._assert_blocked(
            "parallel busybox rm -rf {} ::: /",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_parallel_rm_rf_with_safe_replacement_allowed(self) -> None:
        self._assert_allowed(
            "parallel rm -rf {} ::: build",
            cwd=str(self.tmpdir),
        )

    def test_parallel_bash_c_rm_rf_with_safe_replacement_allowed(self) -> None:
        self._assert_allowed(
            "parallel bash -c 'rm -rf {}' ::: build",
            cwd=str(self.tmpdir),
        )

    def test_parallel_busybox_rm_rf_with_safe_replacement_allowed(self) -> None:
        self._assert_allowed(
            "parallel busybox rm -rf {} ::: build",
            cwd=str(self.tmpdir),
        )

    def test_parallel_bash_c_without_placeholder_analyzes_script(self) -> None:
        self._assert_blocked(
            "parallel bash -c 'git reset --hard' ::: ok",
            "git reset --hard",
        )

    def test_parallel_bash_c_without_placeholder_allows_safe_script(self) -> None:
        self._assert_allowed("parallel bash -c 'echo ok' ::: ok")

    def test_parallel_busybox_rm_rf_args_after_marker_without_placeholder_blocked(
        self,
    ) -> None:
        self._assert_blocked(
            "parallel busybox rm -rf ::: /",
            "root or home",
        )

    def test_parallel_busybox_find_without_delete_allowed(self) -> None:
        self._assert_allowed("parallel busybox find . -name foo ::: ok")

    def test_parallel_git_reset_hard_blocked(self) -> None:
        self._assert_blocked(
            "parallel git reset --hard ::: ok",
            "git reset --hard",
        )

    def test_parallel_find_delete_blocked(self) -> None:
        self._assert_blocked(
            "parallel find . -delete ::: ok",
            "find -delete",
        )

    def test_parallel_find_without_delete_allowed(self) -> None:
        self._assert_allowed("parallel find . -name foo ::: ok")

    def test_busybox_find_delete_blocked(self) -> None:
        self._assert_blocked("busybox find . -delete", "find -delete")

    def test_busybox_find_without_delete_allowed(self) -> None:
        self._assert_allowed("busybox find . -name foo")

    def test_parallel_stdin_without_template_allowed(self) -> None:
        self._assert_allowed("echo ok | parallel")

    def test_parallel_marker_without_template_allowed(self) -> None:
        self._assert_allowed("parallel :::")

    def test_or_operator_split_blocked(self) -> None:
        self._assert_blocked(
            "git status || git reset --hard",
            "git reset --hard",
        )

    def test_semicolon_split_blocked(self) -> None:
        self._assert_blocked(
            "git status; git reset --hard",
            "git reset --hard",
        )

    def test_newline_split_blocked(self) -> None:
        self._assert_blocked(
            "git status\ngit reset --hard",
            "git reset --hard",
        )

    def test_redirection_ampersand_does_not_split_blocked(self) -> None:
        self._assert_blocked(
            "echo ok 2>&1 && git reset --hard",
            "git reset --hard",
        )

    def test_redirection_ampersand_greater_does_not_split_blocked(self) -> None:
        self._assert_blocked(
            "echo ok &>out && git reset --hard",
            "git reset --hard",
        )

    def test_sudo_double_dash_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "sudo -- git reset --hard",
            "git reset --hard",
        )

    def test_env_unset_equals_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env --unset=PATH git reset --hard",
            "git reset --hard",
        )

    def test_env_unset_attached_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -uPATH git reset --hard",
            "git reset --hard",
        )

    def test_env_C_attached_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -C/tmp git reset --hard",
            "git reset --hard",
        )

    def test_env_C_separate_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -C /tmp git reset --hard",
            "git reset --hard",
        )

    def test_env_P_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -P /usr/bin git reset --hard",
            "git reset --hard",
        )

    def test_env_S_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -S 'PATH=/usr/bin' git reset --hard",
            "git reset --hard",
        )

    def test_env_dash_breaks_option_scan_still_blocks(self) -> None:
        self._assert_blocked(
            "env - git reset --hard",
            "git reset --hard",
        )

    def test_command_combined_short_opts_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "command -pv -- git reset --hard",
            "git reset --hard",
        )

    def test_command_V_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "command -V git reset --hard",
            "git reset --hard",
        )

    def test_command_combined_short_opts_with_V_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "command -pvV -- git reset --hard",
            "git reset --hard",
        )

    def test_env_assignments_stripped_blocked(self) -> None:
        self._assert_blocked(
            "FOO=1 BAR=2 git reset --hard",
            "git reset --hard",
        )

    def test_invalid_env_assignment_key_does_not_strip_still_blocks(self) -> None:
        self._assert_blocked(
            "1A=2 git reset --hard",
            "git reset --hard",
        )

    def test_invalid_env_assignment_chars_does_not_strip_still_blocks(self) -> None:
        self._assert_blocked(
            "A-B=2 git reset --hard",
            "git reset --hard",
        )

    def test_empty_env_assignment_key_does_not_strip_still_blocks(self) -> None:
        self._assert_blocked(
            "=2 git reset --hard",
            "git reset --hard",
        )

    def test_strict_mode_python_one_liner_allowed(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_allowed('python -c "print(\'ok\')"')

    def test_paranoid_mode_python_one_liner_denies(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_PARANOID_INTERPRETERS": "1"}):
            self._assert_blocked(
                'python -c "print(\'ok\')"',
                "SAFETY_NET_PARANOID",
            )

    def test_global_paranoid_mode_python_one_liner_denies(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_PARANOID": "1"}):
            self._assert_blocked(
                'python -c "print(\'ok\')"',
                "SAFETY_NET_PARANOID",
            )

    def test_strict_mode_bash_lc_without_arg_denies(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_blocked(
                "bash -lc",
                "shell -c wrapper",
            )

    def test_strict_mode_bash_without_dash_c_allowed(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_allowed("bash -l echo ok")

    def test_strict_mode_bash_only_allowed(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_allowed("bash")

    def test_strict_mode_bash_double_dash_does_not_treat_dash_c_as_wrapper_allowed(
        self,
    ) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_allowed("bash -- -c 'echo ok'")

    def test_deny_output_truncates_long_command(self) -> None:
        long_cmd = "git reset --hard " + ("a" * 400)
        output = self._run_guard(long_cmd)
        self.assertIsNotNone(output)
        assert output is not None
        reason = output["hookSpecificOutput"]["permissionDecisionReason"]
        self.assertIn("…", reason)
        self.assertNotIn("a" * 350, reason)

    def test_unparseable_echo_mentions_find_delete_allowed(self) -> None:
        self._assert_allowed('echo "find . -delete')

    def test_unparseable_rg_mentions_find_delete_allowed(self) -> None:
        self._assert_allowed('rg "find . -delete')

    def test_strict_mode_python_without_one_liner_allowed(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_allowed("python script.py")

    def test_node_e_dangerous_blocked(self) -> None:
        self._assert_blocked('node -e "rm -rf /"', "rm -rf")

    def test_node_e_safe_allowed(self) -> None:
        self._assert_allowed('node -e "console.log(\"ok\")"')

    def test_ruby_e_dangerous_blocked(self) -> None:
        self._assert_blocked('ruby -e "rm -rf /"', "rm -rf")

    def test_ruby_e_safe_allowed(self) -> None:
        self._assert_allowed("ruby -e \"puts 'ok'\"")

    def test_perl_e_dangerous_blocked(self) -> None:
        self._assert_blocked("perl -e \"rm -rf /\"", "rm -rf")

    def test_perl_e_safe_allowed(self) -> None:
        self._assert_allowed("perl -e \"print 'ok'\"")

    def test_strict_mode_python_double_dash_does_not_treat_dash_c_as_one_liner_allowed(
        self,
    ) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_allowed("python -- -c 'print(1)'")

    def test_non_strict_unparseable_git_restore_worktree_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git restore --worktree file.txt 'unterminated",
            "git restore --worktree",
        )

    def test_non_strict_unparseable_git_stash_clear_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git stash clear 'unterminated",
            "git stash clear",
        )

    def test_non_strict_unparseable_git_branch_D_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git branch -D feature 'unterminated",
            "git branch -D",
        )

    def test_non_strict_unparseable_git_reset_hard_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git reset --hard 'unterminated",
            "git reset --hard",
        )

    def test_non_strict_unparseable_git_reset_merge_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git reset --merge 'unterminated",
            "git reset --merge",
        )

    def test_non_strict_unparseable_git_clean_f_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git clean -f 'unterminated",
            "git clean -f",
        )

    def test_non_strict_unparseable_git_stash_drop_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git stash drop stash@{0} 'unterminated",
            "git stash drop",
        )

    def test_non_strict_unparseable_git_push_force_still_blocked_by_heuristic(
        self,
    ) -> None:
        self._assert_blocked(
            "git push --force origin main 'unterminated",
            "Force push",
        )

    def test_cwd_empty_string_treated_as_unknown(self) -> None:
        self._assert_blocked("git reset --hard", "git reset --hard", cwd="")

    def test_segment_changes_cwd_regex_fallback_on_unparseable(self) -> None:
        self.assertTrue(_segment_changes_cwd("cd 'unterminated"))

    def test_analyze_segment_empty_returns_none(self) -> None:
        self.assertIsNone(
            _analyze_segment(
                "   ",
                depth=0,
                cwd=None,
                strict=False,
                paranoid_rm=False,
                paranoid_interpreters=False,
            )
        )

    def test_xargs_replacement_tokens_can_terminate_without_break(self) -> None:
        self.assertEqual(_xargs_replacement_tokens(["xargs", "--replace"]), {"{}"})

    def test_segment_changes_cwd_builtin_only_is_false(self) -> None:
        self.assertFalse(_segment_changes_cwd("builtin"))

    def test_shell_split_with_leading_operator_still_blocks(self) -> None:
        self._assert_blocked("&& git reset --hard", "git reset --hard")

    def test_shell_split_with_leading_pipe_still_blocks(self) -> None:
        self._assert_blocked("| git reset --hard", "git reset --hard")

    def test_shell_dash_c_recursion_limit_reached_denies(self) -> None:
        cmd = "rm -rf /some/path"
        for _ in range(6):
            cmd = f"bash -c {shlex.quote(cmd)}"
        self._assert_blocked(cmd, "recursion limit")

    def test_sudo_option_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "sudo -u root -- git reset --hard",
            "git reset --hard",
        )

    def test_env_P_attached_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -P/usr/bin git reset --hard",
            "git reset --hard",
        )

    def test_env_S_attached_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -SPATH=/usr/bin git reset --hard",
            "git reset --hard",
        )

    def test_env_unknown_option_wrapper_bypass_blocked(self) -> None:
        self._assert_blocked(
            "env -i git reset --hard",
            "git reset --hard",
        )

    def test_command_unknown_short_opts_not_stripped_still_blocks(self) -> None:
        self._assert_blocked(
            "command -px git reset --hard",
            "git reset --hard",
        )

    def test_only_env_assignments_allowed(self) -> None:
        self._assert_allowed("FOO=1")

    def test_shell_split_with_leading_pipe_stderr_operator_still_blocks(self) -> None:
        self._assert_blocked("|& git reset --hard", "git reset --hard")

    def test_shell_split_with_leading_background_operator_still_blocks(self) -> None:
        self._assert_blocked("& git reset --hard", "git reset --hard")

    def test_shell_split_with_trailing_separator_ignored_allowed(self) -> None:
        self._assert_allowed("git status;")
