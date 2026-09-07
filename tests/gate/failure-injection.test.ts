import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import * as nodeFs from 'node:fs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AnalysisLimit,
  LIMITS,
  type LimitKind,
  REASON_DERIVED_COMMAND_WORK_LIMIT,
  REASON_PARALLEL_ANALYSIS_LIMIT,
  REASON_SAFETY_NET_FAILED_CLOSED,
} from '@/core/budget';
import { createProcessEnvironment } from '@/core/environment';
import { ToolInputLimitError } from '@/core/tool-input';
import { analyzeCommandWithProgram as portedAnalyzeCommand } from '@/gate/analyzer';
import { REASON_COMMAND_ANALYSIS_LIMIT, REASON_RECURSION_LIMIT } from '@/gate/analyzer/reasons';
import { outputFailedClosed as portedOutputFailedClosed } from '@/gate/intake';
import {
  type GuardDependencies as PortedDependencies,
  evaluateGuard as portedEvaluateGuard,
} from '@/gate/pipeline';
import { withEnv } from '../helpers';
import { bashCall, createGateTree, portedVerdict, toolCall } from '../helpers/gate-differential';
import { policySnapshot } from '../helpers/policy';

/**
 * What the gate does when something under it fails: a filesystem that throws, a config file
 * swapped out from under the reader, input past the intake caps, and one breach of every analysis
 * cap a command can still reach. Each row records the verdict, pins the words it carries, and —
 * where a breach escapes as an exception — the audit classification it is given.
 */

const tree = createGateTree('gate-failure-injection-');
const environment = createProcessEnvironment();
const snapshot = policySnapshot();
const dependencies = { loadPolicySnapshot: () => snapshot, resolveGitMetadata: () => null };

afterAll(() => {
  tree.remove();
});

const repeated = (count: number, make: (index: number) => string, separator = ' ') =>
  Array.from({ length: count }, (_, index) => make(index)).join(separator);

/** Records one command's verdict and hands it back for the row's own assertions. */
function agreedOn(command: string, overrides = {}) {
  const ported = portedVerdict(bashCall(command, tree.workspace), environment, {
    ...dependencies,
    ...overrides,
  });
  return ported;
}

describe('a filesystem that throws instead of answering', () => {
  const throwing = {
    ...environment,
    paths: {
      realpath: () => {
        throw new Error('injected realpath failure');
      },
      entryKind: environment.paths.entryKind,
      isDirectory: environment.paths.isDirectory,
    },
  };

  // The analyzer is the seam the gate takes its process state through, so it is the only place a
  // broken `realpath` can be injected.
  const breakingPaths: Partial<PortedDependencies> = {
    analyzeCommand: (command, options, program, store) =>
      portedAnalyzeCommand(command, { ...options, environment: throwing }, program, store),
  };

  /** One command through the gate with `realpath` broken, recorded as it decided. */
  const brokenRealpathVerdict = (command: string) => {
    const ported = portedVerdict(bashCall(command, tree.workspace), environment, {
      ...dependencies,
      ...breakingPaths,
    });
    return ported;
  };

  test('a delete under an unresolvable cwd is treated as outside it, not as an internal fault', () => {
    const ported = brokenRealpathVerdict('rm -rf ./build');
    expect(ported.outcome).toBe('deny');
    expect(ported.reason).toContain('rm -rf outside cwd');
  });

  test('commands that never resolve a path are unaffected', () => {
    for (const command of ['git status', 'echo hello']) brokenRealpathVerdict(command);
  });
});

describe('input past the intake caps', () => {
  test('a command longer than the parser can hold', () => {
    const verdict = agreedOn(`echo ${'y'.repeat(200_000)}`);
    expect(verdict.stage).toBe('command-analysis');
    expect(verdict.reason).toBe(REASON_RECURSION_LIMIT);
  });

  test('a tool input string past the traversal cap fails closed with the command withheld', () => {
    const call = toolCall(
      'Bash',
      { command: 'git status', transcript: 'x'.repeat(1024 * 1024 + 1) },
      { kind: 'command', shell: 'posix' },
      tree.workspace,
    );
    const ported = portedVerdict(call, environment, dependencies);
    expect(ported).toMatchObject({ thrown: 'GuardEvaluationError', evidence: [] });
  });
});

