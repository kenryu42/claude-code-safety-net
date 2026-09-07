import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessEnvironment } from '@/core/environment';
import type { ProtectedGitMetadata } from '@/core/git/metadata';
import { resolveProtectedGitMetadata } from '@/core/git/metadata';
import type { CommandWord } from '@/core/shell/model';
import { parseCommand } from '@/core/shell/parse';
import { projectCommandViews } from '@/core/shell/traversal';
import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  deleteTargetWordFacts,
  isDangerousRootOrHomeTarget,
  isTrustedTempDescendantTarget,
  type RecursiveDeleteTargetClassificationOptions,
  type RecursiveDeleteTargetOptions,
} from '@/gate/analyzer/recursive-delete-targets';
import { corpusWords, pairedEnvironments } from '../../core/differential-inputs';
import { createLinkedWorktreeFixture, type LinkedWorktreeFixture } from '../../helpers';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import {
  corpusCommands,
  FIXED_COMMANDS,
  FUZZ_SAMPLE_COUNT,
  FUZZ_SEED,
  fuzzShellSources,
} from '../../helpers/shell-inputs';
import { normalize, rootFolds } from '../../helpers/temp-home';

/**
 * Where a recursive delete lands decides which rule fires, so every classification branch —
 * root and home, the Git control plane, trusted temp, dynamic, allow paths, the anchored cwd —
 * is recorded over the same targets, options and filesystem.
 */

let root = '';
let home = '';
let workspace = '';
let worktrees: LinkedWorktreeFixture;
let gitMetadata: ProtectedGitMetadata | null = null;

function environments(env: Record<string, string> = {}) {
  return pairedEnvironments({ HOME: home, ...env }, home);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-delete-targets-'));
  home = join(root, 'home');
  workspace = join(root, 'work');
  writeTree(root, {
    'home/projects': null,
    'work/nested/deep': null,
    'work/file.txt': 'x',
    allowed: null,
    'allowed/inner': null,
    'home/allowed-home': null,
    tmp: null,
    'tmp/inner': null,
    'not-temp': null,
    'link-to-work': { symlink: join(root, 'work') },
  });
  worktrees = createLinkedWorktreeFixture();
  gitMetadata = resolveProtectedGitMetadata(worktrees.mainWorktree, createProcessEnvironment());
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  worktrees.cleanup();
});

type ContextCase = {
  label: string;
  env?: Record<string, string>;
  options: Omit<RecursiveDeleteTargetOptions, 'environment'>;
};

function contextCases(): readonly ContextCase[] {
  return [
    {
      label: 'workspace anchored',
      options: { cwd: workspace, originalCwd: workspace, protectedGitMetadata: null },
    },
    {
      label: 'workspace anchored, posix shell',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        posixShell: true,
        protectedGitMetadata: null,
      },
    },
    {
      label: 'nested cwd under the anchor',
      options: {
        cwd: join(workspace, 'nested'),
        originalCwd: workspace,
        posixShell: true,
        strict: true,
        protectedGitMetadata: null,
      },
    },
    {
      label: 'home is the anchor',
      options: { cwd: home, originalCwd: home, paranoid: true, protectedGitMetadata: null },
    },
    {
      label: 'no anchor',
      options: { protectedGitMetadata: null },
    },
    {
      label: 'tmpdir variable distrusted',
      env: { TMPDIR: join(root, 'tmp') },
      options: {
        cwd: workspace,
        originalCwd: workspace,
        posixShell: true,
        allowTmpdirVar: false,
        protectedGitMetadata: null,
      },
    },
    {
      label: 'tmpdir word splitting unsafe',
      env: { TMPDIR: join(root, 'tmp') },
      options: {
        cwd: workspace,
        originalCwd: workspace,
        posixShell: true,
        tmpdirWordSplittingUnsafe: true,
        trustedTmpdirValue: true,
        protectedGitMetadata: null,
      },
    },
    {
      label: 'tmpdir pointed outside the temp roots',
      env: { TMPDIR: join(root, 'not-temp') },
      options: {
        cwd: workspace,
        originalCwd: workspace,
        posixShell: true,
        trustedTmpdirValue: false,
        protectedGitMetadata: null,
      },
    },
    {
      label: 'allow paths configured',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        allowPaths: [join(root, 'allowed'), '~/allowed-home', 'relative', join(root, 'missing')],
        protectedGitMetadata: null,
      },
    },
    {
      label: 'allow path containing home',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        allowPaths: [root, home],
        protectedGitMetadata: null,
      },
    },
    {
      label: 'git repository',
      options: {
        cwd: '',
        originalCwd: '',
        posixShell: true,
        protectedGitMetadata: null,
      },
    },
  ];
}

