"""Tests for safety-net rm -rf handling."""

import os
from unittest import mock

from .safety_net_test_base import SafetyNetTestCase


class RmRfBlockedTests(SafetyNetTestCase):
    # rm -rf
    def test_rm_rf_blocked(self) -> None:
        self._assert_blocked("rm -rf /some/path", "rm -rf")

    def test_rm_rf_home_blocked(self) -> None:
        self._assert_blocked("rm -rf ~/projects", "rm -rf")

    def test_rm_fr_blocked(self) -> None:
        self._assert_blocked("rm -fr /some/path", "rm -rf")

    def test_rm_rf_background_bypass_blocked(self) -> None:
        self._assert_blocked("true & rm -rf /some/path", "rm -rf")

    def test_rm_rf_tmp_traversal_escape_blocked(self) -> None:
        self._assert_blocked("rm -rf /tmp/../Users/some/path", "rm -rf")

    def test_rm_rf_bin_path_blocked(self) -> None:
        self._assert_blocked("/bin/rm -rf /some/path", "rm -rf")

    def test_rm_rf_busybox_blocked(self) -> None:
        self._assert_blocked("busybox rm -rf /some/path", "rm -rf")

    def test_rm_rf_bash_c_blocked(self) -> None:
        self._assert_blocked("bash -c 'rm -rf /some/path'", "rm -rf")

    def test_python_c_system_rm_rf_blocked(self) -> None:
        self._assert_blocked(
            'python -c "import os; os.system("rm -rf /some/path")"',
            "rm -rf",
        )

    def test_command_substitution_rm_rf_blocked(self) -> None:
        self._assert_blocked("echo $(rm -rf /some/path)", "rm -rf")

    def test_tmpdir_assignment_not_trusted_blocked(self) -> None:
        self._assert_blocked(
            "TMPDIR=/Users rm -rf $TMPDIR/test-dir",
            "rm -rf",
        )


class RmRfAllowedTests(SafetyNetTestCase):
    # rm -rf on temp directories
    def test_rm_rf_tmp_allowed(self) -> None:
        self._assert_allowed("rm -rf /tmp/test-dir")

    def test_rm_rf_var_tmp_allowed(self) -> None:
        self._assert_allowed("rm -rf /var/tmp/test-dir")

    def test_rm_rf_tmpdir_allowed(self) -> None:
        self._assert_allowed("rm -rf $TMPDIR/test-dir")

    def test_rm_rf_tmpdir_braces_allowed(self) -> None:
        self._assert_allowed("rm -rf ${TMPDIR}/test-dir")

    def test_rm_rf_tmpdir_quoted_allowed(self) -> None:
        self._assert_allowed('rm -rf "$TMPDIR/test-dir"')

    def test_bin_rm_rf_tmp_allowed(self) -> None:
        self._assert_allowed("/bin/rm -rf /tmp/test-dir")

    def test_busybox_rm_rf_tmp_allowed(self) -> None:
        self._assert_allowed("busybox rm -rf /tmp/test-dir")


class RmRfCwdAwareTests(SafetyNetTestCase):
    def test_rm_rf_relative_path_in_home_cwd_blocked(self) -> None:
        with mock.patch.dict(os.environ, {"HOME": str(self.tmpdir)}):
            self._assert_blocked("rm -rf build", "rm -rf", cwd=str(self.tmpdir))

    def test_rm_rf_relative_path_in_subdir_of_home_allowed(self) -> None:
        repo = self.tmpdir / "repo"
        repo.mkdir()
        with mock.patch.dict(os.environ, {"HOME": str(self.tmpdir)}):
            self._assert_allowed("rm -rf build", cwd=str(repo))

    def test_rm_rf_relative_path_allowed(self) -> None:
        self._assert_allowed("rm -rf build", cwd=str(self.tmpdir))

    def test_rm_rf_dot_slash_path_allowed(self) -> None:
        self._assert_allowed("rm -rf ./dist", cwd=str(self.tmpdir))

    def test_rm_rf_escapes_cwd_blocked(self) -> None:
        self._assert_blocked("rm -rf ../other", "rm -rf", cwd=str(self.tmpdir))

    def test_rm_rf_absolute_outside_cwd_blocked(self) -> None:
        self._assert_blocked("rm -rf /other/path", "rm -rf", cwd=str(self.tmpdir))

    def test_rm_rf_absolute_inside_cwd_allowed(self) -> None:
        inside = self.tmpdir / "dist"
        self._assert_allowed(f"rm -rf {inside}", cwd=str(self.tmpdir))

    def test_rm_rf_dot_blocked(self) -> None:
        self._assert_blocked("rm -rf .", "rm -rf", cwd=str(self.tmpdir))

    def test_rm_rf_after_cd_bypasses_cwd_allowlist_blocked(self) -> None:
        self._assert_blocked("cd .. && rm -rf build", "rm -rf", cwd=str(self.tmpdir))

    def test_rm_rf_after_grouped_cd_bypasses_cwd_allowlist_blocked(self) -> None:
        self._assert_blocked(
            "{ cd ..; rm -rf build; }",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_rm_rf_after_subshell_cd_bypasses_cwd_allowlist_blocked(self) -> None:
        self._assert_blocked(
            "( cd ..; rm -rf build )",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_rm_rf_after_command_substitution_cd_bypasses_cwd_allowlist_blocked(
        self,
    ) -> None:
        self._assert_blocked(
            "$( cd ..; rm -rf build )",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_rm_rf_after_pushd_bypasses_cwd_allowlist_blocked(self) -> None:
        self._assert_blocked(
            "pushd .. && rm -rf build",
            "rm -rf",
            cwd=str(self.tmpdir),
        )

    def test_rm_rf_pwd_traversal_blocked(self) -> None:
        self._assert_blocked("rm -rf $PWD/../other", "rm -rf", cwd=str(self.tmpdir))

    def test_rm_rf_strict_mode_blocks_all(self) -> None:
        with mock.patch.dict(os.environ, {"SAFETY_NET_STRICT": "1"}):
            self._assert_blocked(
                "rm -rf build", "unset SAFETY_NET_STRICT", cwd=str(self.tmpdir)
            )
