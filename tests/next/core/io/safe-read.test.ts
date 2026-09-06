import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import * as next from '@next/core/io/safe-read';
import * as shipped from '@/rules/policy/filesystem';
import {
  describeOutcome,
  snapshotTree,
  type TreeSpec,
  writeTree,
} from '../../helpers/fixture-tree';
import { recordPorted, rootFolds } from '../../helpers/temp-home';

/**
 * Both implementations run against their own copy of one fixture tree; every call is compared
 * on what it returned or threw and on what it left on disk.
 */

/** The shipped module's public surface equals the port's except for its private brand symbols. */
const SIDES = [
  ['next', next],
  ['shipped', shipped as unknown as typeof next],
] as const;

type Side = (typeof SIDES)[number];

const TREE: TreeSpec = {
  'root/policy.json': '{"level":"standard"}\n',
  'root/rules/team/rule.json': '{"rules":[]}\n',
  'root/rules/empty': null,
  'root/rules/link.json': { symlink: join('..', '..', 'outside', 'secret.json') },
  'root/linked-dir': { symlink: join('..', 'outside') },
  'root/not-a-dir': 'plain text\n',
  'root/nested/deeper/leaf.json': 'leaf\n',
  'root/nested/other.txt': 'other\n',
  'outside/secret.json': 'TOPSECRET\n',
  alias: { symlink: 'root' },
};

const LABELS = ['user policy', 'project policy', 'rules policy'] as const;

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

/** Scope roots relative to a side's base directory; the label rotates with the case index. */
const SCOPE_ROOTS = ['root', 'alias', 'nowhere', 'root/not-a-dir', 'root/linked-dir'];

let base = '';

function sideBase(name: string): string {
  return join(base, name);
}

function targetOn(
  side: Side,
  scopeRoot: string,
  relativePath: string,
  label: (typeof LABELS)[number],
) {
  const [name, implementation] = side;
  return implementation.getPolicyFilesystemTarget(
    implementation.bindPolicyFilesystemScope(join(sideBase(name), scopeRoot), label),
    relativePath,
  );
}

/** Snapshots a side with its base stripped, so the two copies compare equal when identical. */
function sideSnapshot(name: string) {
  return snapshotTree(sideBase(name));
}

function expectSameOnBothSides<T>(run: (side: Side) => T) {
  const outcomes = SIDES.map((side) => describeOutcome(() => run(side)));
  expect(outcomes[0]).toEqual(outcomes[1]);
  recordPorted(outcomes[0], rootFolds(base));
  expect(sideSnapshot('next')).toEqual(sideSnapshot('shipped'));
  return outcomes[0];
}

function resetTrees() {
  if (base !== '') rmSync(base, { recursive: true, force: true });
  base = mkdtempSync(join(tmpdir(), 'next-safe-read-'));
  for (const [name] of SIDES) writeTree(sideBase(name), TREE);
}

beforeEach(resetTrees);

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('safe policy reads', () => {
  test('return the same content or refusal for every scope and relative path', () => {
    let readSomething = false;
    let refusedSomething = false;
    for (const [index, scopeRoot] of SCOPE_ROOTS.entries()) {
      for (const relativePath of RELATIVE_PATHS) {
        const label = LABELS[index % LABELS.length] ?? 'user policy';
        const outcome = expectSameOnBothSides((side) =>
          side[1].readPolicyFile(targetOn(side, scopeRoot, relativePath, label)),
        );
        if (outcome?.ok && outcome.value !== null) readSomething = true;
        if (outcome && !outcome.ok) {
          refusedSomething = true;
          expect(outcome.error).toEqual({
            name: 'PolicyFilesystemError',
            message: `Unable to access ${label} filesystem safely.`,
          });
        }
      }
    }
    expect(readSomething).toBe(true);
    expect(refusedSomething).toBe(true);
    // No read created the missing root or reached through a link to the sentinel.
    for (const [name] of SIDES) {
      expect(existsSync(join(sideBase(name), 'nowhere'))).toBe(false);
      expect(readFileSync(join(sideBase(name), 'outside', 'secret.json'), 'utf-8')).toBe(
        'TOPSECRET\n',
      );
    }
  });

  test('refuse a symlinked leaf and a symlinked parent while reading the plain file', () => {
    for (const [name, implementation] of SIDES) {
      const scope = implementation.bindPolicyFilesystemScope(
        join(sideBase(name), 'root'),
        'user policy',
      );
      expect(
        implementation.readPolicyFile(
          implementation.getPolicyFilesystemTarget(scope, 'rules/team/rule.json'),
        ),
      ).toBe('{"rules":[]}\n');
      for (const linked of ['rules/link.json', 'linked-dir/secret.json']) {
        expect(() =>
          implementation.readPolicyFile(implementation.getPolicyFilesystemTarget(scope, linked)),
        ).toThrow('Unable to access user policy filesystem safely.');
      }
    }
  });

  test('reject a file replaced between open and read, by a file or by a symlink', () => {
    for (const replacement of ['file', 'symlink'] as const) {
      resetTrees();
      const real = fs.readFileSync;
      const replaced: string[] = [];
      const spy = spyOn(fs, 'readFileSync').mockImplementation(((
        path: Parameters<typeof fs.readFileSync>[0],
        options: Parameters<typeof fs.readFileSync>[1],
      ) => {
        // The descriptor read is the window: swap the path's entry before the identity check.
        if (typeof path === 'number') {
          const target = replaced.length === 0 ? 'next' : 'shipped';
          const policy = join(sideBase(target), 'root', 'policy.json');
          rmSync(policy);
          if (replacement === 'file') writeFileSync(policy, '{"level":"off"}\n');
          if (replacement === 'symlink') symlinkSync(join('..', 'outside', 'secret.json'), policy);
          replaced.push(target);
        }
        return real(path, options);
      }) as typeof fs.readFileSync);
      const outcome = expectSameOnBothSides((side) =>
        side[1].readPolicyFile(targetOn(side, 'root', 'policy.json', 'project policy')),
      );
      spy.mockRestore();
      expect(replaced).toEqual(['next', 'shipped']);
      expect(outcome).toEqual({
        ok: false,
        error: {
          name: 'PolicyFilesystemError',
          message: 'Unable to access project policy filesystem safely.',
        },
      });
    }
  });
});

