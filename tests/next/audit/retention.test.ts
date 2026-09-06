import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneExpiredAuditLogs } from '@next/audit/retention';
import { createTestEnvironment } from '@next/core/environment';
import { pruneExpiredAuditLogs as shippedPrune } from '@/engine/audit-retention';
import { withEnv } from '../../helpers';
import { writeAuditFixture } from '../helpers/audit-fixture';
import { snapshotTree } from '../helpers/fixture-tree';

const NOW_MS = Date.parse('2026-05-17T12:34:56.789Z');
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Everything the default 30-day window takes out of the fixture tree, in sorted order. */
const REMOVED_AT_THIRTY_DAYS = [
  'logs/legacy-expired.jsonl',
  'logs/proj-a',
  'logs/proj-a/2026-03',
  'logs/proj-a/2026-03/2026-03-02-sess.jsonl',
  'logs/proj-b/2026-04/2026-04-16-sess.jsonl',
  'logs/proj-empty-old',
  'logs/proj-empty-old/2026-02',
];

const POLICIES = [
  { name: 'no policy file', content: null, removed: REMOVED_AT_THIRTY_DAYS },
  {
    name: 'a three-day window',
    content: JSON.stringify({ version: 1, audit: { retention_days: 3 } }),
    // Only the day whose end falls between the two cutoffs moves.
    removed: [...REMOVED_AT_THIRTY_DAYS, 'logs/proj-b/2026-04/2026-04-17-sess.jsonl'].sort(),
  },
  { name: 'a malformed policy', content: '{ not json', removed: REMOVED_AT_THIRTY_DAYS },
];

const roots: string[] = [];

function makeRoot(label: string): string {
  const root = mkdtempSync(
    join(
      process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(),
      `cc-safety-net-next-retention-${label}-`,
    ),
  );
  roots.push(root);
  return root;
}

/** An audit root and the user policy the sweep reads its window from, one per implementation. */
function prepare(label: string, policy: string | null) {
  const container = makeRoot(label);
  const tree = join(container, 'tree');
  const configRoot = join(container, 'config');
  mkdirSync(configRoot, { recursive: true });
  if (policy !== null) writeFileSync(join(configRoot, 'policy.json'), policy);
  return { tree, configRoot, logs: writeAuditFixture(tree, NOW_MS) };
}

/** An empty audit root, so the throttle cases decide what lands in it and when. */
function prepareEmpty(label: string) {
  const container = makeRoot(label);
  const configRoot = join(container, 'config');
  const logs = join(container, 'logs');
  mkdirSync(configRoot, { recursive: true });
  mkdirSync(logs, { recursive: true });
  return { configRoot, logs };
}

const at = (ms: number) => () => new Date(ms);

const environmentFor = (configRoot: string) =>
  createTestEnvironment({ env: new Map([['CC_SAFETY_NET_HOME', configRoot]]) });

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('audit retention parity', () => {
  for (const policy of POLICIES) {
    test(`sweeps the same tree under ${policy.name}`, () => {
      const src = prepare('src', policy.content);
      const next = prepare('next', policy.content);
      const before = snapshotTree(next.tree).map((node) => node.path);

      withEnv({ CC_SAFETY_NET_HOME: src.configRoot }, () => shippedPrune(src.logs, at(NOW_MS)));
      pruneExpiredAuditLogs(environmentFor(next.configRoot), next.logs, at(NOW_MS));

      const survivors = snapshotTree(next.tree);
      expect(survivors).toStrictEqual(snapshotTree(src.tree));
      expect(survivors).toMatchSnapshot();
      expect(before.filter((path) => !survivors.some((node) => node.path === path))).toStrictEqual(
        policy.removed,
      );
    });
  }
});

describe('audit retention throttle', () => {
  test('a file that becomes eligible after the marker waits for the next UTC day', () => {
    const srcSide = prepareEmpty('src-throttle');
    const nextSide = prepareEmpty('next-throttle');
    const sweep = (ms: number) => {
      withEnv({ CC_SAFETY_NET_HOME: srcSide.configRoot }, () => shippedPrune(srcSide.logs, at(ms)));
      pruneExpiredAuditLogs(environmentFor(nextSide.configRoot), nextSide.logs, at(ms));
    };
    const expired = 'proj/2026-03/2026-03-02-sess.jsonl';
    const addExpired = (logs: string) => {
      mkdirSync(join(logs, 'proj', '2026-03'), { recursive: true });
      writeFileSync(join(logs, expired), `${JSON.stringify({ ts: '2026-03-02T01:00:00.000Z' })}\n`);
    };

    sweep(NOW_MS);
    const marker = join(nextSide.logs, '.last-prune');
    expect(snapshotTree(nextSide.logs)).toStrictEqual(snapshotTree(srcSide.logs));
    expect(snapshotTree(nextSide.logs)).toStrictEqual([
      { path: '.last-prune', kind: 'file', mode: 0o600, content: '' },
    ]);
    expect(statSync(marker).mtimeMs).toBe(NOW_MS);

    addExpired(srcSide.logs);
    addExpired(nextSide.logs);
    sweep(NOW_MS + HOUR_MS);
    expect(existsSync(join(nextSide.logs, expired))).toBeTrue();
    expect(existsSync(join(srcSide.logs, expired))).toBeTrue();
    expect(statSync(marker).mtimeMs).toBe(NOW_MS);

    sweep(NOW_MS + DAY_MS);
    const swept = snapshotTree(nextSide.logs);
    expect(swept).toStrictEqual(snapshotTree(srcSide.logs));
    expect(swept).toMatchSnapshot();
    expect(existsSync(join(nextSide.logs, expired))).toBeFalse();
    expect(statSync(marker).mtimeMs).toBe(NOW_MS + DAY_MS);
  });

  test('a missing audit root is not created', () => {
    const src = prepare('src-missing', null);
    const next = prepare('next-missing', null);
    const missing = (root: string) => join(root, 'absent-logs');

    withEnv({ CC_SAFETY_NET_HOME: src.configRoot }, () =>
      shippedPrune(missing(src.tree), at(NOW_MS)),
    );
    pruneExpiredAuditLogs(environmentFor(next.configRoot), missing(next.tree), at(NOW_MS));

    expect(existsSync(missing(next.tree))).toBeFalse();
    expect(existsSync(missing(src.tree))).toBeFalse();
  });
});
