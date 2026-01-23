/**
 * Tests for the doctor command system-info functions.
 */

import { describe, expect, test } from 'bun:test';
import { defaultVersionFetcher, getPackageVersion, getSystemInfo } from '@/bin/doctor/system-info';
import { mockVersionFetcher } from '../../helpers.ts';

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
    expect(sysInfo.nodeVersion === null || typeof sysInfo.nodeVersion === 'string').toBe(true);
    expect(sysInfo.npmVersion === null || typeof sysInfo.npmVersion === 'string').toBe(true);
    expect(sysInfo.bunVersion === null || typeof sysInfo.bunVersion === 'string').toBe(true);
  });

  test('detects Bun version with mock fetcher', async () => {
    const sysInfo = await getSystemInfo(mockVersionFetcher);
    expect(sysInfo.bunVersion).toBe('1.0.0');
  });

  test('uses real fetcher by default and detects bun', async () => {
    const sysInfo = await getSystemInfo();
    expect(sysInfo.bunVersion).toMatch(/^\d+\.\d+/);
    expect(sysInfo.platform).toContain(process.platform);
  });

  test('handles non-existent commands gracefully', async () => {
    const sysInfo = await getSystemInfo();
    expect(
      sysInfo.claudeCodeVersion === null || typeof sysInfo.claudeCodeVersion === 'string',
    ).toBe(true);
    expect(sysInfo.openCodeVersion === null || typeof sysInfo.openCodeVersion === 'string').toBe(
      true,
    );
    expect(sysInfo.geminiCliVersion === null || typeof sysInfo.geminiCliVersion === 'string').toBe(
      true,
    );
  });

  test('handles commands that exit with non-zero code', async () => {
    const failingFetcher = async (_args: string[]) => null;
    const result = await getSystemInfo(failingFetcher);
    expect(result.claudeCodeVersion).toBeNull();
    expect(result.bunVersion).toBeNull();
    expect(result.nodeVersion).toBeNull();
  });

  test('handles empty version output', async () => {
    const emptyFetcher = async (_args: string[]) => '';
    const result = await getSystemInfo(emptyFetcher);
    expect(result.claudeCodeVersion).toBeNull();
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

  test('returns version for existing commands', async () => {
    const result = await defaultVersionFetcher(['bun', '--version']);
    expect(result).not.toBeNull();
    expect(result).toMatch(/^\d+\.\d+/);
  });

  test('returns null for commands that exit with non-zero code', async () => {
    const result = await defaultVersionFetcher(['false']);
    expect(result).toBeNull();
  });
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
