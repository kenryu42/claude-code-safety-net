import { describe, expect, test } from 'bun:test';
import { createBudget } from '@/core/budget';
import type { PolicyRule } from '@/core/rules/types';
import { textCommandWords } from '@/gate/analyzer/command-words';
import {
  analyzeXargs,
  extractXargsChildCommandWithInfo,
  REASON_XARGS_RM,
  REASON_XARGS_SHELL,
} from '@/gate/analyzer/xargs';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, FUZZ_SEED, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * `xargs` reads its arguments from a stream nobody can see, so the analyzer asks two questions of
 * every child: what appended input can still change, and what a replacement token could be made to
 * spell. The analyzer answers over the option shapes, child heads and policy states, and the
 * nested sources it hands back to the caller are recorded with it.
 *
 * The paths here are lexical, not a fixture tree: every verdict `xargs` reaches is decided by the
 * option scan and the child dispatch, and the canonicalization underneath is pinned by the path
 * tests under `tests/core/`.
 */

const AGENT_HOME = '/srv/agent';
const CHECKOUT = '/srv/agent/checkout';

const DEPLOY_RULES: readonly PolicyRule[] = [
  {
    name: 'no-cluster-drain',
    command: 'kubectl',
    subcommand: 'drain',
    block_args: ['--force'],
    reason: 'Draining a node is an operator action.',
  },
  {
    name: 'no-registry-push',
    command: 'skopeo',
    block_args: ['copy'],
    reason: 'Image promotion goes through the release job.',
  },
];

const NESTED_HIT = {
  id: 'custom.nested-xargs-source',
  reason: 'nested source',
  intent: 'manual_only',
} as const;

type XargsSetting = {
  readonly label: string;
  readonly rules?: readonly PolicyRule[];
  readonly strict?: boolean;
  readonly paranoidRm?: boolean;
  readonly worktreeMode?: boolean;
  readonly assignments?: ReadonlyMap<string, string>;
  readonly ruleOff?: string;
};

const SETTINGS: readonly XargsSetting[] = [
  { label: 'defaults' },
  { label: 'custom rules', rules: DEPLOY_RULES },
  { label: 'strict', strict: true, rules: DEPLOY_RULES },
  { label: 'paranoid rm', paranoidRm: true },
  { label: 'worktree mode', worktreeMode: true },
  { label: 'wrapper assignment', assignments: new Map([['GIT_DIR', '/srv/elsewhere/.git']]) },
  { label: 'dynamic rule off', ruleOff: 'xargs.shell-dynamic', rules: DEPLOY_RULES },
];

/** The one effective-rule state a setting can carry: a single rule switched off by an override. */
function ruleStates(id: string | undefined) {
  if (id === undefined) return {};
  return {
    [id]: {
      changesInherited: true,
      enabled: false,
      inheritedEnabled: true,
      source: 'rule_override' as const,
    },
  };
}

/** One token list through the analyzer, with its own budget and nested-source log. */
function runBothXargs(tokens: readonly string[], setting: XargsSetting) {
  const paired = pairedEnvironments({ HOME: AGENT_HOME, PATH: '/usr/bin:/bin' }, AGENT_HOME);
  const asked: string[] = [];
  const shared = {
    allowTmpdirVar: true,
    cwd: CHECKOUT,
    envAssignments: setting.assignments ?? new Map<string, string>(),
    originalCwd: CHECKOUT,
    paranoidRm: setting.paranoidRm,
    policy: {
      destructiveCommandProtectionEnabled: true,
      effectiveDestructiveCommandRules: ruleStates(setting.ruleOff),
      rules: setting.rules ?? [],
      transparentWrappers: ['uv'],
    },
    protectedGitMetadata: null,
    strict: setting.strict,
    worktreeMode: setting.worktreeMode,
  };
  return {
    asked,
    match: describeOutcome(() =>
      analyzeXargs(textCommandWords(tokens), {
        ...shared,
        analyzeNested: (source: string) => {
          asked.push(source);
          return source.includes('BOOM') ? NESTED_HIT : null;
        },
        budget: createBudget(),
        environment: paired,
      }),
    ),
  };
}