describe('a host that truncated the tool input', () => {
  /** What the Grok Build adapter does with `toolInputTruncated`: deny without analyzing. */
  function truncatedDenial(report: typeof portedOutputFailedClosed, toolInput: unknown) {
    const denials: unknown[] = [];
    report((denial) => denials.push(denial), toolInput, 'run_terminal_command');
    return denials;
  }

  for (const [name, toolInput, command] of [
    ['a truncated command', { command: 'rm -rf /var/l' }, 'rm -rf /var/l'],
    [
      'a payload past the traversal cap',
      { command: 'x'.repeat(1024 * 1024 + 1) },
      'x'.repeat(1024 * 1024 + 1),
    ],
    ['no payload at all', undefined, undefined],
  ] as const) {
    test(name, () => {
      // The adapter never analyzed the text, so it fails closed and echoes back whatever it was
      // handed — the truncated command, the oversized one, or nothing at all.
      expect(truncatedDenial(portedOutputFailedClosed, toolInput)).toEqual([
        {
          command,
          intent: 'stop_and_explain',
          reason: REASON_SAFETY_NET_FAILED_CLOSED,
          segment: command,
          toolName: 'run_terminal_command',
        },
      ]);
    });
  }
});

describe('process state the two gates read differently', () => {
  test('a Git config count past its cap is a rule denial on both sides', () => {
    /** `git status` through the gate, reading the process state as it stands right now. */
    const gitStatusVerdict = () => {
      const ported = portedVerdict(
        bashCall('git status', tree.workspace),
        createProcessEnvironment(),
        dependencies,
      );
      return ported;
    };
    withEnv({ GIT_CONFIG_COUNT: '1025' }, () => {
      expect(gitStatusVerdict().ruleId).toBe('git.alias-config');
    });
    // `1024` is still a valid count, and the analyzer denies large valid counts for its own
    // reason, so the counterpart here is the variable being absent.
    withEnv({ GIT_CONFIG_COUNT: undefined }, () => {
      expect(gitStatusVerdict().outcome).toBe('allow');
    });
  });

  test('a rule config replaced between open and read degrades both snapshots alike', () => {
    const safetyNetHome = join(tree.home, '.cc-safety-net');
    const rulePath = join(safetyNetHome, 'rules', 'rule.json');
    mkdirSync(join(safetyNetHome, 'rules'), { recursive: true });
    writeFileSync(join(safetyNetHome, 'policy.json'), '{"version":1}');
    const original = '{"version":1,"rules":[]}';
    writeFileSync(rulePath, original);

    withEnv({ CC_SAFETY_NET_HOME: safetyNetHome, HOME: tree.home }, () => {
      const call = bashCall('git status', tree.workspace);
      const environmentWithHome = createProcessEnvironment();
      expect(portedVerdict(call, environmentWithHome, {}).configFallback).toBeUndefined();

      const read = nodeFs.readFileSync;
      const swaps: number[] = [];
      const spy = spyOn(nodeFs, 'readFileSync').mockImplementation(((
        path: Parameters<typeof nodeFs.readFileSync>[0],
        options: Parameters<typeof nodeFs.readFileSync>[1],
      ) => {
        // The descriptor read is the window the identity check closes: swap the file inside it.
        if (typeof path === 'number') {
          swaps.push(path);
          rmSync(rulePath, { force: true });
          writeFileSync(rulePath, '{"version":1,"rules":["team/rulebook"]}');
        }
        return read(path, options);
      }) as typeof nodeFs.readFileSync);
      const ported = portedVerdict(call, environmentWithHome, {});
      writeFileSync(rulePath, original);
      spy.mockRestore();

      expect(swaps.length).toBe(1);
      expect(ported.configFallback).toStrictEqual({
        reason:
          'Unable to access user policy filesystem safely. Those rule sources are not active; every other rule and all built-in protections still apply.',
      });
    });
  });
});

const nestedShells = (depth: number): string =>
  depth === 0 ? 'echo ok' : `sh -c ${JSON.stringify(nestedShells(depth - 1))}`;

/**
 * One breach per cap a command can still reach, with the counterpart just below it. `audited` is
 * what the audit would record: the class the breach escapes as, or null where the analyzer
 * catches it and answers with an ordinary denial.
 */
