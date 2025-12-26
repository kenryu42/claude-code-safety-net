# Claude Code Safety Net

[![CI](https://github.com/kenryu42/claude-code-safety-net/actions/workflows/ci.yml/badge.svg)](https://github.com/kenryu42/claude-code-safety-net/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/kenryu42/claude-code-plan-export)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-orange)](https://platform.claude.com/docs/en/agent-sdk/plugins)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Claude Code plugin that acts as a safety net, catching destructive git and filesystem commands before they execute.

## Why This Exists

We learned the [hard way](https://www.reddit.com/r/ClaudeAI/comments/1pgxckk/claude_cli_deleted_my_entire_home_directory_wiped/) that instructions aren't enough to keep AI agents in check.
After Claude Code silently wiped out hours of progress with a single `rm -rf ~/` or `git checkout --`, we were reminded that **"soft"** rules in an `CLAUDE.md` or `AGENTS.md` file cannot replace **hard** technical constraints.
We've now moved from documentation to mechanical enforcement, using a dedicated hook to programmatically prevent agents from running destructive commands.

## Why Hooks Instead of settings.json?

Claude Code's `.claude/settings.json` supports deny rules for Bash commands, but these use [simple prefix matching](https://code.claude.com/docs/en/iam#tool-specific-permission-rules)—not pattern matching or semantic analysis. This makes them insufficient for nuanced safety rules:

| Limitation | Example |
|------------|---------|
| Can't distinguish safe vs. dangerous variants | `Bash(git checkout)` blocks both `git checkout -b new-branch` (safe) and `git checkout -- file` (dangerous) |
| Can't parse flags semantically | `Bash(rm -rf)` blocks `rm -rf /tmp/cache` (safe) but allows `rm -r -f /` (dangerous, different flag order) |
| Can't detect shell wrappers | `sh -c "rm -rf /"` bypasses a `Bash(rm)` deny rule entirely |
| Can't analyze interpreter one-liners | `python -c 'os.system("rm -rf /")'` executes without matching any rm rule |

This hook provides **semantic command analysis**: it parses arguments, understands flag combinations, recursively analyzes shell wrappers, and distinguishes safe operations (temp directories, within cwd) from dangerous ones.

## Quick Start

### Installation

```bash
/plugin marketplace add kenryu42/cc-marketplace
/plugin install safety-net@cc-marketplace
```

> **Note:** Restart Claude Code after installation to ensure the hooks are properly registered.

## Commands Blocked

| Command Pattern | Why It's Dangerous |
|-----------------|-------------------|
| git checkout -- files | Discards uncommitted changes permanently |
| git checkout \<ref\> -- \<path\> | Overwrites working tree with ref version |
| git restore files | Discards uncommitted changes |
| git restore --worktree | Explicitly discards working tree changes |
| git reset --hard | Destroys all uncommitted changes |
| git reset --merge | Can lose uncommitted changes |
| git clean -f | Removes untracked files permanently |
| git push --force / -f | Destroys remote history |
| git branch -D | Force-deletes branch without merge check |
| git stash drop | Permanently deletes stashed changes |
| git stash clear | Deletes ALL stashed changes |
| rm -rf (paths outside cwd) | Recursive file deletion outside the current directory |
| rm -rf / or ~ or $HOME | Root/home deletion is extremely dangerous |

## Commands Allowed

| Command Pattern | Why It's Safe |
|-----------------|--------------|
| git checkout -b branch | Creates new branch |
| git checkout --orphan | Creates orphan branch |
| git restore --staged | Only unstages, doesn't discard |
| git restore --help/--version | Help/version output |
| git branch -d | Safe delete with merge check |
| git clean -n / --dry-run | Preview only |
| git push --force-with-lease | Safe force push |
| rm -rf /tmp/... | Temp directories are ephemeral |
| rm -rf /var/tmp/... | System temp directory |
| rm -rf $TMPDIR/... | User's temp directory |
| rm -rf ./... (within cwd) | Limited to current working directory |

## What Happens When Blocked

When a destructive command is detected, the plugin blocks the tool execution and provides a reason.

Example output:
```text
BLOCKED by safety_net.py

Reason: git checkout -- discards uncommitted changes permanently. Use 'git stash' first.

Command: git checkout -- src/main.py

If this operation is truly needed, ask the user for explicit permission and have them run the command manually.
```

## Testing the Hook

You can manually test the hook by attempting to run blocked commands in Claude Code:

```bash
# This should be blocked
git checkout -- README.md

# This should be allowed
git checkout -b test-branch
```

## Development

### Setup

```bash
just setup
# or
uv sync && uv run pre-commit install
```

### Run Tests

```bash
uv run pytest
```

### Full Checks

```bash
just check
```

## Project Structure

```text
.claude-plugin/
  plugin.json
  marketplace.json
hooks/
  hooks.json
scripts/
  safety_net.py          # Entry point
  safety_net_impl/
    __init__.py
    hook.py              # Main hook logic
    rules_git.py         # Git command rules
    rules_rm.py          # rm command rules
    shell.py             # Shell parsing utilities
tests/
  safety_net_test_base.py
  test_safety_net_edge.py
  test_safety_net_git.py
  test_safety_net_rm.py
```

## Advanced Features

### Strict Mode

By default, unparseable commands are allowed through, and `rm -rf` is allowed only for temp
paths and paths within the current working directory. Enable strict mode to additionally
block unparseable commands and block non-temp `rm -rf`:

```bash
export SAFETY_NET_STRICT=1
```

### Shell Wrapper Detection

The guard recursively analyzes commands wrapped in shells:

```bash
bash -c 'git reset --hard'    # Blocked
sh -lc 'rm -rf /'             # Blocked
```

### Interpreter One-Liner Detection

Detects destructive commands hidden in Python/Node/Ruby/Perl one-liners:

```bash
python -c 'import os; os.system("rm -rf /")'  # Blocked
```

### Secret Redaction

Block messages automatically redact sensitive data (tokens, passwords, API keys) to prevent leaking secrets in logs.

## License

MIT
