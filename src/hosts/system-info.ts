/**
 * System information for the doctor command.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, extname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';

import { installIntegrationMetadata } from '@/hosts/catalog';
import type { SystemInfo } from '@/hosts/doctor-types';

declare const __PKG_VERSION__: string | undefined;

const CURRENT_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';
// These probes all race in one Promise.all, and Electron-backed CLIs (Cursor) can exceed 2s
// while every probe contends.
const VERSION_FETCH_TIMEOUT_MS = 5000;
const TEST_SPAWN_PLATFORM_ENV = '_CC_SAFETY_NET_TEST_SPAWN_PLATFORM';

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
export type VersionFetcher = (args: string[], timeoutMs?: number) => Promise<string | null>;

function getEnvValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const direct = env[name];
  if (direct) return direct;
  const matchingName = Object.keys(env).find(
    (key) => key.toLowerCase() === name.toLowerCase() && !!env[key],
  );
  return matchingName ? env[matchingName] : direct;
}

function getWindowsExecutableExtensions(env: NodeJS.ProcessEnv): string[] {
  return (getEnvValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .filter((extension) => extension.length > 0);
}

function resolveWindowsCommand(command: string, env: NodeJS.ProcessEnv): string {
  const candidates = extname(command)
    ? [command]
    : [
        ...getWindowsExecutableExtensions(env).map((extension) => `${command}${extension}`),
        command,
      ];
  if (command.includes('/') || command.includes('\\')) {
    return candidates.find((candidate) => existsSync(candidate)) ?? command;
  }
  return (
    (getEnvValue(env, 'PATH') ?? '')
      .split(delimiter)
      .flatMap((dir) => candidates.map((candidate) => join(dir, candidate)))
      .find((candidate) => existsSync(candidate)) ?? command
  );
}

function quoteWindowsCommandArg(value: string): string {
  if (!/[\s"&|<>^]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Windows-safe argv: npm-distributed CLIs exist there only as `.cmd` shims, which
 * spawn cannot start directly, so those are run through COMSPEC.
 */
export function getSpawnCommand(
  args: string[],
  env: NodeJS.ProcessEnv,
): { cmd: string; args: string[] } {
  const [command, ...rest] = args;
  const platform = env[TEST_SPAWN_PLATFORM_ENV] === 'win32' ? 'win32' : process.platform;
  if (!command || platform !== 'win32') return { cmd: command ?? '', args: rest };

  const resolved = resolveWindowsCommand(command, env);
  if (!/\.(?:bat|cmd)$/i.test(resolved)) return { cmd: resolved, args: rest };

  return {
    cmd: getEnvValue(env, 'COMSPEC') ?? 'cmd.exe',
    args: [
      '/d',
      '/c',
      ['call', quoteWindowsCommandArg(resolved), ...rest.map(quoteWindowsCommandArg)].join(' '),
    ],
  };
}

/**
 * Default version fetcher that runs shell commands.
 * Uses Node.js child_process.spawn for compatibility with both Node and Bun runtimes.
 */
export const defaultVersionFetcher = async (
  args: string[],
  timeoutMs = VERSION_FETCH_TIMEOUT_MS,
): Promise<string | null> => {
  // Every non-zero exit, timeout, spawn error and empty argument list reports the
  // version as unavailable, so only a clean exit is read for output.
  const result = await runCommand(args, { timeoutMs });
  if (result.code !== 0) return null;

  return (
    stripVTControlCharacters(result.stdout).trim() ||
    stripVTControlCharacters(result.stderr).trim() ||
    null
  );
};

interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCommand(args: string[], options: { timeoutMs: number }): Promise<CommandResult> {
  const [cmd, ...rest] = args;
  if (!cmd) {
    return Promise.resolve({ code: null, stdout: '', stderr: '' });
  }

  return new Promise((resolve) => {
    try {
      const spawnCommand = getSpawnCommand([cmd, ...rest], process.env);
      const proc = spawn(spawnCommand.cmd, spawnCommand.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let isSettled = false;
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const finish = (result: CommandResult): void => {
        if (isSettled) return;
        isSettled = true;
        clearTimeout(timeoutId);
        resolve(result);
      };

      const timeoutId = setTimeout(() => {
        proc.kill();
        finish({ code: null, stdout, stderr });
      }, options.timeoutMs);

      proc.on('close', (code) => {
        finish({ code, stdout, stderr });
      });

      proc.on('error', () => {
        finish({ code: null, stdout, stderr });
      });
    } catch {
      resolve({ code: null, stdout: '', stderr: '' });
    }
  });
}

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
 *
 * Only probes that leave the inspected runtime untouched are run. `claude plugin list`,
 * `gemini extensions list`, `copilot plugin list` and the Pi extension probe all write into
 * the user's real config directories, so those runtimes are reported as not inspected instead.
 */
export async function getSystemInfo(
  fetcher: VersionFetcher = defaultVersionFetcher,
): Promise<SystemInfo> {
  // Run all version fetches in parallel
  const [versionEntries, codexPluginListOutput, ampPluginListOutput, nodeRaw, npmRaw, bunRaw] =
    await Promise.all([
      Promise.all(
        installIntegrationMetadata.map(
          async (integration) =>
            [integration.id, parseVersion(await fetcher([...integration.probeCommand]))] as const,
        ),
      ),
      // A cold `codex plugin list` refreshes marketplace checkouts over the network and can
      // outlast the default 5s version timeout, which would silently drop Codex from detection.
      fetcher(['codex', 'plugin', 'list'], 30_000),
      // A cold `amp plugins list` starts the plugin service and fetches the hosted personal
      // plugins, which outlasts the default version timeout the same way Codex's does.
      fetcher(['amp', 'plugins', 'list'], 30_000),
      fetcher(['node', '--version']),
      fetcher(['npm', '--version']),
      fetcher(['bun', '--version']),
    ]);

  return {
    version: CURRENT_VERSION,
    versions: Object.fromEntries(versionEntries),
    codexPluginListOutput,
    ampPluginListOutput,
    nodeVersion: parseVersion(nodeRaw),
    npmVersion: parseVersion(npmRaw),
    bunVersion: parseVersion(bunRaw),
    platform: `${process.platform} ${process.arch}`,
  };
}
