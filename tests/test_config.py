"""Tests for config loading and validation."""

import json

from scripts.safety_net_impl.config import (
    Config,
    load_config,
    validate_config_file,
)

from . import TempDirTestCase


class TestConfigValidation(TempDirTestCase):
    """Tests for config schema validation."""

    def _write_project_config(self, data: dict | str) -> None:
        """Write config to project scope (.safety-net.json in tmpdir)."""
        path = self.tmpdir / ".safety-net.json"
        if isinstance(data, str):
            path.write_text(data, encoding="utf-8")
        else:
            path.write_text(json.dumps(data), encoding="utf-8")

    def _load_from_project(self, data: dict | str) -> Config | None:
        """Write config to project scope and load."""
        self._write_project_config(data)
        return load_config(cwd=str(self.tmpdir))

    # --- Valid configs ---

    def test_minimal_valid_config(self) -> None:
        """Minimal config with just version is valid."""
        config = self._load_from_project({"version": 1})
        assert config is not None
        self.assertEqual(config.version, 1)
        self.assertEqual(config.rules, [])

    def test_valid_config_with_rules(self) -> None:
        """Config with valid rules parses correctly."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "block-git-add-all",
                        "command": "git",
                        "subcommand": "add",
                        "block_args": ["-A", "--all"],
                        "reason": "Use specific files.",
                    }
                ],
            }
        )
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        rule = config.rules[0]
        self.assertEqual(rule.name, "block-git-add-all")
        self.assertEqual(rule.command, "git")
        self.assertEqual(rule.subcommand, "add")
        self.assertEqual(rule.block_args, ["-A", "--all"])
        self.assertEqual(rule.reason, "Use specific files.")

    def test_valid_config_without_subcommand(self) -> None:
        """Rule without subcommand is valid."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "block-npm-global",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "No global installs.",
                    }
                ],
            }
        )
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertIsNone(config.rules[0].subcommand)

    def test_valid_rule_name_patterns(self) -> None:
        """Various valid rule name patterns."""
        valid_names = [
            "a",
            "A",
            "rule1",
            "my-rule",
            "my_rule",
            "MyRule123",
            "a" * 64,  # max length
        ]
        for name in valid_names:
            config = self._load_from_project(
                {
                    "version": 1,
                    "rules": [
                        {
                            "name": name,
                            "command": "git",
                            "block_args": ["-A"],
                            "reason": "test",
                        }
                    ],
                }
            )
            assert config is not None, f"Name {name!r} should be valid"
            self.assertEqual(config.rules[0].name, name)

    def test_unknown_fields_ignored(self) -> None:
        """Unknown fields are ignored for forward compatibility."""
        config = self._load_from_project(
            {
                "version": 1,
                "future_field": "ignored",
                "rules": [
                    {
                        "name": "test",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "test",
                        "unknown_rule_field": True,
                    }
                ],
            }
        )
        assert config is not None
        self.assertEqual(len(config.rules), 1)

    # --- Invalid configs (all return None silently) ---

    def test_invalid_json_syntax(self) -> None:
        """Invalid JSON returns None silently."""
        config = self._load_from_project("{ invalid json }")
        self.assertIsNone(config)

    def test_missing_version(self) -> None:
        """Missing version field returns None."""
        config = self._load_from_project({"rules": []})
        self.assertIsNone(config)

    def test_wrong_version_number(self) -> None:
        """Version != 1 returns None."""
        config = self._load_from_project({"version": 2})
        self.assertIsNone(config)

    def test_version_not_integer(self) -> None:
        """Version must be integer, otherwise None."""
        config = self._load_from_project({"version": "1"})
        self.assertIsNone(config)

    def test_missing_required_rule_fields(self) -> None:
        """Missing required rule fields returns None."""
        # Missing name
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [{"command": "git", "block_args": ["-A"], "reason": "x"}],
            }
        )
        self.assertIsNone(config)

        # Missing command
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [{"name": "test", "block_args": ["-A"], "reason": "x"}],
            }
        )
        self.assertIsNone(config)

        # Missing block_args
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [{"name": "test", "command": "git", "reason": "x"}],
            }
        )
        self.assertIsNone(config)

        # Missing reason
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [{"name": "test", "command": "git", "block_args": ["-A"]}],
            }
        )
        self.assertIsNone(config)

    def test_invalid_name_patterns(self) -> None:
        """Invalid rule name patterns return None."""
        invalid_names = [
            "1rule",  # starts with number
            "-rule",  # starts with hyphen
            "_rule",  # starts with underscore
            "rule with space",  # contains space
            "rule.name",  # contains dot
            "a" * 65,  # too long
            "",  # empty
        ]
        for name in invalid_names:
            config = self._load_from_project(
                {
                    "version": 1,
                    "rules": [
                        {
                            "name": name,
                            "command": "git",
                            "block_args": ["-A"],
                            "reason": "test",
                        }
                    ],
                }
            )
            self.assertIsNone(config, f"Name {name!r} should return None")

    def test_invalid_command_patterns(self) -> None:
        """Invalid command patterns return None."""
        invalid_commands = [
            "/usr/bin/git",  # path, not just command
            "git add",  # contains space
            "1git",  # starts with number
            "",  # empty
        ]
        for cmd in invalid_commands:
            config = self._load_from_project(
                {
                    "version": 1,
                    "rules": [
                        {
                            "name": "test",
                            "command": cmd,
                            "block_args": ["-A"],
                            "reason": "test",
                        }
                    ],
                }
            )
            self.assertIsNone(config, f"Command {cmd!r} should return None")

    def test_invalid_subcommand_patterns(self) -> None:
        """Invalid subcommand patterns return None."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "test",
                        "command": "git",
                        "subcommand": "add files",  # space
                        "block_args": ["-A"],
                        "reason": "test",
                    }
                ],
            }
        )
        self.assertIsNone(config)

    def test_duplicate_rule_names_case_insensitive(self) -> None:
        """Duplicate rule names (case-insensitive) return None."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "MyRule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "test",
                    },
                    {
                        "name": "myrule",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "test",
                    },
                ],
            }
        )
        self.assertIsNone(config)

    def test_empty_block_args(self) -> None:
        """Empty block_args array returns None."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "test",
                        "command": "git",
                        "block_args": [],
                        "reason": "test",
                    }
                ],
            }
        )
        self.assertIsNone(config)

    def test_empty_string_in_block_args(self) -> None:
        """Empty string in block_args returns None."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "test",
                        "command": "git",
                        "block_args": ["-A", ""],
                        "reason": "test",
                    }
                ],
            }
        )
        self.assertIsNone(config)

    def test_reason_exceeds_max_length(self) -> None:
        """Reason exceeding 256 chars returns None."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "test",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "x" * 257,
                    }
                ],
            }
        )
        self.assertIsNone(config)

    def test_empty_reason(self) -> None:
        """Empty reason returns None."""
        config = self._load_from_project(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "test",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "",
                    }
                ],
            }
        )
        self.assertIsNone(config)

    def test_empty_config_file(self) -> None:
        """Empty config file returns None."""
        config = self._load_from_project("")
        self.assertIsNone(config)

    def test_whitespace_only_config_file(self) -> None:
        """Whitespace-only config file returns None."""
        config = self._load_from_project("   \n\t  ")
        self.assertIsNone(config)

    def test_config_not_object(self) -> None:
        """Config that is not a JSON object returns None."""
        config = self._load_from_project("[]")
        self.assertIsNone(config)

    def test_rules_not_array(self) -> None:
        """Rules that is not an array returns None."""
        config = self._load_from_project({"version": 1, "rules": {}})
        self.assertIsNone(config)

    def test_rule_not_object(self) -> None:
        """Rule that is not an object returns None."""
        config = self._load_from_project({"version": 1, "rules": ["not an object"]})
        self.assertIsNone(config)


class TestConfigScopeMerging(TempDirTestCase):
    """Tests for user + project scope merging."""

    def _write_user_config(self, data: dict) -> None:
        """Write config to user scope (~/.cc-safety-net/config.json)."""
        user_dir = self.tmpdir / ".cc-safety-net"
        user_dir.mkdir(parents=True, exist_ok=True)
        path = user_dir / "config.json"
        path.write_text(json.dumps(data), encoding="utf-8")

    def _write_project_config(self, data: dict) -> None:
        """Write config to project scope (.safety-net.json in tmpdir)."""
        path = self.tmpdir / ".safety-net.json"
        path.write_text(json.dumps(data), encoding="utf-8")

    def test_no_config_returns_none(self) -> None:
        """When no config file exists, returns None."""
        config = load_config(cwd=str(self.tmpdir))
        self.assertIsNone(config)

    def test_user_scope_only(self) -> None:
        """When only user scope exists, use it."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "user-rule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user",
                    }
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].name, "user-rule")

    def test_project_scope_only(self) -> None:
        """When only project scope exists, use it."""
        self._write_project_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "project-rule",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "project",
                    }
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].name, "project-rule")

    def test_both_scopes_merged(self) -> None:
        """Both scopes exist with different rules: merged."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "user-rule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user",
                    }
                ],
            }
        )
        self._write_project_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "project-rule",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "project",
                    }
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 2)
        rule_names = {r.name for r in config.rules}
        self.assertEqual(rule_names, {"user-rule", "project-rule"})

    def test_project_overrides_user_on_duplicate(self) -> None:
        """Project scope overrides user scope on duplicate rule names."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "shared-rule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user version",
                    }
                ],
            }
        )
        self._write_project_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "shared-rule",
                        "command": "git",
                        "block_args": ["--all"],
                        "reason": "project version",
                    }
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].reason, "project version")
        self.assertEqual(config.rules[0].block_args, ["--all"])

    def test_project_overrides_case_insensitive(self) -> None:
        """Project override is case-insensitive on rule names."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "MyRule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user",
                    }
                ],
            }
        )
        self._write_project_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "myrule",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "project",
                    }
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].name, "myrule")
        self.assertEqual(config.rules[0].reason, "project")

    def test_mixed_override_and_merge(self) -> None:
        """Some rules overridden, some merged."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "shared-rule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user shared",
                    },
                    {
                        "name": "user-only",
                        "command": "rm",
                        "block_args": ["-rf"],
                        "reason": "user only",
                    },
                ],
            }
        )
        self._write_project_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "shared-rule",
                        "command": "git",
                        "block_args": ["--all"],
                        "reason": "project shared",
                    },
                    {
                        "name": "project-only",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "project only",
                    },
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 3)

        rules_by_name = {r.name: r for r in config.rules}
        self.assertIn("shared-rule", rules_by_name)
        self.assertIn("user-only", rules_by_name)
        self.assertIn("project-only", rules_by_name)

        self.assertEqual(rules_by_name["shared-rule"].reason, "project shared")
        self.assertEqual(rules_by_name["user-only"].reason, "user only")
        self.assertEqual(rules_by_name["project-only"].reason, "project only")

    def test_invalid_user_config_ignored(self) -> None:
        """Invalid user config is ignored, project config still works."""
        user_dir = self.tmpdir / ".cc-safety-net"
        user_dir.mkdir(parents=True, exist_ok=True)
        (user_dir / "config.json").write_text('{"version": 2}', encoding="utf-8")

        self._write_project_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "project-rule",
                        "command": "npm",
                        "block_args": ["-g"],
                        "reason": "project",
                    }
                ],
            }
        )
        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].name, "project-rule")

    def test_invalid_project_config_ignored(self) -> None:
        """Invalid project config is ignored, user config still works."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "user-rule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user",
                    }
                ],
            }
        )
        (self.tmpdir / ".safety-net.json").write_text(
            '{"version": 2}', encoding="utf-8"
        )

        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].name, "user-rule")

    def test_both_invalid_returns_none(self) -> None:
        """Both configs invalid returns None."""
        user_dir = self.tmpdir / ".cc-safety-net"
        user_dir.mkdir(parents=True, exist_ok=True)
        (user_dir / "config.json").write_text('{"version": 2}', encoding="utf-8")
        (self.tmpdir / ".safety-net.json").write_text("invalid json", encoding="utf-8")

        config = load_config(cwd=str(self.tmpdir))
        self.assertIsNone(config)

    def test_empty_project_rules_still_merges(self) -> None:
        """Project with empty rules still loads (merges with user)."""
        self._write_user_config(
            {
                "version": 1,
                "rules": [
                    {
                        "name": "user-rule",
                        "command": "git",
                        "block_args": ["-A"],
                        "reason": "user",
                    }
                ],
            }
        )
        self._write_project_config({"version": 1, "rules": []})

        config = load_config(cwd=str(self.tmpdir))
        assert config is not None
        self.assertEqual(len(config.rules), 1)
        self.assertEqual(config.rules[0].name, "user-rule")


class TestValidateConfigFile(TempDirTestCase):
    """Tests for validate_config_file function."""

    def test_valid_file_returns_empty_list(self) -> None:
        """Valid config file returns empty error list."""
        path = self.tmpdir / "config.json"
        path.write_text(json.dumps({"version": 1}), encoding="utf-8")
        errors = validate_config_file(str(path))
        self.assertEqual(errors, [])

    def test_nonexistent_file_returns_error(self) -> None:
        """Non-existent file returns error."""
        errors = validate_config_file("/nonexistent/config.json")
        self.assertEqual(len(errors), 1)
        self.assertIn("file not found", errors[0])

    def test_invalid_file_returns_errors(self) -> None:
        """Invalid config returns error messages."""
        path = self.tmpdir / "config.json"
        path.write_text(json.dumps({"version": 2}), encoding="utf-8")
        errors = validate_config_file(str(path))
        self.assertEqual(len(errors), 1)
        self.assertIn("unsupported version", errors[0])
