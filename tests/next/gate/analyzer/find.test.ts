import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DestructiveCommandRuleMatch } from '@next/core/rules/types';
import { parseCommand } from '@next/core/shell/parse';
import { projectCommandViews } from '@next/core/shell/traversal';
import {
  analyzeFindMatch,
  findExecRmDeletesFoundPaths,
  findHasDelete,
  getFindExecCommand,
  getFindPrimaryArity,
  getFindStartingPoints,
  isFindExecPrimary,
} from '@next/gate/analyzer/find';
import {
  analyzeFindMatch as shippedAnalyzeFind,
  getFindExecCommand as shippedExecCommand,
  findExecRmDeletesFoundPaths as shippedExecRmDeletes,
  findHasDelete as shippedHasDelete,
  isFindExecPrimary as shippedIsExecPrimary,
  getFindPrimaryArity as shippedPrimaryArity,
  getFindStartingPoints as shippedStartingPoints,
} from '@/analyzer/find';
import type { ProtectedGitMetadata } from '@/ir/analysis';
import { parseCommand as shippedParse } from '@/parser/command';
import { projectCommandViews as shippedViews } from '@/parser/traversal';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, FUZZ_SEED, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * The find analyzer decides three separate things — the catastrophic starting point, `-delete`
 * against the trusted temp roots, and what each `-exec` child is — and it hands the child to the
 * caller. The differential therefore compares the match and the sequence of nested calls.
 */

let root = '';
let home = '';
let workspace = '';
let hookMetadata: ProtectedGitMetadata = {
  entries: [],
  markerFiles: [],
  directories: [],
  hooksDirectories: [],
};

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-find-')));
  home = join(root, 'home');
  workspace = join(root, 'work');
  writeTree(root, {
    'home/notes': null,
    'work/logs': null,
    'work/.git/hooks': null,
    scratch: null,
  });
  const gitDir = join(workspace, '.git');
  const hooks = join(gitDir, 'hooks');
  hookMetadata = {
    entries: [gitDir],
    markerFiles: [],
    directories: [gitDir],
    hooksDirectories: [hooks],
  };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const FIND_COMMANDS: readonly string[] = [
  'find',
  'find .',
  'find . -name "*.log"',
  'find . -delete',
  'find . -name "*.log" -delete',
  'find . -name -delete',
  'find . -newermt yesterday -delete',
  'find . -newerXY ref -delete',
  'find . -fprintf out fmt -delete',
  'find -delete',
  'find / -delete',
  'find /* -delete',
  'find ~ -delete',
  'find $HOME -delete',
  'find "$HOME"/notes -delete',
  'find $TMPDIR -delete',
  'find $TMPDIR/build -delete',
  'find /tmp/next-find-probe -delete',
  'find logs -delete',
  'find logs -L -delete',
  'find logs -follow -delete',
  'find -H -P -- logs -delete',
  'find ! -name x -delete',
  'find ( logs ) -delete',
  'find .git -delete',
  'find . -name hooks -delete',
  'find . -iname HOOKS -delete',
  'find . -name hooks -print',
  'find . -exec rm -rf {} ;',
  'find . -exec rm -rf {} \\;',
  'find . -exec rm -rf {} +',
  'find . -exec rm {} \\;',
  'find . -execdir rm -rf {} \\;',
  'find . -ok rm -rf {} \\;',
  'find . -okdir rm -rf {} \\;',
  'find . -exec busybox rm -rf {} \\;',
  'find . -exec env rm -rf {} \\;',
  'find . -exec sudo rm -rf {} \\;',
  'find . -exec echo {} \\;',
  'find . -exec rm -rf {} \\; -exec echo done \\;',
  'find . -exec rm -rf',
  'find . -exec',
  'find . -name -exec -delete',
  'find . -exec DANGER {} \\; -exec CUSTOM {} \\;',
  'find /nonexistent -exec rm -rf {} +',
  'find . -type f -exec rm {} + -delete',
  'find . -maxdepth 1 -delete',
  'find . -exec DANGER {} \\;',
  'find . -exec CUSTOM {} \\;',
];

type NestedCall = { tokens: string[]; cwd: string | null | undefined; command?: string };

/** Blocks on two sentinel heads so the caller-supplied match is exercised both ways. */
function nestedMatchFor(tokens: readonly string[]): DestructiveCommandRuleMatch | null {
  if (tokens.includes('DANGER')) {
    return { id: 'rm.recursive-force-outside-cwd', reason: 'nested', intent: 'manual_only' };
  }
  if (tokens.includes('CUSTOM')) {
    return { id: 'custom.nested', reason: 'nested custom', intent: 'manual_only' };
  }
  return null;
}

