import { afterEach, describe, expect, test } from 'bun:test';
import { buildHermesAgentPluginFiles } from '@/hosts/hermes-agent/artifact';
import { detect as detectHermes, isHermesAgentPluginEnabled } from '@/hosts/hermes-agent/detect';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { differential } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Doctor reports two independent facts about Hermes: whether the artifact on disk is ours and
 * current, and whether Hermes' own `plugins.enabled` list would load it. Both are read without a
 * YAML parser, so every shape the reader accepts is pinned here.
 */

const DIR = '.hermes/plugins/cc-safety-net';
const DIR_PATH = `<home>/${DIR}`;
const CONFIG = '.hermes/config.yaml';
const NOT_ENABLED =
  'cc-safety-net is not enabled in Hermes; run `hermes plugins enable cc-safety-net`';
const OUTDATED = 'Installed Hermes Agent plugin is outdated; run install --hermes-agent to update';
const HEADER = buildHermesAgentPluginFiles('dev')[0]?.content.split('\n')[0];

const managedFiles = (version: string): TreeSpec =>
  Object.fromEntries(
    buildHermesAgentPluginFiles(version).map((file) => [`${DIR}/${file.name}`, file.content]),
  );

/** Config shapes Hermes' own `yaml.safe_dump` can produce, and whether each loads the plugin. */
const CONFIGS: readonly (readonly [string, string | undefined, boolean])[] = [
  ['a block sequence naming the plugin', 'plugins:\n  enabled:\n    - cc-safety-net\n', true],
  ['a quoted sequence entry', 'plugins:\n  enabled:\n    - "cc-safety-net"\n', true],
  [
    'a plugin listed as enabled and disabled at once',
    'plugins:\n  enabled:\n    - cc-safety-net\n  disabled:\n    - cc-safety-net\n',
    false,
  ],
  ['a config with no plugins block', 'model: fast\n', false],
  ['a plugins block the next top-level key ends', 'plugins:\nmodel: fast\n', false],
  ['an enabled list naming someone else', 'plugins:\n  enabled:\n    - other\n', false],
  ['no config file at all', undefined, false],
];

const configSeed = (config: string | undefined): TreeSpec =>
  config === undefined ? {} : { [CONFIG]: config };

const detection = async (seed: TreeSpec) =>
  (
    await differential({
      seed,
      ported: (environment) => detectHermes({ environment, cwd: environment.home }),
    })
  ).outcome;

afterEach(removeTempRoots);

describe('reading whether Hermes would load the plugin', () => {
  test.each(CONFIGS)('reads %s', async (_case, config, enabled) => {
    expect(
      (
        await differential({
          seed: configSeed(config),
          ported: (environment) => isHermesAgentPluginEnabled(environment),
        })
      ).outcome,
    ).toEqual({ kind: 'returned', value: enabled });
  });

  test.each(CONFIGS)('carries %s into the reported status', async (_case, config, enabled) => {
    expect(await detection({ ...managedFiles('dev'), ...configSeed(config) })).toEqual({
      kind: 'returned',
      value: enabled
        ? {
            platform: 'hermes-agent',
            status: 'configured',
            method: 'plugin directory',
            configPath: DIR_PATH,
          }
        : {
            platform: 'hermes-agent',
            status: 'disabled',
            method: 'plugin directory',
            configPath: DIR_PATH,
            errors: [NOT_ENABLED],
          },
    });
  });
});

describe('reading the installed Hermes Agent artifact', () => {
  const ENABLED = { [CONFIG]: 'plugins:\n  enabled:\n    - cc-safety-net\n' };

  test('reports an install stamped with another version as outdated', async () => {
    expect(await detection({ ...ENABLED, ...managedFiles('1.0.0') })).toEqual({
      kind: 'returned',
      value: {
        platform: 'hermes-agent',
        status: 'configured',
        method: 'plugin directory',
        configPath: DIR_PATH,
        errors: [OUTDATED],
      },
    });
  });

  test('reports an outdated install Hermes would not load with both facts', async () => {
    expect(await detection(managedFiles('1.0.0'))).toEqual({
      kind: 'returned',
      value: {
        platform: 'hermes-agent',
        status: 'disabled',
        method: 'plugin directory',
        configPath: DIR_PATH,
        errors: [NOT_ENABLED, OUTDATED],
      },
    });
  });

  test.each([
    ['a home that never installed the plugin', {} as TreeSpec, undefined],
    [
      'a symlink standing in for the plugin directory',
      { [DIR]: { symlink: '../../elsewhere' } } as TreeSpec,
      [`${DIR_PATH} is a symlink or not a directory; move or remove it before installing`],
    ],
    [
      'an install whose manifest is gone',
      { [`${DIR}/__init__.py`]: managedFiles('dev')[`${DIR}/__init__.py`] } as TreeSpec,
      [`plugin.yaml is missing from ${DIR_PATH}/plugin.yaml; run install --hermes-agent`],
    ],
    [
      'a shim someone else wrote',
      { ...managedFiles('dev'), [`${DIR}/__init__.py`]: 'print("mine")\n' } as TreeSpec,
      [`Unmanaged __init__.py occupies ${DIR_PATH}/__init__.py; move or remove it`],
    ],
    [
      'a shim truncated below its own version stamp',
      {
        ...managedFiles('dev'),
        [`${DIR}/__init__.py`]: `${HEADER}\n# version: dev\n`,
      } as TreeSpec,
      [
        `Modified __init__.py occupies ${DIR_PATH}/__init__.py; run install --hermes-agent to restore it`,
      ],
    ],
  ])('refuses to call %s an install', async (_case, seed, errors) => {
    expect(await detection({ ...ENABLED, ...seed })).toEqual({
      kind: 'returned',
      value: { platform: 'hermes-agent', status: 'n/a', configPath: DIR_PATH, errors },
    });
  });
});
