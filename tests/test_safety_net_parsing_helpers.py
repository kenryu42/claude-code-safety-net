"""Targeted unit tests for helper parsers in the safety net hook.

These focus on option-scanning branches that are hard to hit via end-to-end
command strings, improving confidence (and coverage) of the parsing logic.
"""

import importlib.util
import sys
from pathlib import Path
from unittest import TestCase, mock

from scripts.safety_net_impl.hook import (
    _extract_parallel_template_and_args,
    _extract_xargs_child_command,
    _find_has_delete,
    _rm_has_recursive_force,
    _xargs_replacement_tokens,
)
from scripts.safety_net_impl.rules_git import (
    _checkout_positional_args,
    _git_subcommand_and_rest,
)
from scripts.safety_net_impl.shell import _short_opts


class HookParsingHelpersTests(TestCase):
    def test_short_opts_stops_at_double_dash(self) -> None:
        # given: tokens with -Ap after -- (a filename, not options)
        # when: extracting short options
        # then: A and p should NOT be in the result
        self.assertEqual(_short_opts(["git", "add", "--", "-Ap"]), set())
        self.assertEqual(_short_opts(["rm", "-r", "--", "-f"]), {"r"})

    def test_short_opts_extracts_before_double_dash(self) -> None:
        # given: tokens with options before --
        # when: extracting short options
        # then: only options before -- are extracted
        self.assertEqual(
            _short_opts(["git", "-v", "add", "-n", "--", "-x"]), {"v", "n"}
        )

    def test_rm_has_recursive_force_empty_tokens_false(self) -> None:
        self.assertFalse(_rm_has_recursive_force([]))

    def test_rm_has_recursive_force_stops_at_double_dash(self) -> None:
        # -f after `--` is a positional arg, not an option.
        self.assertFalse(_rm_has_recursive_force(["rm", "-r", "--", "-f"]))

    def test_find_has_delete_exec_without_terminator_ignored(self) -> None:
        # Un-terminated -exec should not cause a false positive on -delete.
        self.assertFalse(_find_has_delete(["-exec", "echo", "-delete"]))

    def test_extract_xargs_child_command_none_when_not_xargs(self) -> None:
        self.assertIsNone(_extract_xargs_child_command(["echo", "ok"]))

    def test_extract_xargs_child_command_none_when_unspecified(self) -> None:
        self.assertIsNone(_extract_xargs_child_command(["xargs"]))

    def test_extract_xargs_child_command_double_dash_starts_child(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "--", "rm", "-rf"]),
            ["rm", "-rf"],
        )

    def test_extract_xargs_child_command_long_option_consumes_value(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "--max-args", "5", "rm", "-rf"]),
            ["rm", "-rf"],
        )

    def test_extract_xargs_child_command_long_option_equals_form(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "--max-args=5", "rm"]),
            ["rm"],
        )

    def test_extract_xargs_child_command_short_option_attached_form(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "-n1", "rm"]),
            ["rm"],
        )

    def test_extract_xargs_child_command_dash_i_does_not_consume_child(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "-i", "rm", "-rf"]),
            ["rm", "-rf"],
        )

    def test_extract_xargs_child_command_unknown_short_option_skipped(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "-Z", "rm"]),
            ["rm"],
        )

    def test_extract_xargs_child_command_dash_token_ends_option_scan(self) -> None:
        self.assertEqual(
            _extract_xargs_child_command(["xargs", "-", "rm"]),
            ["-", "rm"],
        )

    def test_extract_xargs_child_command_more_attached_forms(self) -> None:
        cases: list[tuple[list[str], list[str] | None]] = [
            (["xargs", "-P4", "rm"], ["rm"]),
            (["xargs", "-L2", "rm"], ["rm"]),
            (["xargs", "-R1", "rm"], ["rm"]),
            (["xargs", "-S1", "rm"], ["rm"]),
            (["xargs", "-s256", "rm"], ["rm"]),
            (["xargs", "-a/tmp/paths", "rm"], ["rm"]),
            (["xargs", "-d,", "rm"], ["rm"]),
            (["xargs", "-EEOF", "rm"], ["rm"]),
            (["xargs", "-J%", "rm", "-rf"], ["rm", "-rf"]),
            (["xargs", "--eof=EOF", "rm"], ["rm"]),
            (["xargs", "--process-slot-var=VAR", "rm"], ["rm"]),
        ]
        for tokens, expected in cases:
            with self.subTest(tokens=tokens):
                self.assertEqual(_extract_xargs_child_command(tokens), expected)

    def test_extract_xargs_child_command_long_consumes_value_missing_value_none(
        self,
    ) -> None:
        self.assertIsNone(_extract_xargs_child_command(["xargs", "--max-args"]))

    def test_xargs_replacement_tokens_I_and_i_and_replace(self) -> None:
        self.assertEqual(_xargs_replacement_tokens(["echo", "ok"]), set())
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "-I", "{}", "rm"]),
            {"{}"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "-I%", "rm"]),
            {"%"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "-i", "rm"]),
            {"{}"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "-i%", "rm"]),
            {"%"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "--replace", "rm"]),
            {"{}"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "--replace=%", "rm"]),
            {"%"},
        )

    def test_xargs_replacement_tokens_I_missing_value_breaks(self) -> None:
        self.assertEqual(_xargs_replacement_tokens(["xargs", "-I"]), set())

    def test_xargs_replacement_tokens_J_and_replace_str_and_double_dash(self) -> None:
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "-J", "%", "rm"]),
            {"%"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "-J%", "rm"]),
            {"%"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "--replace-str", "rm"]),
            {"{}"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "--replace=", "rm"]),
            {"{}"},
        )
        self.assertEqual(
            _xargs_replacement_tokens(["xargs", "--", "-i", "rm"]),
            set(),
        )

    def test_extract_parallel_template_and_args_dynamic(self) -> None:
        self.assertEqual(
            _extract_parallel_template_and_args(["parallel", "rm", "-rf"]),
            (["rm", "-rf"], [], True),
        )

    def test_extract_parallel_template_and_args_marker(self) -> None:
        self.assertEqual(
            _extract_parallel_template_and_args(
                ["parallel", "rm", "-rf", "{}", ":::", "/"]
            ),
            (["rm", "-rf", "{}"], ["/"], False),
        )

    def test_extract_parallel_template_and_args_consumes_options(self) -> None:
        self.assertEqual(
            _extract_parallel_template_and_args(
                ["parallel", "--results", "out", "rm", "-rf", ":::", "/"]
            ),
            (["rm", "-rf"], ["/"], False),
        )
        self.assertEqual(
            _extract_parallel_template_and_args(
                [
                    "parallel",
                    "--results=out",
                    "-j4",
                    "--",
                    "rm",
                    "-rf",
                    ":::",
                    "/",
                ]
            ),
            (["rm", "-rf"], ["/"], False),
        )

    def test_extract_parallel_template_and_args_more_options(self) -> None:
        cases: list[tuple[list[str], tuple[list[str], list[str], bool] | None]] = [
            (["echo", "ok"], None),
            (["parallel"], ([], [], True)),
            (["parallel", ":::"], ([], [], False)),
            (["parallel", "-S", "login", "rm", ":::", "/"], (["rm"], ["/"], False)),
            (["parallel", "-Slogin", "rm", ":::", "/"], (["rm"], ["/"], False)),
            (["parallel", "--tmpdir=/tmp", "rm", ":::", "/"], (["rm"], ["/"], False)),
            (
                [
                    "parallel",
                    "--sshloginfile",
                    "hosts.txt",
                    "rm",
                    ":::",
                    "/",
                ],
                (["rm"], ["/"], False),
            ),
        ]
        for tokens, expected in cases:
            with self.subTest(tokens=tokens):
                self.assertEqual(_extract_parallel_template_and_args(tokens), expected)


