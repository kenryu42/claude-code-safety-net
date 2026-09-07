import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, posix } from 'node:path';
import { AnalysisLimit, createBudget } from '@/core/budget';
import { processPathResolver } from '@/core/environment';
import {
  expandSupportedPathEnvironmentVariables,
  isUnsupportedWindowsNamespacePath,
  normalizeMsysDrivePath,
  normalizeProtectedPathCandidate,
  probeExistingPath,
  resolveExistingPath,
} from '@/core/paths/canonicalization';
import {
  corpusWords,
  pairedEnvironments,
  pickWord,
  seededRandom,
  writeSymlinkLoopTree,
} from '../differential-inputs';

/**
 * The view the protected-path guards get of a candidate: supported variables and `~` expanded,
 * unsupported forms failing closed under `pathEnvironmentExpansion`, the existing prefix
 * canonicalized within the realpath budget, and the answer spelled with forward slashes.
 */

const root = mkdtempSync(join(tmpdir(), 'next-canonicalization-'));
const home = join(root, 'home');
writeSymlinkLoopTree(root, {
  home: null,
  existing: null,
  alias: { symlink: join(root, 'existing') },
});

/** The fixture as a canonicalized candidate spells it: symlinks resolved, forward slashes. */
const canonicalRoot = realpathSync(root).replace(/\\/g, '/');
const under = (...parts: string[]) => posix.join(canonicalRoot, ...parts);

const environment = pairedEnvironments(
  { HOME: home, TMPDIR: '/tmp', XDG_CONFIG_HOME: '/xdg' },
  home,
);
const emptyTmpdir = pairedEnvironments({ HOME: home, TMPDIR: '' }, home);
const unsetHome = pairedEnvironments({}, home);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** What the call settled with, so one invariant can hold over both outcomes. */
function settle<T>(call: () => T): { value: T } | { error: unknown } {
  try {
    return { value: call() };
  } catch (error) {
    return { error };
  }
}

const failureKind = (error: unknown) =>
  error instanceof AnalysisLimit ? error.kind : `unexpected: ${String(error)}`;

