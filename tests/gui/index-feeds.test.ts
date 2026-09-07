import { afterAll, afterEach, describe, expect, spyOn, test } from 'bun:test';
import * as os from 'node:os';
import { join, posix } from 'node:path';
import { DEFAULT_GUI_POLICY } from '@/core/policy/store';
import type { TreeSpec } from '../helpers/fixture-tree';
import { type GuiHookOptions, type GuiRequest, runGuiRow } from '../helpers/gui-differential';
import { json, rulesConfig, v1Rulebook } from '../helpers/rulebook-seeds';
import { createTempRoot, removeTempRoots, withProcessEnv } from '../helpers/temp-home';

/**
 * The read-only feeds the dashboard opens on — activity, rulebooks, star, integrations, health —
 * and the two install routes, driven against the server over a seeded home. Every hook that would
 * spawn `gh`, a dialog, an installer or a browser is injected by the row and records what it was
 * asked for, so a row proves the routing rather than the host it would otherwise touch.
 */

const USER_POLICY_FILE = 'home/.cc-safety-net/policy.json';
const RULE_ID = 'destructive.git-push-force';

const withRetention = (days: number): TreeSpec => ({
  [USER_POLICY_FILE]: json({ ...DEFAULT_GUI_POLICY, audit: { retention_days: days } }),
});

/** Local noon `daysAgo` days back; `second` keeps entries written for one day apart and ordered. */
const at = (daysAgo: number, second: number) => {
  const when = new Date();
  when.setHours(12, 0, second, 0);
  when.setDate(when.getDate() - daysAgo);
  return when.toISOString();
};

type Line = { daysAgo: number; second: number; record: Record<string, unknown> };

const denied = (command: string, extra: Record<string, unknown> = {}) => ({
  command,
  decision: 'deny',
  agent: 'claude-code',
  sessionId: 's1',
  ...extra,
});

const allowed = (command: string) => ({
  command,
  decision: 'allow',
  agent: 'claude-code',
  sessionId: 's1',
});

const jsonl = (lines: readonly Line[], raw: readonly string[] = []) =>
  [
    ...lines.map((line) => JSON.stringify({ ts: at(line.daysAgo, line.second), ...line.record })),
    ...raw,
  ]
    .map((line) => `${line}\n`)
    .join('');

/** The dated layout the writer produces, for today, so the scan has to walk into it. */
const stamp = at(0, 0).slice(0, 10);
const NESTED_TODAY = `home/logs/proj/${stamp.slice(0, 7)}/${stamp}-s2.jsonl`;

const FEED: TreeSpec = {
  ...withRetention(10),
  'home/logs/feed.jsonl': jsonl(
    [
      {
        daysAgo: 0,
        second: 1,
        record: denied('git push --force', { ruleId: RULE_ID, segment: 'git push --force' }),
      },
      { daysAgo: 0, second: 2, record: allowed('ls') },
      { daysAgo: 0, second: 3, record: denied('chmod -R 777 /', { failureStage: 'analysis' }) },
      { daysAgo: 1, second: 4, record: denied('git push --force') },
      { daysAgo: 3, second: 5, record: allowed('ls') },
      { daysAgo: 9, second: 6, record: denied('rm -rf /') },
    ],
    ['{ not json', JSON.stringify({ ts: 1234, command: 'ls', decision: 'allow' })],
  ),
  // The one denial whose signature comes off the segment rather than the whole command line.
  [NESTED_TODAY]: jsonl([
    {
      daysAgo: 0,
      second: 7,
      record: denied('a && FOO=1 docker system prune', { segment: 'docker system prune' }),
    },
  ]),
};

const storm = (denials: number, allowances: number): TreeSpec => ({
  ...withRetention(10),
  'home/logs/feed.jsonl': jsonl([
    ...Array.from({ length: denials }, (_unused, index) => ({
      daysAgo: 0,
      second: index,
      record: denied('git push --force'),
    })),
    ...Array.from({ length: allowances }, (_unused, index) => ({
      daysAgo: 0,
      second: denials + index,
      record: allowed('ls'),
    })),
  ]),
});

type FeedBody = {
  days: number;
  logsDir: string;
  homeDir: string;
  totalInWindow: number;
  truncated: boolean;
  unreadable: number;
  counts: {
    blocked: number;
    allowed: number;
    blockedByDay: number[];
    analyzedByDay: number[];
    rules: Record<string, number>;
    commands: Record<string, number>;
    errors: number;
  };
  entries: { ts: string; command: string }[];
};