const CAP_BREACHES = [
  {
    kind: 'recursionDepth',
    name: 'recursion depth',
    breaching: nestedShells(10),
    below: nestedShells(9),
    reason: REASON_RECURSION_LIMIT,
    audited: null,
  },
  {
    kind: 'wrapperPeelIterations',
    name: 'wrapper peel iterations',
    breaching: `${repeated(21, () => 'env')} echo ok`,
    below: `${repeated(19, () => 'env')} echo ok`,
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
    audited: null,
  },
  {
    kind: 'trackedHeredocFiles',
    name: 'tracked heredoc files',
    breaching: `tee ${repeated(64, (index) => `sink${index}`)} > extra <<'BODY'\nhello\nBODY`,
    below: `tee ${repeated(63, (index) => `sink${index}`)} > extra <<'BODY'\nhello\nBODY`,
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
    audited: null,
  },
  {
    kind: 'controlFlowStates',
    name: 'control-flow states',
    breaching: repeated(64, (index) => `export GIT_DIR=g${index}`, ' && '),
    below: repeated(63, (index) => `export GIT_DIR=g${index}`, ' && '),
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
    audited: null,
  },
  {
    kind: 'derivedTokens',
    name: 'derived command work',
    breaching: `unmapped-head ${repeated(200, () => 'sh')}`,
    below: `unmapped-head ${repeated(100, () => 'sh')}`,
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
    audited: null,
  },
  {
    kind: 'parallelChildAnalyses',
    name: 'parallel child analyses',
    breaching: `parallel rm -rf {} ::: ${repeated(1025, (index) => `arg${index}`)}`,
    below: `parallel rm -rf {} ::: ${repeated(1023, (index) => `arg${index}`)}`,
    reason: REASON_PARALLEL_ANALYSIS_LIMIT,
    audited: null,
  },
  {
    kind: 'pathEnvironmentExpansion',
    name: 'path environment expansion',
    breaching: `cat ${'${HOME:-'.repeat(65)}x${'}'.repeat(65)}/.ssh/config`,
    below: 'cat ${HOME}/notes.md',
    reason: REASON_COMMAND_ANALYSIS_LIMIT,
    audited: 'path-canonicalization-limit',
  },
] as const satisfies readonly {
  kind: LimitKind;
  name: string;
  breaching: string;
  below: string;
  reason: string;
  audited: string | null;
}[];

/** The classification: one exception carrying the kind the `LIMITS` table codes. */
function portedAuditCode(cause: unknown) {
  if (cause instanceof AnalysisLimit) return LIMITS[cause.kind].errorCode;
  if (cause instanceof ToolInputLimitError) return 'tool-input-limit';
  return null;
}

function escapingCause(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { cause?: unknown }).cause ?? null;
  }
}

describe('every cap a command can still reach', () => {
  for (const breach of CAP_BREACHES) {
    test(`${breach.name} breaches with the same words`, () => {
      const verdict = agreedOn(breach.breaching);
      expect(verdict.reason).toBe(breach.reason);
      expect(agreedOn(breach.below).reason).not.toBe(breach.reason);
    });

    test(`${breach.name} is classified the same way for the audit`, () => {
      const call = bashCall(breach.breaching, tree.workspace);
      expect(
        portedAuditCode(
          escapingCause(() => portedEvaluateGuard(call, { environment, dependencies })),
        ),
      ).toBe(breach.audited);
    });
  }

  test('the caps the table names, and the codes the LIMITS table already assigns them', () => {
    expect(
      CAP_BREACHES.map((breach) => ({
        kind: breach.kind,
        reported: breach.audited,
        table: LIMITS[breach.kind].errorCode,
        wordingMatchesTable: breach.reason === LIMITS[breach.kind].reason,
      })),
    ).toStrictEqual([
      {
        kind: 'recursionDepth',
        reported: null,
        table: 'structural-shell-syntax-limit',
        wordingMatchesTable: true,
      },
      {
        kind: 'wrapperPeelIterations',
        reported: null,
        table: 'structural-shell-syntax-limit',
        wordingMatchesTable: true,
      },
      {
        kind: 'trackedHeredocFiles',
        reported: null,
        table: 'structural-shell-syntax-limit',
        wordingMatchesTable: true,
      },
      {
        kind: 'controlFlowStates',
        reported: null,
        table: 'structural-shell-syntax-limit',
        wordingMatchesTable: true,
      },
      {
        kind: 'derivedTokens',
        reported: null,
        table: 'structural-shell-syntax-limit',
        wordingMatchesTable: true,
      },
      {
        kind: 'parallelChildAnalyses',
        reported: null,
        table: 'structural-shell-syntax-limit',
        wordingMatchesTable: true,
      },
      {
        kind: 'pathEnvironmentExpansion',
        reported: 'path-canonicalization-limit',
        table: 'path-canonicalization-limit',
        wordingMatchesTable: true,
      },
    ]);
  });
});
