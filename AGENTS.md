# Agent Guidelines

A Claude Code / OpenCode plugin that blocks destructive git and filesystem commands before execution. Works as a PreToolUse hook intercepting Bash commands.

## Commands

| Task | Command |
|------|---------|
| Install | `bun install` |
| Build | `bun run build` |
| All checks | `bun run check` |
| Lint | `bun run lint` |
| Type check | `bun run typecheck` |
| Test all | `AGENT=1 bun test` |
| Single test | `bun test tests/rules-git.test.ts` |
| Pattern match | `bun test --test-name-pattern "pattern"` |
| Dead code | `bun run knip` |
| AST rules | `bun run sg:scan` |
| Doctor | `bun src/bin/cc-safety-net.ts doctor` |

**`bun run check`** runs: biome check → typecheck → knip → ast-grep scan → bun test

## Pre-commit Hooks

Runs on commit (in order): knip → lint-staged (biome check --write)

## Commit Conventions

When committing changes to files in `commands/`, `hooks/`, or `.opencode/`, use only `fix` or `feat` commit types. These directories contain user-facing skill definitions and hook configurations that represent features or fixes to the plugin's capabilities.

## Code Style (TypeScript)

### Formatting
- Formatter: Biome
- Line length: configured in `biome.json`
- Use tabs for indentation (Biome default)

### Type Hints
- **Required** on all functions
- Use `| null` or `| undefined` appropriately
- Use lowercase primitive types (`string`, `number`, `boolean`)
- Use `readonly` arrays where mutation isn't needed

```typescript
// Good
function analyze(command: string, options?: { strict?: boolean }): string | null { ... }
function analyzeRm(tokens: readonly string[], cwd: string | null): string | null { ... }

// Bad
function analyze(command, strict) { ... }  // Missing types
```

### Imports
- Order: handled by Biome (sorted automatically)
- Use relative imports within same package
- Prefer named exports over default exports

```typescript
import { parse } from "shell-quote"
import type { Config, HookInput } from "../types"
import { analyzeGit } from "./rules-git"
import { splitShellCommands } from "./shell"
```

### Naming
- Functions/variables: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` (reason strings: `REASON_*`)
- Private/internal: `_leadingUnderscore` (for module-private functions)

### Error Handling
- Print errors to stderr
- Return exit codes: `0` = success, `1` = error
- Block commands: exit 0 with JSON `permissionDecision: "deny"`

## Architecture

```
src/
├── index.ts                   # OpenCode plugin export (main entry)
├── types.ts                   # Shared types and constants
├── bin/
│   └── cc-safety-net.ts       # Claude Code CLI wrapper
└── core/
    ├── analyze.ts             # Main analysis logic
    ├── config.ts              # Config loading (.safety-net.json)
    ├── shell.ts               # Shell parsing (uses shell-quote)
    ├── rules-git.ts           # Git subcommand analysis
    ├── rules-rm.ts            # rm command analysis
    └── rules-custom.ts        # Custom rule evaluation
```

| Module | Purpose |
|--------|---------|
| `index.ts` | OpenCode plugin export |
| `bin/cc-safety-net.ts` | Claude Code CLI wrapper, JSON I/O |
| `analyze.ts` | Main entry, command analysis orchestration |
| `config.ts` | Config loading (`.safety-net.json`), Config type |
| `rules-custom.ts` | Custom rule evaluation (`checkCustomRules`) |
| `rules-git.ts` | Git rules (checkout, restore, reset, clean, push, branch, stash) |
| `rules-rm.ts` | rm analysis (cwd-relative, temp paths, root/home detection) |
| `shell.ts` | Shell parsing (`splitShellCommands`, `shlexSplit`, `stripWrappers`) |

## Testing

Use Bun's built-in test runner with test helpers:

```typescript
import { describe, test } from "bun:test"
import { assertBlocked, assertAllowed } from "./helpers"

describe("git rules", () => {
  test("git reset --hard blocked", () => {
    assertBlocked("git reset --hard", "git reset --hard")
  })

  test("git status allowed", () => {
    assertAllowed("git status")
  })

  test("with cwd", () => {
    assertBlocked("rm -rf /", "rm -rf", "/home/user")
  })
})
```

### Test Helpers
| Function | Purpose |
|----------|---------|
| `assertBlocked(command, reasonContains, cwd?)` | Verify command is blocked |
| `assertAllowed(command, cwd?)` | Verify command passes through |
| `runGuard(command, cwd?, config?)` | Run analysis and return reason or null |
| `withEnv(env, fn)` | Run test with temporary environment variables |

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
1. Add reason constant in `rules-git.ts`: `const REASON_* = "..."`
2. Add detection logic in `analyzeGit()`
3. Add tests in `tests/rules-git.test.ts`
4. Run `bun run check`

### rm Rule
1. Add logic in `rules-rm.ts`
2. Add tests in `tests/rules-rm.test.ts`
3. Run `bun run check`

### Other Command Rules
1. Add reason constant in `analyze.ts`: `const REASON_* = "..."`
2. Add detection in `analyzeSegment()` 
3. Add tests in appropriate test file
4. Run `bun run check`

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
    "permissionDecisionReason": "BLOCKED by Safety Net\n\nReason: ..."
  }
}
```

Allowed commands produce no output (exit 0 silently).

## Bun Guidelines

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Bun.$`ls` instead of execa.

## Testing

Use `AGENT=1 bun test` to run tests.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
