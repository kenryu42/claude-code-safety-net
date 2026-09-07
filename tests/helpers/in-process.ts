import { describe, expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { withEnv } from '../helpers';
import { clearAuditLogs, readAuditEntries } from './hook-capture';
import { type HookFixture, hostEnv } from './hook-hosts';
import { auditDirnameFolds, recordPorted, rootFolds } from './temp-home';

/**
 * The harness the four in-process host entries share: one call into a handler, captured whole, and
 * one recorded outcome per row. The run writes into an audit home of its own inside the fixture, so
 * a row never reads another row's tree, and the two flags a row may set are cleared for every other
 * row.
 */

export async function captureInProcessCall<T>(
  fixture: HookFixture,
  env: Record<string, string | undefined>,
  call: () => T | Promise<T>,
) {
  const auditHome = auditHomeFor(fixture);
  clearAuditLogs(auditHome);
  const stderr: string[] = [];
  const spy = spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    stderr.push(parts.map(String).join(' '));
  });
  const scope = {
    ...hostEnv(fixture, auditHome),
    CC_SAFETY_NET_AUDIT_SCOPE: undefined,
    CC_SAFETY_NET_DEBUG: undefined,
    ...env,
  };
  try {
    const returned = await withEnv(scope, call);
    return { returned, thrown: undefined, stderr, entries: readAuditEntries(auditHome) };
  } catch (error) {
    const thrown = error instanceof Error ? error.message : String(error);
    return { returned: undefined, thrown, stderr, entries: readAuditEntries(auditHome) };
  } finally {
    spy.mockRestore();
  }
}

export function auditHomeFor(fixture: HookFixture): string {
  return join(fixture.root, 'audit-ported');
}

/**
 * One test per row: the recorded outcome pins what the row returns, prints and audits, and `check`
 * then pins what that outcome has to be, so a row cannot pass by leaving the handler silent.
 */
export function describeDifferential<Row extends { name: string }, Outcome>(
  title: string,
  rows: readonly Row[],
  run: (row: Row) => Promise<Outcome>,
  check: (row: Row, outcome: Outcome) => void,
  /** The fixture root every path in an outcome sits under, read when the row runs because the
   *  fixtures are rebuilt per test. */
  root: () => string,
): void {
  describe(title, () => {
    for (const row of rows) {
      test(row.name, async () => {
        const outcome = await run(row);

        const fixtureRoot = root();
        recordPorted(outcome, [
          ...rootFolds(fixtureRoot),
          ...auditDirnameFolds(fixtureRoot, '<root>'),
        ]);
        check(row, outcome);
      });
    }
  });
}

/**
 * The port's own contract (I14): a host object that throws reaches the host's deny document
 * instead of escaping the handler.
 */
export function expectFallbackDeny(
  ported: { returned: unknown; stderr: string[]; entries: unknown[] },
  expected: { denial: unknown; failure: string },
): void {
  expect(ported.returned).toStrictEqual(expected.denial);
  expect(ported.stderr[0]).toStartWith('CC Safety Net error:');
  expect(ported.stderr[0]).toContain(expected.failure);
  expect(ported.entries).toStrictEqual([]);
}
