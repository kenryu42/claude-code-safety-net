import { expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VersionFetcher } from '@/bin/doctor/system-info';
import { analyzeCommand } from '@/core/analyze';
import { loadConfig } from '@/core/config';
import { envTruthy } from '@/core/env';
import type { AnalyzeOptions, Config } from '@/types';

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
    worktreeMode: envTruthy('SAFETY_NET_WORKTREE'),
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
 * @internal Exported for testing
 */
export const mockVersionFetcher: VersionFetcher = async (args: string[]) => {
  // Handle multi-word commands like `copilot plugin list`
  if (args[0] === 'copilot' && args[1] === 'plugin') {
    return 'Installed plugins:\n  • copilot-safety-net (v1.0.0)';
  }

  const cmd = args[0];
  const mockVersions: Record<string, string> = {
    claude: '1.0.0',
    opencode: '0.1.0',
    gemini: '0.20.0',
    copilot: 'Copilot binary version: 1.0.9',
    node: 'v22.0.0',
    npm: '10.0.0',
    bun: '1.0.0',
  };
  return mockVersions[cmd ?? ''] ?? null;
};

/**
 * Convert Windows backslashes to forward slashes for shell command embedding.
 * shell-quote interprets backslashes as escape characters, which corrupts
 * Windows paths like C:\Users\... into C:Users...
 */
export function toShellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export interface LinkedWorktreeFixture {
  rootDir: string;
  mainWorktree: string;
  linkedWorktree: string;
  cleanup: () => void;
}

function runGit(args: readonly string[], cwd: string): void {
  execFileSync('git', [...args], { cwd, stdio: 'ignore' });
}

export function createLinkedWorktreeFixture(): LinkedWorktreeFixture {
  const rootDir = mkdtempSync(join(tmpdir(), 'safety-net-worktree-'));
  const mainWorktree = join(rootDir, 'main');
  const linkedWorktree = join(rootDir, 'linked');

  mkdirSync(mainWorktree);
  runGit(['init'], mainWorktree);
  runGit(['config', 'user.email', 'safety-net@example.test'], mainWorktree);
  runGit(['config', 'user.name', 'Safety Net Test'], mainWorktree);
  writeFileSync(join(mainWorktree, 'file.txt'), 'initial\n');
  runGit(['add', 'file.txt'], mainWorktree);
  runGit(['commit', '-m', 'initial'], mainWorktree);
  runGit(['worktree', 'add', '-b', 'feature/worktree-test', linkedWorktree], mainWorktree);

  return {
    rootDir,
    mainWorktree,
    linkedWorktree,
    cleanup: () => {
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

export interface FakeGitFileFixture {
  rootDir: string;
  cwd: string;
  cleanup: () => void;
}

export function createSubmoduleLikeGitFileFixture(): FakeGitFileFixture {
  const rootDir = mkdtempSync(join(tmpdir(), 'safety-net-submodule-like-'));
  const cwd = join(rootDir, 'submodule');
  const gitDir = join(rootDir, '.git', 'modules', 'submodule');

  mkdirSync(cwd, { recursive: true });
  mkdirSync(gitDir, { recursive: true });
  writeFileSync(join(cwd, '.git'), 'gitdir: ../.git/modules/submodule\n');

  return {
    rootDir,
    cwd,
    cleanup: () => {
      rmSync(rootDir, { recursive: true, force: true });
    },
  };
}
