import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir as systemTempDir } from 'node:os';
import { join } from 'node:path';
import { type Budget, createBudget, REASON_PARALLEL_ANALYSIS_LIMIT } from '@next/core/budget';
import type { PolicyRule } from '@next/core/rules/types';
import { textCommandWords } from '@next/gate/analyzer/command-words';
import {
  analyzeParallel,
  extractParallelChildStart,
  REASON_PARALLEL_RM,
  REASON_PARALLEL_SHELL,
  replaceParallelPlaceholder,
} from '@next/gate/analyzer/parallel';
import { textCommandWords as shippedTextWords } from '@/analyzer/command-words';
import { createDerivedCommandWorkBudget as shippedDerivedBudget } from '@/analyzer/derived-command-budget';
import {
  REASON_PARALLEL_RM as SHIPPED_REASON_RM,
  REASON_PARALLEL_SHELL as SHIPPED_REASON_SHELL,
  analyzeParallel as shippedAnalyzeParallel,
  extractParallelChildStart as shippedChildStart,
  replaceParallelPlaceholder as shippedReplacePlaceholder,
} from '@/analyzer/parallel';
import { createParallelAnalysisBudget as shippedParallelBudget } from '@/analyzer/parallel-budget';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, FUZZ_SEED, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * GNU parallel builds its jobs from a template, a `:::` argument product, a stream nobody can
 * see, and options that can move the work to another host or another directory. The two
 * implementations are compared on all four, on the work each reserves against the parallel
 * budget, and on the `PARALLEL` value each reads through its own environment seam.
 */

let root = '';
let home = '';
let project = '';

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(systemTempDir(), 'next-parallel-')));
  home = join(root, 'user');
  project = join(root, 'project');
  writeTree(root, { 'user/.cache': null, 'project/build': null, other: null });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const RULES: readonly PolicyRule[] = [
  {
    name: 'no-prod-deploy',
    command: 'deploy-tool',
    block_args: ['--prod'],
    reason: 'Production deploys are manual.',
  },
  {
    name: 'no-registry-publish',
    command: 'npm',
    subcommand: 'publish',
    block_args: ['--force'],
    reason: 'Publishing is manual.',
  },
];

const NESTED = { id: 'custom.nested-job', reason: 'nested job', intent: 'manual_only' } as const;

type ParallelRow = {
  readonly label: string;
  readonly strict?: boolean;
  readonly paranoidRm?: boolean;
  readonly worktreeMode?: boolean;
  readonly rules?: readonly PolicyRule[];
  readonly env?: Record<string, string>;
  readonly assignments?: ReadonlyMap<string, string>;
  readonly disabledRule?: string;
};

const ROWS: readonly ParallelRow[] = [
  { label: 'bare' },
  { label: 'custom rules', rules: RULES },
  { label: 'strict', strict: true, rules: RULES },
  { label: 'paranoid rm', paranoidRm: true },
  { label: 'worktree mode', worktreeMode: true },
  { label: 'PARALLEL in the environment', env: { PARALLEL: '-j4' } },
  { label: 'PARALLEL blank in the environment', env: { PARALLEL: '   ' } },
  { label: 'PARALLEL assigned in the shell', assignments: new Map([['PARALLEL', '--tag']]) },
  {
    label: 'PARALLEL assigned empty over an environment value',
    env: { PARALLEL: '-j4' },
    assignments: new Map([['PARALLEL', '']]),
  },
  { label: 'command-stream disabled', disabledRule: 'parallel.command-stream-dynamic' },
];

/** The four parallel counters of the port's one budget, in the shape the shipped budget carries. */
function parallelWork(budget: Budget) {
  return {
    childAnalyses: budget.counters.get('parallelChildAnalyses') ?? 0,
    derivedTokens: budget.counters.get('parallelDerivedTokens') ?? 0,
    derivedBytes: budget.counters.get('parallelDerivedBytes') ?? 0,
    placeholderReplacements: budget.counters.get('parallelPlaceholderReplacements') ?? 0,
  };
}

