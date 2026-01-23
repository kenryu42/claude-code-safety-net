import { describe, expect, test } from 'bun:test';
import { findCommand, getVisibleCommands } from '@/bin/commands';

describe('command registry', () => {
  describe('findCommand', () => {
    test('finds command by name', () => {
      const cmd = findCommand('doctor');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('doctor');
    });

    test('finds command by alias', () => {
      const cmd = findCommand('-cc');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('claude-code');
    });

    test('finds command case-insensitively', () => {
      const cmd = findCommand('DOCTOR');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('doctor');
    });

    test('returns undefined for unknown command', () => {
      const cmd = findCommand('nonexistent');
      expect(cmd).toBeUndefined();
    });

    test('finds command by long alias', () => {
      const cmd = findCommand('--claude-code');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('claude-code');
    });
  });

  describe('getVisibleCommands', () => {
    test('returns all non-hidden commands', () => {
      const visible = getVisibleCommands();
      expect(visible.length).toBeGreaterThan(0);

      // Verify expected commands are present
      const names = visible.map((c) => c.name);
      expect(names).toContain('doctor');
      expect(names).toContain('explain');
      expect(names).toContain('claude-code');
      expect(names).toContain('gemini-cli');
    });
  });
});

describe('command definitions', () => {
  test('all commands have required fields', () => {
    const visible = getVisibleCommands();
    for (const cmd of visible) {
      expect(cmd.name).toBeDefined();
      expect(cmd.description).toBeDefined();
      expect(cmd.usage).toBeDefined();
      expect(cmd.options).toBeDefined();
      expect(Array.isArray(cmd.options)).toBe(true);
    }
  });

  test('all commands have help option', () => {
    const visible = getVisibleCommands();
    for (const cmd of visible) {
      const hasHelpOption = cmd.options.some(
        (opt) => opt.flags.includes('--help') || opt.flags.includes('-h'),
      );
      expect(hasHelpOption).toBe(true);
    }
  });

  test('doctor command has expected options', () => {
    const cmd = findCommand('doctor');
    expect(cmd).toBeDefined();

    const flags = cmd?.options.map((opt) => opt.flags);
    expect(flags).toContain('--json');
    expect(flags).toContain('--skip-update-check');
  });

  test('explain command has expected options', () => {
    const cmd = findCommand('explain');
    expect(cmd).toBeDefined();

    const flags = cmd?.options.map((opt) => opt.flags);
    expect(flags).toContain('--json');
    expect(flags).toContain('--cwd');
  });
});
