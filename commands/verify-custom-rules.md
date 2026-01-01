---
description: Verify custom rules for the project
allowed-tools: Bash
---

**Reference**: @CUSTOM_RULES_REFERENCE.md for schema details, field constraints, and examples.

Verify the custom rules config file using the verify_config.py script.
```bash
${CLAUDE_PLUGIN_ROOT}/scripts/verify_config.py
```

If the config has validation errors, inform the user:
- Show the specific validation errors
- Offer to fix them with your best suggestion
- Ask for confirmation before proceeding

After fixing the config, verify it again.