/**
 * One token list through both analyzers. Each side gets its own budget and scan counter, so the
 * reserved work and the scanned units are comparable afterwards.
 */
function bothAnalyzers(tokens: readonly string[], row: ParallelRow) {
  const paired = pairedEnvironments({ HOME: home, ...row.env }, home);
  const nextBudget = createBudget();
  const shippedBudget = shippedParallelBudget();
  const nextScan = { units: 0 };
  const shippedScan = { units: 0 };
  const jobsSeenByNext: string[] = [];
  const jobsSeenByShipped: string[] = [];
  const settings = {
    cwd: project,
    originalCwd: project,
    strict: row.strict,
    paranoidRm: row.paranoidRm,
    worktreeMode: row.worktreeMode,
    allowTmpdirVar: true,
    envAssignments: row.assignments ?? new Map<string, string>(),
    protectedGitMetadata: null,
    policy: {
      rules: row.rules ?? [],
      transparentWrappers: ['uv'],
      destructiveCommandProtectionEnabled: true,
      effectiveDestructiveCommandRules: row.disabledRule
        ? {
            [row.disabledRule]: {
              enabled: false,
              inheritedEnabled: true,
              changesInherited: true,
              source: 'rule_override' as const,
            },
          }
        : {},
    },
  };
  const answer =
    (log: string[]) => (command: string, overrides?: { effectiveCwd?: string | null }) => {
      log.push(`${command} @ ${overrides?.effectiveCwd ?? '-'}`);
      return command.includes('BOOM') ? NESTED : null;
    };
  return {
    next: {
      match: describeOutcome(() =>
        analyzeParallel(textCommandWords(tokens), {
          ...settings,
          environment: paired.next,
          budget: nextBudget,
          scanWork: nextScan,
          analyzeNested: answer(jobsSeenByNext),
        }),
      ),
      budget: nextBudget,
      scan: nextScan,
      jobs: jobsSeenByNext,
    },
    shipped: {
      match: describeOutcome(() =>
        shippedAnalyzeParallel(shippedTextWords(tokens), {
          ...settings,
          environment: paired.shipped,
          budget: shippedBudget,
          derivedCommandWorkBudget: shippedDerivedBudget(),
          scanWork: shippedScan,
          analyzeNested: answer(jobsSeenByShipped),
        }),
      ),
      budget: shippedBudget,
      scan: shippedScan,
      jobs: jobsSeenByShipped,
    },
  };
}

