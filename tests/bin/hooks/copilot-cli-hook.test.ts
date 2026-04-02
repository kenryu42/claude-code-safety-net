import { describe, expect, test } from 'bun:test';
import { runCopilotHook } from './hook-helpers';

describe('Copilot CLI hook', () => {
  describe('blocked commands', () => {
    test('blocks rm -rf via bash tool', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'rm -rf /' }),
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain('rm -rf');
    });
  });

  describe('ask mode', () => {
    test('ask mode returns ask decision instead of deny', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'rm -rf /' }),
      };

      const { stdout, exitCode } = await runCopilotHook(input, {
        SAFETY_NET_ASK: '1',
      });

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.permissionDecision).toBe('ask');
      expect(output.permissionDecisionReason).toContain('FLAGGED by Safety Net');
      expect(output.permissionDecisionReason).toContain('rm -rf');
    });

    test('ask mode still allows safe commands', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'ls -la' }),
      };

      const { stdout, exitCode } = await runCopilotHook(input, {
        SAFETY_NET_ASK: '1',
      });

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });
  });

  describe('allowed commands', () => {
    test('allows safe commands (no output)', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: 'ls -la' }),
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });
  });

  describe('non-target tool', () => {
    test('ignores non-bash tools', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'write_file',
        toolArgs: JSON.stringify({ path: '/etc/passwd' }),
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(exitCode).toBe(0);
      expect(stdout).toBe('');
    });
  });

  describe('empty stdin', () => {
    test('empty input produces no output', async () => {
      const { stdout, exitCode } = await runCopilotHook('');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('whitespace-only input produces no output', async () => {
      const { stdout, exitCode } = await runCopilotHook('   \n\t  ');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('invalid outer JSON', () => {
    test('strict mode blocks invalid outer JSON', async () => {
      const { stdout, exitCode } = await runCopilotHook('{invalid json', {
        SAFETY_NET_STRICT: '1',
      });

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain(
        'Failed to parse hook input JSON (strict mode)',
      );
    });

    test('non-strict mode silently ignores invalid outer JSON', async () => {
      const { stdout, exitCode } = await runCopilotHook('{invalid json');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('invalid toolArgs', () => {
    test('strict mode blocks invalid toolArgs JSON', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: '{invalid',
      };

      const { stdout, exitCode } = await runCopilotHook(input, {
        SAFETY_NET_STRICT: '1',
      });

      expect(exitCode).toBe(0);
      const output = JSON.parse(stdout);
      expect(output.permissionDecision).toBe('deny');
      expect(output.permissionDecisionReason).toContain(
        'Failed to parse toolArgs JSON (strict mode)',
      );
    });

    test('non-strict mode silently ignores invalid toolArgs JSON', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: '{invalid',
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('missing command', () => {
    test('missing command in toolArgs produces no output', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({}),
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('null command in toolArgs produces no output', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: null }),
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('empty string command in toolArgs produces no output', async () => {
      const input = {
        timestamp: Date.now(),
        cwd: process.cwd(),
        toolName: 'bash',
        toolArgs: JSON.stringify({ command: '' }),
      };

      const { stdout, exitCode } = await runCopilotHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });
});
