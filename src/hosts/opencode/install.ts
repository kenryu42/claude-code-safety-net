import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Environment } from '@/core/environment';
import { atomicWriteFile } from '@/core/io/atomic-write';
import {
  findJsonArrayProperty,
  findJsonStringItems,
  removeArrayRangeItem,
  stripJsonComments,
} from '@/core/io/jsonc';
import { readRecord } from '@/hosts/detect/context';
import type { InstallResult } from '@/hosts/install/types';

const OPENCODE_PACKAGE = 'cc-safety-net';
const OPENCODE_CACHE_PACKAGE = `${OPENCODE_PACKAGE}@latest`;
const OPENCODE_CONFIG_FILES = ['opencode.json', 'opencode.jsonc'] as const;
/** The plugin factory `src/index.ts` publishes and OpenCode loads from the package entry. */
const OPENCODE_PLUGIN_EXPORT = 'CCSafetyNetPlugin';
const OPENCODE_JSON_ERRORS = {
  stringError: 'Unterminated string in OpenCode config',
  bracketError: 'Unmatched plugin array in OpenCode config',
};

/**
 * OpenCode derives its config root through `xdg-basedir`: `XDG_CONFIG_HOME` verbatim when set,
 * else `<home>/.config`. An empty value falls back, matching the package's `||`.
 */
export function getOpenCodeConfigDir(environment: Environment) {
  return join(
    environment.env.get('XDG_CONFIG_HOME') || join(environment.home, '.config'),
    'opencode',
  );
}

function getDefaultOpenCodeConfigPath(environment: Environment) {
  return join(getOpenCodeConfigDir(environment), OPENCODE_CONFIG_FILES[0]);
}

function getOpenCodeConfigPaths(environment: Environment) {
  return OPENCODE_CONFIG_FILES.map((filename) => join(getOpenCodeConfigDir(environment), filename));
}

/** Same derivation for OpenCode's package cache, from `XDG_CACHE_HOME`, else `<home>/.cache`. */
function getOpenCodeCachePath(environment: Environment) {
  return join(
    environment.env.get('XDG_CACHE_HOME') || join(environment.home, '.cache'),
    'opencode',
    'packages',
    OPENCODE_CACHE_PACKAGE,
  );
}

export function clearOpenCodeCache(environment: Environment): void {
  rmSync(getOpenCodeCachePath(environment), { recursive: true, force: true });
}

/**
 * Prove the plugin OpenCode just installed can actually load. OpenCode fails open: when a
 * configured plugin cannot be installed, resolved or imported it publishes a session error and
 * keeps going unprotected, so `opencode plugin` exiting 0 proves nothing about enforcement.
 *
 * This mirrors the host's own acceptance of an npm plugin: it reifies the package into
 * `<cache>/packages/<spec>/node_modules/<name>`, resolves the entry from the package's `main`
 * (this package ships no `./server` export) and requires the exported plugin to be callable.
 */
export async function verifyOpenCodePluginRuntime(environment: Environment): Promise<void> {
  const packageDir = join(getOpenCodeCachePath(environment), 'node_modules', OPENCODE_PACKAGE);
  const packageJsonPath = join(packageDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `The OpenCode plugin cache at ${packageDir} is missing its package, so OpenCode would load nothing and fail open. Run \`opencode plugin -g -f ${OPENCODE_CACHE_PACKAGE}\` for details.`,
    );
  }

  const main = readRecord(JSON.parse(readFileSync(packageJsonPath, 'utf-8')), 'main');
  if (typeof main !== 'string') {
    throw new Error(`The cached OpenCode plugin at ${packageDir} declares no "main" entry.`);
  }

  const entry = join(packageDir, main);
  const entryModule = (await import(pathToFileURL(entry).href)) as Record<string, unknown>;
  if (typeof entryModule[OPENCODE_PLUGIN_EXPORT] === 'function') return;
  throw new Error(
    `The cached OpenCode plugin at ${entry} does not export a callable ${OPENCODE_PLUGIN_EXPORT}, so OpenCode would load nothing and fail open.`,
  );
}

function parseOpenCodeConfig(content: string, configPath: string) {
  try {
    return JSON.parse(stripJsonComments(content)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse OpenCode config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function hasManagedPlugin(config: unknown) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
  const plugins = (config as { plugin?: unknown }).plugin;
  if (!Array.isArray(plugins)) return false;
  return plugins.some((plugin) => typeof plugin === 'string' && plugin.includes(OPENCODE_PACKAGE));
}

function removeManagedPlugins(content: string, configPath: string) {
  const pluginArray = findJsonArrayProperty(content, 'plugin', OPENCODE_JSON_ERRORS);
  if (!pluginArray) throw new Error(`Failed to locate OpenCode plugin array in ${configPath}`);

  const updated = findJsonStringItems(content, pluginArray, OPENCODE_JSON_ERRORS.stringError)
    .filter((item) => item.value.includes(OPENCODE_PACKAGE))
    .map((item) => item.range)
    .reverse()
    .reduce(removeArrayRangeItem, content);

  parseOpenCodeConfig(updated, configPath);
  return updated;
}

export function uninstallOpenCode(environment: Environment): InstallResult {
  clearOpenCodeCache(environment);

  const configPaths = getOpenCodeConfigPaths(environment);
  const existingConfigPath = configPaths.find((configPath) => existsSync(configPath));
  const errors: string[] = [];

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) continue;

    try {
      const content = readFileSync(configPath, 'utf-8');
      if (!hasManagedPlugin(parseOpenCodeConfig(content, configPath))) continue;

      atomicWriteFile(configPath, removeManagedPlugins(content, configPath));
      return { path: configPath, alreadyInstalled: true };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length > 0) throw new Error(errors.join('\n'));
  return {
    path: existingConfigPath ?? getDefaultOpenCodeConfigPath(environment),
    alreadyInstalled: false,
  };
}