/** `:::` argument sources, the placeholder vocabulary, and the option shapes around them. */
const ARGUMENT_SHAPES: readonly (readonly string[])[] = [
  ['parallel'],
  ['parallel', '--version'],
  ['parallel', '--help'],
  ['parallel', 'echo', ':::', 'a', 'b'],
  ['parallel', 'echo', '{}', ':::', 'a', 'b'],
  ['parallel', 'echo', '{1}', '{2}', ':::', 'a', 'b', ':::', 'c', 'd'],
  ['parallel', 'echo', '{2}', ':::', 'a'],
  ['parallel', 'echo', '{-1}', ':::', 'a', 'b'],
  ['parallel', 'echo', '{0}', ':::', 'a'],
  ['parallel', 'echo', '{.}', ':::', 'a'],
  ['parallel', 'echo', '{/}', '{//}', ':::', 'a'],
  ['parallel', 'echo', '{= s/a/b/ =}', ':::', 'a'],
  ['parallel', 'echo', ':::', 'a', ':::', 'b', 'c'],
  ['parallel', 'echo', ':::'],
  ['parallel', '::::', 'file'],
  ['parallel', ':::+', 'a'],
  ['parallel', ':::', 'rm -rf /tmp/x', 'echo hi'],
  ['parallel', ':::', 'echo BOOM'],
  ['parallel', ':::', 'a', 'b'],
  ['parallel', '--', 'rm', '-rf', '{}', ':::', 'a'],
  ['parallel', '-I', '{}', 'echo', '{}', ':::', 'a'],
  ['parallel', '-I', '%', 'echo', '%', ':::', 'a'],
  ['parallel', '-I%', 'echo', '%', ':::', 'a'],
  ['parallel', '--replace', 'echo', ':::', 'a'],
  ['parallel', '--replace=', 'echo', '{}', ':::', 'a'],
  ['parallel', '-i', 'echo', ':::', 'a'],
  ['parallel', '-j', '4', 'echo', ':::', 'a'],
  ['parallel', '-j4', 'echo', ':::', 'a'],
  ['parallel', '--jobs', '4', 'echo', ':::', 'a'],
  ['parallel', '-n', '2', 'echo', ':::', 'a', 'b'],
  ['parallel', '-n', ':::', 'a'],
  ['parallel', '--delay', '1', 'echo', ':::', 'a'],
  ['parallel', '--tagstring', '{}', 'echo', ':::', 'a'],
  ['parallel', '--dry-run', 'rm', '-rf', '{}', ':::', 'a'],
  ['parallel', '--dry-run', 'FOO={= x =}', 'echo', ':::', 'a'],
  ['parallel', '--dry-run', 'FOO={}', 'echo', ':::', 'a'],
  ['parallel', '--pipe', 'rm', '-rf', '{}'],
  ['parallel', '--pipepart', 'cat'],
  ['parallel', '-a', 'list', 'echo'],
  ['parallel', '--arg-file', 'list', 'echo'],
  ['parallel', '--colsep', ',', 'echo', ':::', 'a'],
  ['parallel', '--rpl', '{x}', 'echo', ':::', 'a'],
  ['parallel', '--env', 'FOO', 'echo', ':::', 'a'],
  ['parallel', '--env=FOO', 'echo', ':::', 'a'],
  ['parallel', '-S', 'host', 'rm', '-rf', '{}', ':::', 'a'],
  ['parallel', '-Shost', 'rm', '-rf', ':::', 'a'],
  ['parallel', '--sshlogin', 'host', 'rm', '-rf', ':::', 'a'],
  ['parallel', '--workdir', '/tmp', 'rm', '-rf', 'x', ':::', 'a'],
  ['parallel', '--workdir', '...', 'rm', '-rf', 'x', ':::', 'a'],
  ['parallel', '--workdir', '{}', 'rm', '-rf', 'x', ':::', 'a'],
  ['parallel', '--wd=', 'rm', '-rf', 'x', ':::', 'a'],
  ['parallel', '--workdir', ':::', 'a'],
  ['parallel', '--workdir', 'relative', 'rm', '-rf', 'x', ':::', 'a'],
  ['parallel', '--workdir', '/tmp', '-S', 'host', 'rm', '-rf', 'x'],
];