/** The repository case needs the fixture paths and metadata resolved in `beforeAll`. */
function resolvedOptions(row: ContextCase): Omit<RecursiveDeleteTargetOptions, 'environment'> {
  if (row.label !== 'git repository') return row.options;
  return {
    ...row.options,
    cwd: worktrees.mainWorktree,
    originalCwd: worktrees.mainWorktree,
    protectedGitMetadata: gitMetadata,
  };
}

function contextPair(row: ContextCase) {
  return createRecursiveDeleteTargetContext({
    ...resolvedOptions(row),
    environment: environments(row.env),
  });
}

/** Both temp roots a recorded value can name: the fixture tree and the linked worktree clone. */
const recordFolds = () => [...rootFolds(root), ...rootFolds(worktrees.rootDir)];

function targets(cwd: string): readonly string[] {
  return [
    '/',
    '/*',
    '/**',
    '/*/*',
    '//',
    '~',
    '~/',
    '~/*',
    '~/projects',
    '$HOME',
    '$HOME/',
    '$HOME/*',
    '${HOME}',
    '${HOME}/projects',
    'C:/',
    'C:\\',
    '//server/share',
    '.',
    './',
    '.\\',
    '..',
    '../x',
    '*',
    './*',
    'file.txt',
    './nested',
    'nested/deep',
    'nested/../file.txt',
    cwd,
    `${cwd}/`,
    join(cwd, 'nested'),
    join(root, 'link-to-work'),
    join(root, 'allowed'),
    join(root, 'allowed', 'inner'),
    join(home, 'allowed-home'),
    join(root, 'tmp'),
    join(root, 'tmp', 'inner'),
    '/tmp',
    '/tmp/next-delete-targets-probe',
    '$TMPDIR',
    '$TMPDIR/',
    '$TMPDIR/x',
    '${TMPDIR}/x',
    '$TMPDIR/../escape',
    '$TMPDIR/$VAR',
    '$TMPDIRX/x',
    '$VAR/x',
    '`hostname`/x',
    'a?b',
    '[ab]',
    '{a,b}',
    '+(x)',
    '@(x)',
    '!(x)',
    'x\\*y',
    '.git',
    '.git/hooks',
    '',
    '   ',
  ];
}

/** The context fields the module exposes; the budget behind them is private. */
type ReadableContext = {
  readonly anchoredCwd: string | null;
  readonly resolvedCwd: string | null;
  readonly strict: boolean;
  readonly paranoid: boolean;
  readonly trustTmpdirVar: boolean;
  readonly posixShell: boolean;
  readonly tmpdirWordSplittingUnsafe: boolean;
  readonly trustedTmpdirValue: boolean;
  readonly allowRoots: readonly string[];
  readonly protectedGitMetadata: ProtectedGitMetadata | null;
};

const CLASSIFICATION_OPTIONS: readonly RecursiveDeleteTargetClassificationOptions[] = [
  {},
  { targetIsLiteral: true },
  { tmpdirWordSplittingProtected: true },
  { skipHomeCwd: true },
  { skipCwdSelf: true },
  { skipHomeCwd: true, skipCwdSelf: true, targetIsLiteral: true },
];

describe('recursive delete target context', () => {
  test('resolves the same anchors, flags and allow roots as the shipped context', () => {
    const recorded: [string, unknown][] = [];
    for (const row of contextCases()) {
      const pair = contextPair(row);
      const readable = (context: ReadableContext) => ({
        anchoredCwd: context.anchoredCwd,
        resolvedCwd: context.resolvedCwd,
        strict: context.strict,
        paranoid: context.paranoid,
        trustTmpdirVar: context.trustTmpdirVar,
        posixShell: context.posixShell,
        tmpdirWordSplittingUnsafe: context.tmpdirWordSplittingUnsafe,
        trustedTmpdirValue: context.trustedTmpdirValue,
        allowRoots: context.allowRoots,
        protectedGitMetadata: context.protectedGitMetadata,
      });
      recorded.push([row.label, normalize(readable(pair), recordFolds())]);
    }
    expectRecordedDigest('analyzer-delete-targets/context', recorded);
  });

  test('an allow path that would widen into home is dropped', () => {
    const withAllowed = contextPair({
      label: 'allow paths configured',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        allowPaths: [join(root, 'allowed'), '~/allowed-home', 'relative', join(root, 'missing')],
        protectedGitMetadata: null,
      },
    });
    // An allow root is canonicalized, so it spells the fixture's real path.
    expect(withAllowed.allowRoots).toContain(join(realpathSync(root), 'allowed'));
    expect(withAllowed.allowRoots).toContain(join(realpathSync(home), 'allowed-home'));
    // A relative entry is not an allow root, and a root containing home is refused.
    expect(withAllowed.allowRoots).not.toContain('relative');
    expect(
      contextPair({
        label: 'allow path containing home',
        options: {
          cwd: workspace,
          originalCwd: workspace,
          allowPaths: [root, home],
          protectedGitMetadata: null,
        },
      }).allowRoots,
    ).toStrictEqual([]);
  });
});

