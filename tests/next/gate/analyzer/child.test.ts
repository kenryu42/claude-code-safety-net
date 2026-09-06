import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { PolicyRule } from '@next/core/rules/types';
import {
  analyzeChildCommandMatch,
  type ChildCommandAnalysisOptions,
} from '@next/gate/analyzer/child-analyzer';
import {
  collectCommandTemplate,
  normalizeChildCommand,
  normalizeChildCommands,
} from '@next/gate/analyzer/child-command';
import { analyzeChildCommandMatch as shippedAnalyzeChild } from '@/analyzer/child-analyzer';
import {
  collectCommandTemplate as shippedCollectTemplate,
  normalizeChildCommands as shippedNormalizeAll,
  normalizeChildCommand as shippedNormalizeOne,
} from '@/analyzer/child-command';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, FUZZ_SEED, fuzzShellSources } from '../../helpers/shell-inputs';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';

/**
 * A child command reaches the rule sets only after the wrapper prelude, the transparent
 * wrappers and busybox have been peeled, and the peel is bounded. Both halves are compared:
 * what normalization yields for each candidate, and which rule the dispatch then reports.
 */

let root = '';
let home = '';
let workspace = '';

beforeAll(() => {
  root = realpathSync(createTempRoot('next-child-'));
  home = join(root, 'home');
  workspace = join(root, 'work');
  writeTree(root, { 'home/notes': null, 'work/build': null, elsewhere: null });
});

afterAll(removeTempRoots);

const CUSTOM_RULES: readonly PolicyRule[] = [
  {
    name: 'block-deploy',
    command: 'deploy-tool',
    block_args: ['--prod'],
    reason: 'Deployments are manual.',
  },
];

const TRANSPARENT_WRAPPERS: readonly string[] = ['uv', 'poetry'];

const WRAPPED_COMMANDS: readonly (readonly string[])[] = [
  [],
  ['rm'],
  ['rm', '-rf', 'build'],
  ['sudo', 'rm', '-rf', 'build'],
  ['sudo', '-u', 'root', '--', 'rm', '-rf', 'build'],
  ['env', 'FOO=bar', 'rm', '-rf', 'build'],
  ['env', '-C', '/tmp', 'rm', '-rf', 'build'],
  ['env', '-i', 'PATH=/bin', 'find', '.', '-delete'],
  ['env', '-S', 'rm -rf build', 'extra'],
  ['env', '-S', 'echo "quoted"'],
  ['command', '-p', 'rm', '-rf', 'build'],
  ['builtin', 'rm', '-rf', 'build'],
  ['busybox', 'rm', '-rf', 'build'],
  ['busybox'],
  ['/usr/bin/busybox', 'sh', '-c', 'rm -rf /'],
  ['uv', 'run', 'rm', '-rf', 'build'],
  ['uv', '--', 'rm', '-rf', 'build'],
  ['uv', 'run', 'python3', '-c', 'print(1)'],
  ['poetry', 'run', 'git', 'reset', '--hard'],
  ['uv', 'run', 'echo', 'rm'],
  ['uv'],
  ['nice', '-n', '5', 'rm', '-rf', 'build'],
  ['timeout', '5', 'rm', '-rf', 'build'],
  ['xargs', 'rm', '-rf'],
  ['deploy-tool', '--prod'],
  ['echo', 'hello'],
  ...Array.from({ length: 3 }, (_, index) => [
    ...Array.from({ length: 8 + index * 8 }, () => 'busybox'),
    'rm',
    '-rf',
    'build',
  ]),
];

function normalizationContext(useEnv: boolean) {
  const paired = pairedEnvironments({ HOME: home, PATH: '/usr/bin' }, home);
  const shared = {
    cwd: workspace,
    envAssignments: useEnv ? new Map([['SEEDED', 'yes']]) : undefined,
    policy: {
      rules: CUSTOM_RULES,
      transparentWrappers: TRANSPARENT_WRAPPERS,
      destructiveCommandProtectionEnabled: true,
      effectiveDestructiveCommandRules: {},
    },
  };
  return {
    next: { ...shared, environment: paired.next },
    shipped: { ...shared, environment: paired.shipped },
  };
}