/** Option shapes: the replacement forms, the value-taking options and the terminators. */
const OPTION_SHAPES: readonly (readonly string[])[] = [
  ['xargs'],
  ['xargs', 'rm', '-rf'],
  ['xargs', '-0', 'rm', '-rf'],
  ['xargs', '-0', '-n', '1', 'rm', '-rf'],
  ['xargs', '-n1', 'rm', '-rf'],
  ['xargs', '-P', '4', 'rm', '-rf'],
  ['xargs', '-P4', '-n', '2', 'rm', '-rf'],
  ['xargs', '-L', '1', 'echo'],
  ['xargs', '-s', '4096', 'echo'],
  ['xargs', '-E', 'END', 'echo'],
  ['xargs', '-a', 'list.txt', 'rm', '-rf'],
  ['xargs', '-d', '\\n', 'rm', '-rf'],
  ['xargs', '--max-args', '2', 'rm', '-rf'],
  ['xargs', '--max-procs=4', 'rm', '-rf'],
  ['xargs', '--delimiter', '\\0', 'rm', '-rf'],
  ['xargs', '--process-slot-var', 'SLOT', 'echo'],
  ['xargs', '--unknown-flag', 'rm', '-rf'],
  ['xargs', '--', 'rm', '-rf'],
  ['xargs', '--', '-I', '{}'],
  ['xargs', '-I', '{}', 'rm', '-rf', '{}'],
  ['xargs', '-I{}', 'rm', '-rf', '{}'],
  ['xargs', '-I', '%', 'rm', '-rf', '%'],
  ['xargs', '-I%', 'rm', '%'],
  ['xargs', '--replace', 'rm', '-rf', '{}'],
  ['xargs', '--replace=%', 'rm', '-rf', '%'],
  ['xargs', '--replace=', 'rm', '-rf', '{}'],
  ['xargs', '-J', '%', 'cp', 'src', '%'],
  ['xargs', '-I'],
  ['xargs', '-J'],
  ['xargs', '-n'],
  ['xargs', '', 'rm', '-rf'],
  ['xargs', '-I', '{}'],
];

