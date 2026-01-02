# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v0.3.1 (2026-01-02)

### Fix

- Add cross-platform script execution compatibility

## v0.3.0 (2026-01-01)

### Feat

- add short option expansion to custom rule matching
- add commands for custom rules management
- detect find -exec rm -rf as destructive pattern
- add verify_config script for config validation
- integrate custom rules into hook analysis
- add custom rule matching logic
- add config loading module for user-configurable rules

### Fix

- stop _short_opts parsing at non-alpha chars and -- marker
- Block rm -rf of cwd itself even when under /tmp/

### Refactor

- improve verify_config output formatting
- return ValidationResult from validate_config_file

## v0.2.0 (2025-12-29)

### Feat

- add audit logging for denied commands
- add paranoid mode environment variable checks
- detect dangerous commands via xargs and parallel
- block git worktree remove --force
- block git checkout <ref> <pathspec> without --
- block find -delete destructive command

### Fix

- Add cross-platform script execution compatibility
- recognize rm -R (uppercase) as recursive and respect -- delimiter
- preserve case sensitivity for git branch -D detection

### Refactor

- rename strict to paranoid for rm rule parameter

## v0.1.0 (2025-12-26)

### Feat

- initial implementation
