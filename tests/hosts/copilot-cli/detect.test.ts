import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { detect as detectCopilot } from '@/hosts/copilot-cli/detect';
import type { HookDetection } from '@/hosts/detect/context';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { detectionRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Copilot reads hooks from four kinds of place, and which of them its binary understands depends
 * on the version the caller probed: user hook files landed in 0.0.422 and inline definitions in
 * 1.0.8, so the same tree is configured, ignored-with-a-reason, or unknown-with-a-reason depending
 * on that one string. Every row below is that product.
 */

const REPO_HOOK = 'repo/.github/hooks/a.json';
const USER_HOOK = '.copilot/hooks/b.json';
const REPO_SETTINGS = 'repo/.github/copilot/settings.json';
const USER_SETTINGS = '.copilot/settings.json';
const USER_CONFIG = '.copilot/config.json';
const PLUGIN = '.copilot/installed-plugins/cc-marketplace/cc-safety-net/plugin.json';
const USER_HOOK_DIR = '<home>/.copilot/hooks';
const PLUGIN_DIR = '<home>/.copilot/installed-plugins/cc-marketplace/cc-safety-net';
const PLUGIN_ID = 'cc-safety-net@cc-marketplace';

const HOOK_FILE =
  '{"hooks":{"preToolUse":[{"type":"command","bash":"npx -y cc-safety-net hook --copilot-cli"}]}}';
const at = (path: string) => `<home>/${path}`;
const inline = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ ...JSON.parse(HOOK_FILE), ...extra });

const detection = (
  seed: TreeSpec,
  copilotCliVersion: string | null,
  env?: Record<string, string>,
) =>
  detectionRunner({
    ported: (environment) =>
      detectCopilot({
        environment,
        cwd: join(environment.home, 'repo'),
        copilotCliVersion,
      }),
  })(seed, env);

type Detected = { kind: 'returned'; value: HookDetection };

const absent = (errors?: string[]): Detected => ({
  kind: 'returned',
  value: { platform: 'copilot-cli', status: 'n/a', errors },
});

const viaHooks = (paths: readonly string[], errors?: string[]): Detected => ({
  kind: 'returned',
  value: {
    platform: 'copilot-cli',
    status: 'configured',
    method: 'hook config',
    configPath: paths[0],
    configPaths: paths,
    errors,
  },
});

const VERSIONS: Array<string | null> = [null, '0.0.400', '0.0.422', '1.0.8'];

afterEach(removeTempRoots);

describe('the version gate on each hook source', () => {
  test.each(VERSIONS)('reports an untouched home as absent at version %s', async (version) => {
    expect(await detection({}, version)).toEqual(absent());
  });

  test.each(
    VERSIONS,
  )('honours a repository hook file at every version, here %s', async (version) => {
    expect(await detection({ [REPO_HOOK]: HOOK_FILE }, version)).toEqual(viaHooks([at(REPO_HOOK)]));
  });

  test.each([
    [
      null,
      absent([
        `GitHub Copilot CLI version unavailable; skipping user hook files in ${USER_HOOK_DIR} because it requires 0.0.422+`,
      ]),
    ],
    [
      '0.0.400',
      absent([
        `GitHub Copilot CLI 0.0.400 does not support user hook files in ${USER_HOOK_DIR}; requires 0.0.422+`,
      ]),
    ],
    ['0.0.422', viaHooks([at(USER_HOOK)])],
    ['1.0.8', viaHooks([at(USER_HOOK)])],
  ] as Array<
    [string | null, Detected]
  >)('reads a user hook file only from 0.0.422 on (%s)', async (version, expected) => {
    expect(await detection({ [USER_HOOK]: HOOK_FILE }, version)).toEqual(expected);
  });

  test.each([
    [
      null,
      absent([
        'GitHub Copilot CLI version unavailable; skipping inline hook definitions in Copilot config files because it requires 1.0.8+',
      ]),
    ],
    [
      '0.0.422',
      absent([
        'GitHub Copilot CLI 0.0.422 does not support inline hook definitions in Copilot config files; requires 1.0.8+',
      ]),
    ],
    ['1.0.8', viaHooks([at(REPO_SETTINGS)])],
  ] as Array<
    [string | null, Detected]
  >)('reads an inline hook definition only from 1.0.8 on (%s)', async (version, expected) => {
    expect(await detection({ [REPO_SETTINGS]: HOOK_FILE }, version)).toEqual(expected);
  });

  test('orders the matched sources repository-first, inline before hook file', async () => {
    expect(
      await detection(
        {
          [REPO_SETTINGS]: HOOK_FILE,
          [REPO_HOOK]: HOOK_FILE,
          [USER_SETTINGS]: HOOK_FILE,
          [USER_HOOK]: HOOK_FILE,
        },
        '1.0.8',
      ),
    ).toEqual(viaHooks([at(REPO_SETTINGS), at(REPO_HOOK), at(USER_SETTINGS), at(USER_HOOK)]));
  });
});