type FindCase = {
  readonly label: string;
  readonly env?: Record<string, string>;
  readonly cwd?: string;
  readonly strict?: boolean;
  readonly metadata?: boolean;
  readonly allowTmpdirVar?: boolean;
  readonly protectionOff?: boolean;
};

function findCases(): readonly FindCase[] {
  return [
    { label: 'workspace', cwd: workspace },
    { label: 'workspace, strict', cwd: workspace, strict: true },
    { label: 'workspace with git metadata', cwd: workspace, metadata: true },
    { label: 'home as cwd', cwd: home },
    { label: 'no cwd', cwd: undefined },
    {
      label: 'tmpdir trusted',
      cwd: workspace,
      env: { TMPDIR: join(root, 'scratch') },
      allowTmpdirVar: true,
    },
    { label: 'destructive protection off', cwd: workspace, protectionOff: true },
  ];
}

function commandWords(source: string, shipped: boolean) {
  const views = shipped
    ? shippedViews(shippedParse(source, 'posix'))
    : projectCommandViews(parseCommand(source, 'posix'));
  return views[0]?.words ?? [];
}

function sharedContext(row: FindCase) {
  return {
    cwd: row.cwd,
    originalCwd: workspace,
    strict: row.strict,
    allowTmpdirVar: row.allowTmpdirVar,
    protectedGitMetadata: row.metadata ? hookMetadata : null,
    policy: row.protectionOff
      ? { destructiveCommandProtectionEnabled: false, effectiveDestructiveCommandRules: {} }
      : undefined,
  };
}

/** Both analyzers over one command, each with its own recorder for the nested calls. */
function analyzePair(source: string, row: FindCase, mode: 'tokens' | 'nested') {
  const paired = pairedEnvironments({ HOME: home, ...row.env }, home);
  const shared = sharedContext(row);
  const nextCalls: NestedCall[] = [];
  const shippedCalls: NestedCall[] = [];
  const hooks = (calls: NestedCall[]) =>
    mode === 'tokens'
      ? {
          analyzeTokens: (tokens: readonly string[], cwd: string | null | undefined) => {
            calls.push({ tokens: [...tokens], cwd });
            return nestedMatchFor(tokens);
          },
        }
      : {
          analyzeNested: (command: string, overrides?: { effectiveCwd?: string | null }) => {
            calls.push({ tokens: command.split(' '), cwd: overrides?.effectiveCwd, command });
            return nestedMatchFor(command.split(' '));
          },
        };
  return {
    next: {
      match: describeOutcome(() =>
        analyzeFindMatch(commandWords(source, false), {
          ...shared,
          environment: paired.next,
          ...hooks(nextCalls),
        }),
      ),
      calls: nextCalls,
    },
    shipped: {
      match: describeOutcome(() =>
        shippedAnalyzeFind(commandWords(source, true), {
          ...shared,
          environment: paired.shipped,
          ...hooks(shippedCalls),
        }),
      ),
      calls: shippedCalls,
    },
  };
}

function tokenLists(): readonly (readonly string[])[] {
  return [
    ...FIND_COMMANDS.map((source) => source.split(' ')),
    ...corpusCommands().map((source) => source.split(/\s+/)),
    ...fuzzShellSources(200, FUZZ_SEED).map((source) => source.split(/\s+/)),
    [],
    ['find'],
    ['-delete'],
    ['find', '-exec', '-exec', '-exec', ';'],
  ];
}

