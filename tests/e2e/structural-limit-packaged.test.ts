import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { REASON_RECURSION_LIMIT } from '@/gate/analyzer/reasons';

describe('packaged structural command limits', () => {
  test('denies an exact one-MiB command through the built Coding CLI hook', () => {
    const command = 'a '.repeat(524_288);
    const result = spawnSync('node', ['dist/bin/cc-safety-net.js', 'hook', '--coding-cli'], {
      cwd: process.cwd(),
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        cwd: process.cwd(),
        tool_name: 'Bash',
        tool_input: { command },
      }),
      encoding: 'utf8',
    });

    expect(Buffer.byteLength(command)).toBe(1_048_576);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const output = JSON.parse(result.stdout);
    expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(output.hookSpecificOutput.permissionDecisionReason).toContain(REASON_RECURSION_LIMIT);
  });
});
