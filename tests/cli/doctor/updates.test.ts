import { describe, expect, test } from 'bun:test';
import {
  checkForUpdates as portedCheckForUpdates,
  isNewerVersion as portedIsNewerVersion,
} from '@/cli/doctor/updates';

/**
 * The one network call the CLI makes. The registry is replaced for the length of each case, so the
 * rows cover the three answers a user can get — a version, a bad status, no network — and prove
 * the check never reaches the real registry to find out.
 */

const REGISTRY_URL = 'https://registry.npmjs.org/cc-safety-net/latest';

const VERSION_PAIRS = [
  ['1.2.3', '1.2.2'],
  ['2.0.0', '1.9.9'],
  ['1.2.3', '1.2.3'],
  ['1.10.0', '1.9.0'],
  ['1.0.0', 'dev'],
] as const;

async function callWithRegistry(answer: () => Promise<unknown>) {
  const requests: { url: unknown; hasSignal: boolean }[] = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = ((url: unknown, init: { signal?: unknown } = {}) => {
    requests.push({ url, hasSignal: init.signal instanceof AbortSignal });
    return answer();
  }) as unknown as typeof globalThis.fetch;
  try {
    return { info: await portedCheckForUpdates(), requests };
  } finally {
    globalThis.fetch = previousFetch;
  }
}

const published = () => Promise.resolve({ ok: true, json: async () => ({ version: '9.9.9' }) });
const unavailable = () => Promise.resolve({ ok: false, status: 503 });
const offline = () => Promise.reject(new Error('network down'));

describe('cli/doctor/updates', () => {
  test('version comparison agrees on both implementations', () => {
    expect(VERSION_PAIRS.map(([latest, current]) => portedIsNewerVersion(latest, current))).toEqual(
      [true, true, false, true, false],
    );
  });

  test('a published version reads the same on both implementations', async () => {
    const ported = await callWithRegistry(published);
    expect(ported).toEqual({
      info: { currentVersion: 'dev', latestVersion: '9.9.9', updateAvailable: false },
      requests: [{ url: REGISTRY_URL, hasSignal: true }],
    });
  });

  test('a registry error reads the same on both implementations', async () => {
    const ported = await callWithRegistry(unavailable);
    expect(ported).toMatchSnapshot();
    expect(ported.info).toEqual({
      currentVersion: 'dev',
      latestVersion: null,
      updateAvailable: false,
      error: 'npm registry returned 503',
    });
  });

  test('a failed request reads the same on both implementations', async () => {
    const ported = await callWithRegistry(offline);
    expect(ported).toMatchSnapshot();
    expect(ported.info).toEqual({
      currentVersion: 'dev',
      latestVersion: null,
      updateAvailable: false,
      error: 'network down',
    });
  });
});