/** Job templates: every child head the executed-source question branches on. */
const TEMPLATE_SHAPES: readonly (readonly string[])[] = [
  ['parallel', 'rm', '-rf', '{}', ':::', 'build', 'dist'],
  ['parallel', 'rm', '-rf', '{}'],
  ['parallel', 'rm', '-rf', ':::', 'build'],
  ['parallel', 'rm', '-rf'],
  ['parallel', 'rm', '-rf', '{}', '--', ':::', 'a'],
  ['parallel', 'rm', '-rf', '-{}', ':::', 'a'],
  ['parallel', 'rm', '-rf', '/', ':::', 'a'],
  ['parallel', 'rm', '-rf', '{1}', ':::', 'a', ':::', 'b'],
  ['parallel', 'rm', 'build', ':::', 'a'],
  ['parallel', 'bash', '-c', 'rm -rf {}', ':::', 'a'],
  ['parallel', 'bash', '-c', '{}', ':::', 'rm -rf /tmp/x'],
  ['parallel', 'bash', '-c', '{}'],
  ['parallel', 'bash', '-c', 'echo hi', ':::', 'a'],
  ['parallel', 'bash', '-c', 'echo BOOM'],
  ['parallel', 'bash', '-c', 'rm -rf /tmp/x'],
  ['parallel', 'bash', '-c', 'eval "$FOO"'],
  ['parallel', 'sh', '-c', 'echo "$1"', '_', ':::', 'a'],
  ['parallel', 'sh', '-c', 'echo "$1"', '{}', ':::', 'a'],
  ['parallel', 'sh', '-n', '-c', 'rm -rf {}', ':::', 'a'],
  ['parallel', 'sh', '-n', '-c', 'rm -rf x'],
  ['parallel', 'bash', 'script.sh', ':::', 'a'],
  ['parallel', 'bash', '{}', ':::', 'script.sh'],
  ['parallel', 'bash', ':::', 'rm -rf /tmp/x'],
  ['parallel', 'bash', ':::', 'echo BOOM'],
  ['parallel', 'bash', '{}'],
  ['parallel', 'bash'],
  ['parallel', 'sh', '-c'],
  ['parallel', 'git', 'reset', '--hard', ':::', 'a'],
  ['parallel', 'git', 'reset', '--hard'],
  ['parallel', 'git', '{}', ':::', 'status'],
  ['parallel', 'git', 'checkout', '{}', ':::', '.'],
  ['parallel', 'git', 'checkout', '--', '{}', ':::', '.'],
  ['parallel', 'git', '-c', '{}', 'status', ':::', 'a'],
  ['parallel', 'git', '-c', 'core.pager=x', 'status', ':::', 'a'],
  ['parallel', 'git', 'status', ':::', 'a'],
  ['parallel', 'find', '.', '-delete', ':::', 'a'],
  ['parallel', 'find', '{}', '-delete'],
  ['parallel', 'find', '.', '-name', '{}'],
  ['parallel', 'find', '.', '-exec', 'rm', '-rf', '{}', ';'],
  ['parallel', 'find', '.', '-exec', 'rm', '-{}', 'x', ';'],
  ['parallel', 'find', '.', '-exec', 'sh', '-c', '{}', ';'],
  ['parallel', 'find', '.', '-newermt', '{}', '-print'],
  ['parallel', 'xargs', 'rm', '-rf'],
  ['parallel', 'xargs', '-I', '{}', 'rm', '-rf', '{}'],
  ['parallel', 'xargs', 'echo'],
  ['parallel', 'awk', '{}'],
  ['parallel', 'awk', '-f', '{}'],
  ['parallel', 'awk', '{ print }', ':::', 'a'],
  ['parallel', 'python3', '-c', '{}'],
  ['parallel', 'python3', '{}'],
  ['parallel', 'python3', '-c', 'print(1)', ':::', 'a'],
  ['parallel', 'node', '--eval={}'],
  ['parallel', 'eval', '{}'],
  ['parallel', 'source', '{}'],
  ['parallel', '.', '{}'],
  ['parallel', 'parallel', 'rm', '-rf'],
  ['parallel', '{}', 'arg'],
  ['parallel', 'deploy-tool', '{}', ':::', '--prod'],
  ['parallel', 'deploy-tool', '--prod'],
  ['parallel', 'deploy-tool', '{}'],
  ['parallel', 'npm', 'publish', '{}'],
  ['parallel', 'echo', '{}'],
  ['parallel', 'uv', 'run', 'rm', '-rf', '{}', ':::', 'a'],
  ['parallel', 'FOO=bar', 'echo', ':::', 'a'],
  ['parallel', 'FOO=rm -rf /', 'echo', ':::', 'a'],
  ['parallel', 'FOO={}', 'echo', ':::', 'a'],
  ['parallel', 'FOO={.}', 'echo', ':::', 'a'],
  ['parallel', 'FOO={= x =}', 'echo', ':::', 'a'],
];

