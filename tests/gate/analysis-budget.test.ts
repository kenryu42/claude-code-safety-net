import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import * as budgetModule from '@/core/budget';
import { AnalysisLimit, LIMITS, type LimitKind } from '@/core/budget';
import { createProcessEnvironment } from '@/core/environment';
import { resolveProtectedGitMetadata } from '@/core/git/metadata';
import { analyzeCommandWithProgram, analyzerCapBreach } from '@/gate/analyzer';
import { evaluateGuard } from '@/gate/pipeline';
import { bashCall, createGateTree, portedVerdict } from '../helpers/gate-differential';
import { policySnapshot, testModes } from '../helpers/policy';

/**
 * Every cap the analyzer used to enforce with a budget of its own now counts on the one Budget and
 * throws `AnalysisLimit{kind}`. One row per counter, each proving three things: which counter the
 * input actually breaches (the kind the analyzer entry throws, so a row cannot silently start
 * testing a different cap), that the pipeline answers with the wording and audit class the table
 * assigns that kind instead of failing closed, and what the gate's recorded verdict is.
 * A companion input just short of the cap keeps each row honest about the cap being the cause.
 */

const tree = createGateTree('gate-analysis-budget-');
const environment = createProcessEnvironment();
const snapshot = policySnapshot();
const dependencies = { loadPolicySnapshot: () => snapshot, resolveGitMetadata: () => null };
const modes = testModes('standard');

afterAll(() => {
  tree.remove();
});

/** The analyzer entry's own input: the same process state and cwd the pipeline hands it. */
const analysisInput = {
  cwd: tree.workspace,
  shell: 'posix' as const,
  policySnapshot: snapshot,
  environment,
  protectedGitMetadata: null,
  effectiveCapabilities: modes.capabilities,
  strict: modes.strict,
  paranoidRm: modes.paranoidRm,
  paranoidInterpreters: modes.paranoidInterpreters,
  worktreeMode: modes.worktreeMode,
};

function copies(count: number, make: (index: number) => string) {
  return Array.from({ length: count }, (_, index) => make(index));
}

const numberedArgs = (count: number) => copies(count, (index) => `arg${index}`).join(' ');

const ROWS: readonly { kind: LimitKind; name: string; breaching: string; below: string }[] = [
  {
    kind: 'derivedTokens',
    name: 'derived tokens',
    breaching: `custom-tool ${copies(190, () => 'bash').join(' ')}`,
    below: `custom-tool ${copies(150, () => 'bash').join(' ')}`,
  },
  {
    kind: 'trackedHeredocFiles',
    name: 'tracked heredoc files',
    breaching: `tee ${copies(65, (index) => `file${index}.txt`).join(' ')} <<'END'\nbody\nEND`,
    below: `tee ${copies(64, (index) => `file${index}.txt`).join(' ')} <<'END'\nbody\nEND`,
  },
  {
    kind: 'controlFlowStates',
    name: 'control-flow states',
    breaching: copies(64, (index) => `export GIT_WORK_TREE=w${index}`).join(' && '),
    below: copies(63, (index) => `export GIT_WORK_TREE=w${index}`).join(' && '),
  },
  {
    // The segment peel: each `busybox` hands the rest of the segment back to the same analysis.
    kind: 'wrapperPeelIterations',
    name: 'wrapper peel iterations',
    breaching: `${copies(21, () => 'busybox').join(' ')} echo ok`,
    below: `${copies(19, () => 'busybox').join(' ')} echo ok`,
  },
  {
    // The same counter through the other site: normalizing a derived child command.
    kind: 'wrapperPeelIterations',
    name: 'child normalization peels',
    breaching: `find . -exec ${copies(24, () => 'busybox').join(' ')} rm {} \\;`,
    below: `find . -exec ${copies(10, () => 'busybox').join(' ')} rm {} \\;`,
  },
  {
    // An `env -S` value needing the quote language has no channel for a match on either side.
    kind: 'derivedCommandShape',
    name: 'an unnormalizable derived child',
    breaching: `xargs env -S 'echo "quoted"'`,
    below: `xargs env -S 'echo quoted'`,
  },
  {
    kind: 'parallelChildAnalyses',
    name: 'parallel child analyses',
    breaching: `parallel echo {} ::: ${numberedArgs(1100)}`,
    below: `parallel echo {} ::: ${numberedArgs(1000)}`,
  },
  {
    kind: 'parallelDerivedTokens',
    name: 'parallel derived tokens',
    breaching: `parallel echo ${copies(149, () => 'w').join(' ')} {} ::: ${numberedArgs(120)}`,
    below: `parallel echo ${copies(149, () => 'w').join(' ')} {} ::: ${numberedArgs(100)}`,
  },
  {
    kind: 'parallelDerivedBytes',
    name: 'parallel derived bytes',
    breaching: `parallel echo ${'y'.repeat(3000)} {} ::: ${numberedArgs(400)}`,
    below: `parallel echo ${'y'.repeat(3000)} {} ::: ${numberedArgs(200)}`,
  },
  {
    kind: 'parallelPlaceholderReplacements',
    name: 'parallel placeholder replacements',
    breaching: `parallel echo ${'{}'.repeat(20)} ::: ${numberedArgs(1000)}`,
    below: `parallel echo ${'{}'.repeat(20)} ::: ${numberedArgs(800)}`,
  },
];