/** Child heads: every branch of the executed-source question. */
const CHILD_SHAPES: readonly (readonly string[])[] = [
  ['xargs', 'cat'],
  ['xargs', 'rm', '-rf', 'dist'],
  ['xargs', '-I', '{}', 'rm', '{}'],
  ['xargs', '-I', '{}', 'rm', '-{}', 'dist'],
  ['xargs', '-I', '{}', 'rm', '-rf', '--', '{}'],
  ['xargs', '-I', '{}', '{}', 'dist'],
  ['xargs', '-I', '{}', 'rm', '-rf', '/'],
  ['xargs', 'sh', '-c', 'rm -rf /tmp/x'],
  ['xargs', 'sh', '-c', 'rm -rf "$1"', '_'],
  ['xargs', 'sh', '-c', 'eval "$FOO"'],
  ['xargs', 'bash', '-c', '$0'],
  ['xargs', 'bash', '-c', 'echo BOOM'],
  ['xargs', 'sh', '-n', '-c', 'rm -rf /'],
  ['xargs', 'sh', 'script.sh'],
  ['xargs', 'sh'],
  ['xargs', '-I', '{}', 'sh', '-c', 'echo {}'],
  ['xargs', '-I', '{}', 'sh', '-c', '{}'],
  ['xargs', '-I', '{}', 'sh', '{}'],
  ['xargs', '-I', '{}', 'sh', '-{}', 'echo hi'],
  ['xargs', '-I', '{}', '{}c', 'rm -rf /'],
  ['xargs', 'env', 'FOO=bar', 'rm', '-rf'],
  ['xargs', '-I', '{}', 'env', 'FOO={}', 'sh', '-c', 'eval "$FOO"'],
  ['xargs', '-I', '{}', 'env', 'FOO={}', 'sh', '-c', 'echo hi'],
  ['xargs', 'python3', '-c', 'print(1)'],
  ['xargs', 'python3', 'main.py'],
  ['xargs', 'python3'],
  ['xargs', '-I', '{}', 'python3', '-c', '{}'],
  ['xargs', '-I', '{}', 'python3', '{}'],
  ['xargs', '-I', '{}', 'python3', '-{}', 'print(1)'],
  ['xargs', 'node', '-e', 'process.exit(0)'],
  ['xargs', '-I', '{}', 'node', '--eval={}'],
  ['xargs', 'awk', '{ print }'],
  ['xargs', 'awk'],
  ['xargs', '-I', '{}', 'awk', '{}'],
  ['xargs', '-I', '{}', 'awk', '-f', '{}'],
  ['xargs', 'eval'],
  ['xargs', 'eval', 'echo hi'],
  ['xargs', '-I', '{}', 'eval', '{}'],
  ['xargs', 'find', '.', '-delete'],
  ['xargs', '-I', '{}', 'find', '{}', '-delete'],
  ['xargs', '-I', '{}', 'find', '.', '-name', '{}'],
  ['xargs', '-I', '{}', 'find', '.', '-name', 'x', '-print'],
  ['xargs', '-I', '{}', 'find', '.', '-exec', 'rm', '-rf', '{}', ';'],
  ['xargs', '-I', '%', 'find', '.', '-exec', 'rm', '-%', 'dist', ';'],
  ['xargs', '-I', '{}', 'find', '.', '-exec', 'sh', '-c', '{}', ';'],
  ['xargs', '-I', '{}', 'find', '.', '-newermt', '{}'],
  ['xargs', 'git', 'reset', '--hard'],
  ['xargs', 'git'],
  ['xargs', 'git', 'status'],
  ['xargs', '-I', '{}', 'git', '{}', '--hard'],
  ['xargs', '-I', '{}', 'git', 'checkout', '{}'],
  ['xargs', '-I', '{}', 'git', 'checkout', '--', '{}'],
  ['xargs', '-I', '{}', 'git', 'status', '{}'],
  ['xargs', 'command', 'rm', '-rf'],
  ['xargs', 'command', '-I', '{}'],
  ['xargs', 'sudo', 'rm', '-rf'],
  ['xargs', '-I', '{}', 'sudo', '{}'],
  ['xargs', 'uv', 'run', 'rm', '-rf'],
  ['xargs', 'kubectl', 'drain', '--force'],
  ['xargs', '-I', '{}', 'kubectl', 'drain', '{}'],
  ['xargs', '-I', '{}', 'skopeo', '{}'],
  ['xargs', 'skopeo', 'copy'],
  ['xargs', '-I', '{}', 'echo', '{}'],
  ['xargs', 'printf', '%s'],
];

const EVERY_SHAPE = [...OPTION_SHAPES, ...CHILD_SHAPES];

describe('xargs option parsing', () => {
  test('finds the same child start and replacement token as the shipped parser', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of [...EVERY_SHAPE, [], ['xargs', '-I', '', 'rm'], ['-I', '{}']]) {
      const child = extractXargsChildCommandWithInfo(tokens);
      recorded.push([tokens.join(' '), child]);
    }
    expectRecordedDigest('analyzer-xargs/child-start', recorded);
  });

  test('the table separates every replacement spelling from the plain options', () => {
    const spellings = EVERY_SHAPE.map(
      (tokens) => extractXargsChildCommandWithInfo(tokens).replacementToken,
    );
    expect(new Set(spellings)).toStrictEqual(new Set([null, '{}', '%']));
    expect(extractXargsChildCommandWithInfo(['xargs', '-0', 'rm']).childStart).toBe(2);
    expect(extractXargsChildCommandWithInfo(['xargs', '-n', '1', 'rm']).childStart).toBe(3);
    expect(extractXargsChildCommandWithInfo(['xargs', '-n1', 'rm']).childStart).toBe(2);
  });
});

