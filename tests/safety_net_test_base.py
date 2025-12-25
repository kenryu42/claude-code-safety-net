"""Shared helpers for safety-net tests."""

import io
import json
from unittest import mock

from scripts import safety_net

from . import TempDirTestCase


class SafetyNetTestCase(TempDirTestCase):
    """Base test case with helpers for running the safety-net guard."""

    def _run_guard(self, command: str, *, cwd: str | None = None) -> dict | None:
        """Run the guard with a Bash command and return parsed output or None."""
        input_data: dict = {"tool_name": "Bash", "tool_input": {"command": command}}
        if cwd is not None:
            input_data["cwd"] = cwd
        with mock.patch("sys.stdin", io.StringIO(json.dumps(input_data))):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as mock_stdout:
                result = safety_net.main()
                output = mock_stdout.getvalue()

        self.assertEqual(result, 0)
        if output.strip():
            parsed: dict = json.loads(output)
            return parsed
        return None

    def _assert_blocked(
        self, command: str, reason_contains: str, *, cwd: str | None = None
    ) -> None:
        """Assert that a command is blocked with a reason containing the given text."""
        output = self._run_guard(command, cwd=cwd)
        self.assertIsNotNone(output, f"Expected {command!r} to be blocked")
        assert output is not None
        hook_output = output.get("hookSpecificOutput", {})
        self.assertEqual(hook_output.get("permissionDecision"), "deny")
        reason = hook_output.get("permissionDecisionReason", "")
        self.assertIn(reason_contains, reason)

    def _assert_allowed(self, command: str, *, cwd: str | None = None) -> None:
        """Assert that a command is allowed (no output)."""
        output = self._run_guard(command, cwd=cwd)
        self.assertIsNone(output, f"Expected {command!r} to be allowed, got {output}")
