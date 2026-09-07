import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  buildOpenClawArtifactHeader,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_MANIFEST_FILE,
  OPENCLAW_PLUGIN_PACKAGE_FILE,
} from '@/hosts/openclaw/artifact';
import {
  assertOpenClawPluginDirIsOurs,
  findOpenClawArtifactDir,
  getOpenClawConfigPath,
  getOpenClawInstallCommands,
  getOpenClawPluginDir,
  resolveOpenClawArtifactDir,
  verifyOpenClawPluginRuntime,
} from '@/hosts/openclaw/install';
import { createFakeBin, type FakeScriptEntry } from '../../helpers/fake-bin';
import { describeOutcome, type TreeSpec } from '../../helpers/fixture-tree';
import { differential } from '../../helpers/host-differential';
import {
  createTempRoot,
  describeAsyncOutcome,
  removeTempRoots,
  withProcessEnv,
} from '../../helpers/temp-home';

/**
 * OpenClaw keeps plugin state in its own index, so install is two native commands over a packaged
 * directory. What this side owns is where that directory is (both env overrides expand a leading
 * `~` the way OpenClaw expands it), the guard that keeps `--force` off anything that is not our
 * install, and the runtime check that refuses to call a plugin that never loaded a success.
 */

const PLUGIN_DIR = '.openclaw/extensions/cc-safety-net';
const REFUSAL = `Refusing to modify <home>/${PLUGIN_DIR}: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.`;
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const INSPECT_ARGS = ['plugins', 'inspect', 'cc-safety-net', '--runtime', '--json'];
const INSPECT_HINT = 'Run `openclaw plugins inspect cc-safety-net --runtime` for details.';

/** A packaged install: the built entry under its managed header plus the two metadata files. */
const PACKAGED: TreeSpec = {
  [OPENCLAW_PLUGIN_ENTRY_FILE]: `${buildOpenClawArtifactHeader('dev')}export default {};\n`,
  [OPENCLAW_PLUGIN_MANIFEST_FILE]: '{"id":"cc-safety-net"}\n',
  [OPENCLAW_PLUGIN_PACKAGE_FILE]: '{"name":"cc-safety-net"}\n',
};

const installedPlugin = (overrides: TreeSpec = {}): TreeSpec => ({
  ...Object.fromEntries(
    Object.entries(PACKAGED).map(([name, content]) => [`${PLUGIN_DIR}/${name}`, content]),
  ),
  ...overrides,
});

afterEach(removeTempRoots);

describe('resolving the OpenClaw state directory', () => {
  /** Both overrides, spelled every way OpenClaw's own `resolveUserPath` accepts them: the state
   * directory decides where extensions live, the config path decides where the config is, and a
   * blank state directory defers to the config path's directory before falling back. */
  test.each([
    [undefined, undefined, '<home>/.openclaw/openclaw.json', '<home>/.openclaw/extensions'],
    ['~', undefined, '<home>/openclaw.json', '<home>/extensions'],
    ['~', '~/cfg/openclaw.json', '<home>/cfg/openclaw.json', '<home>/extensions'],
    ['~', '<home>/c/openclaw.json', '<home>/c/openclaw.json', '<home>/extensions'],
    ['~/state', undefined, '<home>/state/openclaw.json', '<home>/state/extensions'],
    ['~/state', '~/cfg/openclaw.json', '<home>/cfg/openclaw.json', '<home>/state/extensions'],
    ['~/state', '<home>/c/openclaw.json', '<home>/c/openclaw.json', '<home>/state/extensions'],
    ['<home>/abs', undefined, '<home>/abs/openclaw.json', '<home>/abs/extensions'],
    ['<home>/abs', '~/cfg/openclaw.json', '<home>/cfg/openclaw.json', '<home>/abs/extensions'],
    ['<home>/abs', '<home>/c/openclaw.json', '<home>/c/openclaw.json', '<home>/abs/extensions'],
    ['  ', undefined, '<home>/.openclaw/openclaw.json', '<home>/.openclaw/extensions'],
    ['  ', '~/cfg/openclaw.json', '<home>/cfg/openclaw.json', '<home>/cfg/extensions'],
    ['  ', '<home>/c/openclaw.json', '<home>/c/openclaw.json', '<home>/c/extensions'],
  ])('reads OPENCLAW_STATE_DIR=%s with OPENCLAW_CONFIG_PATH=%s', async (stateDir, configPath, config, extensions) => {
    const env = {
      ...(stateDir === undefined ? {} : { OPENCLAW_STATE_DIR: stateDir }),
      ...(configPath === undefined ? {} : { OPENCLAW_CONFIG_PATH: configPath }),
    };

    expect(
      (
        await differential({
          seed: {},
          env,
          ported: (environment) => ({
            config: getOpenClawConfigPath(environment),
            plugin: getOpenClawPluginDir(environment),
          }),
        })
      ).outcome,
    ).toEqual({ kind: 'returned', value: { config, plugin: `${extensions}/cc-safety-net` } });
  });
});