describe('supported path variable expansion', () => {
  const expansions = [
    {
      name: 'expands a supported variable in the bare form',
      target: '$HOME/x',
      environment,
      expected: `${home}/x`,
    },
    {
      name: 'expands a supported variable in the braced form',
      target: '${HOME}',
      environment,
      expected: home,
    },
    {
      name: 'falls back to the captured home when HOME is not in the environment map',
      target: '$HOME',
      environment: unsetHome,
      expected: home,
    },
    {
      name: 'leaves a variable outside the supported set untouched',
      target: '$PATH/bin',
      environment,
      expected: '$PATH/bin',
    },
    {
      name: 'leaves a positional parameter untouched',
      target: '$1',
      environment,
      expected: '$1',
    },
    {
      name: 'leaves a bare dollar untouched',
      target: '$$',
      environment,
      expected: '$$',
    },
    {
      name: 'takes the value for `:-` when it is set and non-empty',
      target: '${TMPDIR:-/fallback}',
      environment,
      expected: '/tmp',
    },
    {
      name: 'takes the fallback for `:-` when the value is empty',
      target: '${TMPDIR:-/fallback}',
      environment: emptyTmpdir,
      expected: '/fallback',
    },
    {
      name: 'treats an empty value as set for the colonless `-`',
      target: '${TMPDIR-/fallback}',
      environment: emptyTmpdir,
      expected: '',
    },
    {
      name: 'expands the alternate branch of `:+` when the value is usable',
      target: '${XDG_CONFIG_HOME:+set}',
      environment,
      expected: 'set',
    },
    {
      name: 'expands `:+` to nothing when the variable is unset',
      target: '${XDG_CONFIG_HOME:+set}',
      environment: unsetHome,
      expected: '',
    },
    {
      name: 'expands nested defaults down to the first usable value',
      target: '${HOME:-${TMPDIR:-${HOME}}}',
      environment,
      expected: home,
    },
    {
      name: 'expands a variable nested inside an alternate branch',
      target: '${HOME:+${HOME}/nested}',
      environment,
      expected: `${home}/nested`,
    },
    {
      name: 'keeps an operator form on an unsupported name literal rather than modelling it',
      target: '${UNSET_X:-$HOME}/x',
      environment,
      expected: '${UNSET_X:-$HOME}/x',
    },
    {
      name: 'keeps an unmodelled operator on an unsupported name literal',
      target: '${UNSET_Y%x}',
      environment,
      expected: '${UNSET_Y%x}',
    },
    {
      name: 'keeps an unterminated expansion of an unsupported name literal',
      target: '${UNSET_Z:-',
      environment,
      expected: '${UNSET_Z:-',
    },
    {
      name: 'keeps a lone opening brace literal',
      target: '${',
      environment,
      expected: '${',
    },
    {
      name: 'expands through a preceding backslash, which is not a quoting model',
      target: '\\${HOME}',
      environment,
      expected: `\\${home}`,
    },
    {
      name: 'treats a backslash inside the expansion as escaping the brace that follows it',
      target: '${HOME:-\\}}',
      environment,
      expected: home,
    },
    {
      name: 'expands an empty TMPDIR to nothing, so $TMPDIR/build reads as /build',
      target: '$TMPDIR/build',
      environment: emptyTmpdir,
      expected: '/build',
    },
    {
      name: 'expands the error form when the value is usable',
      target: '${HOME:?missing}',
      environment,
      expected: home,
    },
    {
      name: 'leaves a supported variable that is unset literal in the bare form',
      target: '$TMPDIR/build',
      environment: unsetHome,
      expected: '$TMPDIR/build',
    },
    {
      name: 'leaves a supported variable that is unset literal in the braced form',
      target: '${TMPDIR}/build',
      environment: unsetHome,
      expected: '${TMPDIR}/build',
    },
  ];

  for (const row of expansions) {
    test(row.name, () => {
      expect(expandSupportedPathEnvironmentVariables(row.target, row.environment)).toBe(
        row.expected,
      );
    });
  }

  /** Forms whose shell semantics the gate does not model: it refuses the candidate instead. */
  const refusals = [
    { name: 'fails closed on an assignment operator', target: '${HOME=x}', environment },
    { name: 'fails closed on a colon assignment operator', target: '${HOME:=x}', environment },
    {
      name: 'fails closed on the error operator when the value is empty',
      target: '${TMPDIR:?missing}',
      environment: emptyTmpdir,
    },
    {
      name: 'fails closed on an operator it does not implement for a supported name',
      target: '${HOME%x}',
      environment,
    },
    {
      name: 'fails closed on an unterminated expansion of a supported name',
      target: '${HOME',
      environment,
    },
  ];

  for (const row of refusals) {
    test(row.name, () => {
      expect(() => expandSupportedPathEnvironmentVariables(row.target, row.environment)).toThrow(
        expect.objectContaining({ name: 'AnalysisLimit', kind: 'pathEnvironmentExpansion' }),
      );
    });
  }

  // The documented expansion-depth cap is 64 (docs/greenfield-contract.md §"Budgets").
  const nested = (depth: number) => `${'${HOME:-'.repeat(depth)}x${'}'.repeat(depth)}`;

  test('expands nesting at the depth cap', () => {
    expect(expandSupportedPathEnvironmentVariables(nested(64), environment)).toBe(home);
  });

  test('fails closed one level past the depth cap', () => {
    expect(() => expandSupportedPathEnvironmentVariables(nested(65), environment)).toThrow(
      expect.objectContaining({ kind: 'pathEnvironmentExpansion' }),
    );
  });
});

describe('platform path forms', () => {
  const drives = [
    {
      name: 'rewrites an MSYS drive path to its Windows spelling',
      target: '/c/Users',
      windows: 'c:/Users',
    },
    { name: 'rewrites a bare MSYS drive to a drive root', target: '/c', windows: 'c:/' },
    { name: 'keeps the drive letter case it was given', target: '/C/x', windows: 'C:/x' },
    { name: 'leaves a multi-letter first component alone', target: '/tmp', windows: '/tmp' },
    { name: 'leaves an already-Windows drive path alone', target: 'c:/x', windows: 'c:/x' },
    { name: 'leaves a device path alone', target: '/dev/null', windows: '/dev/null' },
  ];

  for (const row of drives) {
    test(`${row.name} on Windows and nowhere else`, () => {
      expect(normalizeMsysDrivePath(row.target, 'win32')).toBe(row.windows);
      expect(normalizeMsysDrivePath(row.target, 'linux')).toBe(row.target);
      expect(normalizeMsysDrivePath(row.target, 'darwin')).toBe(row.target);
    });
  }

  const namespaces = [
    { name: 'a Win32 file namespace prefix', target: '\\\\?\\C:\\x', unsupported: true },
    { name: 'a device namespace prefix', target: '\\\\.\\pipe\\name', unsupported: true },
    { name: 'a UNC share in backslash form', target: '\\\\server\\share', unsupported: true },
    { name: 'a UNC share in forward-slash form', target: '//server/share/x', unsupported: true },
    { name: 'a POSIX absolute path', target: '/tmp', unsupported: false },
    { name: 'a lone backslash', target: '\\', unsupported: false },
    { name: 'a drive-relative path', target: 'C:\\x', unsupported: false },
  ];

  for (const row of namespaces) {
    test(`classifies ${row.name} on Windows and never off it`, () => {
      expect(isUnsupportedWindowsNamespacePath(row.target, 'win32')).toBe(row.unsupported);
      expect(isUnsupportedWindowsNamespacePath(row.target, 'linux')).toBe(false);
      expect(isUnsupportedWindowsNamespacePath(row.target, 'darwin')).toBe(false);
    });
  }
});