class GitRulesHelpersTests(TestCase):
    def test_git_subcommand_and_rest_non_git_none(self) -> None:
        self.assertEqual(_git_subcommand_and_rest(["echo", "ok"]), (None, []))

    def test_git_subcommand_and_rest_git_only_none(self) -> None:
        self.assertEqual(_git_subcommand_and_rest(["git"]), (None, []))

    def test_git_subcommand_and_rest_unknown_short_option_skipped(self) -> None:
        self.assertEqual(
            _git_subcommand_and_rest(["git", "-x", "reset", "--hard"]),
            ("reset", ["--hard"]),
        )

    def test_git_subcommand_and_rest_unknown_long_option_equals_skipped(self) -> None:
        self.assertEqual(
            _git_subcommand_and_rest(["git", "--unknown=1", "reset", "--hard"]),
            ("reset", ["--hard"]),
        )

    def test_git_subcommand_and_rest_opts_with_value_separate_consumed(self) -> None:
        self.assertEqual(
            _git_subcommand_and_rest(["git", "-c", "foo=bar", "reset"]),
            ("reset", []),
        )

    def test_checkout_positional_args_attached_short_opts_ignored(self) -> None:
        self.assertEqual(
            _checkout_positional_args(["-bnew", "main", "file.txt"]),
            ["main", "file.txt"],
        )
        self.assertEqual(
            _checkout_positional_args(["-U3", "main"]),
            ["main"],
        )

    def test_checkout_positional_args_long_equals_ignored(self) -> None:
        self.assertEqual(
            _checkout_positional_args(["--pathspec-from-file=paths.txt", "main"]),
            ["main"],
        )

    def test_checkout_positional_args_unknown_long_consumes_value(self) -> None:
        self.assertEqual(
            _checkout_positional_args(["--unknown", "main", "file.txt"]),
            ["file.txt"],
        )
        self.assertEqual(
            _checkout_positional_args(["--unknown", "-q", "main"]),
            ["main"],
        )

    def test_checkout_positional_args_double_dash_breaks(self) -> None:
        self.assertEqual(_checkout_positional_args(["--", "file.txt"]), [])

    def test_checkout_positional_args_optional_value_options(self) -> None:
        self.assertEqual(
            _checkout_positional_args(
                ["--recurse-submodules", "checkout", "main", "file.txt"]
            ),
            ["main", "file.txt"],
        )
        self.assertEqual(
            _checkout_positional_args(["--recurse-submodules", "main", "file.txt"]),
            ["main", "file.txt"],
        )
        self.assertEqual(
            _checkout_positional_args(["--track", "direct", "main"]),
            ["main"],
        )
        self.assertEqual(
            _checkout_positional_args(["--track", "main", "file.txt"]),
            ["main", "file.txt"],
        )

    def test_checkout_positional_args_unknown_short_option_skipped(self) -> None:
        self.assertEqual(_checkout_positional_args(["-x", "main"]), ["main"])


