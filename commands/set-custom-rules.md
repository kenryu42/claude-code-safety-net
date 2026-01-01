---
description: Set custom rules for the project
allowed-tools: Bash, Read, Write, Glob
---

# Set Custom Rules for Safety Net

You are helping the user configure custom blocking rules for claude-code-safety-net.

**Reference**: @CUSTOM_RULES_REFERENCE.md for schema details, field constraints, and examples.

## Your Task

Follow this flow exactly:

### Step 1: Show Examples and Ask for Scope

Show examples in natural language:
- "Block `git add -A` and `git add .` to prevent blanket staging"
- "Block `npm install -g` to prevent global package installs"
- "Block `docker system prune` to prevent accidental cleanup"

Ask: **Which scope would you like to configure?**
- **User** (`~/.cc-safety-net/config.json`) - applies to all your projects
- **Project** (`.safety-net.json`) - applies only to this project

### Step 2: Ask for Rules

Ask the user to describe rules in natural language. They can list multiple.

### Step 3: Generate JSON Config

Parse user input and generate valid JSON. Use @CUSTOM_RULES_REFERENCE.md for:
- Field constraints and patterns
- Example rule structures

Guidelines:
- `name`: kebab-case, descriptive (e.g., `block-git-add-all`)
- `command`: binary name only, lowercase
- `subcommand`: omit if rule applies to any subcommand
- `block_args`: include all variants (e.g., both `-g` and `--global`)
- `reason`: explain why blocked AND suggest alternative

### Step 4: Show Config and Confirm

Display the generated JSON and ask:
- "Does this look correct?"
- "Would you like to modify anything?"

### Step 5: Check for Existing Config

Check if config exists at target location:
```bash
cat ~/.cc-safety-net/config.json 2>/dev/null  # user scope
cat .safety-net.json 2>/dev/null               # project scope
```

If exists:
1. Show existing config
2. Ask: **Merge** (add new rules, duplicates use new version) or **Replace**?

### Step 6: Validate and Write

For user scope, ensure directory exists:
```bash
mkdir -p ~/.cc-safety-net
```

Write config, then validate:
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/verify_config.py
```

If validation errors:
- Show specific errors
- Offer to fix with your best suggestion
- Confirm before proceeding

### Step 7: Confirm Success

Tell the user:
1. Config saved to [path]
2. **Changes take effect immediately** - no restart needed
3. Summary of rules added

## Important Notes

- Custom rules can only ADD restrictions, not bypass built-in protections
- Rule names must be unique (case-insensitive)
- Invalid config → entire config ignored, only built-in rules apply
