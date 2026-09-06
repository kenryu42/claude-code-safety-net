import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getActivityFeed as portedFeed } from '@/gui/activity';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * The feed the dashboard renders from: one window over the audit tree, the aggregates the tiles
 * count in full, and a capped entry list that has to keep both decision classes visible. The feed
 * reads its home off the `Environment` it is handed, so each row seeds one log tree and records the
 * answer with that tree's paths folded out.
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

/** The feed over one seeded tree, with the home and the log directory it read folded out. */
const feedOverBothSides = (
  entries: readonly Seeded[],
  rawLines: readonly string[],
  days: number,
) => {
  const home = createTempRoot('gui-activity-ported-');
  seedFeed(join(home, 'logs'), entries, rawLines);
  // `homeDir` is the home the feed's `Environment` carries, so it folds out with the tree.
  const ported = normalize(
    portedFeed(environmentFor(home, isolationEnv(home)), days, join(home, 'logs')),
    [
      [join(home, 'logs'), '<logs>'],
      [home, '<home>'],
    ],
  );
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
