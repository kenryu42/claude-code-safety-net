/**
 * System information for the doctor command.
 */

import { spawn } from 'node:child_process';

import type { SystemInfo } from '@/bin/doctor/types';

declare const __PKG_VERSION__: string | undefined;

const CURRENT_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';
const VERSION_FETCH_TIMEOUT_MS = 2000;

/**
 * Get the package version synchronously.
 * This is useful for callers that only need the version without fetching tool versions.
 */
export function getPackageVersion(): string {
  return CURRENT_VERSION;
}

/**
 * Version fetcher function type.
 * Takes command args and returns the version string or null.
 */
export type VersionFetcher = (args: string[]) => Promise<string | null>;

/**
 * Default version fetcher that runs shell commands.
 * Uses Node.js child_process.spawn for compatibility with both Node and Bun runtimes.
 * @internal Exported for testing
 */
export const defaultVersionFetcher: VersionFetcher = async (args: string[]) => {
  const [cmd, ...rest] = args;
  if (!cmd) return null;

  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, rest, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let isSettled = false;

      let output = '';
      proc.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });
      proc.stderr.on('data', () => {});

      const finish = (value: string | null): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);
        resolve(value);
      };

      const timeoutId = setTimeout(() => {
        proc.kill();
        finish(null);
      }, VERSION_FETCH_TIMEOUT_MS);

      proc.on('close', (code) => {
        finish(code === 0 ? output.trim() || null : null);
      });

      proc.on('error', () => {
        finish(null);
      });
    } catch {
      resolve(null);
    }
  });
};

/**
 * Parse version from command output.
 * Handles various formats like "v1.2.3", "1.2.3", "tool 1.2.3", etc.
 */
function parseVersion(output: string | null): string | null {
  if (!output) return null;

  // Handle "Claude Code X.Y.Z" format
  const claudeMatch = /Claude Code\s+(\d+\.\d+\.\d+)/i.exec(output);
  if (claudeMatch) return claudeMatch[1] ?? null;

  // Handle "vX.Y.Z" or just "X.Y.Z"
  const versionMatch = /v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/i.exec(output);
  if (versionMatch) return versionMatch[1] ?? null;

  // If no version pattern found, return the output as-is (trimmed first line)
  const firstLine = output.split('\n')[0]?.trim();
  return firstLine || null;
}

/**
 * Fetch system info with tool versions.
 * Runs all version checks in parallel for performance.
 */
export async function getSystemInfo(
  fetcher: VersionFetcher = defaultVersionFetcher,
): Promise<SystemInfo> {
  const fetchCopilotVersion = async (): Promise<string | null> => {
    const binaryVersionPromise = fetcher(['copilot', '--binary-version']);
    const fallbackVersionPromise = fetcher(['copilot', '--version']);
    const binaryVersion = await binaryVersionPromise;
    if (binaryVersion) {
      return binaryVersion;
    }
    return fallbackVersionPromise;
  };

  // Run all version fetches in parallel
  const [claudeRaw, openCodeRaw, geminiRaw, copilotRaw, nodeRaw, npmRaw, bunRaw] =
    await Promise.all([
      fetcher(['claude', '--version']),
      fetcher(['opencode', '--version']),
      fetcher(['gemini', '--version']),
      fetchCopilotVersion(),
      fetcher(['node', '--version']),
      fetcher(['npm', '--version']),
      fetcher(['bun', '--version']),
    ]);

  return {
    version: CURRENT_VERSION,
    claudeCodeVersion: parseVersion(claudeRaw),
    openCodeVersion: parseVersion(openCodeRaw),
    geminiCliVersion: parseVersion(geminiRaw),
    copilotCliVersion: parseVersion(copilotRaw),
    nodeVersion: parseVersion(nodeRaw),
    npmVersion: parseVersion(npmRaw),
    bunVersion: parseVersion(bunRaw),
    platform: `${process.platform} ${process.arch}`,
  };
}
