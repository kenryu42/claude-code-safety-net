import { describe, expect, test } from 'bun:test';
import type { HookOutput } from '@/types';

describe('CLI wrapper output format', () => {
  test('blocked command produces correct JSON structure', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {
        command: 'git reset --hard',
      },
    });

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--claude-code'], {
      stdin: new Blob([input]),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const parsed = JSON.parse(output) as HookOutput;

    expect(parsed.hookSpecificOutput).toBeDefined();
    expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(parsed.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('BLOCKED by Safety Net');
    expect(parsed.hookSpecificOutput.permissionDecisionReason).toContain('git reset --hard');
  });

  test('allowed command produces no output', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: {
        command: 'git status',
      },
    });

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--claude-code'], {
      stdin: new Blob([input]),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('');
    expect(exitCode).toBe(0);
  });

  test('non-Bash tool produces no output', async () => {
    const input = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: {
        path: '/some/file.txt',
      },
    });

    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', '--claude-code'], {
      stdin: new Blob([input]),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(output.trim()).toBe('');
    expect(exitCode).toBe(0);
  });
});