describe('existing-prefix resolution', () => {
  const resolutions = [
    {
      name: 'returns the canonical path of a directory that exists',
      target: join(root, 'existing'),
      expected: under('existing'),
    },
    {
      name: 'resolves a symlink to its target',
      target: join(root, 'alias'),
      expected: under('existing'),
    },
    {
      name: 'appends the missing components to the canonical existing prefix',
      target: join(root, 'alias', 'missing', 'leaf'),
      expected: under('existing', 'missing', 'leaf'),
    },
    {
      name: 'keeps a dangling symlink in the missing suffix instead of failing',
      target: join(root, 'broken', 'child'),
      expected: under('broken', 'child'),
    },
    {
      name: 'keeps a symlink cycle in the missing suffix instead of looping',
      target: join(root, 'loop-a', 'child'),
      expected: under('loop-a', 'child'),
    },
    {
      name: 'keeps a path descending through a file in the missing suffix',
      target: join(root, 'file', 'under-a-file'),
      expected: under('file', 'under-a-file'),
    },
    {
      name: 'returns the empty candidate unchanged rather than resolving the cwd',
      target: '',
      expected: '',
    },
  ];

  for (const row of resolutions) {
    test(row.name, () => {
      expect(resolveExistingPath(row.target, processPathResolver, createBudget())).toBe(
        row.expected,
      );
    });
  }

  test('stops at the 256-component cap and hands back the lexical path, leaving the link unresolved', () => {
    // 300 missing components under `alias`: the walk gives up 256 levels up, still short of the
    // link, so the answer never names the link's target.
    const deep = join(root, 'alias', ...Array.from({ length: 300 }, (_, index) => `m${index}`));
    expect(resolveExistingPath(deep, processPathResolver, createBudget())).toBe(deep);
  });

  test('answers a repeated candidate from the budget cache without charging again', () => {
    const budget = createBudget();
    const target = join(root, 'missing', 'leaf');
    expect(resolveExistingPath(target, processPathResolver, budget)).toBe(under('missing', 'leaf'));
    const charged = new Map(budget.counters);
    expect(resolveExistingPath(target, processPathResolver, budget)).toBe(under('missing', 'leaf'));
    expect(new Map(budget.counters)).toEqual(charged);
  });

  const probes = [
    {
      name: 'answers with the canonical path when the entry exists',
      target: join(root, 'existing'),
      expected: under('existing'),
    },
    {
      name: 'answers with the symlink target when the entry is a link',
      target: join(root, 'alias'),
      expected: under('existing'),
    },
    {
      name: 'answers null for a missing entry instead of walking up',
      target: join(root, 'alias', 'missing', 'leaf'),
      expected: null,
    },
    { name: 'answers null for a dangling symlink', target: join(root, 'broken'), expected: null },
    { name: 'answers null for a symlink cycle', target: join(root, 'loop-a'), expected: null },
  ];

  for (const row of probes) {
    test(`probing ${row.name}`, () => {
      expect(probeExistingPath(row.target, processPathResolver, createBudget())).toBe(row.expected);
    });
  }

  test('probing returns the cached walk of a missing path, which callers compare rather than trust', () => {
    const budget = createBudget();
    const target = join(root, 'missing', 'leaf');
    resolveExistingPath(target, processPathResolver, budget);
    expect(probeExistingPath(target, processPathResolver, budget)).toBe(under('missing', 'leaf'));
  });

  /** The call index that first breached, and the kind it breached on. */
  function firstBreach(path: (index: number) => string, calls: number) {
    const budget = createBudget();
    const breaches = Array.from({ length: calls }, (_, index) => index).flatMap((index) => {
      const settled = settle(() => resolveExistingPath(path(index), processPathResolver, budget));
      return 'error' in settled ? [{ index, kind: failureKind(settled.error) }] : [];
    });
    return breaches[0];
  }

  test('breaches the 16,384 realpath-attempt cap on the call that crosses it', () => {
    // Each call walks leaf → parent → root: three attempts, so attempt 16,385 falls in call 5,461.
    expect(firstBreach((index) => join(root, `missing-${index}`, 'leaf'), 6000)).toEqual({
      index: 5461,
      kind: 'realpathAttempts',
    });
  });

  test('breaches the 4 MiB candidate-byte cap long before the attempt cap', () => {
    const breach = firstBreach((index) => join(root, 'y'.repeat(4000), `leaf-${index}`), 6000);
    expect(breach?.kind).toBe('processedCandidateBytes');
    expect(breach?.index).toBeLessThan(5461);
  });
});