class SafetyNetEntrypointFallbackTests(TestCase):
    def test_scripts_entrypoint_import_fallback(self) -> None:
        repo_root = Path(__file__).resolve().parents[1]
        scripts_dir = repo_root / "scripts"
        entrypoint = scripts_dir / "safety_net.py"

        # Make the fallback import path (`safety_net_impl.*`) resolvable.
        added_sys_path = False
        if str(scripts_dir) not in sys.path:
            sys.path.insert(0, str(scripts_dir))
            added_sys_path = True

        real_import = __import__

        def _fake_import(name: str, globals=None, locals=None, fromlist=(), level=0):
            if name == "scripts.safety_net_impl.hook":
                raise ImportError("forced")
            return real_import(name, globals, locals, fromlist, level)

        try:
            sys.modules.pop("scripts.safety_net_impl.hook", None)

            spec = importlib.util.spec_from_file_location(
                "safety_net_fallback", entrypoint
            )
            assert spec is not None
            assert spec.loader is not None
            mod = importlib.util.module_from_spec(spec)

            with mock.patch("builtins.__import__", side_effect=_fake_import):
                spec.loader.exec_module(mod)

            # The fallback import should bind _impl_main from safety_net_impl.hook.
            self.assertTrue(mod._impl_main.__module__.endswith("safety_net_impl.hook"))
        finally:
            if added_sys_path:
                sys.path.remove(str(scripts_dir))
