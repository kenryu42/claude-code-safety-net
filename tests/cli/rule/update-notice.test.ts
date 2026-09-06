import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { RULE_DOC } from '@/cli/rule/doc';
import { runRuleCommand as portedRuleCommand } from '@/cli/rule/index';
import { getUpdateNotice as portedGetUpdateNotice } from '@/cli/rule/update-notice';
import * as portedSystemInfo from '@/hosts/system-info';
import { captureConsole } from '../../helpers/console-capture';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { runManagerDifferential } from '../../helpers/rules-manager-differential';
import { environmentFor, removeTempRoots } from '../../helpers/temp-home';

/**
 * The notice `rule doc` appends. Every row fixes `now`, pins the running version through the
 * package-version export the notice reads, and answers the registry from a recorder, so what is
 * recorded is the decision itself: whether the poll happened, what the cache kept and
 * whether the user is told. Under `bun test` the real version is `dev`, which `isNewerVersion`
 * refuses outright, so without the spy no row could reach a notice at all.
 */

const NOW = 1_700_000_000_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RUNNING = [1, 0, 0].join('.');
const LATEST = [2, 0, 0].join('.');
const REGISTRY_URL = 'https://registry.npmjs.org/cc-safety-net/latest';
const AUDIT_DIR = 'home/.cc-safety-net/audit/.cc-safety-net';
const CACHE_FILE = `${AUDIT_DIR}/update-check.json`;
const NOTICE = `UPDATE_AVAILABLE: cc-safety-net v${LATEST} is available (running v${RUNNING}). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`;

const realFetch = globalThis.fetch;

const served = (version: string) => () =>
  Promise.resolve(new Response(JSON.stringify({ version }), { status: 200 }));

afterEach(() => {
  globalThis.fetch = realFetch;
  removeTempRoots();
});

type Row = {
  name: string;
  cache?: string;
  extra?: TreeSpec;
  values?: Record<string, string | undefined>;
  reply?: () => Promise<Response>;
  notice: string | null;
  urls: string[];
  written: string | undefined;
};

