import { afterEach, describe, expect, test } from 'bun:test';
import { detect as detectClaudeCode, hasClaudeInstalledPlugin } from '@/hosts/claude-code/detect';
import type { HookDetection } from '@/hosts/detect/context';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { detectionRunner, differential } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Claude Code is read from the two records it writes itself: `installed_plugins.json` says what is
 * installed and `settings.json` says what is switched on. A record we cannot parse is reported as
 * uninspected rather than guessed at, which is what keeps a half-written file from reading as
 * "not installed" and prompting a reinstall over a working one.
 */

const INSTALLED = '.claude/plugins/installed_plugins.json';
const SETTINGS = '.claude/settings.json';
const INSTALLED_PATH = `<home>/${INSTALLED}`;
const SETTINGS_PATH = `<home>/${SETTINGS}`;
const PLUGIN_ID = 'cc-safety-net@cc-marketplace';
const LEGACY_ID = 'safety-net@cc-marketplace';

const installedPlugins = (...ids: readonly string[]) =>
  JSON.stringify({ plugins: Object.fromEntries(ids.map((id) => [id, [{}]])) });

const OURS = { [INSTALLED]: installedPlugins(PLUGIN_ID) };
const enabledPlugins = (value: boolean) =>
  JSON.stringify({ enabledPlugins: { [PLUGIN_ID]: value } });

const NOT_ENABLED = `${PLUGIN_ID} is installed but not enabled in Claude Code`;

const detection = detectionRunner({
  ported: (environment) => detectClaudeCode({ environment, cwd: environment.home }),
});

const NOT_INSPECTED: HookDetection = { platform: 'claude-code', status: 'not-inspected' };
const ABSENT: HookDetection = { platform: 'claude-code', status: 'n/a' };
const DISABLED: HookDetection = {
  platform: 'claude-code',
  status: 'disabled',
  method: 'plugin config',
  configPath: SETTINGS_PATH,
  errors: [NOT_ENABLED],
};
const CONFIGURED: HookDetection = {
  platform: 'claude-code',
  status: 'configured',
  method: 'plugin config',
  configPath: INSTALLED_PATH,
};

afterEach(removeTempRoots);

describe('reading what Claude Code recorded', () => {
  test.each([
    ['a home Claude Code never wrote to', {}, ABSENT],
    ['a directory where the install record belongs', { [INSTALLED]: null }, NOT_INSPECTED],
    ['an install record that is not JSON', { [INSTALLED]: '{ "plugins":' }, NOT_INSPECTED],
    ['an install record naming someone else', { [INSTALLED]: installedPlugins('other@m') }, ABSENT],
    [
      'an entry with no installed copies',
      { [INSTALLED]: JSON.stringify({ plugins: { [PLUGIN_ID]: [] } }) },
      ABSENT,
    ],
    ['an install with no settings file yet', OURS, DISABLED],
    ['a directory where the settings belong', { ...OURS, [SETTINGS]: null }, NOT_INSPECTED],
    ['settings that are not JSON', { ...OURS, [SETTINGS]: 'nope' }, NOT_INSPECTED],
    [
      'settings that switch the plugin on',
      { ...OURS, [SETTINGS]: enabledPlugins(true) },
      CONFIGURED,
    ],
    [
      'settings that switch the plugin off',
      { ...OURS, [SETTINGS]: enabledPlugins(false) },
      DISABLED,
    ],
    ['settings that never mention the plugin', { ...OURS, [SETTINGS]: '{}' }, DISABLED],
  ] as Array<[string, TreeSpec, HookDetection]>)('reports %s', async (_case, seed, value) => {
    expect(await detection(seed)).toEqual({ kind: 'returned' as const, value });
  });
});

describe('asking whether a specific plugin id is installed', () => {
  const legacyInstalled = async (seed: TreeSpec) =>
    (
      await differential({
        seed,
        ported: (environment) => hasClaudeInstalledPlugin(environment, LEGACY_ID),
      })
    ).outcome;

  test('finds the pre-rename id the install flow cleans up after', async () => {
    expect(await legacyInstalled({ [INSTALLED]: installedPlugins(LEGACY_ID, PLUGIN_ID) })).toEqual({
      kind: 'returned',
      value: true,
    });
  });

  test.each([
    ['only the current id is recorded', OURS],
    ['nothing was ever installed', {} as TreeSpec],
    ['the record cannot be read', { [INSTALLED]: null } as TreeSpec],
  ])('answers no when %s', async (_case, seed) => {
    expect(await legacyInstalled(seed)).toEqual({ kind: 'returned', value: false });
  });
});
