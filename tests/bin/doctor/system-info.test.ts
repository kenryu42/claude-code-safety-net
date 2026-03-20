/**
 * Tests for the doctor command system-info functions.
 */

import { describe, expect, test } from 'bun:test';
import { defaultVersionFetcher, getPackageVersion, getSystemInfo } from '@/bin/doctor/system-info';
import { mockVersionFetcher } from '../../helpers.ts';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('getSystemInfo', () => {
  test('returns all required fields', async () => {
    const sysInfo = await getSystemInfo(mockVersionFetcher);

    expect(typeof sysInfo.version).toBe('string');
    expect(typeof sysInfo.platform).toBe('string');
    expect(
      sysInfo.claudeCodeVersion === null || typeof sysInfo.claudeCodeVersion === 'string',
    ).toBe(true);
    expect(sysInfo.openCodeVersion === null || typeof sysInfo.openCodeVersion === 'string').toBe(
      true,
    );
    expect(sysInfo.geminiCliVersion === null || typeof sysInfo.geminiCliVersion === 'string').toBe(
      true,
    );
    expect(
      sysInfo.copilotCliVersion === null || typeof sysInfo.copilotCliVersion === 'string',
    ).toBe(true);
    expect(sysInfo.nodeVersion === null || typeof sysInfo.nodeVersion === 'string').toBe(true);
    expect(sysInfo.npmVersion === null || typeof sysInfo.npmVersion === 'string').toBe(true);
    expect(sysInfo.bunVersion === null || typeof sysInfo.bunVersion === 'string').toBe(true);
  });

  test('detects Bun version with mock fetcher', async () => {
    const sysInfo = await getSystemInfo(mockVersionFetcher);
    expect(sysInfo.bunVersion).toBe('1.0.0');
  });

  test('includes Copilot CLI version with mock fetcher', async () => {
    const sysInfo = await getSystemInfo(mockVersionFetcher);
    expect(sysInfo.copilotCliVersion).toBe('1.0.9');
  });

  test('starts both copilot version probes immediately and prefers --binary-version', async () => {
    const calls: string[][] = [];
    const binaryVersion = createDeferred<string | null>();
    const fallbackVersion = createDeferred<string | null>();
    const fetcher = (args: string[]): Promise<string | null> => {
      calls.push(args);
      if (args[0] === 'copilot' && args[1] === '--binary-version') {
        return binaryVersion.promise;
      }
      if (args[0] === 'copilot' && args[1] === '--version') {
        return fallbackVersion.promise;
      }
      return Promise.resolve(null);
    };

    const sysInfoPromise = getSystemInfo(fetcher);
    await Promise.resolve();

    expect(calls.some((args) => args[0] === 'copilot' && args[1] === '--binary-version')).toBe(
      true,
    );
    expect(calls.some((args) => args[0] === 'copilot' && args[1] === '--version')).toBe(true);

    fallbackVersion.resolve('copilot 1.0.8');
    binaryVersion.resolve('Copilot binary version: 1.0.9');

    const sysInfo = await sysInfoPromise;

    expect(sysInfo.copilotCliVersion).toBe('1.0.9');
  });

  test('falls back to copilot --version when --binary-version is unavailable', async () => {
    const calls: string[][] = [];
    const fetcher = async (args: string[]) => {
      calls.push(args);
      if (args[0] !== 'copilot') return null;
      if (args[1] === '--binary-version') return null;
      if (args[1] === '--version') return 'copilot 1.0.8';
      return null;
    };

    const sysInfo = await getSystemInfo(fetcher);

    expect(sysInfo.copilotCliVersion).toBe('1.0.8');
    expect(calls.some((args) => args[0] === 'copilot' && args[1] === '--binary-version')).toBe(
      true,
    );
    expect(calls.some((args) => args[0] === 'copilot' && args[1] === '--version')).toBe(true);
  });

  test('does not wait for copilot --version when --binary-version succeeds', async () => {
    const calls: string[][] = [];
    const binaryVersion = createDeferred<string | null>();
    const fallbackVersion = createDeferred<string | null>();
    const fetcher = (args: string[]): Promise<string | null> => {
      calls.push(args);
      if (args[0] === 'copilot' && args[1] === '--binary-version') {
        return binaryVersion.promise;
      }
      if (args[0] === 'copilot' && args[1] === '--version') {
        return fallbackVersion.promise;
      }
      return Promise.resolve(null);
    };

    const sysInfoPromise = getSystemInfo(fetcher);
    await Promise.resolve();

    expect(calls.some((args) => args[0] === 'copilot' && args[1] === '--binary-version')).toBe(
      true,
    );
    expect(calls.some((args) => args[0] === 'copilot' && args[1] === '--version')).toBe(true);

    binaryVersion.resolve('Copilot binary version: 1.0.9');

    const sysInfo = await sysInfoPromise;

    expect(sysInfo.copilotCliVersion).toBe('1.0.9');

    fallbackVersion.resolve('copilot 1.0.8');
  }, 100);

  test('handles commands that exit with non-zero code', async () => {
    const failingFetcher = async (_args: string[]) => null;
    const result = await getSystemInfo(failingFetcher);
    expect(result.claudeCodeVersion).toBeNull();
    expect(result.copilotCliVersion).toBeNull();
    expect(result.bunVersion).toBeNull();
    expect(result.nodeVersion).toBeNull();
  });

  test('handles empty version output', async () => {
    const emptyFetcher = async (_args: string[]) => '';
    const result = await getSystemInfo(emptyFetcher);
    expect(result.claudeCodeVersion).toBeNull();
    expect(result.copilotCliVersion).toBeNull();
    expect(result.bunVersion).toBeNull();
  });
});

describe('defaultVersionFetcher', () => {
  test('returns null for non-existent commands', async () => {
    const result = await defaultVersionFetcher([
      '__nonexistent_command_that_definitely_does_not_exist__',
      '--version',
    ]);
    expect(result).toBeNull();
  });

  test('returns null for empty args', async () => {
    const result = await defaultVersionFetcher([]);
    expect(result).toBeNull();
  });

  test('returns null when spawn throws synchronously for invalid command input', async () => {
    const result = await defaultVersionFetcher(['\u0000']);
    expect(result).toBeNull();
  });

  test('returns version for existing commands', async () => {
    const result = await defaultVersionFetcher(['bun', '--version']);
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d+\.\d+/);
  });

  test('returns null for commands that time out', async () => {
    const startedAt = Date.now();
    const result = await defaultVersionFetcher(['bun', '-e', 'setTimeout(() => {}, 3000)']);
    const durationMs = Date.now() - startedAt;

    expect(result).toBeNull();
    expect(durationMs).toBeLessThan(2800);
  }, 5000);

  test('returns null for commands that exit with non-zero code', async () => {
    const result = await defaultVersionFetcher(['false']);
    expect(result).toBeNull();
  });

  test('detects bun version with the real fetcher', async () => {
    const result = await defaultVersionFetcher(['bun', '--version']);
    expect(result).toMatch(/^\d+\.\d+/);
  }, 5000);
});

describe('version comparison', () => {
  test('system version is a string', async () => {
    const sysInfo = await getSystemInfo(mockVersionFetcher);
    expect(typeof sysInfo.version).toBe('string');
  });

  test('getPackageVersion returns version string', () => {
    const version = getPackageVersion();
    expect(typeof version).toBe('string');
    expect(version === 'dev' || /^\d+\.\d+\.\d+/.test(version)).toBe(true);
  });
});
