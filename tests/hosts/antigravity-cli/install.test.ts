import { afterEach, describe, expect, test } from 'bun:test';
import { detect as detectAntigravity } from '@/hosts/antigravity-cli/detect';
import { installAntigravityCli, uninstallAntigravityCli } from '@/hosts/antigravity-cli/install';
import { expectRow, fileAt, hostRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Antigravity keys its hook definitions by name, so ours is one entry among the user's. The rows
 * below cover the states that decide whether install writes, flips `enabled`, or does nothing, and
 * what uninstall is allowed to leave behind: the definition itself, emptied.
 */

const CONFIG = '.gemini/config/hooks.json';
const CONFIG_PATH = `<home>/${CONFIG}`;
const MANAGED = 'npx -y cc-safety-net hook --agy-cli';
const DEFINITION = {
  PreToolUse: [{ hooks: [{ type: 'command', command: MANAGED, timeout: 30 }] }],
};
const EMPTIED = { 'cc-safety-net': { PreToolUse: [] } };
const FOREIGN = { mine: { PreToolUse: [] } };

const hooksConfig = (config: Record<string, unknown>) => `${JSON.stringify(config, null, 2)}\n`;

const CONFIGURED = {
  platform: 'antigravity-cli',
  status: 'configured',
  method: 'hook config',
  configPath: CONFIG_PATH,
} as const;

const { row, detection } = hostRunner({
  ported: (environment) => ({
    install: () => installAntigravityCli(environment),
    detect: () => detectAntigravity({ environment, cwd: environment.home }),
    uninstall: () => uninstallAntigravityCli(environment),
  }),
});

afterEach(removeTempRoots);

describe('the Antigravity hook config differential', () => {
  test('writes the managed definition when the host has no hook config', async () => {
    expectRow((await row({})).steps, {
      file: CONFIG,
      alreadyInstalled: false,
      wrote: hooksConfig({ 'cc-safety-net': DEFINITION }),
      detected: CONFIGURED,
      left: hooksConfig(EMPTIED),
    });
  });

  test('adds the definition beside the user own, and empties only ours', async () => {
    expectRow((await row({ [CONFIG]: hooksConfig(FOREIGN) })).steps, {
      file: CONFIG,
      alreadyInstalled: false,
      wrote: hooksConfig({ ...FOREIGN, 'cc-safety-net': DEFINITION }),
      detected: CONFIGURED,
      left: hooksConfig({ ...FOREIGN, ...EMPTIED }),
    });
  });

  test('flips a definition the user disabled instead of appending a second one', async () => {
    const disabled = { 'cc-safety-net': { enabled: false, ...DEFINITION } };

    expectRow((await row({ [CONFIG]: hooksConfig(disabled) })).steps, {
      file: CONFIG,
      alreadyInstalled: false,
      wrote: hooksConfig({ 'cc-safety-net': { enabled: true, ...DEFINITION } }),
      detected: CONFIGURED,
      left: hooksConfig({ 'cc-safety-net': { enabled: true, PreToolUse: [] } }),
    });
  });

  test('reports an active definition without touching the file', async () => {
    const seed = hooksConfig({ 'cc-safety-net': DEFINITION });

    expectRow((await row({ [CONFIG]: seed })).steps, {
      file: CONFIG,
      alreadyInstalled: true,
      wrote: seed,
      detected: CONFIGURED,
      left: hooksConfig(EMPTIED),
    });
  });

  test.each([
    ['[]\n', 'Antigravity hooks config must be a JSON object'],
    [
      '{"cc-safety-net": "x"}\n',
      'Antigravity hooks config entry "cc-safety-net" must be an object',
    ],
  ])('refuses a shape it cannot edit safely: %s', async (seed, message) => {
    const { steps, tree } = await row({ [CONFIG]: seed });

    expect(steps?.install.result).toEqual({ ok: false, error: { name: 'Error', message } });
    expect(fileAt(tree, CONFIG)).toBe(seed);
  });

  test('refuses a hook config carrying comments instead of dropping them', async () => {
    const seed = `{\n  // ours\n  "cc-safety-net": {}\n}\n`;
    const { steps, tree } = await row({ [CONFIG]: seed });

    expect(steps?.install.result).toMatchObject({
      ok: false,
      error: {
        name: 'Error',
        message: expect.stringContaining(
          `Failed to parse Antigravity hooks config ${CONFIG_PATH}: `,
        ),
      },
    });
    expect(fileAt(tree, CONFIG)).toBe(seed);
  });
});

describe('the Antigravity detector differential', () => {
  test('finds the managed handler', async () => {
    expect(await detection({ [CONFIG]: hooksConfig({ 'cc-safety-net': DEFINITION }) })).toEqual({
      kind: 'returned',
      value: CONFIGURED,
    });
  });

  test('reports a definition the user disabled', async () => {
    const disabled = { 'cc-safety-net': { enabled: false, ...DEFINITION } };

    expect(await detection({ [CONFIG]: hooksConfig(disabled) })).toEqual({
      kind: 'returned',
      value: { ...CONFIGURED, status: 'disabled' },
    });
  });

  test('says nothing is installed for a foreign or absent config', async () => {
    const absent = {
      kind: 'returned',
      value: { platform: 'antigravity-cli', status: 'n/a', configPath: CONFIG_PATH },
    } as const;

    expect(await detection({ [CONFIG]: hooksConfig(FOREIGN) })).toEqual(absent);
    expect(await detection({})).toEqual(absent);
  });

  test('reports a config it cannot parse instead of guessing', async () => {
    expect(await detection({ [CONFIG]: '{ "cc-safety-net": {}, }\n' })).toMatchObject({
      kind: 'returned',
      value: {
        platform: 'antigravity-cli',
        status: 'n/a',
        configPath: CONFIG_PATH,
        errors: [
          expect.stringContaining(`Failed to parse Antigravity hooks config ${CONFIG_PATH}: `),
        ],
      },
    });
  });
});
