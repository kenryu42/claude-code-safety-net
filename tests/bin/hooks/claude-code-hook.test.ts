import { describe, expect, test } from 'bun:test';
import { runClaudeCodeHook } from './hook-helpers';

describe('Claude Code hook', () => {
  describe('blocked commands', () => {
    test('blocked command produces correct JSON structure', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'git reset --hard',
        },
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input);

      const parsed = JSON.parse(stdout);
      expect(exitCode).toBe(0);
      expect(parsed.hookSpecificOutput).toBeDefined();
      expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('BLOCKED by Safety Net');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
    });
  });

  describe('ask mode', () => {
    test('ask mode returns ask decision instead of deny', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'git reset --hard',
        },
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input, {
        SAFETY_NET_ASK: '1',
      });

      const parsed = JSON.parse(stdout);
      expect(exitCode).toBe(0);
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('ask');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('FLAGGED by Safety Net');
    });

    test('ask mode still allows safe commands', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'git status',
        },
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input, {
        SAFETY_NET_ASK: '1',
      });

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('strict JSON parse failures still deny even in ask mode', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook('{invalid json', {
        SAFETY_NET_ASK: '1',
        SAFETY_NET_STRICT: '1',
      });

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('BLOCKED by Safety Net');
    });

    test('strict command parse failures still deny even in ask mode', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: "git reset --hard 'unterminated",
        },
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input, {
        SAFETY_NET_ASK: '1',
        SAFETY_NET_STRICT: '1',
      });

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('BLOCKED by Safety Net');
    });
  });

  describe('allowed commands', () => {
    test('allowed command produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {
          command: 'git status',
        },
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('non-target tool', () => {
    test('non-Bash tool produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: {
          path: '/some/file.txt',
        },
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('empty stdin', () => {
    test('empty input produces no output', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook('');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('whitespace-only input produces no output', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook('   \n\t  ');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('invalid JSON', () => {
    test('strict mode blocks invalid JSON', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook('{invalid json', {
        SAFETY_NET_STRICT: '1',
      });

      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain(
        'Failed to parse hook input JSON (strict mode)',
      );
    });

    test('non-strict mode silently ignores invalid JSON', async () => {
      const { stdout, exitCode } = await runClaudeCodeHook('{invalid json');

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });

  describe('missing command', () => {
    test('missing command in tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {},
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('null tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: null,
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });

    test('missing tool_input produces no output', async () => {
      const input = {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
      };

      const { stdout, exitCode } = await runClaudeCodeHook(input);

      expect(stdout).toBe('');
      expect(exitCode).toBe(0);
    });
  });
});