/** Maps do not survive `toStrictEqual` across implementations as plainly as entry arrays. */
function readableCandidate(candidate: {
  tokens: string[];
  cwd: string | undefined;
  wrapperCwd: string | null | undefined;
  wrapperEnvAssignments: ReadonlyMap<string, string>;
  envAssignments: ReadonlyMap<string, string>;
  head: string;
  wrappedByTransparent: boolean;
}) {
  return {
    tokens: candidate.tokens,
    cwd: candidate.cwd,
    wrapperCwd: candidate.wrapperCwd,
    wrapperEnv: [...candidate.wrapperEnvAssignments].sort(),
    env: [...candidate.envAssignments].sort(),
    head: candidate.head,
    wrappedByTransparent: candidate.wrappedByTransparent,
  };
}

/**
 * An outcome without the exception class, which the two implementations no longer share: the port
 * throws the one `AnalysisLimit` for every cap it enforces where the shipped normalizer throws its
 * own class. The port's class is pinned on the spot, so only the wording and the value are left to
 * compare.
 */
function portedOutcome<T>(run: () => T, label: string) {
  const outcome = describeOutcome(run);
  if (!outcome.ok) expect(outcome.error.name, label).toBe('AnalysisLimit');
  return outcome.ok ? outcome : { ok: outcome.ok, message: outcome.error.message };
}

function shippedOutcome<T>(run: () => T) {
  const outcome = describeOutcome(run);
  return outcome.ok ? outcome : { ok: outcome.ok, message: outcome.error.message };
}

describe('child command normalization', () => {
  test('yields the same candidates as the shipped normalizer', () => {
    const recorded: [string, unknown][] = [];
    for (const useEnv of [false, true]) {
      const context = normalizationContext(useEnv);
      for (const tokens of WRAPPED_COMMANDS) {
        const label = `${tokens.join(' ')} (env: ${useEnv})`;
        const all = portedOutcome(
          () => [...normalizeChildCommands(tokens, context.next)].map(readableCandidate),
          label,
        );
        expect(all, label).toStrictEqual(
          shippedOutcome(() =>
            [...shippedNormalizeAll(tokens, context.shipped)].map(readableCandidate),
          ),
        );
        const one = portedOutcome(
          () => readableCandidate(normalizeChildCommand(tokens, context.next)),
          label,
        );
        expect(one, label).toStrictEqual(
          shippedOutcome(() => readableCandidate(shippedNormalizeOne(tokens, context.shipped))),
        );
        recorded.push([label, { all, one }]);
      }
    }
    expectRecordedDigest('analyzer-child/normalization', recorded, root);
  });

  test('the peel is bounded and a transparent wrapper offers every protectable child', () => {
    const context = normalizationContext(false).next;
    expect(normalizeChildCommand(['busybox', 'busybox', 'rm', '-rf', 'x'], context).head).toBe(
      'rm',
    );
    const overCap = [...Array.from({ length: 24 }, () => 'busybox'), 'rm'];
    expect(() => normalizeChildCommand(overCap, context)).toThrow('derived-command work limit');
    const wrapped = [...normalizeChildCommands(['uv', 'run', 'rm', '-rf', 'build'], context)];
    expect(wrapped.map((candidate) => candidate.head)).toStrictEqual(['rm']);
    expect(wrapped[0]?.wrappedByTransparent).toBeTrue();
    // An `env -S` value that needs the quote language has no channel for a match.
    expect(() => normalizeChildCommand(['env', '-S', 'echo "quoted"'], context)).toThrow();
    expect(normalizeChildCommand(['env', '-S', 'a b', 'sudo'], context).tokens).toStrictEqual([
      'a',
      'b',
    ]);
  });

  test('a parallel command template stops at the argument marker', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of [
      ['parallel', 'rm', '-rf', '{}', ':::', 'a', 'b'],
      ['parallel', 'rm', '-rf', '{}'],
      ['parallel', ':::', 'a'],
      [],
    ]) {
      for (const start of [0, 1, 2]) {
        const template = collectCommandTemplate(tokens, start);
        expect(template, `${tokens.join(' ')}@${start}`).toStrictEqual(
          shippedCollectTemplate(tokens, start),
        );
        recorded.push([`${tokens.join(' ')}@${start}`, template]);
      }
    }
    expectRecordedDigest('analyzer-child/command-template', recorded, root);
  });
});