describe('xargs analysis', () => {
  test('reports the same rule and asks for the same nested sources as the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    for (const tokens of EVERY_SHAPE) {
      for (const setting of SETTINGS) {
        const both = runBothXargs(tokens, setting);
        const where = `${setting.label}: ${tokens.join(' ')}`;
        recorded.push([where, { match: both.match, asked: both.asked }]);
      }
    }
    expectRecordedDigest('analyzer-xargs/analysis', recorded);
  });

  test('the shapes reach the dynamic-source, dynamic-rm and custom-rule verdicts', () => {
    const reported: string[] = [];
    for (const tokens of EVERY_SHAPE) {
      for (const setting of SETTINGS) {
        const verdict = runBothXargs(tokens, setting).match;
        if (verdict.ok && verdict.value) reported.push(verdict.value.id);
      }
    }
    for (const ruleId of [
      'custom.no-cluster-drain',
      'find.delete',
      'git.reset-hard',
      'rm.recursive-force-root-or-home',
      'xargs.rm-recursive-force-dynamic',
      'xargs.shell-dynamic',
    ]) {
      expect([...new Set(reported)].sort(), ruleId).toContain(ruleId);
    }
  });

  test('a reader child is allowed where a deleting child is not', () => {
    // `printf / | xargs rm -rf` denies without a replacement token: appended input is the target.
    const appended = runBothXargs(['xargs', 'rm', '-rf'], { label: 'defaults' }).match;
    expect(appended.ok && appended.value?.id).toBe('xargs.rm-recursive-force-dynamic');
    expect(appended.ok && appended.value?.reason).toBe(REASON_XARGS_RM);
    // `echo x | xargs cat` reads, it does not execute, so there is nothing to deny.
    expect(runBothXargs(['xargs', 'cat'], { label: 'defaults' }).match).toStrictEqual({
      ok: true,
      value: null,
    });
  });

  test('a disabled rule drops only the filterable verdict', () => {
    const dynamicShell = ['xargs', 'sh', '-c', 'eval "$1"', '_'];
    const on = runBothXargs(dynamicShell, { label: 'defaults' }).match;
    expect(on.ok && on.value?.id).toBe('xargs.shell-dynamic');
    expect(on.ok && on.value?.reason).toBe(REASON_XARGS_SHELL);
    const off = runBothXargs(dynamicShell, { label: 'off', ruleOff: 'xargs.shell-dynamic' });
    expectRecordedDigest('analyzer-xargs/disabled-rule', [['off', off.match]]);
    expect(off.match).toStrictEqual({ ok: true, value: null });
  });

  test('the reason strings are the shipped strings', () => {
    expectRecordedDigest('analyzer-xargs/reasons', [
      ['rm', REASON_XARGS_RM],
      ['shell', REASON_XARGS_SHELL],
    ]);
  });

  test('corpus and fuzz sources placed after xargs agree with the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    const prefixes = [['xargs'], ['xargs', '-I', '{}'], ['xargs', '-0', '-n', '1']];
    for (const source of [...corpusCommands(), ...fuzzShellSources(1_000, FUZZ_SEED)]) {
      const words = source.split(/\s+/).filter((token) => token !== '');
      for (const prefix of prefixes) {
        const both = runBothXargs([...prefix, ...words], {
          label: 'fuzz',
          rules: DEPLOY_RULES,
          strict: true,
        });
        recorded.push([`${prefix.join(' ')} ${source}`, { match: both.match, asked: both.asked }]);
      }
    }
    expectRecordedDigest('analyzer-xargs/corpus-and-fuzz', recorded);
  });
});
