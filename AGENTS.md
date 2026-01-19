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

Runs on commit: `knip` → `lint-staged` (biome check --write, ast-grep scan)

## Commit Conventions

For changes to `commands/`, `hooks/`, or `.opencode/`, use only `fix` or `feat` commit types.

## Code Style (TypeScript)

### Formatting (Biome)
- 2-space indentation, 100-char line width
- Single quotes, trailing commas, semicolons required
- Imports: auto-sorted by Biome, use relative imports within package
- Prefer named exports over default exports

### Type Hints
- **Required** on all functions
- Use `| null` or `| undefined` appropriately
- Use lowercase primitives (`string`, `number`, `boolean`)
- Use `readonly` arrays where mutation isn't needed

```typescript
// Good
function analyze(command: string, options?: { strict?: boolean }): string | null { ... }
function analyzeRm(tokens: readonly string[], cwd: string | null): string | null { ... }

// Bad
function analyze(command, strict) { ... }  // Missing types
```

### Naming
- Functions/variables: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `UPPER_SNAKE_CASE` (reason strings: `REASON_*`)
- Private/internal: `_leadingUnderscore` (for module-private functions)

### Error Handling
- Print errors to stderr
- Exit codes: `0` = success, `1` = error
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

## Testing

Use Bun's built-in test runner with test helpers:

```typescript
import { describe, test } from 'bun:test';
import { assertBlocked, assertAllowed } from './helpers.ts';

describe('git rules', () => {
  test('git reset --hard blocked', () => {
    assertBlocked('git reset --hard', 'git reset --hard');
  });

  test('git status allowed', () => {
    assertAllowed('git status');
  });

  test('with cwd', () => {
    assertBlocked('rm -rf /', 'rm -rf', '/home/user');
  });
});
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
| `SAFETY_NET_PARANOID_RM=1` | Block non-temp `rm -rf` even within cwd |
| `SAFETY_NET_PARANOID_INTERPRETERS=1` | Block interpreter one-liners |

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

Default to Bun instead of Node.js:
- `bun <file>` instead of `node <file>`
- `bun test` instead of jest/vitest
- `bun install` instead of npm/yarn/pnpm install
- `bunx <pkg>` instead of `npx <pkg>`
- Bun auto-loads `.env` - no dotenv needed

Use `AGENT=1 bun test` to run tests.