const CHILD_COMMANDS: readonly (readonly string[])[] = [
  [],
  [''],
  ['echo', 'hello'],
  ['eval', 'rm -rf /'],
  ['eval', '$COMMAND'],
  ['eval'],
  ['bash', '-c', 'rm -rf /'],
  ['bash', '-c', '$COMMAND'],
  ['bash', '-n', '-c', 'rm -rf /'],
  ['bash', 'script.sh'],
  ['bash'],
  ['sh', '-c'],
  ['zsh', '-c', 'git reset --hard'],
  ['awk', 'BEGIN { system("rm -rf /") }'],
  ['awk', '{ print }'],
  ['gawk', '-f', 'prog.awk'],
  ['python3', '-c', 'import os; os.system("rm -rf /")'],
  ['python3', '-c', 'print("hello")'],
  ['python3', 'script.py'],
  ['node', '-e', 'require("fs").rmSync("/", {recursive: true})'],
  ['perl', '-e', 'print 1'],
  ['ruby', '-e', 'puts 1'],
  ['rm', '-rf', 'build'],
  ['rm', '-rf', '/'],
  ['rm', '-rf', '/nonexistent/elsewhere'],
  ['rm', 'notes'],
  ['rmdir', 'build'],
  ['find', '.', '-delete'],
  ['find', '.', '-exec', 'rm', '-rf', '{}', ';'],
  ['git', 'reset', '--hard'],
  ['git', 'clean', '-fd'],
  ['git', 'status'],
  ['git', 'push', '--force'],
  ['deploy-tool', '--prod'],
  ['deploy-tool', '--dry-run'],
  ['unknown-tool', 'arg'],
];

const DYNAMIC_MATCH = {
  id: 'shell.dynamic-input',
  reason: 'dynamic shell input',
  intent: 'manual_only',
} as const;
const SOURCE_MATCH = {
  id: 'shell.dynamic-source',
  reason: 'dynamic source',
  intent: 'manual_only',
} as const;
const RM_MATCH = {
  id: 'rm.recursive-force-dynamic-target',
  reason: 'dynamic rm input',
  intent: 'scope_down',
} as const;

const ANALYSIS_OPTIONS: readonly ChildCommandAnalysisOptions[] = [
  {},
  { dynamicInput: true, shellDynamicMatch: DYNAMIC_MATCH },
  { dynamicSourceInput: true, dynamicSourceMatch: SOURCE_MATCH },
  { dynamicRmInput: true, rmDynamicMatch: RM_MATCH, dynamicInput: true },
  {
    dynamicInput: true,
    dynamicSourceInput: true,
    dynamicRmInput: true,
    shellDynamicMatch: DYNAMIC_MATCH,
    dynamicSourceMatch: SOURCE_MATCH,
    rmDynamicMatch: RM_MATCH,
  },
];

type ChildAnalysisCase = {
  readonly label: string;
  readonly strict?: boolean;
  readonly paranoidRm?: boolean;
  readonly paranoidInterpreters?: boolean;
  readonly worktreeMode?: boolean;
};

const ANALYSIS_CASES: readonly ChildAnalysisCase[] = [
  { label: 'standard' },
  { label: 'strict', strict: true },
  { label: 'paranoid rm', paranoidRm: true },
  { label: 'paranoid interpreters', paranoidInterpreters: true },
  { label: 'worktree mode', worktreeMode: true },
];

