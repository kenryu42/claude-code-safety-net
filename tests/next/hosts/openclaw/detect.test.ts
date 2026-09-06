import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { detect as detectOpenClaw, modifiedFileErrors } from '@next/hosts/openclaw/detect';
import { buildOpenClawArtifactHeader } from '@/integrations/openclaw/artifact';
import {
  detect as shippedDetectOpenClaw,
  modifiedFileErrors as shippedModifiedFileErrors,
} from '@/integrations/openclaw/detect';
import { type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import { differential, expectSameSides } from '../../helpers/host-differential';
import { createTempRoot, recordPorted, removeTempRoots, rootFolds } from '../../helpers/temp-home';

/**
 * Doctor reads the extension directory OpenClaw copied the plugin into and the config that decides
 * whether it loads. Both halves report why rather than guessing, so a plugin that is installed but
 * inert reads as disabled with the reason, and one that is not ours at all is never called an
 * install.
 */

const DIR = '.openclaw/extensions/cc-safety-net';
const DIR_PATH = join('<home>', DIR);
const CONFIG = '.openclaw/openclaw.json';
const CONFIG_PATH = join('<home>', CONFIG);
const ENABLE_HINT = 'run `openclaw plugins enable cc-safety-net`';
const OUTDATED = 'Installed OpenClaw plugin is outdated; run install --openclaw to update';

/** What `openclaw plugins install` leaves behind: the stamped entry and its two metadata files. */
const installedAt = (dir: string, version: string): TreeSpec => ({
  [`${dir}/index.js`]: `${buildOpenClawArtifactHeader(version)}export default {};\n`,
  [`${dir}/openclaw.plugin.json`]: '{\n  "id": "cc-safety-net"\n}\n',
  [`${dir}/package.json`]: '{\n  "openclaw": { "extensions": ["./index.js"] }\n}\n',
});

const INSTALLED = installedAt(DIR, 'dev');
const ENABLING = { [CONFIG]: '{"plugins":{"entries":{"cc-safety-net":{"enabled":true}}}}' };

const detection = async (seed: TreeSpec, env?: Record<string, string>) =>
  expectSameSides(
    await differential({
      seed,
      env,
      shipped: (home) => shippedDetectOpenClaw({ homeDir: home, cwd: home }),
      ported: (environment) => detectOpenClaw({ environment, cwd: environment.home }),
    }),
  ).outcome;

const configured = (configPath: string, errors?: string[]) => ({
  kind: 'returned' as const,
  value: {
    platform: 'openclaw' as const,
    status: 'configured' as const,
    method: 'plugin directory',
    configPath,
    errors,
  },
});

afterEach(removeTempRoots);

describe('reading the installed OpenClaw plugin', () => {
  test('finds an enabled install of the running version', async () => {
    expect(await detection({ ...INSTALLED, ...ENABLING })).toEqual(configured(DIR_PATH));
  });

  test('reports an install stamped with another version as outdated', async () => {
    expect(await detection({ ...installedAt(DIR, '1.0.0'), ...ENABLING })).toEqual(
      configured(DIR_PATH, [OUTDATED]),
    );
  });

  test('follows OPENCLAW_CONFIG_PATH to the state directory beside it', async () => {
    const dir = 'elsewhere/extensions/cc-safety-net';

    expect(
      await detection(
        { ...installedAt(dir, 'dev'), 'elsewhere/openclaw.json': ENABLING[CONFIG] },
        { OPENCLAW_CONFIG_PATH: join('<home>', 'elsewhere/openclaw.json') },
      ),
    ).toEqual(configured(join('<home>', dir)));
  });

  test.each([
    ['a home that never installed the plugin', {} as TreeSpec, undefined],
    [
      'a symlink standing in for the extension directory',
      { [DIR]: { symlink: '../../elsewhere' } } as TreeSpec,
      [`${DIR_PATH} is a symlink or not a directory; move or remove it before installing`],
    ],
    [
      'an install whose manifest is gone',
      { [`${DIR}/index.js`]: INSTALLED[`${DIR}/index.js`] } as TreeSpec,
      [
        `openclaw.plugin.json is missing from ${join(DIR_PATH, 'openclaw.plugin.json')}; run install --openclaw`,
        `package.json is missing from ${join(DIR_PATH, 'package.json')}; run install --openclaw`,
      ],
    ],
    [
      'a manifest claiming another plugin',
      { ...INSTALLED, [`${DIR}/openclaw.plugin.json`]: '{"id":"other"}' } as TreeSpec,
      [
        `${join(DIR_PATH, 'openclaw.plugin.json')} is not a valid cc-safety-net manifest; run install --openclaw`,
      ],
    ],
    [
      'a package manifest that points OpenClaw nowhere',
      { ...INSTALLED, [`${DIR}/package.json`]: '{"name":"cc-safety-net"}' } as TreeSpec,
      [
        `${join(DIR_PATH, 'package.json')} does not point OpenClaw at index.js; run install --openclaw`,
      ],
    ],
    [
      'an entry file without our header',
      { ...INSTALLED, [`${DIR}/index.js`]: 'export default {};\n' } as TreeSpec,
      [`Unmanaged index.js occupies ${join(DIR_PATH, 'index.js')}; move or remove it`],
    ],
  ])('refuses to call %s an install', async (_case, seed, errors) => {
    expect(await detection({ ...seed, ...ENABLING })).toEqual({
      kind: 'returned',
      value: { platform: 'openclaw', status: 'n/a', configPath: DIR_PATH, errors },
    });
  });
});

describe('reading whether OpenClaw would load the plugin', () => {
  test.each([
    ['a config that is not there', undefined, `cc-safety-net is not enabled; ${ENABLE_HINT}`],
    [
      'a config it cannot parse',
      '{ not json',
      `Failed to read ${CONFIG_PATH}; fix it, then ${ENABLE_HINT}`,
    ],
    [
      'the global plugin switch turned off',
      '{"plugins":{"enabled":false,"entries":{"cc-safety-net":{"enabled":true}}}}',
      `plugins.enabled is false in ${CONFIG_PATH}; no OpenClaw plugin loads`,
    ],
    [
      'a deny list naming the plugin',
      '{"plugins":{"deny":["cc-safety-net"],"allow":["cc-safety-net"]}}',
      `cc-safety-net is disabled in ${CONFIG_PATH}; ${ENABLE_HINT}`,
    ],
    [
      'a per-plugin entry turned off',
      '{"plugins":{"entries":{"cc-safety-net":{"enabled":false}}}}',
      `cc-safety-net is disabled in ${CONFIG_PATH}; ${ENABLE_HINT}`,
    ],
    [
      'an allow list without the plugin',
      '{"plugins":{"allow":["x"]}}',
      `plugins.allow in ${CONFIG_PATH} does not list cc-safety-net; add it, then ${ENABLE_HINT}`,
    ],
    [
      'a config that mentions no plugin at all',
      '{"plugins":{}}',
      `cc-safety-net is not enabled; ${ENABLE_HINT}`,
    ],
  ])('reports %s as disabled with the reason', async (_case, config, error) => {
    expect(
      await detection({ ...INSTALLED, ...(config === undefined ? {} : { [CONFIG]: config }) }),
    ).toEqual({
      kind: 'returned',
      value: {
        platform: 'openclaw',
        status: 'disabled',
        method: 'plugin directory',
        configPath: DIR_PATH,
        errors: [error],
      },
    });
  });

  test.each([
    ['an allow list naming the plugin', '{"plugins":{"allow":["cc-safety-net"]}}'],
    [
      'comments around the entry that enables it',
      '{\n  // our plugin\n  "plugins": { "entries": { "cc-safety-net": { "enabled": true } } }\n}',
    ],
  ])('reads %s as enabled', async (_case, config) => {
    expect(await detection({ ...INSTALLED, [CONFIG]: config })).toEqual(configured(DIR_PATH));
  });
});

describe('comparing an install against the packaged copy', () => {
  const compare = (installed: TreeSpec, packaged: TreeSpec) => {
    const root = createTempRoot('next-openclaw-packaged-');
    writeTree(root, { ...installed, ...packaged });
    const dirs = [join(root, 'installed'), join(root, 'packaged')] as const;

    const errors = modifiedFileErrors(dirs[0], 'dev', dirs[1]);
    expect(errors).toEqual(shippedModifiedFileErrors(dirs[0], 'dev', dirs[1]));
    recordPorted(errors, rootFolds(root));
    return errors.map((error) => error.replaceAll(root, '<root>'));
  };

  test('names the file an edited install would have to restore', () => {
    expect(
      compare(installedAt('installed', 'dev'), {
        ...installedAt('packaged', 'dev'),
        'packaged/openclaw.plugin.json': '{\n  "id": "cc-safety-net",\n  "version": "dev"\n}\n',
      }),
    ).toEqual([
      `Modified openclaw.plugin.json occupies ${join('<root>', 'installed/openclaw.plugin.json')}; run install --openclaw to restore it`,
    ]);
  });

  test('compares nothing when the packaged copy is from another release', () => {
    expect(compare(installedAt('installed', 'dev'), installedAt('packaged', '2.0.0'))).toEqual([]);
  });
});
