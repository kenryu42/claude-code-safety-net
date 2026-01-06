# Custom Rules Reference

Agent reference for generating `.safety-net.json` config files.

## Config Locations

| Scope | Path | Priority |
|-------|------|----------|
| User | `~/.cc-safety-net/config.json` | Lower |
| Project | `.safety-net.json` (cwd) | Higher (overrides user) |

Duplicate rule names (case-insensitive) → project wins.

## Schema

```json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [...]
}
```

- `$schema`: Optional. Enables IDE autocomplete and inline validation.
- `version`: Required. Must be `1`.
- `rules`: Optional. Defaults to `[]`.

**Always include `$schema`** when generating config files for IDE support.

## Rule Fields

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]{0,63}$` — unique (case-insensitive) |
| `command` | Yes | `^[a-zA-Z][a-zA-Z0-9_-]*$` — basename only, not path |
| `subcommand` | No | Same pattern as command. Omit to match any. |
| `block_args` | Yes | Non-empty array of non-empty strings |
| `reason` | Yes | Non-empty string, max 256 chars |

## Matching Behavior

- **Command**: Normalized to basename (`/usr/bin/git` → `git`)
- **Subcommand**: First non-option argument after command
- **Arguments**: Matched literally. Command blocked if **any** `block_args` item present.
- **Short options**: Expanded (`-Ap` matches `-A`)
- **Long options**: Exact match (`--all-files` does NOT match `--all`)
- **Execution order**: Built-in rules first, then custom rules (additive only)

## Examples

### Block `git add -A`

```json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [
    {
      "name": "block-git-add-all",
      "command": "git",
      "subcommand": "add",
      "block_args": ["-A", "--all", "."],
      "reason": "Use 'git add <specific-files>' instead."
    }
  ]
}
```

### Block global npm install

```json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [
    {
      "name": "block-npm-global",
      "command": "npm",
      "subcommand": "install",
      "block_args": ["-g", "--global"],
      "reason": "Use npx or local install."
    }
  ]
}
```

### Block docker system prune

```json
{
  "$schema": "https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json",
  "version": 1,
  "rules": [
    {
      "name": "block-docker-prune",
      "command": "docker",
      "subcommand": "system",
      "block_args": ["prune"],
      "reason": "Use targeted cleanup instead."
    }
  ]
}
```

## Error Handling

Invalid config → silent fallback to built-in rules only. No custom rules applied.