/** Both dispatchers over one token list, each recording the nested sources it asks about. */
function dispatchPair(
  tokens: readonly string[],
  row: ChildAnalysisCase,
  options: ChildCommandAnalysisOptions,
) {
  const paired = pairedEnvironments({ HOME: home }, home);
  const shared = {
    cwd: workspace,
    originalCwd: workspace,
    strict: row.strict,
    paranoidRm: row.paranoidRm,
    paranoidInterpreters: row.paranoidInterpreters,
    worktreeMode: row.worktreeMode,
    allowTmpdirVar: true,
    envAssignments: new Map<string, string>(),
    protectedGitMetadata: null,
    policy: {
      rules: CUSTOM_RULES,
      destructiveCommandProtectionEnabled: true,
      effectiveDestructiveCommandRules: {},
    },
  };
  const nested: string[][] = [[], []];
  const record = (index: number) => (command: string) => {
    nested[index]?.push(command);
    return command.includes('NESTED')
      ? { id: 'custom.nested', reason: 'nested', intent: 'manual_only' as const }
      : null;
  };
  return {
    next: {
      match: describeOutcome(() =>
        analyzeChildCommandMatch(
          tokens,
          { ...shared, environment: paired.next, analyzeNested: record(0) },
          options,
        ),
      ),
      nested: nested[0],
    },
    shipped: {
      match: describeOutcome(() =>
        shippedAnalyzeChild(
          tokens,
          { ...shared, environment: paired.shipped, analyzeNested: record(1) },
          options,
        ),
      ),
      nested: nested[1],
    },
  };
}

describe('child command analysis', () => {
  test('dispatches every head to the same rule as the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    for (const row of ANALYSIS_CASES) {
      for (const options of ANALYSIS_OPTIONS) {
        for (const tokens of CHILD_COMMANDS) {
          const pair = dispatchPair(tokens, row, options);
          const label = `${row.label}: ${tokens.join(' ')}`;
          expect(pair.next.match, label).toStrictEqual(pair.shipped.match);
          expect(pair.next.nested, label).toStrictEqual(pair.shipped.nested);
          recorded.push([label, pair.next]);
        }
      }
    }
    expectRecordedDigest('analyzer-child/dispatch', recorded, root);
  });

  test('the table reaches the interpreter, rm, find, git, custom and dynamic reasons', () => {
    const reported = new Set(
      ANALYSIS_CASES.flatMap((row) =>
        ANALYSIS_OPTIONS.flatMap((options) =>
          CHILD_COMMANDS.flatMap((tokens) => {
            const outcome = dispatchPair(tokens, row, options).next.match;
            return outcome.ok && outcome.value ? [outcome.value.id] : [];
          }),
        ),
      ),
    );
    for (const id of [
      'custom.block-deploy',
      'find.delete',
      'git.reset-hard',
      'interpreter.dangerous-command',
      'interpreter.one-liner-paranoid',
      'rm.recursive-force-outside-cwd',
      'rm.recursive-force-root-or-home',
      'shell.dynamic-input',
      'shell.dynamic-source',
    ]) {
      expect([...reported].sort(), id).toContain(id);
    }
  });

  test('a nested source is handed to the caller for eval, shells and interpreters', () => {
    const nestedFor = (tokens: readonly string[]) =>
      dispatchPair(tokens, { label: 'standard' }, {}).next.nested;
    expect(nestedFor(['eval', 'echo NESTED'])).toStrictEqual(['echo NESTED']);
    expect(nestedFor(['bash', '-c', 'echo NESTED'])).toStrictEqual(['echo NESTED']);
    expect(nestedFor(['python3', '-c', 'echo NESTED'])).toStrictEqual(['echo NESTED']);
    expect(nestedFor(['awk', 'BEGIN { system("echo NESTED") }'])).toStrictEqual(['echo NESTED']);
    // A shell reading a script operand has no source the analyzer can see.
    expect(nestedFor(['bash', 'script.sh'])).toStrictEqual([]);
  });

  test('the corpus commands split into tokens agree with the shipped dispatch', () => {
    const recorded: [string, unknown][] = [];
    for (const source of [...corpusCommands(), ...fuzzShellSources(250, FUZZ_SEED)]) {
      const tokens = source.split(/\s+/).filter((token) => token !== '');
      const pair = dispatchPair(
        tokens,
        { label: 'strict', strict: true },
        ANALYSIS_OPTIONS[1] ?? {},
      );
      expect(pair.next.match, source).toStrictEqual(pair.shipped.match);
      expect(pair.next.nested, source).toStrictEqual(pair.shipped.nested);
      recorded.push([source, pair.next]);
    }
    expectRecordedDigest('analyzer-child/corpus-dispatch', recorded, root);
  });
});
