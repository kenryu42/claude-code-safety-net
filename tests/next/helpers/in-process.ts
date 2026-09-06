import { describe, expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import { withEnv } from '../../helpers';
import { clearAuditLogs, readAuditEntries } from './hook-capture';
import { type HookFixture, hostEnv } from './hook-hosts';
import { recordPorted, rootFolds } from './temp-home';

/**
 * The harness the four in-process host entries share: one call into a handler, captured whole, and
 * one differential per row. Each side writes into an audit home of its own inside the fixture, so
 * the shipped and the ported run of a row never read each other's tree, and the two flags a row
 * may set are cleared for every other row.
 */

export type Side = 'shipped' | 'ported';

export async function captureInProcessCall<T>(
  fixture: HookFixture,
  side: Side,
  env: Record<string, string | undefined>,
  call: () => T | Promise<T>,
) {
  const auditHome = auditHomeFor(fixture, side);
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

export function auditHomeFor(fixture: HookFixture, side: Side): string {
  return join(fixture.root, `audit-${side}`);
}

/**
 * One test per row: the shipped and the ported side must return, print and audit the same thing,
 * and `check` then pins what that agreed outcome has to be, so a row cannot pass by leaving both
 * implementations silent.
 */
export function describeDifferential<Row extends { name: string }, Outcome>(
  title: string,
  rows: readonly Row[],
  run: (row: Row, side: Side) => Promise<Outcome>,
  check: (row: Row, agreed: Outcome) => void,
  /** The fixture root every path in an outcome sits under, read when the row runs because the
   *  fixtures are rebuilt per test. */
  root: () => string,
): void {
  describe(title, () => {
    for (const row of rows) {
      test(row.name, async () => {
        const shipped = await run(row, 'shipped');
        const ported = await run(row, 'ported');

        expect(ported).toStrictEqual(shipped);
        const fixtureRoot = root();
        // The audit writer names a project's log file after the directory the call ran in, with
        // every separator spelled `-`, which neither path fold reaches.
        recordPorted(ported, [
          ...rootFolds(fixtureRoot),
          [fixtureRoot.replaceAll('/', '-'), '<root>'],
        ]);
        check(row, shipped);
      });
    }
  });
}

/**
 * The port's own contract (I14): a host object that throws reaches the host's deny document
 * instead of escaping the handler, where the shipped side lets the throw through.
 */
export function expectFallbackDeny(
  ported: { returned: unknown; stderr: string[]; entries: unknown[] },
  shipped: { thrown: string | undefined },
  expected: { denial: unknown; failure: string },
): void {
  expect(ported.returned).toStrictEqual(expected.denial);
  expect(ported.stderr[0]).toStartWith('CC Safety Net error:');
  expect(ported.stderr[0]).toContain(expected.failure);
  expect(ported.entries).toStrictEqual([]);
  expect(shipped.thrown).toBe(expected.failure);
}