type RulesBody = {
  projectPath: string;
  rulebooks: {
    source: string;
    spec: string;
    name: string;
    version: string;
    rules: Record<string, unknown>[];
  }[];
  errors: string[];
  warnings: string[];
};

/** The feed rows read a logs directory of their own, so no row depends on the writer's layout. */
const readsSeededLogs = (side: { home: string }): GuiHookOptions => ({
  activityLogsDir: join(side.home, 'logs'),
});

const activity = async (seed: TreeSpec, requests: readonly GuiRequest[]) =>
  runGuiRow({ seed, options: readsSeededLogs, requests });

const feedOf = (body: unknown) => body as FeedBody;

const rulebookSeed = (scope: 'home/.cc-safety-net' | 'project/.cc-safety-net'): TreeSpec => ({
  [`${scope}/rules/rule.json`]: rulesConfig(['team-rules']),
  [`${scope}/rules/team-rules/rulebook.json`]: v1Rulebook('team-rules'),
});

const readRules = async (seed: TreeSpec) => {
  const row = await runGuiRow({ seed, requests: [{ path: '/api/rules' }] });
  return row.responses[0]?.body as RulesBody;
};

afterEach(removeTempRoots);

describe('the GUI activity feed over HTTP', () => {
  // `os.homedir()` resolves once at process start, so `withProcessEnv` cannot move it. The spy
  // hands the server the home its own requests already run under, which is what a real
  // `cc-safety-net gui` reads.
  const homedirSpy = spyOn(os, 'homedir').mockImplementation(() => process.env.HOME ?? '');
  afterAll(() => {
    homedirSpy.mockRestore();
  });

  test('refuses a window request that carries no valid token', async () => {
    const row = await activity(withRetention(10), [
      { path: '/api/activity?days=3', token: 'none' },
      { path: '/api/activity?days=3', token: 'wrong-query' },
    ]);

    expect(row.responses.map((response) => response.body)).toStrictEqual([
      { error: 'Forbidden' },
      { error: 'Forbidden' },
    ]);
  });

  test('bounds the window by the retention the policy sets', async () => {
    const row = await activity(withRetention(10), [
      { path: '/api/activity' },
      { path: '/api/activity?days=10' },
      { path: '/api/activity?days=11' },
      { path: '/api/activity?days=0' },
      { path: '/api/activity?days=1.5' },
      { path: '/api/activity?days=abc' },
    ]);
    const short = await activity(withRetention(3), [{ path: '/api/activity' }]);

    expect(row.responses.map((response) => response.status)).toStrictEqual([
      200, 200, 400, 400, 400, 400,
    ]);
    expect(feedOf(row.responses[0]?.body).days).toBe(7);
    expect(feedOf(row.responses[1]?.body).days).toBe(10);
    for (const response of row.responses.slice(2)) {
      expect(response.body).toStrictEqual({ error: 'days must be an integer between 1 and 10' });
    }
    // The default window cannot outrun a retention set below it.
    expect(feedOf(short.responses[0]?.body).days).toBe(3);
  });

  test('aggregates the window it was asked for and drops what falls outside it', async () => {
    const row = await activity(FEED, [
      { path: '/api/activity?days=7' },
      { path: '/api/activity?days=10' },
    ]);
    const week = feedOf(row.responses[0]?.body);
    const fortnight = feedOf(row.responses[1]?.body);

    expect(week.logsDir).toBe(posix.join('<root>', 'home/logs'));
    expect(week.homeDir).toBe(posix.join('<root>', 'home'));
    expect(week.entries.map((entry) => entry.ts)).toStrictEqual(
      [...week.entries.map((entry) => entry.ts)].sort().reverse(),
    );
    expect(week.counts.blockedByDay).toHaveLength(7);
    expect(week.counts.analyzedByDay).toHaveLength(7);
    expect(week.counts.blockedByDay.reduce((sum, count) => sum + count, 0)).toBe(
      week.counts.blocked,
    );
    expect(week.counts.commands).toMatchObject({ 'git push': 2, 'docker system': 1 });
    expect(week.counts.rules).toStrictEqual({ [RULE_ID]: 1 });
    expect(week.counts.errors).toBe(1);
    expect(week.unreadable).toBe(2);
    expect(week.counts).toMatchObject({ blocked: 4, allowed: 2 });
    // The ten-day window is the only one that reaches the entry nine days back.
    expect(fortnight.counts).toMatchObject({ blocked: 5, allowed: 2 });
    expect(week.entries.map((entry) => entry.command)).not.toContain('rm -rf /');
    expect(fortnight.entries.map((entry) => entry.command)).toContain('rm -rf /');
  });

  test.each([
    [600, 200, 300, 200],
    [490, 20, 480, 20],
  ])(
    'caps %i denials and %i allows at the entries the client can render',
    async (denials, allowances, keptDenied, keptAllowed) => {
      const row = await activity(storm(denials, allowances), [{ path: '/api/activity?days=7' }]);
      const feed = feedOf(row.responses[0]?.body);
      const denialsKept = feed.entries.filter((entry) => entry.command !== 'ls').length;

      expect(feed.entries).toHaveLength(keptDenied + keptAllowed);
      expect(denialsKept).toBe(keptDenied);
      expect(feed.entries.length - denialsKept).toBe(keptAllowed);
      expect(feed.truncated).toBeTrue();
      // The tiles count the whole window even though the list below them is cut.
      expect(feed.counts).toMatchObject({ blocked: denials, allowed: allowances });
    },
    30_000,
  );
});

