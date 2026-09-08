import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  fetchStarContext as portedStarContext,
  starRepo as portedStarRepo,
  userHasStarredRepo as portedUserHasStarred,
} from '@/gui/index';
import { createFakeBin, type FakeScriptEntry } from '../helpers/fake-bin';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * The star strip: what `gh` is asked, what each exit means, and the context the dashboard opens
 * with. Every `gh` call goes to a scripted fake named by absolute path, so `PATH` stays untouched
 * and no row can reach a real `gh`, and the star count always comes from a stubbed fetch rather
 * than from api.github.com.
 */

const STARRED_PATH = '/user/starred/kenryu42/cc-safety-net';

type StarHelpers = {
  userHasStarredRepo: typeof portedUserHasStarred;
  starRepo: typeof portedStarRepo;
};

/**
 * The helpers over a scripted `gh`: `runGhCommand` spawns with the process environment, so the
 * fake's script and log are handed to it that way. The command itself is an absolute path into the
 * fake bin, so `PATH` is never touched.
 */
const bothSides = async <T>(
  script: readonly FakeScriptEntry[],
  run: (side: { helpers: StarHelpers; command: string; root: string }) => Promise<T>,
  env: (root: string) => Record<string, string | undefined> = () => ({}),
) => {
  const root = createTempRoot('gui-star-ported-');
  const fake = createFakeBin(root, script);
  const result = await withProcessEnv(
    {
      ...env(root),
      CC_SAFETY_NET_FAKE_LOG: fake.env.CC_SAFETY_NET_FAKE_LOG,
      CC_SAFETY_NET_FAKE_SCRIPT: fake.env.CC_SAFETY_NET_FAKE_SCRIPT,
    },
    async () =>
      run({
        helpers: { userHasStarredRepo: portedUserHasStarred, starRepo: portedStarRepo },
        command: join(fake.binDir, 'gh'),
        root,
      }),
  );
  // The working directory each call ran in is the suite's own, so only the argv is comparable.
  return { result, calls: fake.readLog().map((line) => line.split('\t')[0]) };
};

const gh = (args: string[], exit: number, extra: Partial<FakeScriptEntry> = {}): FakeScriptEntry =>
  ({ command: 'gh', args, exit, ...extra }) as FakeScriptEntry;

const AUTH_OK = gh(['auth'], 0);

describe('the GUI star helpers', () => {
  afterEach(removeTempRoots);

  test('stops at a failed gh auth and reports the state as unknown', async () => {
    const row = await bothSides([gh(['auth'], 1)], (side) =>
      side.helpers.userHasStarredRepo(side.command),
    );

    expect(row.result).toBeNull();
    // The starred probe is never reached, so an unauthenticated `gh` costs one call.
    expect(row.calls).toStrictEqual(['gh auth status']);
  });

  test.each([
    ['a starred repo', 0, true],
    ['an unstarred repo', 1, false],
  ] as const)('maps the exit of the starred probe for %s', async (_label, exit, expected) => {
    const row = await bothSides([AUTH_OK, gh(['api'], exit)], (side) =>
      side.helpers.userHasStarredRepo(side.command),
    );

    expect(row.result).toBe(expected);
    expect(row.calls).toStrictEqual(['gh auth status', `gh api ${STARRED_PATH}`]);
  });

  test('reports an unknown state and a failed star when gh is not on the machine', async () => {
    const missing = await bothSides([], (side) =>
      side.helpers.userHasStarredRepo(join(side.root, 'missing', 'gh')),
    );
    const star = await bothSides([], (side) =>
      side.helpers.starRepo(join(side.root, 'missing', 'gh')),
    );

    expect(missing.result).toBeNull();
    expect(star.result).toStrictEqual({ ok: false });
    expect([missing.calls, star.calls]).toStrictEqual([[], []]);
  });

  test('gives up on a gh that never answers', async () => {
    const row = await bothSides([gh(['auth'], 0, { delayMs: 2000 })], async (side) => {
      const started = Date.now();
      const result = await side.helpers.userHasStarredRepo(side.command, 100);
      // The timeout kills the child rather than waiting the two seconds out.
      expect(Date.now() - started).toBeLessThan(1000);
      return result;
    });

    expect(row.result).toBeNull();
  });

  test('stars the repository with a fixed argv', async () => {
    const row = await bothSides([gh(['api', '-X', 'PUT', STARRED_PATH], 0)], (side) =>
      side.helpers.starRepo(side.command),
    );

    expect(row.result).toStrictEqual({ ok: true });
    expect(row.calls).toStrictEqual([`gh api -X PUT ${STARRED_PATH}`]);
  });
});

describe('the GUI star context', () => {
  afterEach(removeTempRoots);

  const anHourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const seedLogs = (home: string) => {
    const logsDir = join(home, 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(logsDir, 'feed.jsonl'),
      [
        { command: 'rm -rf /', decision: 'deny', sessionId: 's1' },
        { command: 'git push --force', decision: 'deny', sessionId: 's1' },
        { command: 'ls', decision: 'allow', sessionId: 's1' },
      ]
        .map((record) => `${JSON.stringify({ ts: anHourAgo(), ...record })}\n`)
        .join(''),
    );
    return logsDir;
  };

  const contextOver = async (fetchRepo: typeof fetch) => {
    const row = await bothSides(
      [gh(['auth'], 1)],
      async (side) => {
        const home = join(side.root, 'home');
        const values = isolationEnv(home);
        return portedStarContext(environmentFor(home, values), {
          command: side.command,
          logsDir: seedLogs(home),
          fetchRepo,
        });
      },
      (root) => isolationEnv(join(root, 'home')),
    );
    return row.result;
  };

  const respondsWith = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  test('reads the star count, the star state and the retained blocked total together', async () => {
    const context = await contextOver(respondsWith({ stargazers_count: 42 }));

    // `gh` cannot say, the count can, and the total comes off the seeded audit trail.
    expect(context).toStrictEqual({ starred: null, starCount: 42, blockedTotal: 2 });
  });

  test.each([
    ['a refused request', respondsWith({ stargazers_count: 42 }, 500)],
    ['a count that is not a number', respondsWith({ stargazers_count: 'many' })],
    [
      'a request that never lands',
      (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    ],
  ])('degrades the star count on %s without losing the rest', async (_label, fetchRepo) => {
    expect(await contextOver(fetchRepo)).toStrictEqual({
      starred: null,
      starCount: null,
      blockedTotal: 2,
    });
  });
});
