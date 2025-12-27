"""Tests for safety-net find command handling."""

from .safety_net_test_base import SafetyNetTestCase


class FindDeleteTests(SafetyNetTestCase):
    def test_find_delete_blocked(self) -> None:
        self._assert_blocked(
            'find . -name "*.pyc" -delete',
            "find -delete",
        )

    def test_find_name_argument_delete_allowed(self) -> None:
        self._assert_allowed("find . -name -delete -print")

    def test_find_exec_echo_delete_allowed(self) -> None:
        self._assert_allowed("find . -exec echo -delete \\; -print")

    def test_find_exec_plus_terminator_mentions_delete_allowed(self) -> None:
        self._assert_allowed("find . -exec echo -delete + -print")

    def test_busybox_find_delete_blocked(self) -> None:
        self._assert_blocked(
            'busybox find . -name "*.pyc" -delete',
            "find -delete",
        )

    def test_find_print_allowed(self) -> None:
        self._assert_allowed('find . -name "*.pyc" -print')

    def test_echo_mentions_find_delete_allowed(self) -> None:
        self._assert_allowed('echo "find . -name *.pyc -delete"')

    def test_rg_mentions_find_delete_allowed(self) -> None:
        self._assert_allowed('rg "find .* -delete" file.txt')

    def test_python_c_system_find_delete_blocked(self) -> None:
        self._assert_blocked(
            'python -c "import os; os.system(\\"find . -delete\\")"',
            "find -delete",
        )