describe('the GUI rulebook listing', () => {
  test('lists nothing when no scope configures a rulebook', async () => {
    const body = await readRules({});

    expect(body).toStrictEqual({
      projectPath: posix.join('<root>', 'project'),
      canPickDirectory: expect.any(Boolean),
      rulebooks: [],
      errors: [],
      warnings: [],
    } as unknown as RulesBody);
  });

  test.each([
    ['user', 'home/.cc-safety-net'],
    ['project', 'project/.cc-safety-net'],
  ] as const)('names the scope a %s rulebook came from', async (source, scope) => {
    const body = await readRules(rulebookSeed(scope));

    expect(body.rulebooks).toHaveLength(1);
    expect(body.rulebooks[0]).toMatchObject({ source, spec: 'team-rules', name: 'team-rules' });
    expect(body.rulebooks[0]?.version).toBeString();
    expect(body.rulebooks[0]?.rules[0]).toStrictEqual({
      name: 'team-rules/block-docker-system-prune',
      command: 'docker',
      subcommand: 'system',
      block_args: ['prune'],
      reason: 'Use targeted cleanup instead.',
    });
  });

  test('reports a source with no rulebook file and an override naming no rule', async () => {
    const missing = await readRules({
      'home/.cc-safety-net/rules/rule.json': rulesConfig(['ghost']),
    });
    const stray = await readRules({
      ...rulebookSeed('home/.cc-safety-net'),
      'home/.cc-safety-net/rules/rule.json': rulesConfig(['team-rules'], {
        overrides: { 'team-rules/block-docker-system-prune': 'off', 'team-rules/nope': 'off' },
      }),
    });

    expect(missing.rulebooks).toStrictEqual([]);
    expect(missing.errors.join('\n')).toContain('ghost');
    // A rule an override switched off stays listed; the override that names nothing is a warning.
    expect(stray.rulebooks[0]?.rules).toStrictEqual([]);
    expect(stray.warnings.join('\n')).toContain('team-rules/nope');
  });

  test('reports the platform dialog it could not open rather than opening one', async () => {
    // The route calls the real picker rather than an injected one, so the row runs with no
    // display and a `PATH` holding nothing: on Linux that answers before anything is spawned, and
    // on the other platforms the dialog binary is not found.
    const row = await withProcessEnv(
      { DISPLAY: undefined, WAYLAND_DISPLAY: undefined, PATH: createTempRoot('gui-no-dialog-') },
      () =>
        runGuiRow({
          seed: {},
          requests: [{ method: 'POST', path: '/api/rules/choose-directory' }],
          // Linux answers that no dialog exists; macOS and Windows name the binary they could not
          // start. The record keeps one marker for either.
          folds: [
            [
              /No folder dialog is available on this system|Could not open the folder dialog \([^)]*\)/g,
              '<dialog-error>',
            ],
          ],
        }),
    );

    // Which message depends on the platform, so the row pins that one came back, not which one.
    expect(row.responses[0]?.status).toBe(200);
    expect((row.responses[0]?.body as { error?: unknown }).error).toBeString();
  });

  test('refuses the listing without a token', async () => {
    const row = await runGuiRow({ seed: {}, requests: [{ path: '/api/rules', token: 'none' }] });

    expect(row.responses[0]).toMatchObject({ status: 403, body: { error: 'Forbidden' } });
  });
});