describe('disableAllHooks', () => {
  const disabledBy = (path: string, errors?: string[]): Detected => ({
    kind: 'returned',
    value: {
      platform: 'copilot-cli',
      status: 'disabled',
      method: 'hook config',
      configPath: path,
      configPaths: [path],
      errors,
    },
  });

  const SEED = { [REPO_SETTINGS]: inline({ disableAllHooks: true }), [REPO_HOOK]: HOOK_FILE };

  test('switches everything off on a version that supports it', async () => {
    expect(await detection(SEED, '1.0.8')).toEqual(disabledBy(at(REPO_SETTINGS)));
  });

  test('is treated as active, with a reason, when the version is unknown', async () => {
    expect(await detection(SEED, null)).toEqual(
      disabledBy(at(REPO_SETTINGS), [
        `GitHub Copilot CLI version unavailable; treating disableAllHooks in ${at(REPO_SETTINGS)} as active`,
      ]),
    );
  });

  test.each([
    '0.0.400',
    '0.0.422',
  ])('is ignored by %s, which cannot read the file it sits in', async (version) => {
    expect(await detection(SEED, version)).toEqual(
      viaHooks(
        [at(REPO_HOOK)],
        [
          `GitHub Copilot CLI ${version} does not support inline hook definitions in Copilot config files; requires 1.0.8+`,
        ],
      ),
    );
  });

  test('a repository source that switches hooks on ends the search before the user files', async () => {
    expect(
      await detection(
        {
          [REPO_SETTINGS]: JSON.stringify({ disableAllHooks: false }),
          [REPO_HOOK]: HOOK_FILE,
          [USER_SETTINGS]: JSON.stringify({ disableAllHooks: true }),
        },
        '1.0.8',
      ),
    ).toEqual(viaHooks([at(REPO_HOOK)]));
  });

  test('reads the user settings as JSONC, so a commented false still ends the search', async () => {
    expect(
      await detection(
        {
          [USER_SETTINGS]: '{\n  // note\n  "disableAllHooks": false\n}\n',
          [USER_CONFIG]: JSON.stringify({ disableAllHooks: true }),
          [REPO_HOOK]: HOOK_FILE,
        },
        '1.0.8',
      ),
    ).toEqual(viaHooks([at(REPO_HOOK)]));
  });
});

describe('config files it cannot use', () => {
  test.each(VERSIONS)('reports a hook list that is not an array at version %s', async (version) => {
    expect(await detection({ [REPO_HOOK]: '{"hooks":{"preToolUse":{}}}' }, version)).toEqual(
      absent([
        `Invalid hook config ${at(REPO_HOOK)}: hooks.preToolUse must be an array of hook objects`,
      ]),
    );
  });

  test('reports a repository hook file that is not JSON, and keeps reading the others', async () => {
    expect(
      await detection(
        { [REPO_HOOK]: '{ "hooks"', 'repo/.github/hooks/c.json': HOOK_FILE },
        '1.0.8',
      ),
    ).toEqual(
      viaHooks(
        [at('repo/.github/hooks/c.json')],
        [
          `Failed to parse ${at(REPO_HOOK)}: JSON Parse error: Expected ':' before value in object property definition`,
        ],
      ),
    );
  });
});

describe('the plugin checkout under the Copilot home', () => {
  const INSTALLED = { [PLUGIN]: '{"name":"cc-safety-net"}' };

  test.each(VERSIONS)('reports an installed plugin with no settings at %s', async (version) => {
    expect(await detection(INSTALLED, version)).toEqual({
      kind: 'returned',
      value: {
        platform: 'copilot-cli',
        status: 'configured',
        method: 'plugin config',
        configPath: PLUGIN_DIR,
        configPaths: undefined,
        errors: undefined,
      },
    });
  });

  test('reports a plugin the settings switch off', async () => {
    expect(
      await detection(
        {
          ...INSTALLED,
          [USER_SETTINGS]: JSON.stringify({ enabledPlugins: { [PLUGIN_ID]: false } }),
        },
        '1.0.8',
      ),
    ).toEqual({
      kind: 'returned',
      value: {
        platform: 'copilot-cli',
        status: 'disabled',
        method: 'plugin config',
        configPath: at(USER_SETTINGS),
        errors: [`${PLUGIN_ID} is installed but not enabled in Copilot CLI`],
      },
    });
  });

  test('treats an absent enabledPlugins entry as on', async () => {
    expect(await detection({ ...INSTALLED, [USER_SETTINGS]: '{}' }, '1.0.8')).toEqual({
      kind: 'returned',
      value: {
        platform: 'copilot-cli',
        status: 'configured',
        method: 'plugin config',
        configPath: PLUGIN_DIR,
        configPaths: undefined,
        errors: undefined,
      },
    });
  });

  test('refuses to guess when the settings cannot be read', async () => {
    expect(await detection({ ...INSTALLED, [USER_SETTINGS]: null }, '1.0.8')).toEqual({
      kind: 'returned',
      value: { platform: 'copilot-cli', status: 'not-inspected' },
    });
  });
});

test('follows COPILOT_HOME to the user hook file and the plugin checkout', async () => {
  expect(
    await detection(
      {
        'elsewhere/hooks/b.json': HOOK_FILE,
        'elsewhere/installed-plugins/cc-marketplace/cc-safety-net/plugin.json': '{}',
      },
      '1.0.8',
      { COPILOT_HOME: '<home>/elsewhere' },
    ),
  ).toEqual({
    kind: 'returned',
    value: {
      platform: 'copilot-cli',
      status: 'configured',
      method: 'plugin config',
      configPath: at('elsewhere/hooks/b.json'),
      configPaths: [at('elsewhere/hooks/b.json')],
      errors: undefined,
    },
  });
});
