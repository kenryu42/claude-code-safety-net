import { describe, expect, test } from 'bun:test';
import { managedHookCommands } from '@next/hosts/managed-command';
import { CURSOR_HOOK_COMMAND } from '@/integrations/cursor/install';
import { GROK_BUILD_HOOK_COMMAND } from '@/integrations/grok-build/install';

/**
 * One spelling per host, derived from the catalog's long runtime flag. The literals below are the
 * ones `src/` writes into host configs, so a wrong flag in the catalog — or a host whose runtime
 * row is dropped — shows up here rather than as an installed hook no detector recognises.
 */

describe('the managed hook command', () => {
  test('spells out what every npx-launched host runs', () => {
    expect(managedHookCommands).toEqual({
      'antigravity-cli': 'npx -y cc-safety-net hook --agy-cli',
      'claude-code': 'npx -y cc-safety-net hook --coding-cli',
      codex: 'npx -y cc-safety-net hook --codex',
      'copilot-cli': 'npx -y cc-safety-net hook --copilot-cli',
      cursor: 'npx -y cc-safety-net hook --cursor',
      'gemini-cli': 'npx -y cc-safety-net hook --gemini-cli',
      'grok-build': 'npx -y cc-safety-net hook --grok-build',
      'hermes-agent': 'npx -y cc-safety-net hook --hermes-agent',
      'kimi-code': 'npx -y cc-safety-net hook --kimi-code',
    });
  });

  test('agrees with the constants the shipped installers write', () => {
    expect(managedHookCommands.cursor).toBe(CURSOR_HOOK_COMMAND);
    expect(managedHookCommands.cursor).toMatchSnapshot();
    expect(managedHookCommands['grok-build']).toBe(GROK_BUILD_HOOK_COMMAND);
    expect(managedHookCommands['grok-build']).toMatchSnapshot();
  });

  test('splits into the argv the Hermes shim spawns', () => {
    expect(managedHookCommands['hermes-agent'].split(' ')).toEqual([
      'npx',
      '-y',
      'cc-safety-net',
      'hook',
      '--hermes-agent',
    ]);
  });
});
