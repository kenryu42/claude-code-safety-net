import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyConfig as main, type VerifyConfigOptions } from '@/bin/verify-config';

describe('verify-config', () => {
  let tempDir: string;
  let userConfigPath: string;
  let projectConfigPath: string;
  let capturedStdout: string[];
  let capturedStderr: string[];
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    // Create unique temp directory
    tempDir = join(
      tmpdir(),
      `verify-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempDir, { recursive: true });

    // Set up paths
    userConfigPath = join(tempDir, '.cc-safety-net', 'config.json');
    projectConfigPath = join(tempDir, '.safety-net.json');

    // Capture console output
    capturedStdout = [];
    capturedStderr = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (...args: unknown[]) => {
      capturedStdout.push(args.map(String).join(' '));
    };
    console.error = (...args: unknown[]) => {
      capturedStderr.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  function writeUserConfig(content: string): void {
    const dir = join(tempDir, '.cc-safety-net');
    mkdirSync(dir, { recursive: true });
    writeFileSync(userConfigPath, content, 'utf-8');
  }

  function writeProjectConfig(content: string): void {
    writeFileSync(projectConfigPath, content, 'utf-8');
  }

  function runMain(): number {
    const options: VerifyConfigOptions = {
      userConfigPath,
      projectConfigPath,
    };
    return main(options);
  }

  function getStdout(): string {
    return capturedStdout.join('\n');
  }

  function getStderr(): string {
    return capturedStderr.join('\n');
  }

  describe('no configs', () => {
    test('returns zero when no configs exist', () => {
      const result = runMain();
      expect(result).toBe(0);
    });

    test('prints header', () => {
      runMain();
      const output = getStdout();
      expect(output).toContain('Safety Net Config');
      expect(output).toContain('═');
    });

    test('prints no configs message', () => {
      runMain();
      const output = getStdout();
      expect(output).toContain('No config files found');
      expect(output).toContain('Using built-in rules only');
    });
  });

  describe('valid configs', () => {
    test('user config only returns zero', () => {
      writeUserConfig('{"version": 1}');
      const result = runMain();
      expect(result).toBe(0);
    });

    test('user config prints checkmark', () => {
      writeUserConfig('{"version": 1}');
      runMain();
      const output = getStdout();
      expect(output).toContain('✓ User config:');
    });

    test('user config shows rules none', () => {
      writeUserConfig('{"version": 1}');
      runMain();
      const output = getStdout();
      expect(output).toContain('Rules: (none)');
    });

    test('user config with rules shows numbered list', () => {
      writeUserConfig(
        JSON.stringify({
          version: 1,
          rules: [
            {
              name: 'block-foo',
              command: 'foo',
              block_args: ['-x'],
              reason: 'Blocked',
            },
            {
              name: 'block-bar',
              command: 'bar',
              block_args: ['-y'],
              reason: 'Blocked',
            },
          ],
        }),
      );
      runMain();
      const output = getStdout();
      expect(output).toContain('Rules:');
      expect(output).toContain('1. block-foo');
      expect(output).toContain('2. block-bar');
    });

    test('project config only returns zero', () => {
      writeProjectConfig('{"version": 1}');
      const result = runMain();
      expect(result).toBe(0);
    });

    test('project config prints checkmark', () => {
      writeProjectConfig('{"version": 1}');
      runMain();
      const output = getStdout();
      expect(output).toContain('✓ Project config:');
    });

    test('both configs returns zero', () => {
      writeUserConfig('{"version": 1}');
      writeProjectConfig('{"version": 1}');
      const result = runMain();
      expect(result).toBe(0);
    });

    test('both configs prints both checkmarks', () => {
      writeUserConfig('{"version": 1}');
      writeProjectConfig('{"version": 1}');
      runMain();
      const output = getStdout();
      expect(output).toContain('✓ User config:');
      expect(output).toContain('✓ Project config:');
    });

    test('valid config prints success message', () => {
      writeProjectConfig('{"version": 1}');
      runMain();
      const output = getStdout();
      expect(output).toContain('All configs valid.');
    });
  });

  describe('invalid configs', () => {
    test('invalid user config returns one', () => {
      writeUserConfig('{"version": 2}');
      const result = runMain();
      expect(result).toBe(1);
    });

    test('invalid user config prints x mark', () => {
      writeUserConfig('{"version": 2}');
      runMain();
      const output = getStderr();
      expect(output).toContain('✗ User config:');
    });

    test('invalid config shows numbered errors', () => {
      writeUserConfig('{"version": 2}');
      runMain();
      const output = getStderr();
      expect(output).toContain('Errors:');
      expect(output).toContain('1.');
      expect(output).toContain('version');
    });

    test('invalid project config returns one', () => {
      writeProjectConfig('{"rules": []}');
      const result = runMain();
      expect(result).toBe(1);
    });

    test('invalid project config prints x mark', () => {
      writeProjectConfig('{"rules": []}');
      runMain();
      const output = getStderr();
      expect(output).toContain('✗ Project config:');
    });

    test('both invalid returns one', () => {
      writeUserConfig('{"version": 2}');
      writeProjectConfig('{"rules": []}');
      const result = runMain();
      expect(result).toBe(1);
    });

    test('both invalid prints both errors', () => {
      writeUserConfig('{"version": 2}');
      writeProjectConfig('{"rules": []}');
      runMain();
      const output = getStderr();
      expect(output).toContain('✗ User config:');
      expect(output).toContain('✗ Project config:');
    });

    test('invalid json prints error', () => {
      writeProjectConfig('{ not valid json }');
      runMain();
      const output = getStderr();
      expect(output).toContain('✗ Project config:');
    });

    test('validation failed message', () => {
      writeProjectConfig('{"version": 2}');
      runMain();
      const output = getStderr();
      expect(output).toContain('Config validation failed.');
    });
  });

  describe('mixed validity', () => {
    test('valid user invalid project returns one', () => {
      writeUserConfig('{"version": 1}');
      writeProjectConfig('{"version": 2}');
      const result = runMain();
      expect(result).toBe(1);
    });

    test('valid user invalid project shows both', () => {
      writeUserConfig('{"version": 1}');
      writeProjectConfig('{"version": 2}');
      runMain();
      const stdout = getStdout();
      const stderr = getStderr();
      expect(stdout).toContain('✓ User config:');
      expect(stderr).toContain('✗ Project config:');
    });

    test('invalid user valid project returns one', () => {
      writeUserConfig('{"version": 2}');
      writeProjectConfig('{"version": 1}');
      const result = runMain();
      expect(result).toBe(1);
    });

    test('invalid user valid project shows both', () => {
      writeUserConfig('{"version": 2}');
      writeProjectConfig('{"version": 1}');
      runMain();
      const stdout = getStdout();
      const stderr = getStderr();
      expect(stderr).toContain('✗ User config:');
      expect(stdout).toContain('✓ Project config:');
    });
  });

  describe('schema auto-add', () => {
    function readProjectConfig(): Record<string, unknown> {
      return JSON.parse(readFileSync(projectConfigPath, 'utf-8'));
    }

    function readUserConfig(): Record<string, unknown> {
      return JSON.parse(readFileSync(userConfigPath, 'utf-8'));
    }

    test('adds $schema to valid project config missing it', () => {
      writeProjectConfig('{"version": 1}');
      runMain();
      const config = readProjectConfig();
      expect(config.$schema).toBe(
        'https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json',
      );
    });

    test('adds $schema to valid user config missing it', () => {
      writeUserConfig('{"version": 1}');
      runMain();
      const config = readUserConfig();
      expect(config.$schema).toBe(
        'https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json',
      );
    });

    test('does not modify config that already has $schema', () => {
      const originalConfig = {
        $schema:
          'https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json',
        version: 1,
      };
      writeProjectConfig(JSON.stringify(originalConfig, null, 2));
      runMain();
      const config = readProjectConfig();
      expect(config).toEqual(originalConfig);
    });

    test('preserves existing rules when adding $schema', () => {
      const originalConfig = {
        version: 1,
        rules: [
          {
            name: 'block-foo',
            command: 'foo',
            block_args: ['-x'],
            reason: 'Blocked',
          },
        ],
      };
      writeProjectConfig(JSON.stringify(originalConfig));
      runMain();
      const config = readProjectConfig();
      expect(config.$schema).toBe(
        'https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json',
      );
      expect(config.version).toBe(1);
      expect(config.rules).toEqual(originalConfig.rules);
    });

    test('does not add $schema to invalid config', () => {
      writeProjectConfig('{"version": 2}');
      runMain();
      const config = readProjectConfig();
      expect(config.$schema).toBeUndefined();
    });

    test('prints message when $schema is added', () => {
      writeProjectConfig('{"version": 1}');
      runMain();
      const output = getStdout();
      expect(output).toContain('Added $schema');
    });
  });
});