describe('guarding the extension directory before a --force command', () => {
  const guard = async (seed: TreeSpec) =>
    (
      await differential({
        seed,
        ported: (environment) => describeOutcome(() => assertOpenClawPluginDirIsOurs(environment)),
      })
    ).outcome;

  test.each([
    ['a home with no install at all', {} as TreeSpec],
    ['our own packaged install', installedPlugin()],
    ['the empty directory an uninstall leaves behind', { [PLUGIN_DIR]: null } as TreeSpec],
  ])('lets a --force command touch %s', async (_case, seed) => {
    expect(await guard(seed)).toEqual({ kind: 'returned', value: { ok: true, value: undefined } });
  });

  test.each([
    ['a file the user put beside ours', installedPlugin({ [`${PLUGIN_DIR}/README.md`]: 'mine' })],
    [
      'an entry file without our header',
      installedPlugin({ [`${PLUGIN_DIR}/${OPENCLAW_PLUGIN_ENTRY_FILE}`]: 'export default {};\n' }),
    ],
    [
      'an entry file that is a symlink',
      installedPlugin({
        [`${PLUGIN_DIR}/${OPENCLAW_PLUGIN_ENTRY_FILE}`]: { symlink: '../../../elsewhere.js' },
      }),
    ],
    [
      'a symlink standing in for the directory',
      { 'elsewhere/keep.txt': 'kept', [PLUGIN_DIR]: { symlink: '../../elsewhere' } } as TreeSpec,
    ],
  ])('refuses to touch %s', async (_case, seed) => {
    expect(await guard(seed)).toEqual({
      kind: 'returned',
      value: { ok: false, error: { name: 'Error', message: REFUSAL } },
    });
  });
});

describe('finding the packaged plugin directory', () => {
  test('agrees on the built directory the installed CLI ships with', () => {
    expect(findOpenClawArtifactDir()).toBe(join(REPO_ROOT, 'dist', 'openclaw', 'cc-safety-net'));
  });

  test('says what is missing when a checkout was never built', () => {
    const candidates = [join(createTempRoot('next-openclaw-unbuilt-'), 'gone')];

    expect(describeOutcome(() => resolveOpenClawArtifactDir(candidates))).toEqual({
      ok: false,
      error: {
        name: 'Error',
        message:
          'Packaged OpenClaw plugin directory not found. Reinstall cc-safety-net and try again.',
      },
    });
  });

  test('drives the same two commands over the packaged directory', () => {
    expect(getOpenClawInstallCommands('/packaged/dir')).toEqual([
      ['openclaw', 'plugins', 'install', '/packaged/dir', '--force'],
      ['openclaw', 'plugins', 'enable', 'cc-safety-net'],
    ]);
  });
});

describe('verifying that the installed plugin actually loads', () => {
  const verify = async (entry: Omit<FakeScriptEntry, 'command' | 'args'>) => {
    const root = createTempRoot('next-openclaw-verify-');
    const runOne = async (name: string, run: () => Promise<void>) => {
      const bin = createFakeBin(join(root, name), [
        { command: 'openclaw', args: INSPECT_ARGS, ...entry },
      ]);
      const outcome = await withProcessEnv(bin.env, () => describeAsyncOutcome(run));
      return { outcome, calls: bin.readLog().map((line) => line.split('\t')[0]) };
    };
    return runOne('ported', verifyOpenClawPluginRuntime);
  };

  test('accepts a loaded plugin however much trace lands on stderr', async () => {
    expect(
      await verify({
        stdout: '{"plugin":{"status":"loaded"}}',
        stderr: 'plugin lifecycle: resolve\nplugin lifecycle: import\n',
      }),
    ).toEqual({
      outcome: { kind: 'returned', value: undefined },
      calls: [`openclaw ${INSPECT_ARGS.join(' ')}`],
    });
  });

  test('reports the status OpenClaw gave a plugin that did not load', async () => {
    expect((await verify({ stdout: '{"plugin":{"status":"error"}}' })).outcome).toEqual({
      kind: 'threw',
      message: `OpenClaw reports the cc-safety-net plugin with status "error". ${INSPECT_HINT}`,
    });
  });

  test('refuses to call a report it cannot read a success', async () => {
    expect((await verify({ stdout: 'nope' })).outcome).toEqual({
      kind: 'threw',
      message: `The cc-safety-net plugin's load state could not be verified: OpenClaw's runtime inspect report was unreadable. ${INSPECT_HINT}`,
    });
  });

  test('passes a failed inspect command through as the command failure', async () => {
    expect((await verify({ stderr: 'no such plugin\n', exit: 1 })).outcome).toEqual({
      kind: 'threw',
      message: `Failed to run openclaw ${INSPECT_ARGS.join(' ')} (exit 1).\nno such plugin`,
    });
  });
});
