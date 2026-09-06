import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** What worktree relaxation needs about a directory that is a verified linked worktree. */
export type WorktreeFacts = Readonly<{
  /** The effective Git config enables `submodule.recurse`, so a local discard is not relaxable. */
  recursiveSubmodules: boolean;
}>;

export type DotGitFileTargets = {
  gitDir: string;
  commonDir: string | null;
};

const TRUSTED_GIT_BINARIES = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git',
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\bin\\git.exe',
] as const;

const GIT_CONFIG_TIMEOUT_MS = 2000;

/**
 * Null when `cwd` is not a directory, not a verified linked worktree, or the effective
 * `submodule.recurse` setting could not be read (a failed or timed-out `git config` spawn):
 * every one of those means no relaxation.
 * `gitBinary` is exposed so a test can point the spawn at a fake executable.
 */
export function resolveWorktreeFacts(
  cwd: string,
  gitBinary: string | null = getTrustedGitBinary(),
): WorktreeFacts | null {
  const gitCwd = resolveDirectory(cwd);
  if (gitCwd === null || !isLinkedWorktree(gitCwd)) return null;
  const recursiveSubmodules = effectiveGitConfigEnablesRecursiveSubmodules(gitCwd, gitBinary);
  return recursiveSubmodules === null ? null : { recursiveSubmodules };
}

function resolveDirectory(cwd: string): string | null {
  try {
    const resolved = realpathSync(resolve(cwd));
    return statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

/** @internal */
export function isLinkedWorktree(cwd: string): boolean {
  const dotGitPath = findDotGit(cwd);
  if (!dotGitPath) {
    return false;
  }

  try {
    const stat = lstatSync(dotGitPath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      return false;
    }

    const targets = resolveDotGitFileTargets(dotGitPath);
    if (!targets?.commonDir) return false;

    if (!worktreeGitdirBacklinkMatches(targets.gitDir, dotGitPath)) {
      return false;
    }

    return worktreeConfigMatchesRoot(targets.gitDir, dirname(dotGitPath));
  } catch {
    return false;
  }
}

export function resolveDotGitFileTargets(dotGitPath: string): DotGitFileTargets | null {
  try {
    const rawGitDir = readDotGitTarget(dotGitPath);
    if (!rawGitDir) return null;
    const gitDir = realpathSync(
      isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir),
    );
    if (!statSync(gitDir).isDirectory()) return null;
    return {
      gitDir,
      commonDir: resolveCommonGitDir(gitDir),
    };
  } catch {
    return null;
  }
}

function readDotGitTarget(dotGitPath: string): string | null {
  const firstLine = readFileSync(dotGitPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
  if (!firstLine.startsWith('gitdir:')) return null;
  return firstLine.slice('gitdir:'.length).trim() || null;
}

function resolveCommonGitDir(gitDir: string): string | null {
  try {
    const rawCommonDir = readFileSync(join(gitDir, 'commondir'), 'utf-8')
      .split(/\r?\n/, 1)[0]
      ?.trim();
    if (!rawCommonDir) return null;
    const commonDir = realpathSync(
      isAbsolute(rawCommonDir) ? rawCommonDir : resolve(gitDir, rawCommonDir),
    );
    return statSync(commonDir).isDirectory() ? commonDir : null;
  } catch {
    return null;
  }
}

function worktreeGitdirBacklinkMatches(gitDir: string, dotGitPath: string): boolean {
  const rawBacklink = readWorktreeGitdirBacklink(gitDir);
  return rawBacklink === null ? false : gitDirPathReferenceMatches(gitDir, rawBacklink, dotGitPath);
}

function worktreeConfigMatchesRoot(gitDir: string, worktreeRoot: string): boolean {
  const configuredWorktree = readWorktreeConfigWorktree(gitDir);
  return configuredWorktree === null
    ? true
    : gitDirPathReferenceMatches(gitDir, configuredWorktree, worktreeRoot);
}

function readWorktreeGitdirBacklink(gitDir: string): string | null {
  const backlinkPath = join(gitDir, 'gitdir');
  if (!existsSync(backlinkPath)) return null;

  const rawBacklink = readFileSync(backlinkPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
  return rawBacklink === '' ? null : rawBacklink;
}

function readWorktreeConfigWorktree(gitDir: string): string | null {
  const configWorktreePath = join(gitDir, 'config.worktree');
  return existsSync(configWorktreePath) ? readCoreWorktree(configWorktreePath) : null;
}

function gitDirPathReferenceMatches(gitDir: string, target: string, expectedPath: string): boolean {
  try {
    return sameFilesystemPath(isAbsolute(target) ? target : resolve(gitDir, target), expectedPath);
  } catch {
    return false;
  }
}

function sameFilesystemPath(left: string, right: string): boolean {
  try {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    if (
      leftStat.ino !== 0 &&
      rightStat.ino !== 0 &&
      leftStat.dev === rightStat.dev &&
      leftStat.ino === rightStat.ino
    ) {
      return true;
    }
  } catch {
    // Fall through to realpath comparison for platforms where stat identity is unavailable.
  }

  return (
    normalizePathForComparison(realpathSync.native(left)) ===
    normalizePathForComparison(realpathSync.native(right))
  );
}

/** @internal Exported for testing */
export function normalizePathForComparison(path: string): string {
  const normalized = path
    .replace(/^\\\\\?\\UNC\\/i, '//')
    .replace(/^\\\\\?\\/i, '')
    .replace(/\\/g, '/');
  const trimmed =
    normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
}

function readCoreWorktree(configPath: string): string | null {
  const content = readFileSync(configPath, 'utf-8');
  let inCore = false;
  let configuredWorktree: string | null = null;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }
    if (trimmed.startsWith('[')) {
      inCore = /^\[core\]$/i.test(trimmed);
      continue;
    }
    if (!inCore) {
      continue;
    }

    const match = trimmed.match(/^worktree\s*=\s*(.*)$/i);
    if (match) {
      configuredWorktree = parseGitConfigValue(match[1] ?? '');
    }
  }

  return configuredWorktree;
}

function parseGitConfigValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  return unescapeDoubleQuotedGitConfigValue(trimmed.slice(1, -1));
}

