import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { AnalysisLimit, createBudget } from '@next/core/budget';
import { processPathResolver } from '@next/core/environment';
import {
  expandSupportedPathEnvironmentVariables,
  isUnsupportedWindowsNamespacePath,
  normalizeMsysDrivePath,
  normalizeProtectedPathCandidate,
  probeExistingPath,
  resolveExistingPath,
} from '@next/core/paths/canonicalization';
import { isUnsupportedWindowsNamespacePath as shippedIsUnsupportedWindowsNamespacePath } from '@/analyzer/path';
import {
  createPathCanonicalizationBudget,
  createPathCanonicalizationContext,
  PathCanonicalizationLimitError,
  expandSupportedPathEnvironmentVariables as shippedExpand,
  probeExistingPath as shippedProbe,
  resolveExistingPath as shippedResolve,
} from '@/analyzer/path-canonicalization';
import { normalizeProtectedPathCandidate as shippedNormalize } from '@/guards/protected-path-scanner';
import {
  normalizeMsysDrivePath as shippedNormalizeMsysDrivePath,
  processPathResolver as shippedPaths,
} from '@/ir/environment';
import { recordPorted, rootFolds } from '../../helpers/temp-home';
import {
  corpusWords,
  expectSameOutcome,
  pairedEnvironments,
  pickWord,
  seededRandom,
  writeSymlinkLoopTree,
} from '../differential-inputs';

const PLATFORMS: NodeJS.Platform[] = ['win32', 'linux', 'darwin'];
const FRAGMENTS = [
  '$HOME',
  '${HOME}',
  '${HOME:-',
  '${HOME:+',
  '${HOME=',
  '${HOME:?',
  '${HOME%',
  '${TMPDIR:-',
  '${UNSET_Z:-',
  '${XDG_CONFIG_HOME}',
  '$TMPDIR',
  '}',
  '${',
  '$',
  '$1',
  '~',
  '~/',
  '..',
  '/',
  '\\',
  '/tmp',
  '/dev',
  'C:',
  '/c/',
  '\\\\?\\',
  '.git',
  'x',
  ' ',
];

let root = '';
let home = '';

/**
 * Every machine-specific prefix a recorded path can carry: a relative target resolves against the
 * checkout, so the cwd and its parent are folded first — on a CI runner they sit under the home.
 */
const pathFolds = () => [
  [process.cwd(), '<cwd>'] as const,
  [dirname(process.cwd()), '<cwd>/..'] as const,
  ...rootFolds(root),
  [homedir(), '<home>'] as const,
];

/**
 * The one target that resolves above the checkout's parent, which no fold can hide: the
 * grandparent is `/home` here, a substring of `<root>/home` and of the corpus's
 * `/srv/home/tester`, and on a runner it is a different directory again. It is compared like every
 * other target and left out of the record.
 */
const ABOVE_PARENT = '../..';

/**
 * A relative target that climbs out of the fixture root lands in the temp directory or above it:
 * `/tmp` here, `/var/folders/…` on macOS, a value no fold can hide because a fold of the temp
 * directory would rewrite the literal `/tmp` rows instead. Such a target is compared, not recorded.
 */
const climbsOut = (cwd: string, target: string) =>
  !isAbsolute(target) && relative(root, resolve(cwd, target)).startsWith('..');

