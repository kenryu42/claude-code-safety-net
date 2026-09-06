import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { createTestEnvironment, type FakeEntry, processPathResolver } from '@/core/environment';
import { resolveChdirTarget } from '@/core/paths/chdir';
import { pickWord, seededRandom, writeSymlinkLoopTree } from '../differential-inputs';

/**
 * Where a `cd`-like operand lands: each component of the operand is resolved through the
 * filesystem the way the shell would, symlinks included, and anything that cannot be resolved
 * throws so the walker marks the cwd unknown instead of guessing a directory.
 */

const root = mkdtempSync(join(tmpdir(), 'next-chdir-'));
writeSymlinkLoopTree(root, {
  'dir/sub': null,
  'space dir': null,
  link: { symlink: join(root, 'dir') },
});

const canonicalRoot = realpathSync(root);
const canonicalDir = join(canonicalRoot, 'dir');

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('chdir target resolution', () => {
  const landings = [
    {
      name: 'stays in the base for a dot operand, without canonicalizing the base',
      base: root,
      target: '.',
      expected: root,
    },
    { name: 'stays in the base for an empty operand', base: root, target: '', expected: root },
    {
      name: 'climbs to the parent lexically for a dot-dot operand',
      base: root,
      target: '..',
      expected: dirname(root),
    },
    {
      name: 'descends into a directory that exists',
      base: root,
      target: './dir',
      expected: join(root, 'dir'),
    },
    {
      name: 'descends two components',
      base: root,
      target: 'dir/sub',
      expected: join(root, 'dir', 'sub'),
    },
    {
      name: 'collapses a dot-dot between existing components',
      base: root,
      target: 'dir/../dir/sub',
      expected: join(root, 'dir', 'sub'),
    },
    {
      name: 'collapses repeated separators',
      base: root,
      target: 'dir//sub',
      expected: join(root, 'dir', 'sub'),
    },
    {
      name: 'ignores a dot component and a trailing separator',
      base: root,
      target: 'dir/./sub/',
      expected: join(root, 'dir', 'sub'),
    },
    {
      name: 'accepts a component containing a space',
      base: root,
      target: 'space dir',
      expected: join(root, 'space dir'),
    },
    {
      name: 'follows a symlinked component to its target',
      base: root,
      target: 'link',
      expected: canonicalDir,
    },
    {
      name: 'continues from the symlink target, not from the link path',
      base: root,
      target: 'link/sub',
      expected: join(canonicalDir, 'sub'),
    },
    {
      name: 'climbs from the symlink target, so link/.. is not the base',
      base: root,
      target: 'link/..',
      expected: canonicalRoot,
    },
    {
      name: 'resolves a sibling of the symlink target',
      base: root,
      target: 'link/../file',
      expected: join(canonicalRoot, 'file'),
    },
    {
      name: 'does not reject a landing that is a file; the caller decides what a non-directory cwd means',
      base: root,
      target: 'file',
      expected: join(canonicalRoot, 'file'),
    },
    {
      name: 'returns the filesystem root for an absolute root operand',
      base: root,
      target: '/',
      expected: '/',
    },
    {
      name: 'walks an absolute operand through its own components',
      base: root,
      target: join(root, 'link', 'sub'),
      expected: join(canonicalDir, 'sub'),
    },
    {
      name: 'appends to a base that already ends in a separator',
      base: `${root}/`,
      target: 'dir',
      expected: join(root, 'dir'),
    },
    {
      name: 'walks from a base that is itself a symlink path, leaving the base as given',
      base: join(root, 'link'),
      target: 'sub',
      expected: join(root, 'link', 'sub'),
    },
    {
      name: 'climbs out of a directory base',
      base: join(root, 'dir'),
      target: '..',
      expected: root,
    },
  ];

  for (const row of landings) {
    test(row.name, () => {
      expect(resolveChdirTarget(row.base, row.target, processPathResolver)).toBe(row.expected);
    });
  }

  test('names the component it could not resolve when the operand is missing', () => {
    expect(() => resolveChdirTarget(root, 'missing', processPathResolver)).toThrow(
      `Cannot resolve path component: ${join(root, 'missing')}`,
    );
  });

  test('fails on a missing component even when a later dot-dot would erase it', () => {
    expect(() => resolveChdirTarget(root, 'missing/..', processPathResolver)).toThrow(
      `Cannot resolve path component: ${join(root, 'missing')}`,
    );
  });

  const refusals = [
    { name: 'a dangling symlink', target: 'broken' },
    { name: 'a symlink cycle', target: 'loop-a' },
    { name: 'a component under a file', target: 'file/x' },
    { name: 'a tilde, which no shell hands to this resolver already expanded', target: '~' },
    { name: 'an unexpanded variable', target: '$HOME' },
    { name: 'a Windows namespace path', target: '\\\\?\\C:\\x' },
  ];

  for (const row of refusals) {
    test(`refuses to land anywhere for ${row.name}`, () => {
      expect(() => resolveChdirTarget(root, row.target, processPathResolver)).toThrow(Error);
    });
  }

  test('reads the in-memory filesystem through the seam', () => {
    const environment = createTestEnvironment({
      entries: new Map<string, FakeEntry>([
        ['/work/dir', 'present'],
        ['/work/link', { symlink: '/work/dir' }],
      ]),
    });
    expect(resolveChdirTarget('/work', 'link/../dir', environment.paths)).toBe('/work/dir');
    expect(resolveChdirTarget('/work', 'link', environment.paths)).toBe('/work/dir');
    expect(() => resolveChdirTarget('/work', 'gone', environment.paths)).toThrow(
      'Cannot resolve path component: /work/gone',
    );
  });
});