const ALL_SHAPES = [...ARGUMENT_SHAPES, ...TEMPLATE_SHAPES];

describe('parallel command parsing', () => {
  test('finds the same child start as the shipped parser', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of [...ALL_SHAPES, [], ['-j4']]) {
      const start = extractParallelChildStart(tokens);
      expect(start, tokens.join(' ')).toBe(shippedChildStart(tokens));
      recorded.push([tokens.join(' '), start]);
    }
    expectRecordedDigest('analyzer-parallel/child-start', recorded, root);
  });

  test('replaces placeholders exactly as the shipped helper does', () => {
    const recorded: [string, unknown][] = [];
    for (const template of [
      '{}',
      'a{}b',
      '{1}',
      '{-2}',
      '{.}/{}',
      'plain',
      '{ }',
      '{{}}',
      '{=x=}',
    ]) {
      for (const argument of ['x', '', 'a b', '{}']) {
        const replaced = replaceParallelPlaceholder(template, argument);
        expect(replaced, `${template} <- ${argument}`).toBe(
          shippedReplacePlaceholder(template, argument),
        );
        recorded.push([`${template} <- ${argument}`, replaced]);
      }
    }
    expectRecordedDigest('analyzer-parallel/placeholders', recorded, root);
  });
});

describe('parallel analysis', () => {
  test('reports the same rule, reserved work and nested jobs as the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    for (const row of ROWS) {
      for (const tokens of ALL_SHAPES) {
        const pair = bothAnalyzers(tokens, row);
        const label = `${row.label}: ${tokens.join(' ')}`;
        expect(pair.next.match, label).toStrictEqual(pair.shipped.match);
        expect(pair.next.jobs, label).toStrictEqual(pair.shipped.jobs);
        const budget = parallelWork(pair.next.budget);
        expect(budget, label).toStrictEqual(pair.shipped.budget);
        expect(pair.next.scan, label).toStrictEqual(pair.shipped.scan);
        recorded.push([
          label,
          { match: pair.next.match, jobs: pair.next.jobs, budget, scan: pair.next.scan },
        ]);
      }
    }
    expectRecordedDigest('analyzer-parallel/analysis', recorded, root);
  });

  test('the shapes reach the shell, rm, command-stream and unsupported verdicts', () => {
    const seen = new Set(
      ROWS.flatMap((row) =>
        ALL_SHAPES.flatMap((tokens) => {
          const outcome = bothAnalyzers(tokens, row).next.match;
          return outcome.ok && outcome.value ? [outcome.value.id] : [];
        }),
      ),
    );
    for (const id of [
      'parallel.shell-dynamic',
      'parallel.rm-recursive-force-dynamic',
      'parallel.command-stream-dynamic',
      'custom.no-prod-deploy',
      'find.delete',
      'git.reset-hard',
    ]) {
      expect([...seen].sort(), id).toContain(id);
    }
    const stream = bothAnalyzers(['parallel'], { label: 'bare' }).next.match;
    expect(stream.ok && stream.value?.id).toBe('parallel.command-stream-dynamic');
    const template = bothAnalyzers(['parallel', 'rm', '-rf', '{}'], { label: 'bare' }).next.match;
    expect(template.ok && template.value?.reason).toBe(REASON_PARALLEL_RM);
    const script = bothAnalyzers(['parallel', 'bash', '-c', '{}'], { label: 'bare' }).next.match;
    expect(script.ok && script.value?.reason).toBe(REASON_PARALLEL_SHELL);
  });

  test('a PARALLEL value in the environment makes the construction unverifiable', () => {
    const plain = bothAnalyzers(['parallel', 'echo', ':::', 'a'], { label: 'bare' });
    expect(plain.next.match).toStrictEqual({ ok: true, value: null });
    const ambient = bothAnalyzers(['parallel', 'echo', ':::', 'a'], {
      label: 'ambient',
      env: { PARALLEL: '-j4' },
    });
    expect(ambient.next.match.ok && ambient.next.match.value?.id).toBe(
      'parallel.command-stream-dynamic',
    );
    expect(ambient.next.match).toStrictEqual(ambient.shipped.match);
    expectRecordedDigest(
      'analyzer-parallel/ambient-value',
      [['ambient', ambient.next.match]],
      root,
    );
    // A shell assignment shadows the environment, so an empty one restores the plain verdict.
    const shadowed = bothAnalyzers(['parallel', 'echo', ':::', 'a'], {
      label: 'shadowed',
      env: { PARALLEL: '-j4' },
      assignments: new Map([['PARALLEL', '']]),
    });
    expect(shadowed.next.match).toStrictEqual({ ok: true, value: null });
    expect(shadowed.next.match).toStrictEqual(shadowed.shipped.match);
    expectRecordedDigest(
      'analyzer-parallel/shadowed-value',
      [['shadowed', shadowed.next.match]],
      root,
    );
  });

  test('an argument product past the child-analysis cap breaches the parallel budget', () => {
    const overCap = Array.from({ length: 1030 }, (_, index) => `job${index}`);
    const breach = bothAnalyzers(['parallel', 'echo', '{}', ':::', ...overCap], {
      label: 'breach',
    });
    expect(breach.next.match).toStrictEqual({
      ok: false,
      error: { name: 'AnalysisLimit', message: REASON_PARALLEL_ANALYSIS_LIMIT },
    });
    expect(breach.shipped.match).toStrictEqual({
      ok: false,
      error: { name: 'ParallelAnalysisLimitError', message: REASON_PARALLEL_ANALYSIS_LIMIT },
    });
    // A product short of the cap still analyzes, so the breach is the cap and not the shape.
    const within = bothAnalyzers(['parallel', 'echo', '{}', ':::', ...overCap.slice(0, 1000)], {
      label: 'within',
    });
    expect(within.next.match).toStrictEqual({ ok: true, value: null });
    expect(within.next.budget.counters.get('parallelChildAnalyses')).toBe(1000);
    const budget = parallelWork(within.next.budget);
    expect(budget).toStrictEqual(within.shipped.budget);
    expectRecordedDigest('analyzer-parallel/child-analysis-cap', [['within', budget]], root);
  });

  test('the reason strings are the shipped strings', () => {
    expect(REASON_PARALLEL_RM).toBe(SHIPPED_REASON_RM);
    expect(REASON_PARALLEL_SHELL).toBe(SHIPPED_REASON_SHELL);
    expectRecordedDigest(
      'analyzer-parallel/reasons',
      [
        ['rm', REASON_PARALLEL_RM],
        ['shell', REASON_PARALLEL_SHELL],
      ],
      root,
    );
  });

  test('corpus and fuzz sources placed after parallel agree with the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    for (const source of [...corpusCommands(), ...fuzzShellSources(1_000, FUZZ_SEED)]) {
      const words = source.split(/\s+/).filter((token) => token !== '');
      for (const suffix of [[], [':::', 'a', 'b']]) {
        const tokens = ['parallel', ...words, ...suffix];
        const pair = bothAnalyzers(tokens, { label: 'fuzz', rules: RULES, strict: true });
        expect(pair.next.match, source).toStrictEqual(pair.shipped.match);
        expect(pair.next.jobs, source).toStrictEqual(pair.shipped.jobs);
        const budget = parallelWork(pair.next.budget);
        expect(budget, source).toStrictEqual(pair.shipped.budget);
        recorded.push([
          `${source} ${suffix.join(' ')}`,
          { match: pair.next.match, jobs: pair.next.jobs, budget },
        ]);
      }
    }
    expectRecordedDigest('analyzer-parallel/corpus-and-fuzz', recorded, root);
  });
});
