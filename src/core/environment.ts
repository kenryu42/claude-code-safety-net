import { lstatSync, realpathSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { type ProtectedGitMetadata, resolveProtectedGitMetadata } from './git/metadata';
import { resolveWorktreeFacts, type WorktreeFacts } from './git/worktree';
import { normalizeMsysDrivePath } from './paths/canonicalization';

/** Filesystem lookups the gate needs, so path facts are injected instead of read ambiently. */
export type PathResolver = Readonly<{
  /** Fully resolved path, or null when it cannot be resolved. */
  realpath: (path: string) => string | null;
  /** What sits at the path: a symlink, some other existing entry, or nothing. */
  entryKind: (path: string) => 'symlink' | 'present' | 'missing';
  /** Whether a directory sits at the path, following symlinks; false when it cannot be read. */
  isDirectory: (path: string) => boolean;
}>;

/** Ambient process state the gate reads, captured once at the entry point. */
export type Environment = Readonly<{
  env: ReadonlyMap<string, string>;
  home: string;
  tmpdir: string;
  paths: PathResolver;
  /** Git control-plane paths around `cwd`, or null outside a repository; memoized per cwd. */
  gitMetadata: (cwd: string) => ProtectedGitMetadata | null;
  /** Facts for worktree relaxation, or null when it must not apply; memoized per cwd. */
  worktreeFacts: (cwd: string) => WorktreeFacts | null;
}>;

/** The real filesystem behind a PathResolver.
 *  @internal */
export const processPathResolver: PathResolver = {
  realpath: (path) => {
    try {
      return realpathSync(path);
    } catch {
      return null;
    }
  },
  entryKind: (path) => {
    const stats = lstatSync(path, { throwIfNoEntry: false });
    if (!stats) return 'missing';
    return stats.isSymbolicLink() ? 'symlink' : 'present';
  },
  // `throwIfNoEntry` covers only a missing entry; an unreadable parent still throws, and the
  // callers treat every unanswerable path the same way.
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch {
      return false;
    }
  },
};

/** Snapshot the current process state for one gate call. */
export function createProcessEnvironment(): Environment {
  return withGitFacts({
    env: new Map(
      Object.entries(process.env).flatMap(([name, value]) =>
        value === undefined ? [] : [[name, value] as const],
      ),
    ),
    home: normalizeMsysDrivePath(process.env.HOME || homedir()),
    tmpdir: tmpdir(),
    paths: processPathResolver,
  });
}

/** What the in-memory filesystem holds at a path: a file, a directory, or a symlink to one.
 *  @internal */
export type FakeEntry = 'present' | 'directory' | { symlink: string };

/**
 * An environment over an in-memory filesystem for tests: only the listed paths exist, a symlink
 * resolves through its target, and the git facts read the real filesystem unless overridden.
 * @internal
 */
export function createTestEnvironment(
  overrides: Partial<Environment> & { entries?: ReadonlyMap<string, FakeEntry> } = {},
): Environment {
  const { entries = new Map<string, FakeEntry>(), ...rest } = overrides;
  return withGitFacts(
    {
      env: new Map(),
      home: '/home/user',
      tmpdir: '/tmp',
      paths: {
        realpath: (path) => fakeRealpath(entries, path, new Set()),
        entryKind: (path) => {
          const entry = entries.get(path);
          if (entry === undefined) return 'missing';
          return typeof entry === 'string' ? 'present' : 'symlink';
        },
        isDirectory: (path) => {
          const target = fakeRealpath(entries, path, new Set());
          return target !== null && entries.get(target) === 'directory';
        },
      },
    },
    rest,
  );
}

function fakeRealpath(
  entries: ReadonlyMap<string, FakeEntry>,
  path: string,
  seen: ReadonlySet<string>,
): string | null {
  const entry = entries.get(path);
  if (entry === undefined || seen.has(path)) return null;
  if (typeof entry === 'string') return path;
  return fakeRealpath(entries, entry.symlink, new Set([...seen, path]));
}

function withGitFacts(
  base: Omit<Environment, 'gitMetadata' | 'worktreeFacts'>,
  overrides: Partial<Environment> = {},
): Environment {
  const metadata = new Map<string, ProtectedGitMetadata | null>();
  const facts = new Map<string, WorktreeFacts | null>();
  const environment: Environment = {
    ...base,
    gitMetadata: (cwd) =>
      memoized(metadata, cwd, () => resolveProtectedGitMetadata(cwd, environment)),
    worktreeFacts: (cwd) => memoized(facts, cwd, () => resolveWorktreeFacts(cwd)),
    ...overrides,
  };
  return environment;
}

function memoized<T>(cache: Map<string, T>, key: string, compute: () => T): T {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const value = compute();
  cache.set(key, value);
  return value;
}
