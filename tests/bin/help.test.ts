import { describe, expect, test } from 'bun:test';
import { findCommand } from '@/bin/commands';
import { printCommandHelp, printHelp, printVersion, showCommandHelp } from '@/bin/help';

/**
 * Capture console.log output during a function call.
 */
function captureOutput(fn: () => void): string {
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => {
    output += `${args.map(String).join(' ')}\n`;
  };
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return output;
}

describe('help output', () => {
  describe('printHelp (main help)', () => {
    test('contains version header', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('cc-safety-net v');
    });

    test('contains description', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('Blocks destructive git and filesystem commands');
    });

    test('lists all visible commands', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('doctor');
      expect(output).toContain('explain');
      expect(output).toContain('claude-code');
      expect(output).toContain('gemini-cli');
    });

    test('contains COMMANDS section', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('COMMANDS:');
    });

    test('contains GLOBAL OPTIONS section', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('GLOBAL OPTIONS:');
      expect(output).toContain('--help');
      expect(output).toContain('--version');
    });

    test('contains HELP section with usage hints', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('HELP:');
      expect(output).toContain('help <command>');
      expect(output).toContain('<command> --help');
    });

    test('contains ENVIRONMENT VARIABLES section', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('ENVIRONMENT VARIABLES:');
      expect(output).toContain('SAFETY_NET_STRICT');
      expect(output).toContain('SAFETY_NET_PARANOID');
    });

    test('contains CONFIG FILES section', () => {
      const output = captureOutput(() => printHelp());
      expect(output).toContain('CONFIG FILES:');
      expect(output).toContain('.safety-net.json');
    });
  });

  describe('printVersion', () => {
    test('prints version string', () => {
      const output = captureOutput(() => printVersion());
      // Version is either "dev" or a semver string
      expect(output.trim()).toMatch(/^(dev|\d+\.\d+\.\d+.*)$/);
    });
  });

  describe('printCommandHelp (subcommand help)', () => {
    test('prints command name', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const output = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('cc-safety-net doctor');
    });

    test('prints description', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const output = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('Run diagnostic checks');
    });

    test('prints USAGE section', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const output = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('USAGE:');
      expect(output).toContain('doctor [options]');
    });

    test('prints OPTIONS section', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const output = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('OPTIONS:');
      expect(output).toContain('--json');
      expect(output).toContain('--skip-update-check');
    });

    test('prints EXAMPLES section when available', () => {
      const cmd = findCommand('doctor');
      if (!cmd) throw new Error('doctor command not found');
      const output = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('EXAMPLES:');
      expect(output).toContain('cc-safety-net doctor');
    });

    test('explain command shows --cwd option with argument', () => {
      const cmd = findCommand('explain');
      if (!cmd) throw new Error('explain command not found');
      const output = captureOutput(() => printCommandHelp(cmd));
      expect(output).toContain('--cwd');
      expect(output).toContain('<path>');
    });
  });

  describe('showCommandHelp', () => {
    test('returns true and prints help for valid command', () => {
      let output = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        output += `${args.map(String).join(' ')}\n`;
      };

      const result = showCommandHelp('doctor');

      console.log = originalLog;

      expect(result).toBe(true);
      expect(output).toContain('cc-safety-net doctor');
    });

    test('returns true for alias', () => {
      let output = '';
      const originalLog = console.log;
      console.log = (...args: unknown[]) => {
        output += `${args.map(String).join(' ')}\n`;
      };

      const result = showCommandHelp('-cc');

      console.log = originalLog;

      expect(result).toBe(true);
      expect(output).toContain('cc-safety-net claude-code');
    });

    test('returns false for unknown command', () => {
      const result = showCommandHelp('nonexistent');
      expect(result).toBe(false);
    });
  });
});