/** The counter this command breaches, read off the exception the analyzer entry throws. */
function breachedKind(command: string): LimitKind | 'analyzed without a breach' {
  try {
    analyzeCommandWithProgram(command, analysisInput);
    return 'analyzed without a breach';
  } catch (error) {
    if (error instanceof AnalysisLimit) return error.kind;
    throw error;
  }
}

describe('one budget, one report per analyzer cap', () => {
  for (const row of ROWS) {
    test(`${row.name}: the counter that breaches is the one the row names`, () => {
      expect(breachedKind(row.breaching)).toBe(row.kind);
      expect(breachedKind(row.below)).toBe('analyzed without a breach');
    });

    test(`${row.name}: the pipeline reports the denial and the audit class`, () => {
      expect(
        evaluateGuard(bashCall(row.breaching, tree.workspace), { environment, dependencies }),
      ).toStrictEqual({
        stage: 'command-analysis',
        level: 'standard',
        errorCode: LIMITS[row.kind].errorCode,
        decision: {
          kind: 'deny',
          reason: LIMITS[row.kind].reason,
          intent: 'stop_and_explain',
          evidence: [{ kind: 'command', command: row.breaching, segment: row.breaching }],
        },
      });
    });

    test(`${row.name}: the shipped gate reaches the same verdict, and not below the cap`, () => {
      // The gate the hosts call answers the breach with the same capped denial the pipeline
      // reports above, and the command one step below the cap never reaches that reason.
      expect(
        portedVerdict(bashCall(row.breaching, tree.workspace), environment, dependencies).reason,
      ).toBe(LIMITS[row.kind].reason);
      expect(
        portedVerdict(bashCall(row.below, tree.workspace), environment, dependencies).reason,
      ).not.toBe(LIMITS[row.kind].reason);
    });
  }

  test('the rows cover every analyzer cap the table names', () => {
    expect([...new Set(ROWS.map((row) => row.kind))].sort()).toStrictEqual([
      'controlFlowStates',
      'derivedCommandShape',
      'derivedTokens',
      'parallelChildAnalyses',
      'parallelDerivedBytes',
      'parallelDerivedTokens',
      'parallelPlaceholderReplacements',
      'trackedHeredocFiles',
      'wrapperPeelIterations',
    ]);
  });

  test('and no other kind in the table is answered as an analyzer cap', () => {
    const analyzerKinds = new Set<LimitKind>(ROWS.map((row) => row.kind));
    const mapped = (Object.keys(LIMITS) as LimitKind[]).filter(
      (kind) => analyzerCapBreach(new AnalysisLimit(kind), 'x') !== null,
    );
    expect(mapped.sort()).toStrictEqual([...analyzerKinds].sort());
  });
});

/**
 * The other half of the unification: not only does each cap report once, the whole evaluation
 * counts on one Budget. Every `createBudget` call made inside `src/` while the evaluation runs is
 * counted, so a guard or an analyzer entry that quietly builds its own budget again shows up as a
 * second call. The one budget deliberately outside the count is the git-metadata resolver's own:
 * the rows resolve metadata before the spy is installed, so a production run — where the
 * environment resolves it inside the evaluation — makes that call as well. The rows below run the
 * stages that used to create their own: the protection walk with a tracked cwd and an assignment,
 * a heredoc the analyzer tracks as a file, and the three derived `rm` children — `find -exec`, an
 * `xargs` pipeline and a `parallel` expansion.
 */
describe('one Budget per evaluation', () => {
  // Real metadata, so the git-metadata guard does its path work instead of returning at
  // `!metadata`; resolved once here, because the resolver charges a budget of its own.
  const metadata = resolveProtectedGitMetadata(tree.repository, environment);
  const inRepository = { loadPolicySnapshot: () => snapshot, resolveGitMetadata: () => metadata };

  for (const command of [
    'd=./build; cd ./src && rm -rf "$d"',
    "cat > notes.txt <<'EOF'\nhello\nEOF",
    String.raw`find . -name '*.log' -exec rm {} \;`,
    'echo build | xargs rm -rf',
    'parallel rm -rf {} ::: build dist',
  ]) {
    test(`${command.split('\n')[0]} creates exactly one budget`, () => {
      const spy = spyOn(budgetModule, 'createBudget');
      const evaluation = evaluateGuard(bashCall(command, tree.repository), {
        environment,
        dependencies: inRepository,
      });
      const calls = spy.mock.calls.length;
      spy.mockRestore();
      expect(evaluation.stage).toBe('command-analysis');
      expect(calls).toBe(1);
    });
  }
});
