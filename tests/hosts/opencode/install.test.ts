import { afterEach, describe, expect, test } from 'bun:test';
import {
  clearOpenCodeCache,
  getOpenCodeConfigDir,
  uninstallOpenCode,
  verifyOpenCodePluginRuntime,
} from '@/hosts/opencode/install';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { differential, fileAt } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * OpenCode fails open: a plugin it cannot load is a session warning, not a refusal, so `opencode
 * plugin` exiting 0 proves nothing. The installer therefore clears the cache, and the verification
 * step re-does the host's own acceptance — reify, resolve `main`, require a callable export.
 * Uninstall is the mirror image: only our own item leaves the plugin array, byte for byte.
 */

const CONFIG = '.config/opencode/opencode.json';
const CONFIG_C = '.config/opencode/opencode.jsonc';
const CACHE = '.cache/opencode/packages/cc-safety-net@latest';
const PACKAGE_DIR = `${CACHE}/node_modules/cc-safety-net`;

const cachedPackage = (main: unknown, entry?: string): TreeSpec => ({
  [`${PACKAGE_DIR}/package.json`]: JSON.stringify(main === undefined ? { name: 'x' } : { main }),
  ...(entry === undefined ? {} : { [`${PACKAGE_DIR}/index.mjs`]: entry }),
});

afterEach(removeTempRoots);

describe('where OpenCode keeps its config and cache', () => {
  test.each([
    ['the XDG default', undefined, '<home>/.config/opencode'],
    ['an XDG_CONFIG_HOME the user moved', '<home>/xdg', '<home>/xdg/opencode'],
  ])('derives the config directory from %s', async (_case, xdg, expected) => {
    expect(
      (
        await differential({
          seed: {},
          env: xdg === undefined ? {} : { XDG_CONFIG_HOME: xdg },
          ported: (environment) => getOpenCodeConfigDir(environment),
        })
      ).outcome,
    ).toEqual({ kind: 'returned', value: expected });
  });

  test.each([
    ['the XDG default', {}, CACHE],
    [
      'an XDG_CACHE_HOME the user moved',
      { XDG_CACHE_HOME: '<home>/xdgcache' },
      'xdgcache/opencode/packages/cc-safety-net@latest',
    ],
  ])('clears the cached package under %s', async (_case, env, cache) => {
    const seed = { [`${cache}/node_modules/cc-safety-net/package.json`]: '{}', 'keep.txt': 'kept' };
    const result = await differential({
      seed,
      env,
      ported: (environment) => clearOpenCodeCache(environment),
    });

    const paths = result.tree.map((entry) => entry.path);
    expect(paths.filter((path) => path.startsWith(cache))).toEqual([]);
    expect(paths).toContain('keep.txt');
  });
});

describe('proving the cached plugin would load', () => {
  const verify = async (seed: TreeSpec) =>
    (
      await differential({
        seed,
        ported: (environment) => verifyOpenCodePluginRuntime(environment),
      })
    ).outcome;

  test('accepts a package whose main exports a callable plugin factory', async () => {
    expect(
      await verify(cachedPackage('./index.mjs', 'export function CCSafetyNetPlugin() {}\n')),
    ).toEqual({
      kind: 'returned',
      value: undefined,
    });
  });

  test('rejects a cache with no package at all', async () => {
    expect(await verify({ [`${CACHE}/.keep`]: '' })).toEqual({
      kind: 'threw',
      message: `The OpenCode plugin cache at <home>/${PACKAGE_DIR} is missing its package, so OpenCode would load nothing and fail open. Run \`opencode plugin -g -f cc-safety-net@latest\` for details.`,
    });
  });

  test('rejects a package that declares no entry', async () => {
    expect(await verify(cachedPackage(undefined))).toEqual({
      kind: 'threw',
      message: `The cached OpenCode plugin at <home>/${PACKAGE_DIR} declares no "main" entry.`,
    });
  });

  test('rejects an entry whose export is not callable', async () => {
    expect(
      await verify(cachedPackage('./index.mjs', 'export const CCSafetyNetPlugin = 1;\n')),
    ).toEqual({
      kind: 'threw',
      message: `The cached OpenCode plugin at <home>/${PACKAGE_DIR}/index.mjs does not export a callable CCSafetyNetPlugin, so OpenCode would load nothing and fail open.`,
    });
  });
});

describe('taking the plugin back out of the config', () => {
  const uninstall = async (seed: TreeSpec) => {
    const result = await differential({
      seed,
      ported: (environment) => uninstallOpenCode(environment),
    });
    return { outcome: result.outcome, tree: result.tree };
  };

  // Only the item and the separator that held it go; the whitespace that framed it stays, so the
  // file keeps the shape its author gave it rather than a formatter's.
  test('removes only our item from a formatted opencode.json', async () => {
    const result = await uninstall({
      [CONFIG]: '{\n  "$schema": "x",\n  "plugin": ["other", "cc-safety-net", "third"]\n}\n',
      [`${CACHE}/node_modules/cc-safety-net/package.json`]: '{}',
    });

    expect(result.outcome).toEqual({
      kind: 'returned',
      value: { path: `<home>/${CONFIG}`, alreadyInstalled: true },
    });
    expect(fileAt(result.tree, CONFIG)).toBe(
      '{\n  "$schema": "x",\n  "plugin": ["other",  "third"]\n}\n',
    );
    expect(result.tree.map((entry) => entry.path)).not.toContain(CACHE);
  });

  test('keeps every comment and every other byte of an opencode.jsonc', async () => {
    const result = await uninstall({
      [CONFIG_C]:
        '{\n  // keep me\n  "plugin": [\n    "cc-safety-net@1.2.3", /* c */\n    "other"\n  ]\n}\n',
    });

    expect(result.outcome).toEqual({
      kind: 'returned',
      value: { path: `<home>/${CONFIG_C}`, alreadyInstalled: true },
    });
    expect(fileAt(result.tree, CONFIG_C)).toBe(
      '{\n  // keep me\n  "plugin": [\n     /* c */\n    "other"\n  ]\n}\n',
    );
  });

  test('edits the file that holds the plugin and leaves the other untouched', async () => {
    const first = '{\n  "plugin": ["other"]\n}\n';
    const result = await uninstall({
      [CONFIG]: first,
      [CONFIG_C]: '{\n  "plugin": ["cc-safety-net"]\n}\n',
    });

    expect(result.outcome).toEqual({
      kind: 'returned',
      value: { path: `<home>/${CONFIG_C}`, alreadyInstalled: true },
    });
    expect(fileAt(result.tree, CONFIG)).toBe(first);
    expect(fileAt(result.tree, CONFIG_C)).toBe('{\n  "plugin": []\n}\n');
  });

  test.each([
    [
      'the existing config when it never held the plugin',
      { [CONFIG_C]: '{\n  "plugin": []\n}\n' },
      CONFIG_C,
    ],
    ['the default path when no config exists', {}, CONFIG],
  ])('reports %s', async (_case, seed, path) => {
    expect((await uninstall(seed)).outcome).toEqual({
      kind: 'returned',
      value: { path: `<home>/${path}`, alreadyInstalled: false },
    });
  });

  test('refuses to touch a config it cannot parse', async () => {
    const result = await uninstall({ [CONFIG]: '{ not json' });

    expect(result.outcome).toEqual({
      kind: 'threw',
      message: `Failed to parse OpenCode config <home>/${CONFIG}: JSON Parse error: Expected '}'`,
    });
    expect(fileAt(result.tree, CONFIG)).toBe('{ not json');
  });
});