const GIT_CONFIG_ESCAPES: Readonly<Record<string, string>> = {
  '\\': '\\',
  '"': '"',
  n: '\n',
  t: '\t',
  b: '\b',
};

function unescapeDoubleQuotedGitConfigValue(value: string): string {
  return value.replace(/\\(.?)/gs, (sequence, next: string) =>
    next === '' ? sequence : (GIT_CONFIG_ESCAPES[next] ?? sequence),
  );
}

function findDotGit(cwd: string): string | null {
  try {
    return findDotGitInAncestors(realpathSync(cwd));
  } catch {
    return null;
  }
}

export function findDotGitInAncestors(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const dotGitPath = join(current, '.git');
    if (existsSync(dotGitPath)) {
      return dotGitPath;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Whether the repository's effective config enables `submodule.recurse`: true when the local
 * config files say so, include other files, or cannot be read, and otherwise what a sanitized
 * `git config --get` reports. Null when that one spawn fails or times out.
 */
function effectiveGitConfigEnablesRecursiveSubmodules(
  cwd: string,
  gitBinary: string | null,
): boolean | null {
  const localConfigResult = localGitConfigEnablesRecursiveSubmodules(cwd);
  if (localConfigResult === null || localConfigResult) {
    return true;
  }

  if (gitBinary === null) {
    return true;
  }

  const result = spawnSync(gitBinary, ['config', '--get', 'submodule.recurse'], {
    cwd,
    encoding: 'utf8',
    env: withoutGitConfigEnv(process.env),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_CONFIG_TIMEOUT_MS,
  });
  // `git config --get` exits 1 when the key is unset; anything but that or success is a failure.
  if (result.error !== undefined || (result.status !== 0 && result.status !== 1)) return null;
  return result.status === 0 && gitConfigValueEnablesRecursiveSubmodules(result.stdout.trim());
}

function localGitConfigEnablesRecursiveSubmodules(cwd: string): boolean | null {
  const configPaths = getLocalGitConfigPaths(cwd);
  if (configPaths === null) {
    return null;
  }
  return configPaths
    .filter((configPath) => existsSync(configPath))
    .some((configPath) => gitConfigFileEnablesRecursiveSubmodules(configPath));
}

function getTrustedGitBinary(): string | null {
  return TRUSTED_GIT_BINARIES.find((gitBinary) => existsSync(gitBinary)) ?? null;
}

export function isGitConfigEnvName(name: string): boolean {
  return (
    name === 'GIT_CONFIG_COUNT' ||
    name === 'GIT_CONFIG_PARAMETERS' ||
    /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(name)
  );
}

function withoutGitConfigEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !isGitConfigEnvName(key)));
}

function getLocalGitConfigPaths(cwd: string): string[] | null {
  const dotGitPath = findDotGitInAncestors(cwd);
  if (dotGitPath === null) {
    return null;
  }

  const gitDir = resolveGitDirFromDotGit(dotGitPath);
  if (gitDir === null) {
    return null;
  }

  const commonDir = resolveLocalConfigCommonDir(gitDir);
  if (commonDir === null) {
    return null;
  }

  return [join(commonDir, 'config'), join(gitDir, 'config.worktree')];
}

function resolveGitDirFromDotGit(dotGitPath: string): string | null {
  try {
    const content = readFileSync(dotGitPath, 'utf-8');
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (!firstLine.startsWith('gitdir:')) {
      return dotGitPath;
    }

    const rawGitDir = firstLine.slice('gitdir:'.length).trim();
    if (rawGitDir === '') {
      return null;
    }
    return isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}

function resolveLocalConfigCommonDir(gitDir: string): string | null {
  const commonDirPath = join(gitDir, 'commondir');
  if (!existsSync(commonDirPath)) {
    return gitDir;
  }

  try {
    const rawCommonDir = readFileSync(commonDirPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (rawCommonDir === '') {
      return null;
    }
    return isAbsolute(rawCommonDir) ? rawCommonDir : resolve(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}

function gitConfigFileEnablesRecursiveSubmodules(configPath: string): boolean {
  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch {
    return true;
  }

  let section = '';
  let recursiveSubmoduleConfig = false;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim().toLowerCase() ?? '';
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    const key = (eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx)).trim().toLowerCase();
    const value = eqIdx === -1 ? 'true' : trimmed.slice(eqIdx + 1).trim();
    if (isIncludeConfigSection(section) && key === 'path') {
      return true;
    }
    if (section === 'submodule' && key === 'recurse') {
      recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
    }
  }

  return recursiveSubmoduleConfig;
}

function isIncludeConfigSection(section: string): boolean {
  return section === 'include' || section.startsWith('includeif ');
}

function gitConfigValueEnablesRecursiveSubmodules(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return (
    normalizedValue !== 'false' &&
    normalizedValue !== 'no' &&
    normalizedValue !== 'off' &&
    normalizedValue !== '0'
  );
}