function targets(): string[] {
  return [
    '~',
    '~/',
    '~/x/../y',
    '~user/x',
    '$HOME',
    '$HOME/x',
    '${HOME}',
    '${HOME}/x',
    '${HOME:-/fallback}',
    '${UNSET_X:-$HOME}/x',
    '${TMPDIR}/build',
    '$TMPDIR/build',
    '${TMPDIR:-/tmp}/build',
    '${XDG_CONFIG_HOME:+set}',
    '${HOME:+${HOME}/nested}',
    '${HOME:-${TMPDIR:-${HOME}}}',
    '$',
    '$$',
    '$1',
    '${',
    '${HOME',
    '${HOME=x}',
    '${HOME:?missing}',
    '${TMPDIR:?missing}',
    '${HOME%x}',
    '${UNSET_Y%x}',
    '${UNSET_Y=1}',
    '\\${HOME}',
    '/c/Users/tester',
    '/c',
    '/C/x',
    'c:/x',
    '\\\\?\\C:\\x',
    '\\\\.\\pipe\\name',
    '//server/share/x',
    '\\\\server\\share',
    '/dev/null',
    '/dev/sda',
    '/dev/../etc/passwd',
    '..',
    '../..',
    '../../../../../../../../etc/passwd',
    'a/b/../../..',
    './x/./y',
    '',
    '   ',
    'x\\y\\z',
    '/tmp/../tmp/x',
    'C:\\Windows\\..\\x',
    join(root, 'alias', 'missing', 'leaf'),
    // Past the 256-component cap the walk stops short of `alias` and hands back the lexical path;
    // a port without the cap reaches the link and resolves it.
    join(root, 'alias', ...Array.from({ length: 300 }, (_, index) => `m${index}`)),
    join(root, 'alias', '..', 'file'),
    join(root, 'loop-a', 'child'),
    join(root, 'broken', 'child'),
    join(root, 'file', 'under-a-file'),
    join(root, 'existing'),
    root,
    ...corpusWords(),
  ];
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-canonicalization-'));
  home = join(root, 'home');
  writeSymlinkLoopTree(root, {
    home: null,
    existing: null,
    alias: { symlink: join(root, 'existing') },
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('supported path variable expansion', () => {
  test('agrees with the shipped expander over the tricky table and the corpus', () => {
    const variables: Record<string, string>[] = [
      { HOME: home, TMPDIR: '/tmp', XDG_CONFIG_HOME: '/xdg' },
      { TMPDIR: '' },
      {},
    ];
    for (const env of variables) {
      const pair = pairedEnvironments(env, home);
      for (const target of targets()) {
        const thrown = expectSameOutcome(
          () => expandSupportedPathEnvironmentVariables(target, pair.next),
          () => shippedExpand(target, pair.shipped),
          pathFolds(),
        );
        if (thrown !== undefined) {
          expect(thrown).toBeInstanceOf(AnalysisLimit);
          expect((thrown as AnalysisLimit).kind).toBe('pathEnvironmentExpansion');
        }
      }
    }
  });

  test('fails closed on nesting past the cap exactly where the shipped expander does', () => {
    const pair = pairedEnvironments({ TMPDIR: '/tmp' }, home);
    for (const depth of [63, 64, 65, 66]) {
      const nested = `${'${HOME:-'.repeat(depth)}x${'}'.repeat(depth)}`;
      const thrown = expectSameOutcome(
        () => expandSupportedPathEnvironmentVariables(nested, pair.next),
        () => shippedExpand(nested, pair.shipped),
        pathFolds(),
      );
      expect(thrown === undefined).toBe(depth <= 64);
    }
  });
});

describe('protected path candidates', () => {
  test('canonicalize like the shipped scanner from existing and missing cwds', () => {
    const pair = pairedEnvironments({ HOME: home, TMPDIR: '/tmp' }, home);
    for (const cwd of [root, join(root, 'missing-cwd'), join(root, 'alias')]) {
      for (const target of targets()) {
        const thrown = expectSameOutcome(
          () => normalizeProtectedPathCandidate(target, cwd, pair.next, createBudget()),
          () => shippedNormalize(target, cwd, createPathCanonicalizationContext(pair.shipped)),
          pathFolds(),
          !climbsOut(cwd, target),
        );
        if (thrown !== undefined) expect(thrown).toBeInstanceOf(AnalysisLimit);
      }
    }
  });

  test('agree with the shipped scanner on a seeded fuzz and throw nothing but AnalysisLimit', () => {
    const random = seededRandom(0x7a7e_5a11);
    const pair = pairedEnvironments({ HOME: home, TMPDIR: '/tmp' }, home);
    const words = [...FRAGMENTS, ...corpusWords()];
    for (let sample = 0; sample < 400; sample++) {
      const length = 1 + Math.floor(random() * 8);
      const target = Array.from({ length }, () => pickWord(random, words)).join('');
      const thrown = expectSameOutcome(
        () => normalizeProtectedPathCandidate(target, root, pair.next, createBudget()),
        () => shippedNormalize(target, root, createPathCanonicalizationContext(pair.shipped)),
        pathFolds(),
        !climbsOut(root, target),
      );
      if (thrown !== undefined) expect(thrown).toBeInstanceOf(AnalysisLimit);
    }
  });
});

describe('existing-prefix resolution', () => {
  test('walks and probes like the shipped resolver', () => {
    const budget = createBudget();
    const shippedBudget = createPathCanonicalizationBudget();
    for (const target of targets()) {
      const resolved = resolveExistingPath(target, processPathResolver, budget);
      expect(resolved).toBe(shippedResolve(target, shippedPaths, shippedBudget));
      const probed = probeExistingPath(target, processPathResolver, budget);
      expect(probed).toBe(shippedProbe(target, shippedPaths, shippedBudget));
      if (target === ABOVE_PARENT) continue;
      recordPorted(resolved, pathFolds());
      recordPorted(probed, pathFolds());
    }
    expect(budget.counters.get('realpathAttempts')).toBe(shippedBudget.realpathAttempts);
    expect(budget.counters.get('processedCandidateBytes')).toBe(
      shippedBudget.processedCandidateBytes,
    );
    expect(budget.resolvedPaths).toEqual(shippedBudget.resolvedPaths);
    recordPorted(
      [...budget.resolvedPaths].filter(([target]) => target !== ABOVE_PARENT),
      pathFolds(),
    );
  });

  test('breaches the attempt counter on the same call as the shipped budget', () => {
    expect(breachIndex((index) => join(root, `missing-${index}`, 'leaf'), 6000)).toEqual({
      next: 5461,
      shipped: 5461,
      kind: 'realpathAttempts',
    });
  });

  test('breaches the byte counter on the same call as the shipped budget', () => {
    const long = 'y'.repeat(4000);
    const breach = breachIndex((index) => join(root, long, `leaf-${index}`), 1200);
    expect(breach.next).toBe(breach.shipped);
    expect(breach.next).toBeGreaterThan(0);
    expect(breach.kind).toBe('processedCandidateBytes');
  });
});

describe('platform path forms', () => {
  test('detect Windows namespaces and MSYS drives like the shipped helpers', () => {
    for (const target of targets()) {
      for (const platform of PLATFORMS) {
        const unsupported = isUnsupportedWindowsNamespacePath(target, platform);
        expect(unsupported).toBe(shippedIsUnsupportedWindowsNamespacePath(target, platform));
        expect(unsupported).toMatchSnapshot();
        const msys = normalizeMsysDrivePath(target, platform);
        expect(msys).toBe(shippedNormalizeMsysDrivePath(target, platform));
        recordPorted(msys, pathFolds());
      }
      expect(isUnsupportedWindowsNamespacePath(target)).toBe(
        shippedIsUnsupportedWindowsNamespacePath(target),
      );
    }
    expect(isUnsupportedWindowsNamespacePath('\\\\?\\C:\\x', 'win32')).toBe(true);
    expect(normalizeMsysDrivePath('/c/Users', 'win32')).toBe('c:/Users');
    expect(normalizeMsysDrivePath(`/${homedir()}`, 'linux')).toBe(`/${homedir()}`);
  });
});

function breachIndex(path: (index: number) => string, calls: number) {
  const budget = createBudget();
  const shippedBudget = createPathCanonicalizationBudget();
  const result = { next: -1, shipped: -1, kind: '' };
  for (let index = 0; index < calls; index++) {
    if (result.next === -1) {
      try {
        resolveExistingPath(path(index), processPathResolver, budget);
      } catch (error) {
        result.next = index;
        result.kind = error instanceof AnalysisLimit ? error.kind : 'not-an-analysis-limit';
      }
    }
    if (result.shipped === -1) {
      try {
        shippedResolve(path(index), shippedPaths, shippedBudget);
      } catch (error) {
        result.shipped = error instanceof PathCanonicalizationLimitError ? index : -2;
      }
    }
  }
  return result;
}