describe('protected path candidates', () => {
  const candidates = [
    {
      name: 'expands a bare tilde to the canonical home',
      target: '~',
      cwd: root,
      expected: under('home'),
    },
    {
      name: 'expands a trailing-slash tilde to the canonical home',
      target: '~/',
      cwd: root,
      expected: under('home'),
    },
    {
      name: 'normalizes away a parent segment under the home',
      target: '~/x/../y',
      cwd: root,
      expected: under('home', 'y'),
    },
    {
      name: 'leaves a tilde-user form as a literal component',
      target: '~user/x',
      cwd: root,
      expected: under('~user', 'x'),
    },
    {
      name: 'expands a supported variable before resolving',
      target: '$HOME/x',
      cwd: root,
      expected: under('home', 'x'),
    },
    {
      name: 'resolves a relative candidate against the cwd',
      target: './x/./y',
      cwd: root,
      expected: under('x', 'y'),
    },
    {
      name: 'resolves against a cwd that does not exist',
      target: './x',
      cwd: join(root, 'missing-cwd'),
      expected: under('missing-cwd', 'x'),
    },
    {
      name: 'reads backslashes as separators',
      target: 'x\\y\\z',
      cwd: root,
      expected: under('x', 'y', 'z'),
    },
    {
      name: 'canonicalizes through a symlinked component',
      target: join(root, 'alias', 'missing', 'leaf'),
      cwd: root,
      expected: under('existing', 'missing', 'leaf'),
    },
    {
      name: 'cannot be walked out of the fixture by parent segments it also normalizes away',
      target: 'a/b/../..',
      cwd: root,
      expected: canonicalRoot,
    },
    { name: 'answers empty for an empty candidate', target: '', cwd: root, expected: '' },
    { name: 'answers empty for a blank candidate', target: '   ', cwd: root, expected: '' },
  ];

  for (const row of candidates) {
    test(row.name, () => {
      expect(
        normalizeProtectedPathCandidate(row.target, row.cwd, environment, createBudget()),
      ).toBe(row.expected);
    });
  }

  test('fails closed when the candidate carries a form the expander refuses', () => {
    expect(() =>
      normalizeProtectedPathCandidate('${HOME=x}', root, environment, createBudget()),
    ).toThrow(expect.objectContaining({ kind: 'pathEnvironmentExpansion' }));
  });
});

/**
 * The properties every candidate must have, over targets glued from the tricky fragments and the
 * words the two contract corpora spell: what a guard may not be handed is a relative answer, a
 * separator it does not compare on, an unresolved `..`, or an exception it does not classify.
 */
describe('canonicalization invariants over generated candidates', () => {
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

  const generated = (() => {
    const random = seededRandom(0x7a7e_5a11);
    const words = [...FRAGMENTS, ...corpusWords()];
    return Array.from({ length: 400 }, () => {
      const target = Array.from({ length: 1 + Math.floor(random() * 8) }, () =>
        pickWord(random, words),
      ).join('');
      return {
        target,
        settled: settle(() =>
          normalizeProtectedPathCandidate(target, root, environment, createBudget()),
        ),
      };
    });
  })();

  const failures = generated.flatMap((row) => ('error' in row.settled ? [row.settled.error] : []));
  const canonical = generated.flatMap((row) =>
    'value' in row.settled ? [{ target: row.target, value: row.settled.value }] : [],
  );

  test('exercises both outcomes, so the invariants below are not vacuous', () => {
    expect(failures.length).toBeGreaterThan(0);
    expect(canonical.length).toBeGreaterThan(0);
  });

  test('throws nothing but the path-expansion limit', () => {
    expect([...new Set(failures.map(failureKind))]).toEqual(['pathEnvironmentExpansion']);
  });

  test('answers with an absolute path or with nothing at all', () => {
    expect(canonical.filter((row) => row.value !== '' && !isAbsolute(row.value))).toEqual([]);
  });

  test('answers with forward slashes only, the separator the guards compare on', () => {
    expect(canonical.filter((row) => row.value.includes('\\'))).toEqual([]);
  });

  test('leaves no relative segment for a guard to compare against', () => {
    expect(
      canonical.filter((row) => row.value.split('/').some((part) => part === '.' || part === '..')),
    ).toEqual([]);
  });

  test('is idempotent: canonicalizing its own answer changes nothing', () => {
    expect(
      canonical.filter(
        (row) =>
          normalizeProtectedPathCandidate(row.value, root, environment, createBudget()) !==
          row.value,
      ),
    ).toEqual([]);
  });
});
