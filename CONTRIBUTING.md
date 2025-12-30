# Contributing to Claude Code Safety Net

First off, thanks for taking the time to contribute! This document provides guidelines and instructions for contributing to cc-safety-net.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Development Setup](#development-setup)
  - [Testing Your Changes Locally](#testing-your-changes-locally)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
  - [Build Commands](#build-commands)
  - [Code Style & Conventions](#code-style--conventions)
- [Making Changes](#making-changes)
  - [Adding a Git Rule](#adding-a-git-rule)
  - [Adding an rm Rule](#adding-an-rm-rule)
  - [Adding Other Command Rules](#adding-other-command-rules)
- [Pull Request Process](#pull-request-process)
- [Publishing](#publishing)
- [Getting Help](#getting-help)

## Code of Conduct

Be respectful, inclusive, and constructive. We're all here to make better tools together.

## Getting Started

### Prerequisites

- **Python 3.10+** - Required for type hints and modern syntax
- **uv** - The only supported package manager ([install guide](https://docs.astral.sh/uv/getting-started/installation/))
- **just** (optional) - Command runner for convenience ([install guide](https://just.systems/man/en/packages.html))
- **Claude Code** - For testing the plugin

### Development Setup

```bash
# Clone the repository
git clone https://github.com/kenryu42/claude-code-safety-net.git
cd claude-code-safety-net

# Install dependencies and pre-commit hooks
just setup
# or
uv sync && uv run pre-commit install
```

### Testing Your Changes Locally

After making changes, you can test your local build in Claude Code:

1. **Disable the safety-net plugin** in Claude Code (if installed) and exit Claude Code completely.

2. **Run Claude Code with the local plugin**:
   ```bash
   claude --plugin-dir .
   ```

3. **Test blocked commands** to verify your changes:
   ```bash
   # This should be blocked
   git checkout -- README.md
   
   # This should be allowed
   git checkout -b test-branch
   ```

> [!NOTE]
> See the [official documentation](https://docs.anthropic.com/en/docs/claude-code/plugins#test-your-plugins-locally) for more details on testing plugins locally.

## Project Structure

```
claude-code-safety-net/
├── .claude-plugin/
│   ├── plugin.json         # Plugin metadata
│   └── marketplace.json    # Marketplace config
├── hooks/
│   └── hooks.json          # Hook definitions
├── scripts/
│   ├── safety_net.py       # Entry point (calls hook.main())
│   └── safety_net_impl/
│       ├── __init__.py
│       ├── hook.py         # Main hook logic, JSON I/O
│       ├── rules_git.py    # Git subcommand analysis
│       ├── rules_rm.py     # rm command analysis
│       └── shell.py        # Shell parsing utilities
├── tests/
│   ├── __init__.py
│   ├── safety_net_test_base.py  # Test base class
│   ├── test_safety_net_git.py   # Git rule tests
│   ├── test_safety_net_rm.py    # rm rule tests
│   └── ...                      # Other test files
├── justfile                # Command runner recipes
├── pyproject.toml          # Project config
└── .pre-commit-config.yaml # Pre-commit hooks
```

| Module | Purpose |
|--------|---------|
| `hook.py` | Main entry, JSON I/O, command analysis orchestration |
| `rules_git.py` | Git rules (checkout, restore, reset, clean, push, branch, stash) |
| `rules_rm.py` | rm analysis (cwd-relative, temp paths, root/home detection) |
| `shell.py` | Shell parsing (`_split_shell_commands`, `_shlex_split`, `_strip_wrappers`) |

## Development Workflow

### Build Commands

```bash
# Run all checks (lint, type check, dead code, tests)
just check

# Individual commands
uv run ruff check          # Lint only
uv run ruff check --fix    # Lint + auto-fix
uv run ruff format         # Format code
uv run mypy .              # Type check
uv run vulture             # Dead code detection
uv run pytest              # Run tests

# Run specific test
uv run pytest tests/test_safety_net_git.py::TestGitCheckout::test_checkout_double_dash -v

# Run tests matching pattern
uv run pytest -k "checkout" -v
```

### Code Style & Conventions

| Convention | Rule |
|------------|------|
| Python Version | **3.10+** |
| Package Manager | **uv only** (`uv run`, `uv sync`) |
| Line Length | 88 characters |
| Formatter | Ruff |
| Type Hints | Required on all functions |
| Type Syntax | `X \| None` not `Optional[X]`, `list[str]` not `List[str]` |
| Naming | `snake_case` for functions, `PascalCase` for classes, `_REASON_*` for block reasons |
| Imports | stdlib → third-party → local, relative imports within package |
| Docstrings | Required for modules and non-trivial functions |
| Test Coverage | **Minimum 90%** - CI will fail if coverage drops below this |

**Examples**:

```python
# Good
def analyze(command: str, *, strict: bool = False) -> str | None:
    """Analyze command and return block reason if dangerous."""
    ...

# Bad
def analyze(command, strict=False):  # Missing type hints
    ...
def analyze(command: str) -> Optional[str]:  # Old syntax
    ...
```

**Anti-Patterns (Do Not Do)**:
- Using pip/poetry instead of uv
- Suppressing type errors with `# type: ignore` or `Any`
- Skipping tests for new rules
- Modifying version in `pyproject.toml` directly

## Making Changes

### Adding a Git Rule

1. **Add reason constant** in `scripts/safety_net_impl/rules_git.py`:
   ```python
   _REASON_MY_RULE = "git my-command does something dangerous. Use safer alternative."
   ```

2. **Add detection logic** in `_analyze_git()`:
   ```python
   if subcommand == "my-command" and "--dangerous-flag" in tokens:
       return _REASON_MY_RULE
   ```

3. **Add tests** in `tests/test_safety_net_git.py`:
   ```python
   class TestGitMyCommand(SafetyNetTestCase):
       def test_dangerous_blocked(self) -> None:
           self._assert_blocked("git my-command --dangerous-flag", "dangerous")
   
       def test_safe_allowed(self) -> None:
           self._assert_allowed("git my-command --safe-flag")
   ```

4. **Run checks**:
   ```bash
   just check
   ```

### Adding an rm Rule

1. **Add logic** in `scripts/safety_net_impl/rules_rm.py`
2. **Add tests** in `tests/test_safety_net_rm.py`
3. **Run checks**: `just check`

### Adding Other Command Rules

1. **Add reason constant** in `scripts/safety_net_impl/hook.py`:
   ```python
   _REASON_MY_COMMAND = "my-command is dangerous because..."
   ```

2. **Add detection** in `_analyze_segment()`

3. **Add tests** in the appropriate test file

4. **Run checks**: `just check`

### Edge Cases to Test

When adding rules, ensure you test these edge cases:

- Shell wrappers: `bash -c '...'`, `sh -lc '...'`
- Sudo/env prefixes: `sudo git ...`, `env VAR=1 git ...`
- Pipelines: `echo ok | git reset --hard`
- Interpreter one-liners: `python -c 'os.system("...")'`
- Xargs/parallel: `find . | xargs rm -rf`
- Busybox: `busybox rm -rf /`

## Pull Request Process

1. **Fork** the repository and create your branch from `main`
2. **Make changes** following the conventions above
3. **Run all checks** locally:
   ```bash
   just check  # Must pass with no errors
   ```
4. **Test in Claude Code** using the local plugin method described above
5. **Commit** with clear, descriptive messages:
   - Use present tense ("Add rule" not "Added rule")
   - Reference issues if applicable ("Fix #123")
6. **Push** to your fork and create a Pull Request
7. **Describe** your changes clearly in the PR description

### PR Checklist

- [ ] Code follows project conventions (type hints, naming, etc.)
- [ ] `just check` passes (lint, types, dead code, tests)
- [ ] Tests added for new rules (minimum 90% coverage required)
- [ ] Tested locally with Claude Code
- [ ] Updated documentation if needed (README, AGENTS.md)
- [ ] No version changes in `pyproject.toml`

## Publishing

**Important**: Version bumping and releases are handled by maintainers only.

- **Never** modify the version in `pyproject.toml` directly
- **Never** run `just bump` - this is for maintainers only
- Maintainers use `just bump` to version, tag, and release

## Getting Help

- **Project Knowledge**: Check `CLAUDE.md` or `AGENTS.md` for detailed architecture and conventions
- **Code Patterns**: Review existing implementations in `scripts/safety_net_impl/`
- **Test Patterns**: See `tests/safety_net_test_base.py` for test helpers
- **Issues**: Open an issue for bugs or feature requests

---

Thank you for contributing to Claude Code Safety Net! Your efforts help keep AI-assisted coding safer for everyone.
