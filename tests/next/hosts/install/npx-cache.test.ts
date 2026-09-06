import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { clearNpxSafetyNetCache } from '@next/hosts/install/npx-cache';
import { clearNpxSafetyNetCache as shippedClearNpxSafetyNetCache } from '@/integrations/install/npx-cache';
import { type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
  snapshotHome,
  withProcessEnv,
} from '../../helpers/temp-home';

/**
 * The npx cache sweep decides where to look from `npm_config_cache`, the platform and the home.
 * The shipped code reads the first two off `process.env`; the port reads them off the
 * `Environment`, and both must land on the same directory and delete the same entries there —
 * only the ones that actually hold a `cc-safety-net` install.
 */

/** One npx cache: an entry that is ours, an entry that is someone else's, and an empty one. */
const npxFixture = (cacheDir: string): TreeSpec => ({
  [`${cacheDir}/_npx/a/node_modules/cc-safety-net/package.json`]: '{}',
  [`${cacheDir}/_npx/b/node_modules/other/index.js`]: '',
  [`${cacheDir}/_npx/c`]: null,
});

const CASES: readonly {
  name: string;
  platform?: NodeJS.Platform;
  env: (home: string) => Record<string, string | undefined>;
  fixture: (home: string) => TreeSpec;
  cacheDir: string;
  remaining: string[];
}[] = [
  {
    name: 'sweeps ~/.npm/_npx when npx set no cache path',
    env: () => ({ npm_config_cache: undefined }),
    fixture: () => npxFixture('.npm'),
    cacheDir: '.npm',
    remaining: ['b', 'c'],
  },
  {
    name: 'sweeps the cache npx injected and nothing else',
    env: (home) => ({ npm_config_cache: join(home, 'cache') }),
    fixture: () => ({ ...npxFixture('cache'), ...npxFixture('.npm') }),
    cacheDir: 'cache',
    remaining: ['b', 'c'],
  },
  {
    name: 'falls back to the home when the injected cache path is empty',
    env: () => ({ npm_config_cache: '' }),
    fixture: () => npxFixture('.npm'),
    cacheDir: '.npm',
    remaining: ['b', 'c'],
  },
  {
    name: 'does nothing when no npx cache was ever written',
    env: () => ({ npm_config_cache: undefined }),
    fixture: () => ({ '.npm/_cacache/index': '' }),
    cacheDir: '.npm',
    remaining: [],
  },
  {
    name: 'reads LOCALAPPDATA for the Windows cache root',
    platform: 'win32',
    env: (home) => ({ npm_config_cache: undefined, LOCALAPPDATA: join(home, 'local') }),
    fixture: () => npxFixture('local/npm-cache'),
    cacheDir: 'local/npm-cache',
    remaining: ['b', 'c'],
  },
  {
    name: 'defaults the Windows cache root to AppData/Local under the home',
    platform: 'win32',
    env: () => ({ npm_config_cache: undefined, LOCALAPPDATA: undefined }),
    fixture: () => npxFixture('AppData/Local/npm-cache'),
    cacheDir: 'AppData/Local/npm-cache',
    remaining: ['b', 'c'],
  },
];

const cacheEntries = (home: string, cacheDir: string) => {
  const npxDir = join(home, cacheDir, '_npx');
  return existsSync(npxDir) ? readdirSync(npxDir).sort() : [];
};

afterEach(removeTempRoots);

describe('clearing the npx cache', () => {
  for (const testCase of CASES) {
    test(testCase.name, () => {
      const root = createTempRoot('next-npx-cache-');
      const shippedHome = join(root, 'shipped');
      const portedHome = join(root, 'ported');
      writeTree(shippedHome, testCase.fixture(shippedHome));
      writeTree(portedHome, testCase.fixture(portedHome));

      withProcessEnv(isolationEnv(shippedHome, testCase.env(shippedHome)), () =>
        shippedClearNpxSafetyNetCache(shippedHome, testCase.platform),
      );
      clearNpxSafetyNetCache(
        environmentFor(portedHome, isolationEnv(portedHome, testCase.env(portedHome))),
        testCase.platform,
      );

      const swept = snapshotHome(portedHome);
      expect(swept).toEqual(snapshotHome(shippedHome));
      expect(swept).toMatchSnapshot();
      expect(cacheEntries(shippedHome, testCase.cacheDir)).toEqual(testCase.remaining);
    });
  }

  test('leaves a second cache root alone while sweeping the injected one', () => {
    const root = createTempRoot('next-npx-cache-');
    const home = join(root, 'home');
    writeTree(home, { ...npxFixture('cache'), ...npxFixture('.npm') });
    clearNpxSafetyNetCache(
      environmentFor(home, isolationEnv(home, { npm_config_cache: join(home, 'cache') })),
    );
    expect(cacheEntries(home, 'cache')).toEqual(['b', 'c']);
    expect(cacheEntries(home, '.npm')).toEqual(['a', 'b', 'c']);
  });
});
