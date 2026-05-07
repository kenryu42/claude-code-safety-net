---
name: set-custom-rules
description: Configure cc-safety-net custom rules.
disable-model-invocation: true
---

# Set Custom Rules

## Workflow

Help the user configure custom blocking rules for Safety Net.

1. Run `npx -y cc-safety-net --custom-rules-doc` and use that schema documentation as the source of truth.
2. Ask which scope to configure:
   - User scope: `~/.cc-safety-net/config.json`, applies to all projects.
   - Project scope: `.safety-net.json`, applies only to the current project.
3. Show a few natural-language examples, then ask the user to describe the rules they want:
   - Block `git add -A` and `git add .` to prevent blanket staging.
   - Block `npm install -g` to prevent global package installs.
   - Block `docker system prune` to prevent accidental cleanup.
4. Convert the request into valid Safety Net JSON using the schema documentation. Show the generated config to the user and ask whether it looks correct.
5. Check existing configs before writing:
   - User config: `cat ~/.cc-safety-net/config.json 2>/dev/null || echo "No user config found"`
   - Project config: `cat .safety-net.json 2>/dev/null || echo "No project config found"`
6. If the selected scope already has a config, show it and ask whether to merge or replace. When merging, preserve unrelated existing rules and update same-name rules with the new version.
7. Write the selected config file only after user confirmation.
8. Run `npx -y cc-safety-net --verify-config`.
9. If validation fails, show the exact errors, suggest the smallest fix, and confirm before changing the config again.
10. Confirm the saved path, state that changes take effect immediately, and summarize the added or updated rules.

## Rules

- Custom rules can only add restrictions; they cannot bypass built-in Safety Net protections.
- Rule names must be unique case-insensitively.
- If a config is invalid, Safety Net ignores the entire custom config and uses built-in rules only.