describe('atomic policy writes', () => {
  test('leave the same tree and outcome for every scope and relative path', () => {
    for (const [index, scopeRoot] of SCOPE_ROOTS.entries()) {
      for (const [position, relativePath] of RELATIVE_PATHS.entries()) {
        const label = LABELS[index % LABELS.length] ?? 'user policy';
        expectSameOnBothSides((side) =>
          side[1].writePolicyFileAtomic(
            targetOn(side, scopeRoot, relativePath, label),
            `written ${scopeRoot} ${relativePath}\n`,
            position % 2 === 0 ? undefined : 0o644,
          ),
        );
      }
    }
    // Writes through a linked leaf or parent never reached the sentinel; only the scope rooted
    // at the link itself (a trusted root alias) may write beside it.
    for (const [name] of SIDES) {
      expect(readFileSync(join(sideBase(name), 'outside', 'secret.json'), 'utf-8')).toBe(
        'TOPSECRET\n',
      );
    }
  });

  test('create missing parents and hand the renamed path to the callback', () => {
    const paths = SIDES.map(([name, implementation]) => {
      const seen: string[] = [];
      implementation.writePolicyFileAtomic(
        targetOn([name, implementation], 'fresh/home', 'rules/new/rule.json', 'user policy'),
        'created\n',
        undefined,
        (path) => seen.push(relative(sideBase(name), path)),
      );
      return seen;
    });
    expect(paths[0]).toEqual(paths[1]);
    expect(paths[0]).toEqual(['fresh/home/rules/new/rule.json']);
    const tree = sideSnapshot('next');
    expect(tree).toEqual(sideSnapshot('shipped'));
    recordPorted(tree, rootFolds(base));
  });

  test('stage through an exclusive sibling temp file and clean it up when the rename fails', () => {
    const captures = SIDES.map(([name, implementation]) => {
      const dir = join(sideBase(name), 'root');
      const seen: Record<string, unknown>[] = [];
      const spy = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        seen.push({
          sameDirectory: dirname(String(from)) === dir && String(to) === join(dir, 'policy.json'),
          tempName: relative(dir, String(from)).replace(/[0-9a-f]{16}/, 'HEX'),
          listing: readdirSync(dir)
            .sort()
            .map((entry) => entry.replace(/[0-9a-f]{16}/, 'HEX')),
          staged: readFileSync(String(from), 'utf-8'),
          stagedMode: fs.lstatSync(String(from)).mode & 0o777,
          destination: readFileSync(join(dir, 'policy.json'), 'utf-8'),
        });
        throw new Error('rename refused');
      });
      const outcome = describeOutcome(() =>
        implementation.writePolicyFileAtomic(
          targetOn([name, implementation], 'root', 'policy.json', 'rules policy'),
          '{"level":"strict"}\n',
        ),
      );
      spy.mockRestore();
      const remaining = snapshotTree(dir).map((entry) => [entry.path, entry.content]);
      return { seen, outcome, remaining };
    });

    const [port, reference] = captures;
    expect(port).toEqual(reference);
    recordPorted(port, rootFolds(base));
    expect(port?.seen).toEqual([
      {
        sameDirectory: true,
        tempName: 'policy.json.HEX.tmp',
        listing: [
          'linked-dir',
          'nested',
          'not-a-dir',
          'policy.json',
          'policy.json.HEX.tmp',
          'rules',
        ],
        staged: '{"level":"strict"}\n',
        stagedMode: 0o600,
        destination: '{"level":"standard"}\n',
      },
    ]);
    expect(port?.outcome.ok).toBe(false);
    expect(port?.outcome).toMatchObject({
      error: {
        name: 'PolicyFilesystemError',
        message: 'Unable to access rules policy filesystem safely.',
      },
    });
    // The failed write cleaned its temp file up and left the destination as it was.
    expect(port?.remaining.filter(([path]) => path?.includes('.tmp'))).toEqual([]);
    expect(port?.remaining).toContainEqual(['policy.json', '{"level":"standard"}\n']);
  });
});

