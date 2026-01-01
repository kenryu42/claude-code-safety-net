"""Config loading, parsing, and validation for custom rules."""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path


class ConfigError(Exception):
    """Raised when config file is invalid."""


@dataclass
class CustomRule:
    """A single custom blocking rule."""

    name: str
    command: str
    subcommand: str | None
    block_args: list[str]
    reason: str


@dataclass
class Config:
    """Loaded configuration with custom rules."""

    version: int
    rules: list[CustomRule] = field(default_factory=list)


# Validation patterns from spec
_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]{0,63}$")
_COMMAND_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_-]*$")
_MAX_REASON_LENGTH = 256


def _validate_rule(rule_data: dict, index: int, seen_names: set[str]) -> CustomRule:
    """Validate a single rule object and return a CustomRule."""
    errors: list[str] = []

    # Check required fields
    for field_name in ("name", "command", "block_args", "reason"):
        if field_name not in rule_data:
            errors.append(f"rules[{index}]: missing required field '{field_name}'")

    if errors:
        raise ConfigError("; ".join(errors))

    name = rule_data["name"]
    command = rule_data["command"]
    subcommand = rule_data.get("subcommand")
    block_args = rule_data["block_args"]
    reason = rule_data["reason"]

    # Validate name
    if not isinstance(name, str):
        errors.append(f"rules[{index}].name: must be a string")
    elif not _NAME_PATTERN.match(name):
        errors.append(
            f"rules[{index}].name: must match pattern "
            "^[a-zA-Z][a-zA-Z0-9_-]{{0,63}}$"
        )
    else:
        # Check for duplicate (case-insensitive)
        name_lower = name.lower()
        if name_lower in seen_names:
            errors.append(f"rules[{index}].name: duplicate rule name '{name}'")
        seen_names.add(name_lower)

    # Validate command
    if not isinstance(command, str):
        errors.append(f"rules[{index}].command: must be a string")
    elif not _COMMAND_PATTERN.match(command):
        errors.append(
            f"rules[{index}].command: must match pattern ^[a-zA-Z][a-zA-Z0-9_-]*$"
        )

    # Validate subcommand (optional)
    if subcommand is not None:
        if not isinstance(subcommand, str):
            errors.append(f"rules[{index}].subcommand: must be a string")
        elif not _COMMAND_PATTERN.match(subcommand):
            errors.append(
                f"rules[{index}].subcommand: must match pattern "
                "^[a-zA-Z][a-zA-Z0-9_-]*$"
            )

    # Validate block_args
    if not isinstance(block_args, list):
        errors.append(f"rules[{index}].block_args: must be an array")
    elif len(block_args) == 0:
        errors.append(f"rules[{index}].block_args: must not be empty")
    else:
        for i, arg in enumerate(block_args):
            if not isinstance(arg, str):
                errors.append(f"rules[{index}].block_args[{i}]: must be a string")
            elif not arg:
                errors.append(f"rules[{index}].block_args[{i}]: must not be empty")

    # Validate reason
    if not isinstance(reason, str):
        errors.append(f"rules[{index}].reason: must be a string")
    elif not reason:
        errors.append(f"rules[{index}].reason: must not be empty")
    elif len(reason) > _MAX_REASON_LENGTH:
        errors.append(
            f"rules[{index}].reason: exceeds max length of {_MAX_REASON_LENGTH}"
        )

    if errors:
        raise ConfigError("; ".join(errors))

    return CustomRule(
        name=name,
        command=command,
        subcommand=subcommand,
        block_args=block_args,
        reason=reason,
    )


def _validate_config(data: dict) -> Config:
    """Validate config dict and return Config object."""
    # Check version
    if "version" not in data:
        raise ConfigError("missing required field 'version'")

    version = data["version"]
    if not isinstance(version, int):
        raise ConfigError("'version' must be an integer")
    if version != 1:
        raise ConfigError(f"unsupported version {version}, expected 1")

    # Validate rules
    rules_data = data.get("rules", [])
    if not isinstance(rules_data, list):
        raise ConfigError("'rules' must be an array")

    seen_names: set[str] = set()
    rules: list[CustomRule] = []
    for i, rule_data in enumerate(rules_data):
        if not isinstance(rule_data, dict):
            raise ConfigError(f"rules[{i}]: must be an object")
        rules.append(_validate_rule(rule_data, i, seen_names))

    return Config(version=version, rules=rules)


def _load_single_config(path: Path) -> Config | None:
    """Load and validate a single config file.

    Returns None if file doesn't exist, is invalid, or has errors.
    """
    if not path.exists():
        return None

    try:
        content = path.read_text(encoding="utf-8")
    except OSError:
        return None

    if not content.strip():
        return None

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    try:
        return _validate_config(data)
    except ConfigError:
        return None


def _merge_configs(user_config: Config | None, project_config: Config | None) -> Config:
    """Merge user and project configs.

    Project rules override user rules with the same name (case-insensitive).
    """
    if user_config is None and project_config is None:
        return Config(version=1, rules=[])

    if user_config is None:
        return project_config  # type: ignore[return-value]

    if project_config is None:
        return user_config

    project_rule_names = {rule.name.lower() for rule in project_config.rules}
    user_rules_not_overridden = [
        rule
        for rule in user_config.rules
        if rule.name.lower() not in project_rule_names
    ]
    merged_rules = user_rules_not_overridden + list(project_config.rules)

    return Config(version=1, rules=merged_rules)


def load_config(cwd: str | None = None) -> Config | None:
    """Load config with scope merging.

    Loads from two scopes:
    1. User scope: ~/.cc-safety-net/config.json (always loaded if exists)
    2. Project scope: .safety-net.json in cwd (loaded if exists)

    Rules are merged: project scope overrides user scope on duplicate names.
    Returns None only if both scopes have no valid config.
    All errors are silent — falls back to built-in rules only.
    """
    user_path = Path.home() / ".cc-safety-net" / "config.json"
    user_config = _load_single_config(user_path)

    project_config: Config | None = None
    if cwd:
        project_path = Path(cwd) / ".safety-net.json"
        project_config = _load_single_config(project_path)

    merged = _merge_configs(user_config, project_config)

    if not merged.rules and user_config is None and project_config is None:
        return None

    return merged


def validate_config_file(path: str) -> list[str]:
    """Validate a config file and return list of error messages.

    Returns empty list if valid.
    """
    errors: list[str] = []
    config_path = Path(path).expanduser()

    if not config_path.exists():
        return [f"file not found: {path}"]

    try:
        content = config_path.read_text(encoding="utf-8")
    except OSError as e:
        return [f"cannot read file: {e}"]

    if not content.strip():
        return ["config file is empty"]

    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        return [f"invalid JSON: {e}"]

    if not isinstance(data, dict):
        return ["config must be a JSON object"]

    try:
        _validate_config(data)
    except ConfigError as e:
        errors.append(str(e))

    return errors
