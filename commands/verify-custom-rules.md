---
description: Verify custom rules for the project
allowed-tools: Bash, AskUserQuestion
---

**Reference**: @CUSTOM_RULES_REFERENCE.md for schema details, field constraints, and examples.

You are helping the user verify the custom rules config file.
ALWAYS use AskUserQuestion tool when you need to ask the user questions.

### Verification Script

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/src/bin/cc-safety-net.ts --verify-config"
```

If the config has validation errors, inform the user:
- Show the specific validation errors
- Offer to fix them with your best suggestion
- Ask for confirmation before proceeding

After fixing the config, verify it again.