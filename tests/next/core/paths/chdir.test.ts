import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createTestEnvironment, type FakeEntry, processPathResolver } from '@next/core/environment';
import { resolveChdirTarget } from '@next/core/paths/chdir';
import { resolveChdirTarget as shippedResolveChdirTarget } from '@/analyzer/path';
import { processPathResolver as shippedPaths } from '@/ir/environment';
import { rootFolds } from '../../helpers/temp-home';
import {
  corpusWords,
  expectSameOutcome,
  pickWord,
  seededRandom,
  writeSymlinkLoopTree,
} from '../differential-inputs';

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

let root = '';

function targets(): string[] {
  return [
    '.',
    '..',
    './dir',
    'dir/sub',
    'dir/../dir/sub',
    'link',
    'link/sub',
    'link/../file',
    'link/..',
    'broken',
    'loop-a',
    'missing',
    'missing/..',
    'file',
    'file/x',
    '/',
    '//',
    '//x',
    '\\\\?\\C:\\x',
    'dir//sub',
    'dir/./sub/',
    'space dir',
    '',
    '~',
    '$HOME',
    root,
    join(root, 'link', 'sub'),
    join(root, 'dir', '..', 'file'),
    ...corpusWords(),
  ];
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-chdir-'));
  writeSymlinkLoopTree(root, {
    'dir/sub': null,
    'space dir': null,
    link: { symlink: join(root, 'dir') },
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/**
 * Where a target lands when it climbs out of the fixture root: the temp directory the root sits
 * in, which the host names — `/tmp` here, `/var/folders/…` on a macOS runner. Folding it out is
 * not an option either, because the corpus spells `/tmp` itself, so the row is compared like
 * every other and left out of the record.
 */
const climbsOut = (cwd: string, target: string) =>
  !isAbsolute(target) && relative(root, resolve(cwd, target)).startsWith('..');

function expectSameChdir(base: string, target: string): void {
  const thrown = expectSameOutcome(
    () => resolveChdirTarget(base, target, processPathResolver),
    () => shippedResolveChdirTarget(base, target, shippedPaths),
    rootFolds(root),
    !climbsOut(base, target),
  );
  if (thrown !== undefined) {
    expect(thrown).toBeInstanceOf(Error);
    expect(() => shippedResolveChdirTarget(base, target, shippedPaths)).toThrow(
      (thrown as Error).message,
    );
  }
}

describe('chdir target resolution', () => {
  test('lands where the shipped resolver lands or fails with the same message', () => {
    for (const base of [root, join(root, 'dir'), join(root, 'link'), `${root}/`]) {
      for (const target of targets()) expectSameChdir(base, target);
    }
  });

  test('agrees with the shipped resolver on a seeded fuzz of joined components', () => {
    const random = seededRandom(0xc4d1_2026);
    for (let sample = 0; sample < 400; sample++) {
      const length = 1 + Math.floor(random() * 6);
      const target = Array.from({ length }, () => pickWord(random, FRAGMENTS)).join(
        random() < 0.5 ? '/' : '',
      );
      expectSameChdir(root, target);
    }
  });

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
