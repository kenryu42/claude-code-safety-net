---
description: Verify custom rules for the project
allowed-tools: Bash, AskUserQuestion
---

# Verify Custom Rules for Safety Net

You are helping the user verify the custom rules config file.
ALWAYS use AskUserQuestion tool when you need to ask the user questions.

## Your Task

Follow this flow exactly:

### Step 1: Run `npx -y cc-safety-net --custom-rules-doc` to read the full schema details, field constraints, and usage examples

### Step 2: Run `npx -y cc-safety-net --verify-config` to verify the config file

If the config has validation errors, inform the user:
- Show the specific validation errors
- Offer to fix them with your best suggestion
- Ask for confirmation before proceeding

After fixing the config, run `npx -y cc-safety-net --verify-config` to verify it again.