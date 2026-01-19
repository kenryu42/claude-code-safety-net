# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Claude Code and OpenCode plugin that blocks destructive git and filesystem commands before execution. It works as a PreToolUse hook that intercepts Bash commands and denies dangerous operations like `git reset --hard`, `rm -rf`, and `git checkout -- <files>`.

## Commands

- **Setup**: `bun install`
- **All checks**: `bun run check` (runs lint, typecheck, knip, ast-grep scan, tests)
- **Single test**: `bun test tests/file.test.ts`
- **Test pattern**: `bun test --test-name-pattern "pattern"`
- **Lint**: `bun run lint` (uses Biome)
- **Type check**: `bun run typecheck`
- **Dead code**: `bun run knip`
- **AST scan**: `bun run sg:scan`
- **Build**: `bun run build`
- **Doctor**: `bun src/bin/cc-safety-net.ts doctor` (diagnostics)

## Pre-commit Hooks

Runs on commit: `knip` → `lint-staged` (biome check --write, ast-grep scan)

## Slash Commands

- `/set-statusline`: Configure status line integration
- `/set-custom-rules`: Create custom rules interactively
- `/verify-custom-rules`: Validate custom rules config

## Architecture

The hook receives JSON input on stdin containing `tool_name` and `tool_input`. For `Bash` tools, it analyzes the command and outputs JSON with `permissionDecision: "deny"` to block dangerous operations.

**Entry points**:
- `src/bin/cc-safety-net.ts` — Claude Code CLI (reads stdin JSON)
- `src/index.ts` — OpenCode plugin export

**Core analysis flow**:
1. `cc-safety-net.ts:main()` parses JSON input, extracts command
2. `analyze.ts:analyzeCommand()` splits command on shell operators (`;`, `&&`, `|`, etc.)
3. `analyzeSegment()` tokenizes each segment, strips wrappers (sudo, env), identifies the command
4. Dispatches to `rules-git.ts:analyzeGit()` or `rules-rm.ts:analyzeRm()` based on command
5. Checks custom rules via `rules-custom.ts:checkCustomRules()` if configured

**Key modules** (`src/core/`):
- `shell.ts`: Shell parsing (`splitShellCommands`, `shlexSplit`, `stripWrappers`, `shortOpts`)
- `rules-git.ts`: Git subcommand analysis (checkout, restore, reset, clean, push, branch, stash)
- `rules-rm.ts`: rm analysis (allows rm -rf within cwd except when cwd is $HOME; temp paths always allowed; strict mode blocks non-temp)
- `config.ts`: Config loading, validation, merging (user `~/.cc-safety-net/config.json` + project `.safety-net.json`)
- `rules-custom.ts`: Custom rule matching (`checkCustomRules()`)
- `audit.ts`: Audit logging for blocked commands
- `verify-config.ts`: Config validator

**Analysis submodules** (`src/core/analyze/`):
- `find.ts`: `find -delete` and `find -exec rm` detection
- `interpreters.ts`: Python/Node/Ruby/Perl one-liner detection
- `xargs.ts`: `xargs rm` and dynamic input detection
- `parallel.ts`: GNU parallel command analysis
- `shell-wrappers.ts`: Recursive `bash -c`/`sh -c` unwrapping
- `tmpdir.ts`: Temp directory path detection

**Test utilities** (`tests/helpers.ts`):
- `assertBlocked()`, `assertAllowed()` helpers for testing command analysis

**Advanced detection**:
- Recursively analyzes shell wrappers (`bash -c '...'`) up to 5 levels deep
- Detects destructive commands in interpreter one-liners (`python -c`, `node -e`, `ruby -e`, `perl -e`)
- Handles `xargs` and `parallel` with template expansion and dynamic input detection
- Detects `find -delete` and `find -exec rm` patterns
- Redacts secrets (tokens, passwords, API keys) in block messages and audit logs
- Audit logging: blocked commands logged to `~/.cc-safety-net/logs/<session_id>.jsonl`

## Code Style (TypeScript)

- Use Bun instead of Node.js for running, testing, and building
- Biome for linting and formatting
- All functions require type annotations
- Use `type | null` syntax (not `undefined` where possible)
- Use kebab-case for file names (`rules-git.ts`, not `rulesGit.ts`)

## Commit Conventions

When committing changes to files in `commands/`, `hooks/`, or `.opencode/`, use only `fix` or `feat` commit types. These directories contain user-facing skill definitions and hook configurations that represent features or fixes to the plugin's capabilities.

## Environment Variables

- `SAFETY_NET_STRICT=1`: Strict mode (fail-closed on unparseable hook input/commands)
- `SAFETY_NET_PARANOID=1`: Paranoid mode (enables all paranoid checks)
- `SAFETY_NET_PARANOID_RM=1`: Paranoid rm (blocks non-temp `rm -rf` even within cwd)
- `SAFETY_NET_PARANOID_INTERPRETERS=1`: Paranoid interpreters (blocks interpreter one-liners)

## Custom Rules

Users can define additional blocking rules in two scopes (merged, project overrides user):
- **User scope**: `~/.cc-safety-net/config.json` (applies to all projects)
- **Project scope**: `.safety-net.json` (in project root)

Rules are additive only—cannot bypass built-in protections. Invalid config silently falls back to built-in rules only.

## Testing

Use `AGENT=1 bun test` to run tests.

## Bun Best Practices

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install`
- Use `bun run <script>` instead of `npm run <script>`
- Bun automatically loads .env, so don't use dotenv

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.