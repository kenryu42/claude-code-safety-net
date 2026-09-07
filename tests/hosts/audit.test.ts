import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IntegrationDenial } from '@/core/denial';
import { createProcessEnvironment, type Environment } from '@/core/environment';
import { evaluateGuard as portedEvaluateGuard } from '@/gate/pipeline';
import {
  projectGuardAudit as portedProjectGuardAudit,
  writeIntegrationDenialAudit as portedWriteDenialAudit,
  writeGuardAudit as portedWriteGuardAudit,
} from '@/hosts/audit';
import { withEnv } from '../helpers';
import { bashCall, createGateTree } from '../helpers/gate-differential';
import { readAuditEntries } from '../helpers/hook-capture';
import { auditDirnameFolds, normalize, rootFolds } from '../helpers/temp-home';

/**
 * The host audit projection: what an evaluation becomes as an audit descriptor, and what that
 * descriptor becomes on disk. The projection's two switches are what the matrix below is for — an
 * allow is projected only where allow auditing is on, a denial always is — and the writer's job is
 * to put the descriptor in the log named after the working directory, under the session id, or to
 * write nothing at all when there is no session to attribute the line to.
 */

const tree = createGateTree('next-hosts-audit-');

/**
 * The workspace an evaluation ran in, as a descriptor spells it and as the audit writer spells it
 * in the log directory it names after that directory, with every separator replaced by `-`.
 */
const FOLDS = [...rootFolds(tree.root), ...auditDirnameFolds(tree.root, '<root>')];

afterAll(() => {
  tree.remove();
});

const environment = createProcessEnvironment();
const SESSION = 'hosts-audit-1';
const FAILURE = { stage: 'command-analysis', errorCode: 'unexpected-error' } as const;
const DENIAL: IntegrationDenial = {
  reason: 'Blocked by a preflight check.',
  ruleId: 'rm.recursive-force-root',
  intent: 'hard_stop',
  command: 'rm -rf /',
  segment: 'rm -rf /',
  toolName: 'Bash',
};

/** One evaluation for one command; `echo ok` fails inside the analyzer. */
function evaluatedRow(command: string, failing = false) {
  const call = bashCall(command, tree.workspace);
  const dependencies = failing
    ? {
        analyzeCommand: () => {
          throw new Error('injected analyzer failure');
        },
      }
    : {};
  return {
    command,
    call,
    failure: failing ? FAILURE : undefined,
    ported: evaluationOf(() => portedEvaluateGuard(call, { environment, dependencies })),
  };
}

const DENIED = evaluatedRow('git push --force origin main');
const ROWS = [
  evaluatedRow('git status'),
  DENIED,
  evaluatedRow('cat ~/.ssh/id_rsa'),
  evaluatedRow('echo ok', true),
];

test('the rows carry one allow and three denials on both sides', () => {
  const kinds = ['allow', 'deny', 'deny', 'deny'] as const;
  expect(ROWS.map((row) => row.ported.decision.kind)).toStrictEqual([...kinds]);
});

/** What each row projects to, before the two switches and the failure fields are applied. */
const DESCRIPTORS: Readonly<Record<string, Record<string, unknown>>> = {
  'git status': {
    decision: 'allow',
    command: 'git status',
    segment: 'git status',
    reason: 'allowed',
    cwd: tree.workspace,
    toolName: 'Bash',
    level: 'standard',
  },
  'git push --force origin main': {
    decision: 'deny',
    command: 'git push --force origin main',
    segment: 'git push --force origin main',
    reason:
      'git push --force destroys remote history. Use --force-with-lease for safer force push.',
    cwd: tree.workspace,
    toolName: 'Bash',
    level: 'standard',
    ruleId: 'git.push-force',
    intent: 'use_alternative',
  },
  'cat ~/.ssh/id_rsa': {
    decision: 'deny',
    command: 'cat ~/.ssh/id_rsa',
    // The evidence names the operand the secret guard answered on, not the whole command line.
    segment: '~/.ssh/id_rsa',
    reason: 'Access to a sensitive path is not allowed.',
    cwd: tree.workspace,
    toolName: 'Bash',
    level: 'standard',
    ruleId: 'secret.home.ssh',
    intent: 'hard_stop',
  },
  'echo ok': {
    decision: 'deny',
    command: 'echo ok',
    segment: 'echo ok',
    reason:
      'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.',
    cwd: tree.workspace,
    toolName: 'Bash',
    // A fail-closed denial is answered by no rule and settles before a level is resolved.
    intent: 'stop_and_explain',
  },
};

describe('an evaluation projected as an audit descriptor', () => {
  for (const row of ROWS) {
    for (const auditAllowed of [true, false]) {
      for (const includeCommand of [true, false]) {
        for (const failure of [undefined, FAILURE]) {
          test(`${row.command} (allowed ${auditAllowed}, command ${includeCommand}, failure ${failure !== undefined})`, () => {
            const projected = portedProjectGuardAudit(
              row.call,
              row.ported,
              auditAllowed,
              includeCommand,
              failure,
            );
            const descriptor = DESCRIPTORS[row.command];

            // An allow is recorded only where allow auditing is on, and never carries a failure:
            // the call went through, so there is nothing that failed closed to report.
            if (descriptor?.decision === 'allow') {
              expect(projected).toEqual(auditAllowed ? descriptor : undefined);
              return;
            }
            // A denial is recorded whatever the allow setting says. `includeCommand` decides the
            // command of a denial that carries no command evidence; each of these carries some,
            // so the evidence wins either way.
            expect(projected).toEqual({
              ...descriptor,
              failureStage: failure?.stage,
              errorCode: failure?.errorCode,
            });
          });
        }
      }
    }
  }
});