const rows: Row[] = [
  {
    name: 'the first run polls the registry, records the answer and tells the user once',
    notice: NOTICE,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW}}`,
  },
  {
    name: 'an hour after a notice the check neither polls nor repeats itself',
    cache: `{"lastCheck":${NOW - HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW - HOUR_MS}}`,
    notice: null,
    urls: [],
    written: `{"lastCheck":${NOW - HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW - HOUR_MS}}`,
  },
  {
    name: 'six days after a notice the same version is still not raised again',
    cache: `{"lastCheck":${NOW - HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW - 6 * DAY_MS}}`,
    notice: null,
    urls: [],
    written: `{"lastCheck":${NOW - HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW - 6 * DAY_MS}}`,
  },
  {
    name: 'a week after the last notice the user is told again without a new poll',
    cache: `{"lastCheck":${NOW - HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW - 8 * DAY_MS}}`,
    notice: NOTICE,
    urls: [],
    written: `{"lastCheck":${NOW - HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW}}`,
  },
  {
    name: 'a check an hour short of a day is still fresh enough to skip the poll',
    cache: `{"lastCheck":${NOW - 23 * HOUR_MS},"latestVersion":"${LATEST}"}`,
    notice: NOTICE,
    urls: [],
    written: `{"lastCheck":${NOW - 23 * HOUR_MS},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW}}`,
  },
  {
    name: 'a check older than a day polls again',
    cache: `{"lastCheck":${NOW - 25 * HOUR_MS},"latestVersion":"${LATEST}"}`,
    notice: NOTICE,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW}}`,
  },
  {
    name: 'a cache that is not JSON heals into a fresh poll',
    cache: 'not json',
    notice: NOTICE,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW}}`,
  },
  {
    name: 'timestamps from the future and beyond the number line are dropped, not obeyed',
    cache: `{"lastCheck":${NOW + 1},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":1e999}`,
    notice: NOTICE,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW},"latestVersion":"${LATEST}","notifiedVersion":"${LATEST}","notifiedAt":${NOW}}`,
  },
  {
    name: 'a cache location that cannot be created stays silent rather than notifying every run',
    extra: { [AUDIT_DIR]: 'a regular file where the cache directory belongs' },
    notice: null,
    urls: [REGISTRY_URL],
    written: undefined,
  },
  {
    name: 'the opt-out variable skips the poll entirely',
    values: { CC_SAFETY_NET_NO_UPDATE_CHECK: '1' },
    notice: null,
    urls: [],
    written: undefined,
  },
  {
    name: 'no place to cache means no poll',
    values: { CC_SAFETY_NET_AUDIT_HOME: undefined, NODE_ENV: 'test' },
    notice: null,
    urls: [],
    written: undefined,
  },
  {
    name: 'a registry that refuses the connection is recorded as checked and reported as nothing',
    reply: () => Promise.reject(new Error('connect ECONNREFUSED')),
    notice: null,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW}}`,
  },
  {
    name: 'a registry error is recorded as checked and reported as nothing',
    reply: () => Promise.resolve(new Response('', { status: 500 })),
    notice: null,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW}}`,
  },
  {
    name: 'the published version equal to the running one is not an update',
    reply: served(RUNNING),
    notice: null,
    urls: [REGISTRY_URL],
    written: `{"lastCheck":${NOW},"latestVersion":"${RUNNING}"}`,
  },
];

describe('the update notice both implementations decide on', () => {
  for (const row of rows) {
    test(row.name, async () => {
      const spies = [spyOn(portedSystemInfo, 'getPackageVersion').mockReturnValue(RUNNING)];
      try {
        const agreed = await runManagerDifferential(
          { ...(row.cache === undefined ? {} : { [CACHE_FILE]: row.cache }), ...row.extra },
          async (side) => {
            const urls: string[] = [];
            globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
              urls.push(String(input));
              return (row.reply ?? served(LATEST))();
            }) as typeof fetch;
            // A row that moves a variable needs the run to read the moved value, so the
            // environment is rebuilt here rather than taken as the harness handed it over.
            // The suite sets the opt-out globally to keep the real registry out of every other
            // test, and clearing it is what puts this one back on the path being compared.
            const values = {
              CC_SAFETY_NET_NO_UPDATE_CHECK: undefined,
              ...side.values,
              ...row.values,
            };
            return {
              notice: await portedGetUpdateNotice(environmentFor(side.home, values), NOW),
              urls,
            };
          },
        );
        expect(agreed.results).toStrictEqual({ notice: row.notice, urls: row.urls });
        expect(agreed.tree.find((entry) => entry.path === CACHE_FILE)?.content).toBe(row.written);
      } finally {
        for (const spy of spies) spy.mockRestore();
      }
    });
  }
});

/**
 * The one command that prints the notice. `rule doc` writes the guide to stdout and the notice to
 * stderr, and the split is the contract: a notice on stdout would land in whatever file an agent
 * redirects the guide into.
 */
describe('rule doc appends the notice to the guide', () => {
  for (const optedOut of [false, true]) {
    test(
      optedOut ? 'the opt-out leaves the guide alone' : 'the guide is followed by the notice',
      async () => {
        const spies = [
          spyOn(portedSystemInfo, 'getPackageVersion').mockReturnValue(RUNNING),
          // `rule doc` asks for the notice without a `now`, so without a fixed clock the run
          // would stamp its cache at whatever the wall clock said.
          spyOn(Date, 'now').mockReturnValue(NOW),
        ];
        try {
          const agreed = await runManagerDifferential({}, async (side) => {
            globalThis.fetch = ((input: Parameters<typeof fetch>[0]) => {
              expect(String(input)).toBe(REGISTRY_URL);
              return served(LATEST)();
            }) as typeof fetch;
            const values = {
              CC_SAFETY_NET_NO_UPDATE_CHECK: optedOut ? '1' : undefined,
              ...side.values,
            };
            return captureConsole(() =>
              portedRuleCommand(environmentFor(side.home, values), ['doc']),
            );
          });
          expect(agreed.results.returned).toBe(0);
          expect(agreed.results.log).toEqual([RULE_DOC]);
          expect(agreed.results.error).toEqual(optedOut ? [] : [NOTICE]);
        } finally {
          for (const spy of spies) spy.mockRestore();
        }
      },
    );
  }
});
