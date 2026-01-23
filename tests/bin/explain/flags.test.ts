/**
 * Tests for parseExplainFlags unit parsing behavior.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { parseExplainFlags } from '@/bin/explain/flags';

describe('parseExplainFlags', () => {
  let capturedStderr: string[];
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    capturedStderr = [];
    originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      capturedStderr.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  function getStderr(): string {
    return capturedStderr.join('\n');
  }

  test('parses --json and command args', () => {
    const flags = parseExplainFlags(['--json', 'git', 'status']);
    expect(flags).not.toBeNull();
    if (!flags) return;
    expect(flags.json).toBe(true);
    expect(flags.cwd).toBeUndefined();
    expect(flags.command).toBe('git status');
  });

  test('parses --cwd and command args', () => {
    const flags = parseExplainFlags(['--cwd', '/tmp', 'rm', '-rf', './foo']);
    expect(flags).not.toBeNull();
    if (!flags) return;
    expect(flags.json).toBe(false);
    expect(flags.cwd).toBe('/tmp');
    expect(flags.command).toBe('rm -rf ./foo');
  });

  test('skips help flags and continues parsing', () => {
    const flags = parseExplainFlags(['-h', '--json', 'echo']);
    expect(flags).not.toBeNull();
    if (!flags) return;
    expect(flags.json).toBe(true);
    expect(flags.command).toBe('echo');
  });

  test('treats -- separator as command start', () => {
    const flags = parseExplainFlags(['--json', '--', '--debug', '--verbose']);
    expect(flags).not.toBeNull();
    if (!flags) return;
    expect(flags.json).toBe(true);
    expect(flags.command).toBe('--debug --verbose');
  });

  test('treats unknown flag as command start', () => {
    const flags = parseExplainFlags(['--json', '--unknown-flag', 'foo']);
    expect(flags).not.toBeNull();
    if (!flags) return;
    expect(flags.json).toBe(true);
    expect(flags.command).toBe('--unknown-flag foo');
  });

  test('preserves single-arg command with shell operators', () => {
    const flags = parseExplainFlags(['--json', 'git status | rm -rf /']);
    expect(flags).not.toBeNull();
    if (!flags) return;
    expect(flags.command).toBe('git status | rm -rf /');
  });

  test('errors when command is missing', () => {
    const flags = parseExplainFlags(['--json']);
    expect(flags).toBeNull();
    const stderr = getStderr();
    expect(stderr).toContain('No command provided');
    expect(stderr).toContain('Usage: cc-safety-net explain');
  });

  test('errors when --cwd has no value', () => {
    const flags = parseExplainFlags(['--cwd']);
    expect(flags).toBeNull();
    expect(getStderr()).toContain('--cwd requires a path');
  });

  test('errors when --cwd value is another flag', () => {
    const flags = parseExplainFlags(['--cwd', '--json', 'echo']);
    expect(flags).toBeNull();
    expect(getStderr()).toContain('--cwd requires a path');
  });
});
