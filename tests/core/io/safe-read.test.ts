import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import {
  bindDelegatedPolicyFilesystemTarget,
  bindPolicyFilesystemScope,
  getPolicyFilesystemTarget,
  getPolicyFilesystemTargetForPath,
  isSamePolicyFilesystemTarget,
  type PolicyFilesystemLabel,
  readPolicyDirectoryEntries,
  readPolicyFile,
  removeEmptyPolicyDirectory,
  removePolicyDirectory,
  removePolicyFile,
  validatePolicyDirectoryRemoval,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import {
  describeOutcome,
  snapshotTree,
  type TreeSpec,
  writeTree,
} from '../../helpers/fixture-tree';

/**
 * One fixture tree holds every shape the guard has to judge: plain files, a nested directory, an
 * empty directory, a symlinked leaf and a symlinked parent that both point at a sentinel outside
 * the root, a regular file where a directory is expected, and a symlink standing in for the root.
 * Each row states the outcome the contract in `safe-read.ts` requires, and every refusal is the
 * one fixed diagnostic its scope carries.
 */
const TREE: TreeSpec = {
  'root/policy.json': '{"level":"standard"}\n',
  'root/rules/team/rule.json': '{"rules":[]}\n',
  'root/rules/empty': null,
  'root/rules/link.json': { symlink: join('..', '..', 'outside', 'secret.json') },
  'root/rules/inside.json': { symlink: join('team', 'rule.json') },
  'root/linked-dir': { symlink: join('..', 'outside') },
  'root/not-a-dir': 'plain text\n',
  'root/nested/deeper/leaf.json': 'leaf\n',
  'root/nested/other.txt': 'other\n',
  'outside/secret.json': 'TOPSECRET\n',
  alias: { symlink: 'root' },
};

const SENTINEL = 'TOPSECRET\n';

/** The contents a read inside the root may legitimately return. */
const READABLE = ['{"level":"standard"}\n', '{"rules":[]}\n', 'plain text\n', 'leaf\n'];

const LABELS: readonly PolicyFilesystemLabel[] = ['user policy', 'project policy', 'rules policy'];

/** Every relative path the guard is asked for, valid and hostile. */
const RELATIVE_PATHS = [
  'policy.json',
  './policy.json',
  'nested/../policy.json',
  'rules//team/rule.json',
  'rules/team/rule.json',
  'rules/link.json',
  'linked-dir/secret.json',
  'not-a-dir/policy.json',
  'not-a-dir',
  'rules/empty',
  'rules',
  '.',
  'missing.json',
  'rules/missing/deeper.json',
  'nested/deeper/leaf.json',
  '',
  '..',
  '../outside/secret.json',
  'rules/../../outside/secret.json',
  '/etc/hostname',
];

/** Scope roots relative to the fixture base: a directory, a link to it, a missing one, a file. */
const SCOPE_ROOTS = ['root', 'alias', 'nowhere', 'root/not-a-dir', 'root/linked-dir'];

let base = '';

function refusal(label: PolicyFilesystemLabel) {
  return { name: 'PolicyFilesystemError', message: `Unable to access ${label} filesystem safely.` };
}

function target(scopeRoot: string, relativePath: string, label: PolicyFilesystemLabel) {
  return getPolicyFilesystemTarget(
    bindPolicyFilesystemScope(join(base, scopeRoot), label),
    relativePath,
  );
}

function sentinel() {
  return readFileSync(join(base, 'outside', 'secret.json'), 'utf-8');
}

beforeEach(() => {
  if (base !== '') rmSync(base, { recursive: true, force: true });
  base = mkdtempSync(join(tmpdir(), 'next-safe-read-'));
  writeTree(base, TREE);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('binding a relative path to a scope', () => {
  const accepted: readonly (readonly [string, string, string])[] = [
    ['keeps a plain name as it is', 'policy.json', 'policy.json'],
    ['drops a leading dot segment', './policy.json', 'policy.json'],
    ['collapses a dot-dot that stays inside the root', 'nested/../policy.json', 'policy.json'],
    ['collapses a doubled separator', 'rules//team/rule.json', join('rules', 'team', 'rule.json')],
  ];

  for (const [name, relativePath, expected] of accepted) {
    test(name, () => {
      const bound = target('root', relativePath, 'user policy');
      expect(bound.relativePath).toBe(expected);
      expect(bound.path).toBe(join(base, 'root', expected));
    });
  }

  const rejected: readonly (readonly [string, string])[] = [
    ['refuses an empty path', ''],
    ['refuses the parent directory', '..'],
    ['refuses a path that climbs out of the root', '../outside/secret.json'],
    ['refuses a path that climbs out after collapsing', 'rules/../../outside/secret.json'],
    ['refuses an absolute path', `${sep}etc${sep}hostname`],
  ];

  for (const [name, relativePath] of rejected) {
    test(name, () => {
      expect(() => target('root', relativePath, 'user policy')).toThrow(
        refusal('user policy').message,
      );
    });
  }

  for (const label of LABELS) {
    test(`names the ${label} scope in its refusal, and nothing about the filesystem`, () => {
      expect(() => target('root', '..', label)).toThrow(refusal(label).message);
    });
  }
});

describe('safe policy reads', () => {
  test('returns the bytes of a file at the root of the scope', () => {
    expect(readPolicyFile(target('root', 'policy.json', 'user policy'))).toBe(
      '{"level":"standard"}\n',
    );
  });

  test('returns the bytes of a file under nested directories', () => {
    expect(readPolicyFile(target('root', 'nested/deeper/leaf.json', 'user policy'))).toBe('leaf\n');
  });

  test('reads through a scope root that is a symlink to the real root', () => {
    expect(readPolicyFile(target('alias', 'rules/team/rule.json', 'user policy'))).toBe(
      '{"rules":[]}\n',
    );
  });

  test('returns null for a missing file', () => {
    expect(readPolicyFile(target('root', 'missing.json', 'user policy'))).toBeNull();
  });

  test('returns null when an intermediate directory is missing', () => {
    expect(readPolicyFile(target('root', 'rules/missing/deeper.json', 'user policy'))).toBeNull();
  });

  test('returns null for a missing scope root, and does not create it', () => {
    expect(readPolicyFile(target('nowhere', 'policy.json', 'user policy'))).toBeNull();
    expect(existsSync(join(base, 'nowhere'))).toBe(false);
  });

  const refused: readonly (readonly [string, string, string])[] = [
    ['refuses a symlinked leaf', 'root', 'rules/link.json'],
    ['refuses a symlink even when it points back inside the root', 'root', 'rules/inside.json'],
    ['refuses a symlinked parent directory', 'root', 'linked-dir/secret.json'],
    ['refuses a parent component that is a regular file', 'root', 'not-a-dir/policy.json'],
    ['refuses a directory asked for as a file', 'root', 'rules'],
    ['refuses the scope root itself', 'root', '.'],
    ['refuses every path when the scope root is a regular file', 'root/not-a-dir', 'policy.json'],
    [
      'refuses a missing path too when the scope root is a regular file',
      'root/not-a-dir',
      'missing.json',
    ],
  ];

  for (const [name, scopeRoot, relativePath] of refused) {
    test(name, () => {
      expect(() => readPolicyFile(target(scopeRoot, relativePath, 'project policy'))).toThrow(
        refusal('project policy').message,
      );
      expect(sentinel()).toBe(SENTINEL);
    });
  }

  for (const replacement of ['file', 'symlink'] as const) {
    test(`refuses a file swapped for a ${replacement} between the open and the read`, () => {
      const real = fs.readFileSync;
      const swapped: string[] = [];
      const spy = spyOn(fs, 'readFileSync').mockImplementation(((
        path: Parameters<typeof fs.readFileSync>[0],
        options: Parameters<typeof fs.readFileSync>[1],
      ) => {
        // The descriptor read is the window: swap the path's entry before the identity check.
        if (typeof path === 'number') {
          const policy = join(base, 'root', 'policy.json');
          rmSync(policy);
          if (replacement === 'file') writeFileSync(policy, '{"level":"off"}\n');
          if (replacement === 'symlink') symlinkSync(join('..', 'outside', 'secret.json'), policy);
          swapped.push(policy);
        }
        return real(path, options);
      }) as typeof fs.readFileSync);
      const outcome = describeOutcome(() =>
        readPolicyFile(target('root', 'policy.json', 'project policy')),
      );
      spy.mockRestore();

      expect(swapped).toHaveLength(1);
      expect(outcome).toEqual({ ok: false, error: refusal('project policy') });
    });
  }

  test('answers every scope and path with content from inside the root, null, or the refusal', () => {
    const surprises = SCOPE_ROOTS.flatMap((scopeRoot, index) =>
      RELATIVE_PATHS.flatMap((relativePath) => {
        const label = LABELS[index % LABELS.length] ?? 'user policy';
        const outcome = describeOutcome(() =>
          readPolicyFile(target(scopeRoot, relativePath, label)),
        );
        if (!outcome.ok) {
          return outcome.error.message === refusal(label).message
            ? []
            : [`${scopeRoot} ${relativePath}: ${outcome.error.message}`];
        }
        return outcome.value === null || READABLE.includes(outcome.value)
          ? []
          : [`${scopeRoot} ${relativePath}: ${String(outcome.value)}`];
      }),
    );
    expect(surprises).toEqual([]);
    expect(sentinel()).toBe(SENTINEL);
    expect(existsSync(join(base, 'nowhere'))).toBe(false);
  });
});

describe('atomic policy writes', () => {
  test('creates the missing root and parents at 0700 and the file at 0600', () => {
    writePolicyFileAtomic(target('nowhere', 'rules/new/rule.json', 'user policy'), 'created\n');
    expect(readFileSync(join(base, 'nowhere', 'rules', 'new', 'rule.json'), 'utf-8')).toBe(
      'created\n',
    );
    expect(lstatSync(join(base, 'nowhere')).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(base, 'nowhere', 'rules')).mode & 0o777).toBe(0o700);
    expect(lstatSync(join(base, 'nowhere', 'rules', 'new', 'rule.json')).mode & 0o777).toBe(0o600);
  });

  test('hands the renamed destination path to the callback', () => {
    const seen: string[] = [];
    writePolicyFileAtomic(
      target('fresh/home', 'rules/new/rule.json', 'user policy'),
      'created\n',
      undefined,
      (path) => seen.push(relative(base, path)),
    );
    expect(seen).toEqual([join('fresh', 'home', 'rules', 'new', 'rule.json')]);
  });

  test('honours an explicit mode', () => {
    writePolicyFileAtomic(target('root', 'rules/mode.json', 'user policy'), 'm\n', 0o644);
    expect(lstatSync(join(base, 'root', 'rules', 'mode.json')).mode & 0o777).toBe(0o644);
  });

  test('replaces an existing file, and gives it the write mode rather than the old one', () => {
    expect(lstatSync(join(base, 'root', 'policy.json')).mode & 0o777).toBe(0o644);
    writePolicyFileAtomic(target('root', 'policy.json', 'user policy'), '{"level":"strict"}\n');
    expect(readFileSync(join(base, 'root', 'policy.json'), 'utf-8')).toBe('{"level":"strict"}\n');
    expect(lstatSync(join(base, 'root', 'policy.json')).mode & 0o777).toBe(0o600);
  });

  test('writes beside a scope root that is itself a symlink to a directory', () => {
    // A root the caller chose to alias is trusted; a link *inside* the root is not.
    writePolicyFileAtomic(target('root/linked-dir', 'beside.json', 'user policy'), 'beside\n');
    expect(readFileSync(join(base, 'outside', 'beside.json'), 'utf-8')).toBe('beside\n');
    expect(sentinel()).toBe(SENTINEL);
  });

  const refused: readonly (readonly [string, string, string])[] = [
    ['refuses to write through a symlinked leaf', 'root', 'rules/link.json'],
    ['refuses to write through a symlink pointing inside the root', 'root', 'rules/inside.json'],
    ['refuses to write through a symlinked parent directory', 'root', 'linked-dir/secret.json'],
    ['refuses to write under a parent that is a regular file', 'root', 'not-a-dir/policy.json'],
    ['refuses to write over a directory', 'root', 'rules'],
    [
      'refuses to write anywhere under a scope root that is a file',
      'root/not-a-dir',
      'policy.json',
    ],
  ];

  for (const [name, scopeRoot, relativePath] of refused) {
    test(name, () => {
      expect(() =>
        writePolicyFileAtomic(target(scopeRoot, relativePath, 'rules policy'), 'written\n'),
      ).toThrow(refusal('rules policy').message);
      expect(sentinel()).toBe(SENTINEL);
    });
  }

  test('stages the bytes in an exclusive sibling temp file at 0600', () => {
    const dir = join(base, 'root');
    const staged: { from: string; listing: string[]; mode: number; destination: string }[] = [];
    const spy = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      staged.push({
        from: String(from),
        listing: readdirSync(dir).sort(),
        mode: lstatSync(String(from)).mode & 0o777,
        destination: `${readFileSync(String(to), 'utf-8')}|${readFileSync(String(from), 'utf-8')}`,
      });
      throw new Error('rename refused');
    });
    const outcome = describeOutcome(() =>
      writePolicyFileAtomic(target('root', 'policy.json', 'rules policy'), '{"level":"strict"}\n'),
    );
    spy.mockRestore();

    expect(staged).toHaveLength(1);
    expect(dirname(staged[0]?.from ?? '')).toBe(dir);
    expect(relative(dir, staged[0]?.from ?? '')).toMatch(/^policy\.json\.[0-9a-f]{16}\.tmp$/);
    expect(staged[0]?.mode).toBe(0o600);
    // The destination still holds the old bytes while the new ones sit in the temp file.
    expect(staged[0]?.destination).toBe('{"level":"standard"}\n|{"level":"strict"}\n');
    expect(
      staged[0]?.listing.map((entry) => entry.replace(/\.[0-9a-f]{16}\.tmp$/, '.<temp>')),
    ).toEqual(['linked-dir', 'nested', 'not-a-dir', 'policy.json', 'policy.json.<temp>', 'rules']);

    // A failed rename raises the scope's fixed diagnostic, not the underlying error.
    expect(outcome).toEqual({ ok: false, error: refusal('rules policy') });
    // The temp file is cleaned up and the destination is exactly as it was.
    expect(readdirSync(dir).sort()).toEqual([
      'linked-dir',
      'nested',
      'not-a-dir',
      'policy.json',
      'rules',
    ]);
    expect(readFileSync(join(dir, 'policy.json'), 'utf-8')).toBe('{"level":"standard"}\n');
  });

  test('answers every scope and path with a write inside the root or the refusal', () => {
    const surprises = SCOPE_ROOTS.flatMap((scopeRoot, index) =>
      RELATIVE_PATHS.flatMap((relativePath, position) => {
        const label = LABELS[index % LABELS.length] ?? 'user policy';
        const outcome = describeOutcome(() =>
          writePolicyFileAtomic(
            target(scopeRoot, relativePath, label),
            `written ${scopeRoot} ${relativePath}\n`,
            position % 2 === 0 ? undefined : 0o644,
          ),
        );
        return outcome.ok || outcome.error.message === refusal(label).message
          ? []
          : [`${scopeRoot} ${relativePath}: ${outcome.error.message}`];
      }),
    );
    expect(surprises).toEqual([]);
    // No write through a linked leaf or a linked parent reached the sentinel.
    expect(sentinel()).toBe(SENTINEL);
    expect(readFileSync(join(base, 'root', 'rules', 'link.json'), 'utf-8')).toBe(SENTINEL);
    expect(lstatSync(join(base, 'root', 'rules', 'link.json')).isSymbolicLink()).toBe(true);
    // Nothing was left staged anywhere under the fixture.
    expect(snapshotTree(base).filter((entry) => entry.path.includes('.tmp'))).toEqual([]);
  });
});

