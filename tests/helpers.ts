import { expect } from 'bun:test';
import type { VersionFetcher } from '@/bin/doctor/system-info';
import { analyzeCommand } from '@/core/analyze';
import { loadConfig } from '@/core/config';
import type { AnalyzeOptions, Config } from '@/types';

function envTruthy(name: string): boolean {
  const val = process.env[name];
  return val === '1' || val === 'true' || val === 'yes';
}

// Default empty config for tests that don't specify a cwd
// This prevents loading the project's .safety-net.json
const DEFAULT_TEST_CONFIG: Config = { version: 1, rules: [] };

function getOptionsFromEnv(cwd?: string, config?: Config): AnalyzeOptions {
  // If no cwd specified, use empty config to avoid loading project's config
  const effectiveConfig = config ?? (cwd ? loadConfig(cwd) : DEFAULT_TEST_CONFIG);
  return {
    cwd,
    config: effectiveConfig,
    strict: envTruthy('SAFETY_NET_STRICT'),
    paranoidRm: envTruthy('SAFETY_NET_PARANOID') || envTruthy('SAFETY_NET_PARANOID_RM'),
    paranoidInterpreters:
      envTruthy('SAFETY_NET_PARANOID') || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS'),
  };
}

export function assertBlocked(command: string, reasonContains: string, cwd?: string): void {
  const options = getOptionsFromEnv(cwd);
  const result = analyzeCommand(command, options);
  expect(result).not.toBeNull();
  expect(result?.reason).toContain(reasonContains);
}

export function assertAllowed(command: string, cwd?: string): void {
  const options = getOptionsFromEnv(cwd);
  const result = analyzeCommand(command, options);
  expect(result).toBeNull();
}

export function runGuard(command: string, cwd?: string, config?: Config): string | null {
  const options = getOptionsFromEnv(cwd, config);
  return analyzeCommand(command, options)?.reason ?? null;
}

export function withEnv<T>(env: Record<string, string>, fn: () => T): T {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    original[key] = process.env[key];
    process.env[key] = env[key];
  }
  try {
    return fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  }
}

/**
 * Mock version fetcher for testing.
 * Returns predefined versions instantly without spawning processes.
 */
export const mockVersionFetcher: VersionFetcher = async (args: string[]) => {
  const cmd = args[0];
  const mockVersions: Record<string, string> = {
    claude: '1.0.0',
    opencode: '0.1.0',
    gemini: '0.20.0',
    node: 'v22.0.0',
    npm: '10.0.0',
    bun: '1.0.0',
  };
  return mockVersions[cmd ?? ''] ?? null;
};
