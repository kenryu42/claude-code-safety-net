import { afterEach, expect, test } from 'bun:test';
import type { HookDetection } from '@/hosts/detect/context';
import { detect as detectOpenCode } from '@/hosts/opencode/detect';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { detectionRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * OpenCode is configured by a plugin array in whichever of its two config files exists, and it has
 * no disabled state: the plugin is listed or it is not. A file that will not parse is reported
 * rather than skipped silently, because that is the shape a half-written config takes.
 */

const DIR = '.config/opencode';
const JSON_FILE = `${DIR}/opencode.json`;
const JSONC_FILE = `${DIR}/opencode.jsonc`;
const plugins = (...entries: readonly string[]) => JSON.stringify({ plugin: entries });

const detection = detectionRunner({
  ported: (environment) => detectOpenCode({ environment, cwd: environment.home }),
});

const configured = (path: string, errors?: string[]) => ({
  kind: 'returned' as const,
  value: {
    platform: 'opencode',
    status: 'configured',
    method: 'plugin array',
    configPath: `<home>/${path}`,
    errors,
  } satisfies HookDetection,
});

afterEach(removeTempRoots);

test.each([
  ['a plain opencode.json', { [JSON_FILE]: plugins('cc-safety-net') }, JSON_FILE],
  ['a versioned entry', { [JSON_FILE]: plugins('other', 'cc-safety-net@1.2.3') }, JSON_FILE],
  [
    'a commented opencode.jsonc',
    { [JSONC_FILE]: '{\n  // ours\n  "plugin": ["cc-safety-net"]\n}\n' },
    JSONC_FILE,
  ],
])('finds the plugin listed in %s', async (_case, seed, path) => {
  expect(await detection(seed)).toEqual(configured(path));
});

test('reads the first config file before the second', async () => {
  expect(
    await detection({
      [JSON_FILE]: plugins('cc-safety-net'),
      [JSONC_FILE]: plugins('cc-safety-net'),
    }),
  ).toEqual(configured(JSON_FILE));
});

test('carries the parse failure of the first file into the answer the second gives', async () => {
  expect(
    await detection({ [JSON_FILE]: '{ "plugin": [', [JSONC_FILE]: plugins('cc-safety-net') }),
  ).toEqual(
    configured(JSONC_FILE, ['Failed to parse opencode.json: JSON Parse error: Unexpected EOF']),
  );
});

test.each([
  ['nothing is configured', {} as TreeSpec],
  ['the plugin array holds someone else', { [JSON_FILE]: plugins('other') } as TreeSpec],
  ['there is no plugin array at all', { [JSON_FILE]: '{}' } as TreeSpec],
])('reports OpenCode absent when %s', async (_case, seed) => {
  expect(await detection(seed)).toEqual({
    kind: 'returned' as const,
    value: { platform: 'opencode', status: 'n/a', errors: undefined } satisfies HookDetection,
  });
});

test('reports the parse failure when no config names the plugin', async () => {
  expect(await detection({ [JSONC_FILE]: '{ "plugin": [' })).toEqual({
    kind: 'returned' as const,
    value: {
      platform: 'opencode',
      status: 'n/a',
      errors: ['Failed to parse opencode.jsonc: JSON Parse error: Unexpected EOF'],
    } satisfies HookDetection,
  });
});

test('follows XDG_CONFIG_HOME to the config OpenCode would read', async () => {
  expect(
    await detection(
      { 'xdg/opencode/opencode.json': plugins('cc-safety-net') },
      {
        XDG_CONFIG_HOME: '<home>/xdg',
      },
    ),
  ).toEqual(configured('xdg/opencode/opencode.json'));
});