// The descriptors themselves are stated above; what is under test here is only what the writer
// does with one.
const descriptorOf = (row: (typeof ROWS)[number]) =>
  portedProjectGuardAudit(row.call, row.ported, true, true, row.failure);

const refuseSession = () => {
  throw new Error('session lookup failed');
};

/** Every line the writer stamps on top of the descriptor it was handed. */
const stamped = { sessionId: SESSION, v: 'dev', agent: 'hosts-test', shape: 'claude-code' };

const WRITE_ROWS: readonly {
  name: string;
  run: (host: Environment) => void;
  entries: Record<string, unknown>[];
  /** The log the line lands in, relative to the audit home, with the date left to the test. */
  directory?: string;
}[] = [
  ...ROWS.map((row) => ({
    name: `guard audit for ${row.command}`,
    run: (host: Environment) =>
      portedWriteGuardAudit(host, descriptorOf(row), () => SESSION, {
        agent: 'hosts-test',
        shape: 'claude-code',
      }),
    entries: [
      {
        ...stamped,
        ...DESCRIPTORS[row.command],
        ...(row.failure
          ? { failureStage: row.failure.stage, errorCode: row.failure.errorCode }
          : {}),
      },
    ],
    directory: '<root>-workspace',
  })),
  {
    name: 'preflight denial without a cwd',
    run: (host: Environment) =>
      portedWriteDenialAudit(host, DENIAL, () => SESSION, {
        agent: 'hosts-test',
        toolName: 'Bash',
        cwd: null,
      }),
    entries: [
      {
        sessionId: SESSION,
        v: 'dev',
        agent: 'hosts-test',
        decision: 'deny',
        command: DENIAL.command,
        segment: DENIAL.segment,
        reason: DENIAL.reason,
        ruleId: DENIAL.ruleId,
        intent: DENIAL.intent,
        toolName: 'Bash',
        cwd: null,
      },
    ],
    // With no directory to name the log after, the lines go to one shared place.
    directory: 'no-cwd',
  },
  {
    name: 'preflight denial under a shape and a cwd',
    run: (host: Environment) =>
      portedWriteDenialAudit(host, { reason: DENIAL.reason }, () => SESSION, {
        agent: 'codex',
        shape: 'claude-code',
        cwd: tree.workspace,
      }),
    entries: [
      {
        sessionId: SESSION,
        v: 'dev',
        agent: 'codex',
        shape: 'claude-code',
        decision: 'deny',
        // A denial that names no command still records the empty one it was given.
        command: '',
        segment: '',
        reason: DENIAL.reason,
        cwd: tree.workspace,
      },
    ],
    directory: '<root>-workspace',
  },
  {
    // Without a session id there is no log to attribute the line to, so nothing is written.
    name: 'a session lookup that throws',
    run: (host: Environment) => {
      portedWriteGuardAudit(host, descriptorOf(DENIED), refuseSession, { agent: 'hosts-test' });
      portedWriteDenialAudit(host, DENIAL, refuseSession, { agent: 'hosts-test', cwd: null });
    },
    entries: [],
  },
  {
    name: 'a blank or missing session id',
    run: (host: Environment) => {
      portedWriteGuardAudit(host, descriptorOf(DENIED), () => '   ', { agent: 'hosts-test' });
      portedWriteDenialAudit(host, DENIAL, () => undefined, { agent: 'hosts-test', cwd: null });
    },
    entries: [],
  },
];

describe('a descriptor written to the audit log', () => {
  let auditHome: string;

  beforeEach(() => {
    auditHome = mkdtempSync(
      join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'next-hosts-audit-home-'),
    );
  });

  afterEach(() => {
    rmSync(auditHome, { recursive: true, force: true });
  });

  for (const row of WRITE_ROWS) {
    test(row.name, () => {
      const written = withEnv({ CC_SAFETY_NET_AUDIT_HOME: auditHome }, () => {
        row.run(createProcessEnvironment());
        return readAuditEntries(auditHome);
      });
      const day = new Date().toISOString().slice(0, 10);

      expect(written.map((line) => line.entry)).toEqual(row.entries);
      expect(written.map((line) => normalize(line.file, FOLDS))).toEqual(
        row.entries.map(() => `${row.directory}/${day.slice(0, 7)}/${day}-${SESSION}.jsonl`),
      );
    });
  }
});

function evaluationOf<E>(run: () => E): E {
  try {
    return run();
  } catch (error) {
    const evaluation = (error as { evaluation?: E }).evaluation;
    if (evaluation) return evaluation;
    throw error;
  }
}
