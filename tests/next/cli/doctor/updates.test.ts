import { describe, expect, test } from 'bun:test';
import {
  checkForUpdates as portedCheckForUpdates,
  isNewerVersion as portedIsNewerVersion,
} from '@next/cli/doctor/updates';
import {
  checkForUpdates as shippedCheckForUpdates,
  isNewerVersion as shippedIsNewerVersion,
} from '@/cli/doctor/updates';

/**
 * The one network call the CLI makes. The registry is replaced for the length of each case, so the
 * differential covers the three answers a user can get — a version, a bad status, no network — and
 * proves neither implementation reaches the real registry to find out.
 */

const REGISTRY_URL = 'https://registry.npmjs.org/cc-safety-net/latest';

const VERSION_PAIRS = [
  ['1.2.3', '1.2.2'],
  ['2.0.0', '1.9.9'],
  ['1.2.3', '1.2.3'],
  ['1.10.0', '1.9.0'],
  ['1.0.0', 'dev'],
] as const;

async function callWithRegistry(
  checkForUpdates: typeof shippedCheckForUpdates,
  answer: () => Promise<unknown>,
) {
  const requests: { url: unknown; hasSignal: boolean }[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = ((url: unknown, init: { signal?: unknown } = {}) => {
    requests.push({ url, hasSignal: init.signal instanceof AbortSignal });
    return answer();
  }) as unknown as typeof globalThis.fetch;
  try {
    return { info: await checkForUpdates(), requests };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

const published = () => Promise.resolve({ ok: true, json: async () => ({ version: '9.9.9' }) });
const unavailable = () => Promise.resolve({ ok: false, status: 503 });
const offline = () => Promise.reject(new Error('network down'));

describe('cli/doctor/updates', () => {
  test('version comparison agrees on both implementations', () => {
    const compare = (isNewerVersion: typeof shippedIsNewerVersion) =>
      VERSION_PAIRS.map(([latest, current]) => isNewerVersion(latest, current));
    expect(compare(portedIsNewerVersion)).toEqual(compare(shippedIsNewerVersion));
    expect(compare(portedIsNewerVersion)).toEqual([true, true, false, true, false]);
  });

  test('a published version reads the same on both implementations', async () => {
    const ported = await callWithRegistry(portedCheckForUpdates, published);
    expect(ported).toEqual(await callWithRegistry(shippedCheckForUpdates, published));
    expect(ported).toEqual({
      info: { currentVersion: 'dev', latestVersion: '9.9.9', updateAvailable: false },
      requests: [{ url: REGISTRY_URL, hasSignal: true }],
    });
  });

  test('a registry error reads the same on both implementations', async () => {
    const ported = await callWithRegistry(portedCheckForUpdates, unavailable);
    expect(ported).toEqual(await callWithRegistry(shippedCheckForUpdates, unavailable));
    expect(ported).toMatchSnapshot();
    expect(ported.info).toEqual({
      currentVersion: 'dev',
      latestVersion: null,
      updateAvailable: false,
      error: 'npm registry returned 503',
    });
  });

  test('a failed request reads the same on both implementations', async () => {
    const ported = await callWithRegistry(portedCheckForUpdates, offline);
    expect(ported).toEqual(await callWithRegistry(shippedCheckForUpdates, offline));
    expect(ported).toMatchSnapshot();
    expect(ported.info).toEqual({
      currentVersion: 'dev',
      latestVersion: null,
      updateAvailable: false,
      error: 'network down',
    });
  });
});
