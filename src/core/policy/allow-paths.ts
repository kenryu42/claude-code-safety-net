import { isAbsolute, join, normalize, sep } from 'node:path';

const IS_WINDOWS = process.platform === 'win32';

const GLOB_CHARS = /[*?]/;

export function expandAllowPathHome(path: string, home: string): string {
  if (path === '~') return home;
  if (path.startsWith('~/')) return `${home}${path.slice(1)}`;
  return path;
}

export function getDestructiveAllowPathError(value: unknown, home: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return 'must be a non-empty path string';
  }
  const expanded = expandAllowPathHome(value.trim(), home);
  if (!isAbsolute(expanded)) {
    return 'must be an absolute path or start with ~/';
  }
  return getAllowPathHomeConflictError(expanded, home);
}

// Deny entries may be relative (they resolve against each session's config cwd,
// which is unknowable at save time), so only absolute and home-anchored entries
// are judged here. The rejected class — home, anything above it, `/` — has no
// legitimate reading and blocks essentially every command in every workspace
// under home.
export function getSecretDenyPathError(value: unknown, home: string): string | null {
  const expanded = expandSecretPolicyEntry(value, home);
  if (expanded === null) return 'must be a non-empty path string';
  if (!isAbsolute(expanded)) return null;
  if (getAllowPathHomeConflictError(expanded, home) === null) return null;
  return 'cannot be the home directory or a path above it (this would block every command the agent runs)';
}

const SECRET_ALLOW_DISABLES_EVERYTHING =
  'cannot cover the home directory or a path above it (this would disable secret protection everywhere)';
const SECRET_ALLOW_GUARD_CONFIG = "cannot cover the guard's own configuration";

// Shared entry preparation for the secret policy validators: trim, rewrite
// $HOME/${HOME} to ~, expand against home. Null means not a usable path string.
function expandSecretPolicyEntry(value: unknown, home: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return expandAllowPathHome(value.trim().replace(/^\$(?:\{HOME\}|HOME(?=\/|$))/, '~'), home);
}

// Allow entries vouch for paths the user manages themselves (a repo's
// .env.test, a fixtures directory). Entries are literal only: a wildcard can
// reach around its own root — `~/**/.ssh/config` covers `~/.ssh/config` while
// its literal prefix looks harmless — so no prefix test can bound what a glob
// vouches for, and glob characters are rejected outright. Entries that would
// vouch for everything (home, anything above it) or for the guard's own
// config are rejected too. Relative entries resolve against each session's
// config cwd and cannot be judged at save time.
export function getSecretAllowPathError(value: unknown, home: string): string | null {
  const expanded = expandSecretPolicyEntry(value, home);
  if (expanded === null) return 'must be a non-empty path string';
  if (GLOB_CHARS.test(expanded)) {
    return 'cannot contain glob characters (* or ?); list the exact file or directory';
  }
  if (!isAbsolute(expanded)) return null;
  if (getAllowPathHomeConflictError(expanded, home) !== null) {
    return SECRET_ALLOW_DISABLES_EVERYTHING;
  }
  return coversGuardConfig(expanded, home) ? SECRET_ALLOW_GUARD_CONFIG : null;
}

function coversGuardConfig(absolutePath: string, home: string): boolean {
  const normalized = comparableAllowPath(absolutePath);
  const guardRoot = comparableAllowPath(join(home, '.cc-safety-net'));
  return normalized === guardRoot || normalized.startsWith(`${guardRoot}${sep}`);
}

export function getAllowPathHomeConflictError(absolutePath: string, home: string): string | null {
  const normalized = comparableAllowPath(absolutePath);
  const normalizedHome = comparableAllowPath(home);
  if (normalized === normalizedHome) return 'cannot be the home directory';
  const prefix = normalized.endsWith(sep) ? normalized : `${normalized}${sep}`;
  if (normalizedHome.startsWith(prefix)) return 'cannot contain the home directory';
  return null;
}

function comparableAllowPath(path: string): string {
  let normalized = normalize(path);
  if (IS_WINDOWS) normalized = normalized.replace(/\//g, '\\').toLowerCase();
  if (normalized.length > (IS_WINDOWS ? 3 : 1) && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
