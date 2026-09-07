import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, sep } from 'node:path';

/**
 * A directory tree as data, so the I/O differential tests can build the same fixture twice (one
 * copy per implementation) and compare what each implementation left behind.
 */

/** `null` is an empty directory, a string is file content, `symlink` is a link's raw target. */
export type TreeSpec = Record<string, string | null | { symlink: string }>;

export function writeTree(root: string, spec: TreeSpec): void {
  // Links last: Windows types a symlink by what its target is when the link is made, and a link
  // to a directory that does not exist yet is made a file link, which no later stat can follow.
  const entries = Object.entries(spec).sort(
    ([, a], [, b]) => Number(isLink(a)) - Number(isLink(b)),
  );
  for (const [path, entry] of entries) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    if (entry === null) {
      mkdirSync(full, { recursive: true });
      continue;
    }
    if (typeof entry === 'string') {
      writeFileSync(full, entry);
      continue;
    }
    symlinkSync(entry.symlink, full);
  }
}

const isLink = (entry: TreeSpec[string]) => entry !== null && typeof entry === 'object';

export type TreeEntry = {
  path: string;
  kind: 'file' | 'directory' | 'symlink' | 'other';
  content?: string;
  target?: string;
};

/**
 * Every entry under `root`, sorted, with regular-file content and symlink targets spelled with `/`
 * (Windows stores a relative target with `\\`). No mode: a symlink's is 0777 on Linux and 0755 on
 * macOS, Windows reports 0666 for everything, and a directory's is the runner's umask, so a
 * recorded mode pins the recording host rather than the code. A test whose contract is a mode (an
 * owner-only policy file) asserts it with `lstatSync`.
 */
export function snapshotTree(root: string, prefix = ''): TreeEntry[] {
  return readdirSync(join(root, prefix))
    .sort()
    .flatMap((name): TreeEntry[] => {
      const path = prefix === '' ? name : `${prefix}/${name}`;
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) {
        return [
          { path, kind: 'symlink', target: readlinkSync(join(root, path)).split(sep).join('/') },
        ];
      }
      if (stat.isDirectory()) {
        return [{ path, kind: 'directory' }, ...snapshotTree(root, path)];
      }
      if (stat.isFile()) {
        return [{ path, kind: 'file', content: readFileSync(join(root, path), 'utf-8') }];
      }
      return [{ path, kind: 'other' }];
    });
}

export type Outcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: { name: string; message: string } };

/** The value a call returns, or the name and message of what it throws. */
export function describeOutcome<T>(run: () => T): Outcome<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: 'unknown', message: String(error) },
    };
  }
}