describe('find primaries', () => {
  test('arity, exec primaries and the exec command slice match the shipped walk', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of tokenLists()) {
      tokens.forEach((token, index) => {
        const arity = getFindPrimaryArity(token);
        expect(arity, token).toBe(shippedPrimaryArity(token));
        const exec = isFindExecPrimary(token);
        expect(exec, token).toBe(shippedIsExecPrimary(token));
        const command = getFindExecCommand(tokens, index);
        expect(command, `${token}@${index}`).toStrictEqual(shippedExecCommand(tokens, index));
        recorded.push([`${token}@${index}`, { arity, exec, command }]);
      });
      const missing = isFindExecPrimary(undefined);
      expect(missing).toBe(shippedIsExecPrimary(undefined));
      recorded.push(['undefined primary', missing]);
      for (const start of [0, 1, 2]) {
        const deletes = findHasDelete(tokens, start);
        expect(deletes, tokens.join(' ')).toBe(shippedHasDelete(tokens, start));
        recorded.push([`${tokens.join(' ')}@${start}`, deletes]);
      }
    }
    expectRecordedDigest('analyzer-find/primaries', recorded, root);
  });

  test('-delete is found only as an action, never as an option value or inside -exec', () => {
    expect(findHasDelete(['find', '.', '-delete'], 1)).toBeTrue();
    expect(findHasDelete(['find', '-name', '-delete'], 1)).toBeFalse();
    expect(findHasDelete(['find', '-exec', 'rm', '-delete', ';'], 1)).toBeFalse();
    expect(getFindPrimaryArity('-newerat')).toBe(1);
    expect(getFindPrimaryArity('-fprintf')).toBe(2);
    expect(getFindPrimaryArity('-print')).toBe(0);
  });

  test('starting points and the exec-rm probe agree with the shipped helpers', () => {
    const recorded: [string, unknown][] = [];
    const paired = pairedEnvironments({ HOME: home }, home);
    for (const source of [...FIND_COMMANDS, ...corpusCommands()]) {
      const nextPoints = getFindStartingPoints(commandWords(source, false));
      const shippedPoints = shippedStartingPoints(commandWords(source, true));
      const points = nextPoints?.map((word) => word.text) ?? null;
      expect(points, source).toStrictEqual(shippedPoints?.map((word) => word.text) ?? null);
      const tokens = source.split(' ');
      const deletes = findExecRmDeletesFoundPaths(tokens, paired.next);
      expect(deletes, source).toBe(shippedExecRmDeletes(tokens, paired.shipped));
      recorded.push([source, { points, deletes }]);
    }
    expectRecordedDigest('analyzer-find/starting-points', recorded, root);
  });
});

describe('find analysis', () => {
  test('matches the shipped analyzer and issues the same nested calls', () => {
    const recorded: [string, unknown][] = [];
    for (const row of findCases()) {
      for (const mode of ['tokens', 'nested'] as const) {
        for (const source of FIND_COMMANDS) {
          const pair = analyzePair(source, row, mode);
          expect(pair.next.match, `${row.label}/${mode}: ${source}`).toStrictEqual(
            pair.shipped.match,
          );
          expect(pair.next.calls, `${row.label}/${mode}: ${source}`).toStrictEqual(
            pair.shipped.calls,
          );
          recorded.push([`${row.label}/${mode}: ${source}`, pair.next]);
        }
      }
    }
    expectRecordedDigest('analyzer-find/analysis', recorded, root);
  });

  test('the table reaches the delete, exec and git-metadata rules', () => {
    const reported = new Set(
      findCases().flatMap((row) =>
        FIND_COMMANDS.flatMap((source) => {
          const outcome = analyzePair(source, row, 'tokens').next.match;
          return outcome.ok && outcome.value ? [outcome.value.id] : [];
        }),
      ),
    );
    expect([...reported].sort()).toStrictEqual([
      'custom.nested',
      'find.delete',
      'find.delete-git-metadata',
      'find.exec-rm-recursive-force',
      'rm.recursive-force-outside-cwd',
      'rm.recursive-force-root-or-home',
    ]);
  });

  test('a -execdir child is analyzed without a cwd, an -exec child keeps it', () => {
    const execdir = analyzePair(
      'find . -execdir rm {} \\;',
      { label: 'x', cwd: workspace },
      'tokens',
    );
    expect(execdir.next.calls).toStrictEqual([{ tokens: ['rm', '{}'], cwd: null }]);
    const exec = analyzePair('find . -exec rm {} \\;', { label: 'x', cwd: workspace }, 'tokens');
    expect(exec.next.calls).toStrictEqual([{ tokens: ['rm', '{}'], cwd: workspace }]);
  });

  test('a derived-command budget shared across many exec bodies fails closed on both sides', () => {
    const source = `find . ${'-exec rm {} \\; '.repeat(120)}`.trim();
    const pair = analyzePair(source, { label: 'budget', cwd: workspace }, 'tokens');
    expect(pair.next.match.ok).toBeFalse();
    expect(pair.shipped.match.ok).toBe(pair.next.match.ok);
    const message = pair.next.match.ok ? '' : pair.next.match.error.message;
    expect(message).toBe(pair.shipped.match.ok ? '' : pair.shipped.match.error.message);
    expectRecordedDigest('analyzer-find/shared-budget', [[source, message]], root);
    expect(pair.next.match.ok ? '' : pair.next.match.error.name).toBe('AnalysisLimit');
  });

  test('the corpus commands and the seeded fuzz agree with the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    for (const source of [...corpusCommands(), ...fuzzShellSources(300, FUZZ_SEED)]) {
      const pair = analyzePair(source, { label: 'corpus', cwd: workspace }, 'nested');
      expect(pair.next.match, source).toStrictEqual(pair.shipped.match);
      expect(pair.next.calls, source).toStrictEqual(pair.shipped.calls);
      recorded.push([source, pair.next]);
    }
    expectRecordedDigest('analyzer-find/corpus-and-fuzz', recorded, root);
  });
});