describe('policy directory listings', () => {
  const rows: readonly (readonly [
    string,
    string,
    { name: string; kind: 'file' | 'directory' }[] | null,
  ])[] = [
    ['lists the files of a directory', 'rules/team', [{ name: 'rule.json', kind: 'file' }]],
    [
      'lists files and directories with their kinds',
      'nested',
      [
        { name: 'deeper', kind: 'directory' },
        { name: 'other.txt', kind: 'file' },
      ],
    ],
    ['lists an empty directory as no entries', 'rules/empty', []],
    ['returns null for a missing directory', 'missing', null],
  ];

  for (const [name, relativePath, expected] of rows) {
    test(name, () => {
      expect(
        readPolicyDirectoryEntries(target('root', relativePath, 'user policy'))?.sort(
          (first, second) => first.name.localeCompare(second.name),
        ) ?? null,
      ).toEqual(expected);
    });
  }

  const refused: readonly (readonly [string, string])[] = [
    ['refuses a directory holding a symlink', 'rules'],
    ['refuses the scope root when it holds a symlink', '.'],
    ['refuses a symlinked directory', 'linked-dir'],
    ['refuses a regular file asked for as a directory', 'policy.json'],
  ];

  for (const [name, relativePath] of refused) {
    test(name, () => {
      expect(() => readPolicyDirectoryEntries(target('root', relativePath, 'user policy'))).toThrow(
        refusal('user policy').message,
      );
    });
  }

  test('clears a tree of plain files and directories for removal', () => {
    expect(validatePolicyDirectoryRemoval(target('root', 'nested', 'user policy'))).toBe(true);
  });

  test('reports a missing directory as nothing to remove', () => {
    expect(validatePolicyDirectoryRemoval(target('root', 'missing', 'user policy'))).toBe(false);
  });

  test('refuses to clear a tree that holds a symlink', () => {
    expect(() => validatePolicyDirectoryRemoval(target('root', 'rules', 'user policy'))).toThrow(
      refusal('user policy').message,
    );
  });
});

