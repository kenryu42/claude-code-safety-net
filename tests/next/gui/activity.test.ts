import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getActivityFeed as portedFeed } from '@next/gui/activity';
import { getActivityFeed as shippedFeed } from '@/gui/activity';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * The feed the dashboard renders from: one window over the audit tree, the aggregates the tiles
 * count in full, and a capped entry list that has to keep both decision classes visible. The
 * shipped helper reads the home from the process and the ported one from the `Environment`, so each
 * row seeds two identical log trees and compares the two answers with each side's own paths folded
 * out.
 */

type Seeded = { daysAgo: number; second: number; record: Record<string, unknown> };

const noon = (daysAgo: number, second: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(12, 0, second, 0);
  return date.toISOString();
};

const seedFeed = (logsDir: string, entries: readonly Seeded[], rawLines: readonly string[]) => {
  mkdirSync(logsDir, { recursive: true });
  const lines = entries.map((entry) =>
    JSON.stringify({ ts: noon(entry.daysAgo, entry.second), ...entry.record }),
  );
  writeFileSync(join(logsDir, 'feed.jsonl'), [...lines, ...rawLines].map((l) => `${l}\n`).join(''));
};

const deny = (second: number, record: Record<string, unknown> = {}): Seeded => ({
  daysAgo: 0,
  second,
  record: { command: 'git push --force', decision: 'deny', agent: 'claude-code', ...record },
});

const allow = (second: number, record: Record<string, unknown> = {}): Seeded => ({
  daysAgo: 0,
  second,
  record: { command: 'ls', decision: 'allow', agent: 'claude-code', ...record },
});

/** Both implementations over the same tree, compared with each side's own home and logs folded out. */
const feedOverBothSides = (
  entries: readonly Seeded[],
  rawLines: readonly string[],
  days: number,
) => {
  const homes = (['shipped', 'ported'] as const).map((side) => {
    const home = createTempRoot(`gui-activity-${side}-`);
    seedFeed(join(home, 'logs'), entries, rawLines);
    return home;
  });
  const [shippedHome, portedHome] = homes as [string, string];
  // `homeDir` is the one field the port moves: the shipped feed reports the process home the way
  // `homedir()` resolves it, the ported one the home its `Environment` carries.
  const folded = <T>(feed: T, logs: string, home: string) =>
    normalize(feed, [
      [logs, '<logs>'],
      [home, '<home>'],
    ]);

  const ported = folded(
    portedFeed(
      environmentFor(portedHome, isolationEnv(portedHome)),
      days,
      join(portedHome, 'logs'),
    ),
    join(portedHome, 'logs'),
    portedHome,
  );
  const shipped = withProcessEnv(isolationEnv(shippedHome), () =>
    folded(shippedFeed(days, join(shippedHome, 'logs')), join(shippedHome, 'logs'), homedir()),
  );
  expect(ported).toStrictEqual(shipped);
  recordPorted(ported);
  return ported;
};

const denials = (count: number, from: number) =>
  Array.from({ length: count }, (_unused, index) => deny(from + index));

const allowances = (count: number, from: number) =>
  Array.from({ length: count }, (_unused, index) => allow(from + index));

const decisionsOf = (feed: { entries: readonly { decision?: string }[] }) => {
  const denied = feed.entries.filter((entry) => entry.decision !== 'allow').length;
  return { denied, allowed: feed.entries.length - denied };
};

describe('the GUI activity feed', () => {
  afterEach(removeTempRoots);

  test('drops the records it cannot read and counts them', () => {
    const feed = feedOverBothSides(
      [
        deny(1, { ruleId: 'destructive.git-push-force', segment: 'git push --force' }),
        allow(2),
        deny(3, { failureStage: 'analysis' }),
      ],
      ['{ not json', JSON.stringify({ ts: 1234, command: 'ls', decision: 'allow' })],
      7,
    );

    expect(feed.unreadable).toBe(2);
    expect(feed.entries).toHaveLength(3);
    expect(feed.entries.map((entry) => entry.command)).toEqual([
      'git push --force',
      'ls',
      'git push --force',
    ]);
    expect(feed.counts.blocked).toBe(2);
    expect(feed.counts.errors).toBe(1);
    expect(feed.counts.commands).toEqual({ 'git push': 2 });
    expect(feed.homeDir).toBe('<home>');
    expect(feed.logsDir).toBe('<logs>');
  });

  test.each([
    ['a denial storm still shows every allow', 600, 200, 300, 200, true],
    ['a denial storm just under the cap keeps its allows', 490, 20, 480, 20, true],
    ['a quiet class lends the rest of the cap away', 10, 490, 10, 490, false],
    ['a window under the cap is shown whole', 30, 30, 30, 30, false],
  ])('caps the entry list so %s', (_label, denied, allowed, keptDenied, keptAllowed, truncated) => {
    const feed = feedOverBothSides([...denials(denied, 0), ...allowances(allowed, denied)], [], 7);

    expect(feed.entries).toHaveLength(keptDenied + keptAllowed);
    expect(decisionsOf(feed)).toEqual({ denied: keptDenied, allowed: keptAllowed });
    expect(feed.truncated).toBe(truncated);
    expect(feed.counts.blocked).toBe(denied);
    expect(feed.counts.allowed).toBe(allowed);
    expect(feed.totalInWindow).toBe(denied + allowed);
    // Newest first, so the list the client renders opens on what just happened.
    const timestamps = feed.entries.map((entry) => entry.ts);
    expect(timestamps).toEqual([...timestamps].sort().reverse());
  });

  test('buckets whole local days and drops what falls outside the window', () => {
    const feed = feedOverBothSides(
      [deny(1), allow(2), { ...deny(3), daysAgo: 1 }, { ...deny(4), daysAgo: 4 }],
      [],
      3,
    );

    expect(feed.days).toBe(3);
    expect(feed.counts.blockedByDay).toHaveLength(3);
    expect(feed.counts.blockedByDay.reduce((sum, count) => sum + count, 0)).toBe(
      feed.counts.blocked,
    );
    expect(feed.counts.blockedByDay).toEqual([0, 1, 1]);
    expect(feed.counts.analyzedByDay).toEqual([0, 1, 2]);
    expect(feed.totalInWindow).toBe(3);
  });
});
