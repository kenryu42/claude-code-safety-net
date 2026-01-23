/**
 * Tests for the explain command CLI flag parsing.
 */
import { describe, expect, test } from 'bun:test';

describe('explain CLI flag parsing', () => {
  test('explain preserves --debug in command when it appears after first positional arg', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--json', 'echo', '--debug'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(output);
    const parseStep = parsed.trace.steps.find((s: { type: string }) => s.type === 'parse');
    expect(parseStep.input).toBe('echo --debug');
    expect(exitCode).toBe(0);
  });

  test('explain preserves --json in command when after positional arg', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--json', 'git', 'push', '--json'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(output);
    const parseStep = parsed.trace.steps.find((s: { type: string }) => s.type === 'parse');
    expect(parseStep.input).toBe('git push --json');
    expect(exitCode).toBe(0);
  });

  test('explain with -- separator treats everything after as command', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--json', '--', '--debug'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(output);
    const parseStep = parsed.trace.steps.find((s: { type: string }) => s.type === 'parse');
    expect(parseStep.input).toBe('--debug');
    expect(exitCode).toBe(0);
  });

  test('explain unknown flag is treated as start of command', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--json', '--unknown-flag', 'foo'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(output);
    const parseStep = parsed.trace.steps.find((s: { type: string }) => s.type === 'parse');
    expect(parseStep.input).toBe('--unknown-flag foo');
    expect(exitCode).toBe(0);
  });

  test('explain single-arg command with pipe preserves shell operators', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--json', 'git status | rm -rf /'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(output);
    const parseStep = parsed.trace.steps.find((s: { type: string }) => s.type === 'parse');
    expect(parseStep.input).toBe('git status | rm -rf /');
    expect(parseStep.segments).toEqual([
      ['git', 'status'],
      ['rm', '-rf', '/'],
    ]);
    expect(parsed.result).toBe('blocked');
    expect(exitCode).toBe(0);
  });

  test('explain --cwd <path> passes cwd to analysis', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--json', '--cwd', '/tmp', 'rm -rf ./foo'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    const parsed = JSON.parse(output);
    expect(parsed.result).toBe('allowed');
    expect(exitCode).toBe(0);
  });

  test('explain --cwd without path shows error', async () => {
    const proc = Bun.spawn(['bun', 'src/bin/cc-safety-net.ts', 'explain', '--cwd'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(stderr).toContain('--cwd requires a path');
    expect(exitCode).toBe(1);
  });

  test('explain --cwd with following flag shows error', async () => {
    const proc = Bun.spawn(
      ['bun', 'src/bin/cc-safety-net.ts', 'explain', '--cwd', '--json', 'echo hello'],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(stderr).toContain('--cwd requires a path');
    expect(exitCode).toBe(1);
  });
});
