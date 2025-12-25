# Agent Guidelines

A Claude Code plugin that blocks destructive git and filesystem commands before execution. Works as a PreToolUse hook intercepting Bash commands.

## Commands

| Task | Command |
|------|---------|
| Setup | `just setup` |
| All checks | `just check` |
| Lint | `uv run ruff check` |
| Lint + fix | `uv run ruff check --fix` |
| Format | `uv run ruff format` |
| Type check | `uv run mypy .` |
| Test all | `uv run pytest` |
| Single test | `uv run pytest tests/test_file.py::TestClass::test_name -v` |
| Pattern match | `uv run pytest -k "pattern" -v` |
| Dead code | `uv run vulture` |

**`just check`** runs: ruff check --fix → mypy → vulture → pytest

## Pre-commit Hooks

Runs on commit (in order): ruff format → ruff check --fix → mypy → vulture

## Code Style (Python 3.10+)

### Formatting
- Line length: 88 chars, indent: 4 spaces, formatter: Ruff

### Type Hints
- **Required** on all functions (`disallow_untyped_defs = true`)
- Exception: test files allow untyped defs
- Use `X | None` not `Optional[X]`, use `list[str]` not `List[str]`

```python
# Good
def analyze(command: str, *, strict: bool = False) -> str | None: ...

# Bad
def analyze(command, strict=False): ...  # Missing hints
def analyze(command: str) -> Optional[str]: ...  # Old syntax
```

### Imports
- Order: stdlib → third-party → local (sorted by ruff)
- Use relative imports within same package

```python
import json
import sys
from pathlib import Path

from .rules_git import _analyze_git
from .shell import _shlex_split
```

### Naming
- Functions/variables: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private: `_leading_underscore`
- Prefer `Path` objects over string paths

### Docstrings
- Module-level: Required
- Function-level: Required for non-trivial logic

```python
"""Git command analysis rules for the safety net."""

def _analyze_git(tokens: list[str]) -> str | None:
    """Analyze git command tokens and return block reason if dangerous."""
```

### Error Handling
- Print errors to stderr
- Return exit codes: `0` = success, `1` = error
- Block commands: exit 0 with JSON `permissionDecision: "deny"`

## Architecture

```
scripts/safety_net.py           # Entry point
  └── safety_net_impl/hook.py   # Main hook logic (main())
        ├── _analyze_command()  # Splits on shell operators
        ├── _analyze_segment()  # Tokenizes, strips wrappers
        ├── rules_git.py        # Git subcommand analysis
        └── rules_rm.py         # rm command analysis
```

| Module | Purpose |
|--------|---------|
| `hook.py` | Main entry, JSON I/O, command analysis orchestration |
| `rules_git.py` | Git rules (checkout, restore, reset, clean, push, branch, stash) |
| `rules_rm.py` | rm analysis (cwd-relative, temp paths, root/home detection) |
| `shell.py` | Shell parsing (`_split_shell_commands`, `_shlex_split`, `_strip_wrappers`) |

## Testing

Inherit from `SafetyNetTestCase` for hook tests:

```python
class MyTests(SafetyNetTestCase):
    def test_dangerous_blocked(self) -> None:
        self._assert_blocked("git reset --hard", "git reset --hard")

    def test_safe_allowed(self) -> None:
        self._assert_allowed("git status")
```

- `_assert_blocked(command, reason_contains)` - verify blocking
- `_assert_allowed(command)` - verify passthrough
- `TempDirTestCase` provides `self.tmpdir: Path` for filesystem tests

## Environment Variables

| Variable | Effect |
|----------|--------|
| `SAFETY_NET_STRICT=1` | Block unparseable commands and non-temp `rm -rf` |

## What Gets Blocked

**Git**: `checkout -- <files>`, `restore` (without --staged), `reset --hard/--merge`, `clean -f`, `push --force/-f` (without --force-with-lease), `branch -D`, `stash drop/clear`

**Filesystem**: `rm -rf` outside cwd (except `/tmp`, `/var/tmp`, `$TMPDIR`), `rm -rf` when cwd is `$HOME`, `rm -rf /` or `~`

## Adding New Rules

### Git Rule
1. Add reason constant in `rules_git.py`
2. Add detection logic in `_analyze_git()`
3. Add tests in `tests/test_safety_net_git.py`
4. Run `just check`

### rm Rule
1. Add logic in `rules_rm.py`
2. Add tests in `tests/test_safety_net_rm.py`
3. Run `just check`

## Edge Cases to Test

- Shell wrappers: `bash -c '...'`, `sh -lc '...'`
- Sudo/env: `sudo git ...`, `env VAR=1 git ...`
- Pipelines: `echo ok | git reset --hard`
- Interpreter one-liners: `python -c 'os.system("rm -rf /")'`