describe('target identity', () => {
  const rows: readonly (readonly [string, string, string, string, string, boolean])[] = [
    ['holds for two spellings of one path', 'root', 'policy.json', 'root', './policy.json', true],
    [
      'holds across a scope rooted at a symlink to the same directory',
      'root',
      'policy.json',
      'alias',
      'policy.json',
      true,
    ],
    [
      'fails for a hard link, which is a second path to the same bytes',
      'root',
      'policy.json',
      'root',
      'nested/hardlink.json',
      false,
    ],
    ['fails for two different files', 'root', 'policy.json', 'root', 'rules/team/rule.json', false],
    ['fails when neither file exists', 'root', 'missing.json', 'alias', 'missing.json', false],
    [
      'fails when one scope root does not exist',
      'nowhere',
      'policy.json',
      'root',
      'policy.json',
      false,
    ],
  ];

  for (const [name, firstRoot, firstPath, secondRoot, secondPath, expected] of rows) {
    test(name, () => {
      linkSync(join(base, 'root', 'policy.json'), join(base, 'root', 'nested', 'hardlink.json'));
      expect(
        isSamePolicyFilesystemTarget(
          target(firstRoot, firstPath, 'project policy'),
          target(secondRoot, secondPath, 'project policy'),
        ),
      ).toBe(expected);
    });
  }

  for (const [first, second] of [
    ['rules/link.json', 'policy.json'],
    ['policy.json', 'rules/link.json'],
  ] as const) {
    test(`refuses the comparison when ${first} is a symlink`, () => {
      expect(() =>
        isSamePolicyFilesystemTarget(
          target('root', first, 'project policy'),
          target('root', second, 'project policy'),
        ),
      ).toThrow(refusal('project policy').message);
    });
  }
});

