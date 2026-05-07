---
name: verify-custom-rules
description: Verify cc-safety-net custom rules.
disable-model-invocation: true
---

# Verify Custom Rules

## Workflow

Help the user verify the current Safety Net custom rules config.

1. Run `npx -y cc-safety-net --verify-config` to check the current validation status.
2. If validation succeeds, report the success and the validated config path or paths shown by the command.
3. If validation fails, show the exact validation errors.
4. Run `npx -y cc-safety-net --custom-rules-doc` and use the schema documentation as the source of truth for fixes.
5. Inspect the relevant config file before proposing edits:
   - User config: `~/.cc-safety-net/config.json`
   - Project config: `.safety-net.json`
6. Suggest the smallest schema-compliant fix that preserves the user's intended restrictions.
7. Ask for confirmation before editing any config file.
8. After fixing, run `npx -y cc-safety-net --verify-config` again.
9. Confirm the final validation result and summarize the changes made.

## Rules

- Do not delete failing rules unless the user explicitly asks for removal.
- Do not weaken or bypass built-in Safety Net protections.
- Treat invalid configs as urgent because Safety Net ignores the entire custom config and uses built-in rules only.