/**
 * The properties every landing must have, over operands glued from the fragments the fixture
 * spells: a cwd the walker accepts must be a place that exists, and everything else must fail
 * loudly rather than resolve to a plausible-looking path.
 */
describe('chdir invariants over generated operands', () => {
  const FRAGMENTS = [
    '.',
    '..',
    '/',
    '//',
    'dir',
    'sub',
    'link',
    'file',
    'broken',
    'loop-a',
    'x',
    '\\',
  ];

  const generated = (() => {
    const random = seededRandom(0xc4d1_2026);
    return Array.from({ length: 400 }, () => {
      const target = Array.from({ length: 1 + Math.floor(random() * 6) }, () =>
        pickWord(random, FRAGMENTS),
      ).join(random() < 0.5 ? '/' : '');
      const settled = ((): { landing: string } | { error: unknown } => {
        try {
          return { landing: resolveChdirTarget(root, target, processPathResolver) };
        } catch (error) {
          return { error };
        }
      })();
      return { target, settled };
    });
  })();

  const landings = generated.flatMap((row) =>
    'landing' in row.settled ? [{ target: row.target, landing: row.settled.landing }] : [],
  );
  const failures = generated.flatMap((row) => ('error' in row.settled ? [row.settled.error] : []));

  test('exercises both outcomes, so the invariants below are not vacuous', () => {
    expect(landings.length).toBeGreaterThan(0);
    expect(failures.length).toBeGreaterThan(0);
  });

  test('only ever lands on a path that exists', () => {
    expect(
      landings.filter((row) => processPathResolver.entryKind(row.landing) === 'missing'),
    ).toEqual([]);
  });

  test('only ever lands on an absolute path with no unresolved parent segment', () => {
    expect(
      landings.filter(
        (row) => !isAbsolute(row.landing) || row.landing.split(/[\\/]/).includes('..'),
      ),
    ).toEqual([]);
  });

  test('keeps a downward relative operand inside the base', () => {
    const downward = landings.filter(
      (row) => !isAbsolute(row.target) && !row.target.includes('..'),
    );
    expect(downward.length).toBeGreaterThan(0);
    expect(
      downward.filter(
        (row) => !row.landing.startsWith(root) && !row.landing.startsWith(canonicalRoot),
      ),
    ).toEqual([]);
  });

  test('reports every unresolvable operand as an Error, so the caller can mark the cwd unknown', () => {
    expect(failures.filter((error) => !(error instanceof Error) || error.message === '')).toEqual(
      [],
    );
  });
});
