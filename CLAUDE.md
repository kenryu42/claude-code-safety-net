# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Claude Code plugin that blocks destructive git and filesystem commands before execution. It works as a PreToolUse hook that intercepts Bash commands and denies dangerous operations like `git reset --hard`, `rm -rf`, and `git checkout -- <files>`.

## Commands

- **Setup**: `just setup` or `uv sync && uv run pre-commit install`
- **All checks**: `just check` (runs ruff, mypy, vulture for dead code, pytest with coverage)
- **Single test**: `uv run pytest tests/test_file.py::test_name -v`
- **Lint**: `uv run ruff check` / **Format**: `uv run ruff format`
- **Type check**: `uv run mypy .`
- **Release**: `just bump` (bumps version, generates changelog, pushes tags, creates GitHub release)

## Architecture

The hook receives JSON input on stdin containing `tool_name` and `tool_input`. For `Bash` tools, it analyzes the command and outputs JSON with `permissionDecision: "deny"` to block dangerous operations.

**Entry point**: `scripts/safety_net.py` → delegates to `scripts/safety_net_impl/hook.py`

**Core analysis flow**:
1. `hook.py:main()` parses JSON input, extracts command
2. `_analyze_command()` splits command on shell operators (`;`, `&&`, `|`, etc.)
3. `_analyze_segment()` tokenizes each segment, strips wrappers (sudo, env), identifies the command
4. Dispatches to `rules_git.py:_analyze_git()` or `rules_rm.py:_analyze_rm()` based on command

**Key modules**:
- `shell.py`: Shell parsing (`_split_shell_commands`, `_shlex_split`, `_strip_wrappers`, `_short_opts`)
- `rules_git.py`: Git subcommand analysis (checkout, restore, reset, clean, push, branch, stash)
- `rules_rm.py`: rm analysis (allows rm -rf within cwd except when cwd is $HOME; temp paths always allowed; strict mode blocks non-temp)
- `tests/safety_net_test_base.py`: Base class with `_assert_blocked()` and `_assert_allowed()` helpers for testing

**Advanced detection**:
- Recursively analyzes shell wrappers (`bash -c '...'`) up to 5 levels deep
- Detects destructive commands in interpreter one-liners (`python -c 'os.system("rm -rf /")'`)
- Handles `xargs` and `parallel` with template expansion and dynamic input detection
- Detects `find -delete` patterns
- Redacts secrets (tokens, passwords, API keys) in block messages

## Code Style (Python 3.10+)

- All functions require type hints (`disallow_untyped_defs = true`)
- Use `X | None` syntax (not `Optional[X]`)
- Use `Path` not string paths where applicable
- Ruff for formatting (88 char line length)

## Environment Variables

- `SAFETY_NET_STRICT=1`: Strict mode (fail-closed on unparseable hook input/commands)
- `SAFETY_NET_PARANOID=1`: Paranoid mode (enables all paranoid checks)
- `SAFETY_NET_PARANOID_RM=1`: Paranoid rm (blocks non-temp `rm -rf` even within cwd)
- `SAFETY_NET_PARANOID_INTERPRETERS=1`: Paranoid interpreters (blocks interpreter one-liners)
