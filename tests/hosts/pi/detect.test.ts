import { afterEach, expect, test } from 'bun:test';
import type { HookDetection } from '@/hosts/detect/context';
import { detect as detectPi } from '@/hosts/pi/detect';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { detectionRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Pi keeps the installed package and the switched-off extensions in one settings file: an entry is
 * either a bare source string or an object carrying a resource filter, and a `-` prefix inside
 * that filter is how Pi spells "installed but not loaded".
 */

const SETTINGS = '.pi/agent/settings.json';
const SETTINGS_PATH = `<home>/${SETTINGS}`;
const settings = (...packages: readonly unknown[]): TreeSpec => ({
  [SETTINGS]: JSON.stringify({ packages }),
});

const detection = detectionRunner({
  ported: (environment) => detectPi({ environment, cwd: environment.home }),
});

const status = (value: HookDetection) => ({ kind: 'returned' as const, value });

afterEach(removeTempRoots);

test.each([
  ['Pi never wrote its settings', {} as TreeSpec],
  ['the settings hold no package list', { [SETTINGS]: '{}' } as TreeSpec],
  ['the package list is empty', settings()],
  ['another package is installed', settings('npm:other', { source: 'npm:cc-safety-net-fork' })],
])('reports Pi absent when %s', async (_case, seed) => {
  expect(await detection(seed)).toEqual(status({ platform: 'pi', status: 'n/a' }));
});

test.each([
  ['a bare source string with a version', settings('npm:cc-safety-net@1')],
  ['a bare source string without one', settings('npm:cc-safety-net')],
  ['an entry with no resource filter', settings({ source: 'npm:cc-safety-net' })],
  [
    'a filter that keeps the extension',
    settings({ source: 'npm:cc-safety-net', extensions: ['cc-safety-net'] }),
  ],
])('reports the package configured for %s', async (_case, seed) => {
  expect(await detection(seed)).toEqual(
    status({
      platform: 'pi',
      status: 'configured',
      method: 'package config',
      configPath: SETTINGS_PATH,
    }),
  );
});

test('reports a `-`-prefixed resource filter as disabled', async () => {
  expect(
    await detection(settings({ source: 'npm:cc-safety-net', extensions: ['-cc-safety-net'] })),
  ).toEqual(
    status({
      platform: 'pi',
      status: 'disabled',
      method: 'package config',
      configPath: SETTINGS_PATH,
      errors: ['npm:cc-safety-net is installed but its extension is disabled in Pi settings'],
    }),
  );
});

test.each([
  ['a directory sits where the settings belong', null],
  ['the settings are not JSON', '{ packages: '],
])('refuses to guess when %s', async (_case, entry) => {
  expect(await detection({ [SETTINGS]: entry })).toEqual(
    status({ platform: 'pi', status: 'not-inspected' }),
  );
});