describe('policy removals', () => {
  test('unlinks a plain file and leaves the rest of the tree', () => {
    removePolicyFile(target('root', 'rules/team/rule.json', 'rules policy'));
    expect(existsSync(join(base, 'root', 'rules', 'team', 'rule.json'))).toBe(false);
    expect(existsSync(join(base, 'root', 'rules', 'team'))).toBe(true);
  });

  test('does nothing for a missing file', () => {
    removePolicyFile(target('root', 'missing.json', 'rules policy'));
    expect(existsSync(join(base, 'root', 'policy.json'))).toBe(true);
  });

  for (const [name, relativePath] of [
    ['refuses to unlink a symlink', 'rules/link.json'],
    ['refuses to unlink a symlink pointing inside the root', 'rules/inside.json'],
    ['refuses to unlink a directory', 'rules/empty'],
    ['refuses to unlink a symlinked directory', 'linked-dir'],
  ] as const) {
    test(name, () => {
      expect(() => removePolicyFile(target('root', relativePath, 'rules policy'))).toThrow(
        refusal('rules policy').message,
      );
      expect(sentinel()).toBe(SENTINEL);
    });
  }

  test('removes an empty directory', () => {
    removeEmptyPolicyDirectory(target('root', 'rules/empty', 'rules policy'));
    expect(existsSync(join(base, 'root', 'rules', 'empty'))).toBe(false);
  });

  test('does nothing for a missing directory', () => {
    removeEmptyPolicyDirectory(target('root', 'missing', 'rules policy'));
    expect(existsSync(join(base, 'root', 'rules'))).toBe(true);
  });

  test('refuses to remove a directory that still holds entries', () => {
    // rmdir refuses a non-empty directory, so entries another process added survive.
    expect(() => removeEmptyPolicyDirectory(target('root', 'rules/team', 'rules policy'))).toThrow(
      refusal('rules policy').message,
    );
    expect(existsSync(join(base, 'root', 'rules', 'team', 'rule.json'))).toBe(true);
  });

  for (const [name, relativePath] of [
    ['refuses to remove a symlinked directory', 'linked-dir'],
    ['refuses to remove a regular file as a directory', 'policy.json'],
  ] as const) {
    test(`empty-directory removal ${name}`, () => {
      expect(() =>
        removeEmptyPolicyDirectory(target('root', relativePath, 'rules policy')),
      ).toThrow(refusal('rules policy').message);
      expect(sentinel()).toBe(SENTINEL);
    });
  }

  test('removes a validated tree of files and directories', () => {
    removePolicyDirectory(target('root', 'nested', 'rules policy'));
    expect(existsSync(join(base, 'root', 'nested'))).toBe(false);
    expect(existsSync(join(base, 'root', 'policy.json'))).toBe(true);
  });

  test('does nothing for a missing tree', () => {
    removePolicyDirectory(target('root', 'missing', 'rules policy'));
    expect(existsSync(join(base, 'root', 'rules'))).toBe(true);
  });

  for (const [name, relativePath] of [
    ['refuses a tree holding a symlink', 'rules'],
    ['refuses a symlinked directory', 'linked-dir'],
    ['refuses a regular file', 'policy.json'],
    ['refuses the scope root, which holds a symlink', '.'],
  ] as const) {
    test(`tree removal ${name}`, () => {
      expect(() => removePolicyDirectory(target('root', relativePath, 'rules policy'))).toThrow(
        refusal('rules policy').message,
      );
      expect(existsSync(join(base, 'root', 'rules', 'link.json'))).toBe(true);
      expect(sentinel()).toBe(SENTINEL);
    });
  }
});

