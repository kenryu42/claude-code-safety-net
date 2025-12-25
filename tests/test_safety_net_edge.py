"""Tests for safety-net edge cases and strict modes."""

import io
import json
import os
from unittest import mock

from scripts import safety_net

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
