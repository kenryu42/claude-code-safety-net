import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IntegrationDenial } from '@next/core/denial';
import { createProcessEnvironment, type Environment } from '@next/core/environment';
import { evaluateGuard as portedEvaluateGuard } from '@next/gate/pipeline';
import {
  projectGuardAudit as portedProjectGuardAudit,
  writeIntegrationDenialAudit as portedWriteDenialAudit,
  writeGuardAudit as portedWriteGuardAudit,
} from '@next/hosts/audit';
import { evaluateGuard as shippedEvaluateGuard } from '@/engine/guard';
import {
  projectGuardAudit as shippedProjectGuardAudit,
  writeIntegrationDenialAudit as shippedWriteDenialAudit,
  writeGuardAudit as shippedWriteGuardAudit,
} from '@/integrations/audit';
import { withEnv } from '../../helpers';
import { bashCall, createGateTree } from '../helpers/gate-differential';
import { clearAuditLogs, readAuditEntries } from '../helpers/hook-capture';
import { recordPorted, rootFolds } from '../helpers/temp-home';

/**
 * The host audit projection: what an evaluation becomes as an audit descriptor, and what that
 * descriptor becomes on disk. The port moved the `Environment` to the front of both writers and
 * dropped the `homeDir` option, so the descriptors are compared directly and the written lines
 * are compared through one audit home that each side writes into in turn.
 */

const tree = createGateTree('next-hosts-audit-');

/**
 * The workspace an evaluation ran in, as a descriptor spells it and as the audit writer spells it
 * in the log directory it names after that directory, with every separator replaced by `-`.
 */
const FOLDS = [...rootFolds(tree.root), [tree.root.replaceAll('/', '-'), '<root>']] as const;

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

/** One evaluation per side for one command; `echo ok` fails inside the analyzer on both sides. */
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
    shipped: evaluationOf(() => shippedEvaluateGuard(call, { dependencies })),
    ported: evaluationOf(() => portedEvaluateGuard(call, { environment, dependencies })),
  };
}

const DENIED = evaluatedRow('rm -rf /');
const ROWS = [
  evaluatedRow('git status'),
  DENIED,
  evaluatedRow('cat ~/.ssh/id_rsa'),
  evaluatedRow('echo ok', true),
];

test('the rows carry one allow and three denials on both sides', () => {
  const kinds = ['allow', 'deny', 'deny', 'deny'] as const;
  expect(ROWS.map((row) => row.ported.decision.kind)).toStrictEqual([...kinds]);
  expect(ROWS.map((row) => row.shipped.decision.kind)).toStrictEqual([...kinds]);
});

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
            expect(projected).toStrictEqual(
              shippedProjectGuardAudit(
                row.call,
                row.shipped,
                auditAllowed,
                includeCommand,
                failure,
              ),
            );
            recordPorted(projected, FOLDS);
          });
        }
      }
    }
  }
});

type Writers = {
  guardAudit: typeof shippedWriteGuardAudit;
  denialAudit: typeof shippedWriteDenialAudit;
};

const SHIPPED: Writers = {
  guardAudit: shippedWriteGuardAudit,
  denialAudit: shippedWriteDenialAudit,
};

const ported = (host: Environment): Writers => ({
  guardAudit: (audit, getSessionId, options) =>
    portedWriteGuardAudit(host, audit, getSessionId, options),
  denialAudit: (denial, getSessionId, options) =>
    portedWriteDenialAudit(host, denial, getSessionId, options),
});

// The descriptors themselves are already pinned equal above, so one side's projection drives both
// writers: what is under test here is only what the writer does with it.
const descriptorOf = (row: (typeof ROWS)[number]) =>
  portedProjectGuardAudit(row.call, row.ported, true, true, row.failure);

const refuseSession = () => {
  throw new Error('session lookup failed');
};

const WRITE_ROWS: readonly { name: string; lines: number; run: (writers: Writers) => void }[] = [
  ...ROWS.map((row) => ({
    name: `guard audit for ${row.command}`,
    lines: 1,
    run: (writers: Writers) =>
      writers.guardAudit(descriptorOf(row), () => SESSION, {
        agent: 'hosts-test',
        shape: 'claude-code',
      }),
  })),
  {
    name: 'preflight denial without a cwd',
    lines: 1,
    run: (writers) =>
      writers.denialAudit(DENIAL, () => SESSION, {
        agent: 'hosts-test',
        toolName: 'Bash',
        cwd: null,
      }),
  },
  {
    name: 'preflight denial under a shape and a cwd',
    lines: 1,
    run: (writers) =>
      writers.denialAudit({ reason: DENIAL.reason }, () => SESSION, {
        agent: 'codex',
        shape: 'claude-code',
        cwd: tree.workspace,
      }),
  },
  {
    name: 'a session lookup that throws',
    lines: 0,
    run: (writers) => {
      writers.guardAudit(descriptorOf(DENIED), refuseSession, { agent: 'hosts-test' });
      writers.denialAudit(DENIAL, refuseSession, { agent: 'hosts-test', cwd: null });
    },
  },
  {
    name: 'a blank or missing session id',
    lines: 0,
    run: (writers) => {
      writers.guardAudit(descriptorOf(DENIED), () => '   ', { agent: 'hosts-test' });
      writers.denialAudit(DENIAL, () => undefined, { agent: 'hosts-test', cwd: null });
    },
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
      const shipped = withEnv({ CC_SAFETY_NET_AUDIT_HOME: auditHome }, () => {
        row.run(SHIPPED);
        const written = readAuditEntries(auditHome);
        clearAuditLogs(auditHome);
        return written;
      });
      const written = withEnv({ CC_SAFETY_NET_AUDIT_HOME: auditHome }, () => {
        row.run(ported(createProcessEnvironment()));
        return readAuditEntries(auditHome);
      });

      expect(shipped.length).toBe(row.lines);
      expect(written).toStrictEqual(shipped);
      recordPorted(written, FOLDS);
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
