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

**`just check`** runs: ruff check --fix → mypy → vulture → pytest (with coverage)

## Pre-commit Hooks

Runs on commit (in order): ruff format → ruff check --fix → mypy → vulture

## Code Style (Python 3.10+)

### Formatting
- Line length: 88 chars, indent: 4 spaces, formatter: Ruff
- Ruff lint rules: E (pycodestyle), F (pyflakes), I (isort), B (bugbear), UP (pyupgrade)

### Type Hints
- **Required** on all functions (`disallow_untyped_defs = true`)
- Exception: test files allow untyped defs
- Use `X | None` not `Optional[X]`, use `list[str]` not `List[str]`
- Use keyword-only args with `*` for clarity

```python
# Good
def analyze(command: str, *, strict: bool = False) -> str | None: ...
def _analyze_rm(tokens: list[str], *, cwd: str | None, strict: bool) -> str | None: ...

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
from os import getenv
from pathlib import Path

from .rules_git import _analyze_git
from .shell import _shlex_split
```

### Naming
- Functions/variables: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` (reason strings: `_REASON_*`)
- Private/internal: `_leading_underscore`
- Prefer `Path` objects over string paths

### Docstrings
- Module-level: Required (first line of every `.py` file)
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
scripts/safety_net.py           # Entry point (calls hook.main())
  └── safety_net_impl/hook.py   # Main hook logic
        ├── main()              # JSON I/O, entry point
        ├── _analyze_command()  # Splits on shell operators
        ├── _analyze_segment()  # Tokenizes, strips wrappers, dispatches
        ├── rules_git.py        # Git subcommand analysis
        ├── rules_rm.py         # rm command analysis
        └── shell.py            # Shell parsing utilities
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
from tests import TempDirTestCase
from tests.safety_net_test_base import SafetyNetTestCase

class TestMyRules(SafetyNetTestCase):
    def test_dangerous_blocked(self) -> None:
        self._assert_blocked("git reset --hard", "git reset --hard")

    def test_safe_allowed(self) -> None:
        self._assert_allowed("git status")

    def test_with_cwd(self) -> None:
        self._assert_blocked("rm -rf /", "rm -rf", cwd="/home/user")
```

### Test Helpers
| Method | Purpose |
|--------|---------|
| `_run_guard(command, cwd=None)` | Run guard, return parsed JSON or None |
| `_assert_blocked(command, reason_contains, cwd=None)` | Verify command is blocked |
| `_assert_allowed(command, cwd=None)` | Verify command passes through |

### Filesystem Tests
Use `TempDirTestCase` for tests needing a temp directory:

```python
class TestFilesystem(TempDirTestCase):
    def test_something(self) -> None:
        (self.tmpdir / "file.txt").write_text("content")
        # self.tmpdir is a Path object, auto-cleaned after test
```

## Environment Variables

| Variable | Effect |
|----------|--------|
| `SAFETY_NET_STRICT=1` | Fail-closed on unparseable hook input/commands |
| `SAFETY_NET_PARANOID=1` | Enable all paranoid checks (rm + interpreters) |
| `SAFETY_NET_PARANOID_RM=1` | Block non-temp `rm -rf` even within the current working directory |
| `SAFETY_NET_PARANOID_INTERPRETERS=1` | Block interpreter one-liners like `python -c`, `node -e`, etc. |

## What Gets Blocked

**Git**: `checkout -- <files>`, `restore` (without --staged), `reset --hard/--merge`, `clean -f`, `push --force/-f` (without --force-with-lease), `branch -D`, `stash drop/clear`

**Filesystem**: `rm -rf` outside cwd (except `/tmp`, `/var/tmp`, `$TMPDIR`), `rm -rf` when cwd is `$HOME`, `rm -rf /` or `~`, `find -delete`

**Piped commands**: `xargs rm -rf`, `parallel rm -rf` (dynamic input to destructive commands)

## Adding New Rules

### Git Rule
1. Add reason constant in `rules_git.py`: `_REASON_* = "..."`
2. Add detection logic in `_analyze_git()`
3. Add tests in `tests/test_safety_net_git.py`
4. Run `just check`

### rm Rule
1. Add logic in `rules_rm.py`
2. Add tests in `tests/test_safety_net_rm.py`
3. Run `just check`

### Other Command Rules
1. Add reason constant in `hook.py`: `_REASON_* = "..."`
2. Add detection in `_analyze_segment()` 
3. Add tests in appropriate test file
4. Run `just check`

## Edge Cases to Test

- Shell wrappers: `bash -c '...'`, `sh -lc '...'`
- Sudo/env: `sudo git ...`, `env VAR=1 git ...`
- Pipelines: `echo ok | git reset --hard`
- Interpreter one-liners: `python -c 'os.system("rm -rf /")'`
- Xargs/parallel: `find . | xargs rm -rf`
- Busybox: `busybox rm -rf /`
- Nested commands: `$( rm -rf / )`, backticks

## Hook Output Format

Blocked commands produce JSON:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "BLOCKED by safety_net.py\n\nReason: ..."
  }
}
```

Allowed commands produce no output (exit 0 silently).