/** Every context row paired with one target resolved under that row's own cwd. */
function contextTargets() {
  return contextCases().flatMap((row) => {
    const pair = contextPair(row);
    return targets(pair.resolvedCwd ?? workspace).map((target) => ({ row, pair, target }));
  });
}

describe('recursive delete target classification', () => {
  test('classifies every target the same way as the shipped classifier', () => {
    const recorded: [string, unknown][] = [];
    for (const { row, pair, target } of contextTargets()) {
      for (const options of CLASSIFICATION_OPTIONS) {
        const classified = describeOutcome(() =>
          classifyRecursiveDeleteTarget(target, pair, options),
        );
        recorded.push([
          `${row.label}: ${normalize(target, recordFolds())} ${JSON.stringify(options)}`,
          normalize(classified, recordFolds()),
        ]);
      }
    }
    expectRecordedDigest('analyzer-delete-targets/classification', recorded);
  });

  test('every classification kind is reached by the table', () => {
    const kinds = new Set(
      contextCases().flatMap((row) => {
        const context = contextPair(row);
        const cwd = context.resolvedCwd ?? workspace;
        return targets(cwd).flatMap((target) =>
          CLASSIFICATION_OPTIONS.map(
            (options) => classifyRecursiveDeleteTarget(target, context, options).kind,
          ),
        );
      }),
    );
    expect([...kinds].sort()).toStrictEqual([
      'cwd_self_target',
      'dynamic_target',
      'git_metadata_target',
      'home_cwd_target',
      'outside_anchored_cwd',
      'root_or_home_target',
      'temp_target',
      'within_anchored_cwd',
    ]);
  });

  test('classifies the corpus words and the seeded fuzz like the shipped classifier', () => {
    const recorded: [string, unknown][] = [];
    const row = contextCases()[1];
    if (!row) throw new Error('missing context case');
    const pair = contextPair(row);
    for (const target of [
      ...corpusWords(),
      ...new Set(fuzzShellSources(300, FUZZ_SEED).flatMap((source) => source.split(/\s+/))),
    ]) {
      for (const options of [{}, { targetIsLiteral: true }]) {
        const classified = describeOutcome(() =>
          classifyRecursiveDeleteTarget(target, pair, options),
        );
        recorded.push([
          `${normalize(target, recordFolds())} ${JSON.stringify(options)}`,
          normalize(classified, recordFolds()),
        ]);
      }
    }
    expectRecordedDigest('analyzer-delete-targets/corpus-classification', recorded);
  });

  test('matches the shipped trusted-temp descendant test, including the containment target', () => {
    const recorded: [string, unknown][] = [];
    for (const { row, pair, target } of contextTargets()) {
      for (const containmentTarget of [undefined, join(root, 'tmp'), workspace, '/']) {
        const options = { containmentTarget, targetIsLiteral: false };
        const trusted = describeOutcome(() => isTrustedTempDescendantTarget(target, pair, options));
        recorded.push([
          normalize(`${row.label}: ${target} contained by ${containmentTarget}`, recordFolds()),
          trusted,
        ]);
      }
    }
    expectRecordedDigest('analyzer-delete-targets/trusted-temp', recorded);
  });

  test('a temp descendant is trusted but a temp root or a workspace parent is not', () => {
    const context = contextPair({
      label: 'tmpdir variable distrusted',
      env: { TMPDIR: join(root, 'tmp') },
      options: {
        cwd: workspace,
        originalCwd: workspace,
        posixShell: true,
        protectedGitMetadata: null,
      },
    });
    expect(isTrustedTempDescendantTarget(join(root, 'tmp', 'inner'), context)).toBeTrue();
    // The temp root itself is never a descendant, and `root` lives under it.
    expect(isTrustedTempDescendantTarget(tmpdir(), context)).toBeFalse();
    expect(isTrustedTempDescendantTarget('$TMPDIR', context)).toBeFalse();
    expect(isTrustedTempDescendantTarget('$TMPDIR/x', context)).toBeTrue();
    expect(isTrustedTempDescendantTarget(workspace, context)).toBeFalse();
  });
});