describe('the GUI star, integrations and install endpoints', () => {
  const STAR_CONTEXT = { starred: true, starCount: 1234, blockedTotal: 5 };
  const INTEGRATIONS = {
    targets: [
      { target: 'cursor' as const, label: 'Cursor', version: '1.2.3', status: 'active' as const },
    ],
    system: { version: 'dev', nodeVersion: null, platform: 'linux' },
  };
  const HEALTH = {
    hooks: [{ platform: 'cursor', label: 'Cursor', configured: true }],
    update: { currentVersion: 'dev', latestVersion: '9.9.9', updateAvailable: true },
  };

  test('answers the star context and the star request from the injected hooks', async () => {
    const starred = await runGuiRow({
      seed: {},
      options: () => ({
        fetchStarContext: async () => STAR_CONTEXT,
        starRepo: async () => ({ ok: true }),
      }),
      requests: [
        { path: '/api/star/context' },
        { path: '/api/star/context', token: 'none' },
        { method: 'POST', path: '/api/star' },
        { method: 'POST', path: '/api/star', token: 'query' },
        { method: 'POST', path: '/api/star', token: 'wrong-header' },
      ],
    });
    const refused = await runGuiRow({
      seed: {},
      options: () => ({ starRepo: async () => ({ ok: false }) }),
      requests: [{ method: 'POST', path: '/api/star' }],
    });

    expect(starred.responses[0]?.body).toStrictEqual(STAR_CONTEXT);
    expect(starred.responses[1]?.body).toStrictEqual({ error: 'Forbidden' });
    expect(starred.responses[2]?.body).toStrictEqual({ ok: true });
    // A POST carries the token twice; one place alone is not enough.
    expect(starred.responses.slice(3).map((response) => response.status)).toStrictEqual([403, 403]);
    // The fallback the browser opens itself when `gh` could not star the repo.
    expect(refused.responses[0]?.body).toStrictEqual({
      ok: false,
      fallbackUrl: 'https://github.com/kenryu42/cc-safety-net',
    });
  });

  test('passes the integrations and health probes through untouched', async () => {
    const row = await runGuiRow({
      seed: {},
      options: () => ({
        fetchIntegrations: async () => INTEGRATIONS,
        fetchHealth: async () => HEALTH,
      }),
      requests: [
        { path: '/api/integrations' },
        { path: '/api/health' },
        { path: '/api/integrations', token: 'wrong-query' },
        { path: '/api/health', token: 'wrong-query' },
      ],
    });

    expect(row.responses[0]?.body).toStrictEqual(INTEGRATIONS);
    expect(row.responses[1]?.body).toStrictEqual(HEALTH);
    expect(row.responses.slice(2).map((response) => response.status)).toStrictEqual([403, 403]);
  });

  test('runs an install and an uninstall for the target the body names, and nothing else', async () => {
    const calls: [string, string][] = [];
    const row = await runGuiRow({
      seed: {},
      options: () => ({
        runIntegration: async (action, target) => {
          calls.push([action, target]);
          return { ok: true, output: 'done' };
        },
      }),
      requests: [
        { method: 'POST', path: '/api/install', body: { target: 'nope' } },
        { method: 'POST', path: '/api/install', raw: '{' },
        { method: 'POST', path: '/api/install', body: { target: 'cursor' } },
        { method: 'POST', path: '/api/uninstall', body: { target: 'codex' } },
      ],
    });

    expect(row.responses[0]).toMatchObject({ status: 400, body: { error: 'unknown target' } });
    expect(row.responses[1]?.status).toBe(400);
    expect((row.responses[1]?.body as { errors: string[] }).errors[0]).toStartWith('Invalid JSON:');
    expect(row.responses[2]).toMatchObject({ status: 200, body: { ok: true, output: 'done' } });
    expect(row.responses[3]?.status).toBe(200);
    // The refused bodies never reached the installer.
    expect(calls).toStrictEqual([
      ['install', 'cursor'],
      ['uninstall', 'codex'],
    ]);
  });

  test('answers an unknown route, and a known one reached by the wrong method, with 404', async () => {
    const row = await runGuiRow({
      seed: {},
      requests: [{ path: '/api/nope' }, { path: '/api/policy/project/diff' }],
    });

    expect(row.responses).toStrictEqual([
      {
        status: 404,
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store',
        body: { error: 'Not found' },
      },
      {
        status: 404,
        contentType: 'application/json; charset=utf-8',
        cacheControl: 'no-store',
        body: { error: 'Not found' },
      },
    ]);
  });
});