describe('delegated and absolute binding', () => {
  const rows: readonly (readonly [string, string, string, string])[] = [
    ['roots a delegated file at its own directory', 'root/policy.json', 'root', 'policy.json'],
    [
      'roots a delegated file deep in the tree at its own directory',
      'root/rules/team/rule.json',
      join('root', 'rules', 'team'),
      'rule.json',
    ],
    [
      'roots a delegated file outside any policy tree at its own directory',
      'outside/secret.json',
      'outside',
      'secret.json',
    ],
    [
      'roots a delegated file whose directory does not exist yet',
      'nowhere/deep/rule.json',
      join('nowhere', 'deep'),
      'rule.json',
    ],
    [
      'resolves a dot-dot in a delegated path before rooting it',
      'root/../outside/secret.json',
      'outside',
      'secret.json',
    ],
  ];

  for (const [name, path, expectedRoot, expectedRelative] of rows) {
    test(name, () => {
      const bound = bindDelegatedPolicyFilesystemTarget(join(base, path));
      expect(relative(base, bound.scope.root)).toBe(expectedRoot);
      expect(bound.relativePath).toBe(expectedRelative);
      expect(bound.path).toBe(join(base, expectedRoot, expectedRelative));
    });
  }

  test('labels a delegated target rules policy unless told otherwise', () => {
    expect(bindDelegatedPolicyFilesystemTarget(join(base, 'root', 'policy.json')).scope.label).toBe(
      'rules policy',
    );
    expect(
      bindDelegatedPolicyFilesystemTarget(join(base, 'root', 'policy.json'), 'user policy').scope
        .label,
    ).toBe('user policy');
  });

  test('binds an absolute path inside the scope back to its relative path', () => {
    const bound = getPolicyFilesystemTargetForPath(
      bindPolicyFilesystemScope(join(base, 'root'), 'project policy'),
      join(base, 'root', 'rules', 'team', 'rule.json'),
    );
    expect(bound.relativePath).toBe(join('rules', 'team', 'rule.json'));
    expect(readPolicyFile(bound)).toBe('{"rules":[]}\n');
  });

  for (const [name, path] of [
    ['a path outside the scope', 'outside/secret.json'],
    ['a path that climbs out of the scope', 'root/../outside/secret.json'],
    ['the scope root itself', 'root'],
  ] as const) {
    test(`refuses to bind ${name}`, () => {
      expect(() =>
        getPolicyFilesystemTargetForPath(
          bindPolicyFilesystemScope(join(base, 'root'), 'project policy'),
          join(base, path),
        ),
      ).toThrow(refusal('project policy').message);
    });
  }
});