describe('dangerous root or home targets', () => {
  test('matches the shipped test for every spelling', () => {
    const recorded: [string, unknown][] = [];
    for (const target of targets(workspace)) {
      for (const targetIsLiteral of [true, false]) {
        const dangerous = isDangerousRootOrHomeTarget(target, targetIsLiteral);
        recorded.push([`${normalize(target, recordFolds())} ${targetIsLiteral}`, dangerous]);
      }
    }
    expectRecordedDigest('analyzer-delete-targets/root-or-home', recorded);
  });

  test('the root and home spellings are dangerous only while they can expand', () => {
    expect(isDangerousRootOrHomeTarget('/')).toBeTrue();
    expect(isDangerousRootOrHomeTarget('/*/*')).toBeTrue();
    expect(isDangerousRootOrHomeTarget('~/*')).toBeTrue();
    expect(isDangerousRootOrHomeTarget('~/*', true)).toBeFalse();
    expect(isDangerousRootOrHomeTarget('$HOME', true)).toBeFalse();
    expect(isDangerousRootOrHomeTarget('/tmp/x')).toBeFalse();
  });
});

const WORD_SOURCES: readonly string[] = [
  'rm -rf plain',
  'rm -rf {a,b}',
  'rm -rf {a,b}/{c,d}',
  'rm -rf x{1..3}',
  'rm -rf y{,z}',
  'rm -rf {}',
  'rm -rf a{b',
  'rm -rf "{a,b}"',
  "rm -rf '{a,b}'",
  'rm -rf {a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}',
  `rm -rf ${'x'.repeat(9000)}{a,b}`,
  'rm -rf "quoted"',
  "rm -rf 'quoted'",
  'rm -rf escaped\\ word',
  'rm -rf $TMPDIR/x',
  'rm -rf "$TMPDIR"/x',
  'rm -rf "$TMPDIR/x"',
  "rm -rf '$TMPDIR'/x",
  'rm -rf ${TMPDIR}/x',
  'rm -rf "${TMPDIR}"/x',
  'rm -rf prefix"$TMPDIR"suffix',
  'rm -rf "$TMPDIRX"/x',
  'rm -rf $HOME/x',
  'rm -rf "$(hostname)"',
  'rm -rf $TMPDIR"/x"',
];

function words(source: string): readonly CommandWord[] {
  const node = parseCommand(source, 'posix').nodes[0];
  return node?.kind === 'command' ? node.words : [];
}

/** Records the facts derived for every word of one source. */
function recordWordFacts(source: string, sourceWords: readonly CommandWord[]) {
  sourceWords.forEach((word, index) => {
    recordedFacts.push([`${source} [${index}]`, deleteTargetWordFacts(word)]);
  });
}

/** Every word fact derived since the last digest; each test drains it. */
const recordedFacts: [string, unknown][] = [];

describe('delete target word facts', () => {
  test('derives the same brace expansion, literal and word-splitting facts', () => {
    for (const source of WORD_SOURCES) {
      recordWordFacts(source, words(source));
    }
    expectRecordedDigest('analyzer-delete-targets/word-facts', recordedFacts.splice(0));
  });

  test('the table covers expansion, both limits and the quoted $TMPDIR form', () => {
    const facts = (source: string) => {
      const word = words(source).at(-1);
      if (!word) throw new Error(`no word in ${source}`);
      return deleteTargetWordFacts(word);
    };
    expect(facts('rm -rf {a,b}').expandedTargets).toStrictEqual(['a', 'b']);
    expect(facts('rm -rf {a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}').unsafeBraceExpansion).toBeTrue();
    expect(facts(`rm -rf ${'x'.repeat(9000)}{a,b}`).unsafeBraceExpansion).toBeTrue();
    expect(facts('rm -rf "quoted"').targetIsLiteral).toBeTrue();
    expect(facts('rm -rf plain').targetIsLiteral).toBeFalse();
    expect(facts('rm -rf "$TMPDIR"/x').tmpdirWordSplittingProtected).toBeTrue();
    expect(facts('rm -rf $TMPDIR/x').tmpdirWordSplittingProtected).toBeFalse();
  });

  test('derives the same facts for every word of the corpus and the seeded fuzz', () => {
    for (const source of [
      ...corpusCommands(),
      ...FIXED_COMMANDS,
      ...fuzzShellSources(FUZZ_SAMPLE_COUNT, FUZZ_SEED),
    ]) {
      recordWordFacts(
        source,
        projectCommandViews(parseCommand(source, 'posix')).flatMap((view) => view.words),
      );
    }
    expectRecordedDigest('analyzer-delete-targets/corpus-word-facts', recordedFacts.splice(0));
  });
});
