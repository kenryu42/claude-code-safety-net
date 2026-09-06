import { afterAll } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAuditLogFiles } from '@/audit/reader';
import type { AuditLogEntry } from '@/core/audit';
import type { VersionFetcher } from '@/hosts/system-info';

export function readAuditLogEntriesForSession(homeDir: string, sessionId: string): AuditLogEntry[] {
  return listAuditLogFiles(join(homeDir, '.cc-safety-net', 'logs'))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as AuditLogEntry),
    )
    .filter((entry) => entry.sessionId === sessionId);
}

function setEnvValue(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

export function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
  const effectiveEnv =
    env.HOME !== undefined && env.CC_SAFETY_NET_AUDIT_HOME === undefined
      ? { ...env, CC_SAFETY_NET_AUDIT_HOME: env.HOME }
      : env;
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(effectiveEnv)) {
    original[key] = process.env[key];
    setEnvValue(key, effectiveEnv[key]);
  }

  const restore = () => {
    for (const key of Object.keys(effectiveEnv)) setEnvValue(key, original[key]);
  };

  try {
    const result = fn();
    if (result instanceof Promise) return result.finally(restore) as T;
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

export function createSpawnEnv(overrides: Record<string, string>) {
  const overriddenNames = new Set(
    Object.keys(overrides).map((name) =>
      process.platform === 'win32' ? name.toLowerCase() : name,
    ),
  );
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined &&
          !overriddenNames.has(process.platform === 'win32' ? entry[0].toLowerCase() : entry[0]),
      ),
    ),
    ...overrides,
  };
}

export async function withTempDir<T>(prefix: string, fn: (dir: string) => T | Promise<T>) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  try {
    const result = await fn(dir);
    return result;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Mock version fetcher for testing.
 * Returns predefined versions instantly without spawning processes.
 * @internal Exported for testing
 */
export const mockVersionFetcher: VersionFetcher = async (args: string[]) => {
  if (args[0] === 'claude' && args[1] === 'plugin') {
    return `Installed plugins:

  ❯ cc-safety-net@cc-marketplace
    Version: 0.8.2
    Scope: user
    Status: ✔ enabled`;
  }

  if (args[0] === 'codex' && args[1] === 'plugin') {
    return 'cc-safety-net https://github.com/kenryu42/cc-safety-net.git installed, enabled';
  }

  // Handle multi-word commands like `copilot plugin list`
  if (args[0] === 'copilot' && args[1] === 'plugin') {
    return 'Installed plugins:\n  • copilot-safety-net (v1.0.0)';
  }

  if (args[0] === 'gemini' && args[1] === 'extensions') {
    return `✓ gemini-safety-net (1.0.0)
 Source: https://github.com/kenryu42/gemini-safety-net (Type: github-release)
 Enabled (User): true
 Enabled (Workspace): true`;
  }

  const cmd = args[0];
  const mockVersions: Record<string, string> = {
    claude: '1.0.0',
    agy: 'Antigravity CLI v2.0.0',
    opencode: '0.1.0',
    codex: 'codex 1.2.0',
    gemini: '0.20.0',
    hermes: 'hermes 1.5.0',
    openclaw: 'openclaw 2026.8.1',
    grok: 'grok 1.1.0',
    kimi: 'kimi 0.3.0',
    pi: 'pi 0.4.0',
    copilot: 'Copilot binary version: 1.0.9',
    node: 'v22.0.0',
    npm: '10.0.0',
    bun: '1.0.0',
  };
  return mockVersions[cmd ?? ''] ?? null;
};

/**
 * Convert Windows backslashes to forward slashes for shell command embedding.
 * The POSIX parser reads backslashes as escape characters, which corrupts
 * Windows paths like C:\Users\... into C:Users...
 */
function toShellPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Convert a native path to one safely quoted POSIX shell word. */
export function quoteShellPath(p: string): string {
  return `'${toShellPath(p).replaceAll("'", `'\\''`)}'`;
}

export interface LinkedWorktreeFixture {
  rootDir: string;
  mainWorktree: string;
  linkedWorktree: string;
  cleanup: () => void;
}

function runGit(args: readonly string[], cwd: string): void {
  execFileSync('git', [...args], {
    cwd,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'CC Safety Net Test',
      GIT_AUTHOR_EMAIL: 'safety-net@example.test',
      GIT_COMMITTER_NAME: 'CC Safety Net Test',
      GIT_COMMITTER_EMAIL: 'safety-net@example.test',
    },
  });
}

let linkedWorktreeSeed: { rootDir: string; repository: string } | undefined;

function getLinkedWorktreeSeed(): string {
  if (linkedWorktreeSeed) return linkedWorktreeSeed.repository;

  const rootDir = mkdtempSync(
    join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'safety-net-worktree-seed-'),
  );
  // Bun's test runner never emits `exit`, so the seed is dropped by the scope that built it and
  // rebuilt by the next one that asks for it, rather than surviving the run in the temp root.
  afterAll(() => {
    rmSync(rootDir, { recursive: true, force: true });
    linkedWorktreeSeed = undefined;
  });
  const repository = join(rootDir, 'repository');
  mkdirSync(repository);
  runGit(['init'], repository);
  writeFileSync(join(repository, 'file.txt'), 'initial\n');
  runGit(['add', 'file.txt'], repository);
  runGit(['-c', 'commit.gpgsign=false', 'commit', '-m', 'initial'], repository);
  linkedWorktreeSeed = { rootDir, repository };
  return repository;
}

export function createLinkedWorktreeFixture(): LinkedWorktreeFixture {
  const rootDir = mkdtempSync(join(tmpdir(), 'safety-net-worktree-'));
  const mainWorktree = join(rootDir, 'main');
  const linkedWorktree = join(rootDir, 'linked');

  runGit(['clone', '--local', getLinkedWorktreeSeed(), mainWorktree], rootDir);
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

export async function withLinkedWorktreeFixture<T>(
  fn: (fixture: LinkedWorktreeFixture) => T | Promise<T>,
) {
  const fixture = createLinkedWorktreeFixture();
  try {
    const result = await fn(fixture);
    return result;
  } finally {
    fixture.cleanup();
  }
}

process.on('exit', () => {
  if (linkedWorktreeSeed) rmSync(linkedWorktreeSeed.rootDir, { recursive: true, force: true });
});

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