describe('policy directories and target identity', () => {
  test('list, compare, and remove entries identically', () => {
    for (const [name] of SIDES) {
      linkSync(
        join(sideBase(name), 'root', 'policy.json'),
        join(sideBase(name), 'root', 'nested', 'hardlink.json'),
      );
    }
    const directories = [
      '.',
      'rules',
      'rules/team',
      'rules/empty',
      'linked-dir',
      'nested',
      'missing',
      'policy.json',
    ];
    for (const relativePath of directories) {
      expectSameOnBothSides((side) =>
        side[1].readPolicyDirectoryEntries(targetOn(side, 'root', relativePath, 'user policy')),
      );
      expectSameOnBothSides((side) =>
        side[1].validatePolicyDirectoryRemoval(targetOn(side, 'root', relativePath, 'user policy')),
      );
    }

    const pairs: [string, string, string, string][] = [
      ['root', 'policy.json', 'root', './policy.json'],
      ['root', 'policy.json', 'alias', 'policy.json'],
      ['root', 'policy.json', 'root', 'nested/hardlink.json'],
      ['root', 'policy.json', 'root', 'rules/team/rule.json'],
      ['root', 'missing.json', 'alias', 'missing.json'],
      ['root', 'rules/link.json', 'root', 'policy.json'],
      ['root', 'policy.json', 'root', 'rules/link.json'],
      ['nowhere', 'policy.json', 'root', 'policy.json'],
    ];
    for (const [firstRoot, firstPath, secondRoot, secondPath] of pairs) {
      expectSameOnBothSides((side) =>
        side[1].isSamePolicyFilesystemTarget(
          targetOn(side, firstRoot, firstPath, 'project policy'),
          targetOn(side, secondRoot, secondPath, 'project policy'),
        ),
      );
    }

    for (const relativePath of [
      'rules/team/rule.json',
      'missing.json',
      'rules/link.json',
      'not-a-dir',
      'rules/empty',
      'linked-dir',
    ]) {
      expectSameOnBothSides((side) =>
        side[1].removePolicyFile(targetOn(side, 'root', relativePath, 'rules policy')),
      );
    }
    for (const relativePath of [
      'rules/empty',
      'rules/team',
      'nested',
      'linked-dir',
      'missing',
      'policy.json',
    ]) {
      expectSameOnBothSides((side) =>
        side[1].removeEmptyPolicyDirectory(targetOn(side, 'root', relativePath, 'rules policy')),
      );
    }
    for (const relativePath of ['rules', 'nested', 'linked-dir', 'missing', 'policy.json', '.']) {
      expectSameOnBothSides((side) =>
        side[1].removePolicyDirectory(targetOn(side, 'root', relativePath, 'rules policy')),
      );
    }
    for (const [name] of SIDES) {
      expect(readFileSync(join(sideBase(name), 'outside', 'secret.json'), 'utf-8')).toBe(
        'TOPSECRET\n',
      );
    }
  });

  test('bind delegated and absolute paths to the same scopes', () => {
    const paths = [
      'root/policy.json',
      'root/rules/team/rule.json',
      'outside/secret.json',
      'nowhere/deep/rule.json',
      'root/../outside/secret.json',
      'root',
    ];
    for (const path of paths) {
      const bound = SIDES.map(([name, implementation]) =>
        describeOutcome(() => {
          const target = implementation.bindDelegatedPolicyFilesystemTarget(
            join(sideBase(name), path),
          );
          return {
            root: relative(sideBase(name), target.scope.root),
            label: target.scope.label,
            relativePath: target.relativePath,
            path: relative(sideBase(name), target.path),
          };
        }),
      );
      expect(bound[0]).toEqual(bound[1]);
      recordPorted(bound[0], rootFolds(base));
      const rebound = SIDES.map(([name, implementation]) =>
        describeOutcome(() => {
          const target = implementation.getPolicyFilesystemTargetForPath(
            implementation.bindPolicyFilesystemScope(
              join(sideBase(name), 'root'),
              'project policy',
            ),
            join(sideBase(name), path),
          );
          return { relativePath: target.relativePath, path: relative(sideBase(name), target.path) };
        }),
      );
      expect(rebound[0]).toEqual(rebound[1]);
      recordPorted(rebound[0], rootFolds(base));
    }
    for (const [, implementation] of SIDES) {
      expect(
        implementation.bindDelegatedPolicyFilesystemTarget(
          join(base, 'x', 'rule.json'),
          'user policy',
        ).scope.label,
      ).toBe('user policy');
    }
  });
});
