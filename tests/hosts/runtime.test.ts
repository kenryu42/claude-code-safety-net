import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnalysisLimit, REASON_SAFETY_NET_FAILED_CLOSED } from '@/core/budget';
import { createProcessEnvironment } from '@/core/environment';
import { ToolInputLimitError as PortedToolInputLimitError } from '@/core/tool-input';
import { evaluateRuntimeGuard as portedEvaluateRuntimeGuard } from '@/hosts/runtime';
import { withEnv } from '../helpers';
import { bashCall, createGateTree } from '../helpers/gate-differential';
import { readAuditEntries } from '../helpers/hook-capture';
import { STRUCTURAL_LIMIT_COMMAND } from '../helpers/hook-hosts';
import { recordPorted, rootFolds } from '../helpers/temp-home';

/**
 * The runner's one call into the gate: evaluate, then record. Each row runs one invocation against
 * one audit home and records what came back — or what was thrown — together with the line that
 * reached the log. The limit rows raise the gate's own limit classes, and the classification they
 * carry is what the audit line has to keep.
 */

const tree = createGateTree('next-hosts-runtime-');

/**
 * The workspace the invocation ran in, as the audit line spells it and as the writer spells it in
 * the log directory it names after that directory, with every separator replaced by `-`.
 */
const FOLDS = [...rootFolds(tree.root), [tree.root.replaceAll('/', '-'), '<root>']] as const;

afterAll(() => {
  tree.remove();
});

const AUDIT = { agent: 'hosts-test', getSessionId: () => 'hosts-runtime-1' };

const throwing = (make: () => Error) => ({
  analyzeCommand: (): never => {
    throw make();
  },
});

const BREACHES = {
  unexpected: () => new Error('injected analyzer failure'),
  toolInput: () => new PortedToolInputLimitError(),
  canonicalization: () => new AnalysisLimit('pathEnvironmentExpansion'),
} as const;

type Row = {
  name: string;
  command: string;
  auditAllowed: boolean;
  breach?: keyof typeof BREACHES;
  /** Set by the one row that throws out of the gate without an injected dependency. */
  throws?: true;
  lines: number;
  entry?: Record<string, unknown>;
};

const ROWS: readonly Row[] = [
  {
    name: 'an allowed command recorded because allow auditing is on',
    command: 'git status',
    auditAllowed: true,
    lines: 1,
    entry: { decision: 'allow', command: 'git status', reason: 'allowed' },
  },
  {
    name: 'an allowed command left unrecorded',
    command: 'git status',
    auditAllowed: false,
    lines: 0,
  },
  {
    name: 'a rule denial',
    command: 'git push --force origin main',
    auditAllowed: false,
    lines: 1,
    entry: { decision: 'deny', command: 'git push --force origin main' },
  },
  {
    name: 'an analyzer that fails with an ordinary error',
    command: 'echo unexpected',
    auditAllowed: false,
    breach: 'unexpected',
    lines: 1,
    entry: {
      decision: 'deny',
      command: 'echo unexpected',
      reason: REASON_SAFETY_NET_FAILED_CLOSED,
      failureStage: 'command-analysis',
      errorCode: 'unexpected-error',
    },
  },
  {
    name: 'an analyzer that fails over the tool-input limit',
    command: 'echo tool input',
    auditAllowed: false,
    breach: 'toolInput',
    lines: 1,
    entry: { decision: 'deny', command: '', segment: '', errorCode: 'tool-input-limit' },
  },
  {
    // The one breach class that is not an `AnalysisLimit`: the secret guard raises it itself, so
    // the row needs no injection and the audit class cannot be satisfied by the default branch.
    name: 'a nested program past the structural shell-syntax limit',
    command: STRUCTURAL_LIMIT_COMMAND,
    auditAllowed: false,
    throws: true,
    lines: 1,
    entry: {
      decision: 'deny',
      failureStage: 'secret-protection',
      errorCode: 'structural-shell-syntax-limit',
    },
  },
  {
    name: 'an analyzer that fails over the path-canonicalization limit',
    command: 'echo canonicalization',
    auditAllowed: false,
    breach: 'canonicalization',
    lines: 1,
    entry: {
      decision: 'deny',
      command: 'echo canonicalization',
      failureStage: 'command-analysis',
      errorCode: 'path-canonicalization-limit',
    },
  },
];

let auditHome: string;

beforeEach(() => {
  auditHome = mkdtempSync(
    join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'next-hosts-runtime-home-'),
  );
});

afterEach(() => {
  rmSync(auditHome, { recursive: true, force: true });
});

for (const row of ROWS) {
  test(row.name, () => {
    const call = bashCall(row.command, tree.workspace);
    const guard = {
      auditAllowed: row.auditAllowed,
      dependencies: row.breach ? throwing(BREACHES[row.breach]) : {},
    };

    const ported = withEnv({ CC_SAFETY_NET_AUDIT_HOME: auditHome }, () => {
      const outcome = outcomeOf(() =>
        portedEvaluateRuntimeGuard(createProcessEnvironment(), call, { guard, audit: AUDIT }),
      );
      return { outcome, entries: readAuditEntries(auditHome) };
    });

    recordPorted(ported, FOLDS);
    expect(ported.entries).toHaveLength(row.lines);
    expect(ported.outcome.thrown).toBe(
      row.breach || row.throws ? 'GuardEvaluationError' : undefined,
    );
    if (row.entry) expect(ported.entries[0]?.entry).toMatchObject(row.entry);
  });
}

/** The stage and decision either returned or carried by the thrown `GuardEvaluationError`. */
function outcomeOf(run: () => { stage: string; decision: unknown }) {
  try {
    const evaluation = run();
    return { thrown: undefined, stage: evaluation.stage, decision: evaluation.decision };
  } catch (error) {
    const failure = error as Error & {
      stage?: string;
      evaluation?: { stage: string; decision: unknown };
    };
    if (failure.evaluation === undefined) throw error;
    return { thrown: failure.name, stage: failure.stage, decision: failure.evaluation.decision };
  }
}
