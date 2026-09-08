/**
 * OpenClaw plugin detection.
 *
 * Reads the managed `<state dir>/extensions/cc-safety-net/` directory for installed, loadable,
 * and outdated state, then OpenClaw's own `plugins` config in `<state dir>/openclaw.json` for
 * enablement. The enablement rules mirror the host's `collectExplicitEffectivePluginIds`:
 * the global switch, the allow list, the deny list, and the per-plugin entry all take part.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import { stripJsonComments } from '@/core/io/jsonc';
import {
  type DetectContext,
  type HookDetection,
  inspectManagedPluginDir,
  lstatOrUndefined,
  readRecord,
} from '@/hosts/detect/context';
import {
  OPENCLAW_MANAGED_HEADER,
  OPENCLAW_PLUGIN_ENTRY_FILE,
  OPENCLAW_PLUGIN_ID,
  OPENCLAW_PLUGIN_MANIFEST_FILE,
  OPENCLAW_PLUGIN_PACKAGE_FILE,
} from '@/hosts/openclaw/artifact';
import {
  findOpenClawArtifactDir,
  getOpenClawConfigPath,
  getOpenClawPluginDir,
} from '@/hosts/openclaw/install';
import { getPackageVersion } from '@/hosts/system-info';

const PLATFORM = 'openclaw';
const ENABLE_HINT = `run \`openclaw plugins enable ${OPENCLAW_PLUGIN_ID}\``;

/** Read one file from the installed plugin, reporting why it cannot be trusted. */
function readPluginFile(dir: string, name: string): { content: string } | { error: string } {
  const path = join(dir, name);
  const info = lstatOrUndefined(path);
  if (!info) return { error: `${name} is missing from ${path}; run install --openclaw` };
  if (info.isSymbolicLink() || !info.isFile())
    return { error: `${path} is a symlink or not a regular file; move or remove it` };

  try {
    return { content: readFileSync(path, 'utf-8') };
  } catch (e) {
    return { error: `Failed to read ${path}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(stripJsonComments(content));
  } catch {
    return undefined;
  }
}

/** The manifest OpenClaw validates before loading plugin code must still claim our id. */
function manifestError(dir: string): string | undefined {
  const file = readPluginFile(dir, OPENCLAW_PLUGIN_MANIFEST_FILE);
  if ('error' in file) return file.error;
  if (readRecord(parseJson(file.content), 'id') === OPENCLAW_PLUGIN_ID) return undefined;
  return `${join(dir, OPENCLAW_PLUGIN_MANIFEST_FILE)} is not a valid ${OPENCLAW_PLUGIN_ID} manifest; run install --openclaw`;
}

/**
 * OpenClaw imports the runtime entry named by `openclaw.extensions`, so a package manifest that
 * is gone or no longer points at it leaves a plugin that cannot load however healthy the other
 * two files look.
 */
function packageError(dir: string): string | undefined {
  const file = readPluginFile(dir, OPENCLAW_PLUGIN_PACKAGE_FILE);
  if ('error' in file) return file.error;

  const extensions = readRecord(readRecord(parseJson(file.content), 'openclaw'), 'extensions');
  if (Array.isArray(extensions) && extensions.includes(`./${OPENCLAW_PLUGIN_ENTRY_FILE}`))
    return undefined;
  return `${join(dir, OPENCLAW_PLUGIN_PACKAGE_FILE)} does not point OpenClaw at ${OPENCLAW_PLUGIN_ENTRY_FILE}; run install --openclaw`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** Why OpenClaw would not load the plugin, or `undefined` when it would. */
function enablementError(environment: Environment): string | undefined {
  const configPath = getOpenClawConfigPath(environment);
  if (!lstatOrUndefined(configPath)) return `${OPENCLAW_PLUGIN_ID} is not enabled; ${ENABLE_HINT}`;

  const config = (() => {
    try {
      return JSON.parse(stripJsonComments(readFileSync(configPath, 'utf-8')));
    } catch {
      return undefined;
    }
  })();
  if (config === undefined) return `Failed to read ${configPath}; fix it, then ${ENABLE_HINT}`;

  const plugins = readRecord(config, 'plugins');
  if (readRecord(plugins, 'enabled') === false)
    return `plugins.enabled is false in ${configPath}; no OpenClaw plugin loads`;

  const entryEnabled = readRecord(
    readRecord(readRecord(plugins, 'entries'), OPENCLAW_PLUGIN_ID),
    'enabled',
  );
  if (
    stringList(readRecord(plugins, 'deny')).includes(OPENCLAW_PLUGIN_ID) ||
    entryEnabled === false
  )
    return `${OPENCLAW_PLUGIN_ID} is disabled in ${configPath}; ${ENABLE_HINT}`;

  const allow = stringList(readRecord(plugins, 'allow'));
  if (allow.length > 0 && !allow.includes(OPENCLAW_PLUGIN_ID))
    return `plugins.allow in ${configPath} does not list ${OPENCLAW_PLUGIN_ID}; add it, then ${ENABLE_HINT}`;
  if (allow.includes(OPENCLAW_PLUGIN_ID) || entryEnabled === true) return undefined;
  return `${OPENCLAW_PLUGIN_ID} is not enabled; ${ENABLE_HINT}`;
}

/** The stamp the build writes into the runtime entry, in the installed and the packaged copy. */
function artifactVersion(content: string): string | undefined {
  return /^\/\/ version:\s*(.+)$/m.exec(content)?.[1]?.trim();
}

/**
 * A managed header, our id, and an entry path are not a plugin: an `index.js` truncated below its
 * header registers no hook, and a manifest reduced to `{"id":"cc-safety-net"}` is not the shape
 * OpenClaw loads — both still pass every check above. The packaged directory is the counterpart of
 * an install carrying its version stamp (in a released install, the running package version), so
 * when the stamps agree every managed file must match it byte for byte. A differing stamp is an
 * outdated install, reported as such by the caller, and a checkout that was never built has no
 * counterpart to compare against at all.
 *
 * @internal
 */
export function modifiedFileErrors(
  dir: string,
  installedVersion: string | undefined,
  packagedDir: string | undefined,
): string[] {
  if (packagedDir === undefined) return [];

  const packagedEntry = readPluginFile(packagedDir, OPENCLAW_PLUGIN_ENTRY_FILE);
  if ('error' in packagedEntry || artifactVersion(packagedEntry.content) !== installedVersion)
    return [];

  return [
    OPENCLAW_PLUGIN_ENTRY_FILE,
    OPENCLAW_PLUGIN_MANIFEST_FILE,
    OPENCLAW_PLUGIN_PACKAGE_FILE,
  ].flatMap((name) => {
    const installed = readPluginFile(dir, name);
    const packaged = readPluginFile(packagedDir, name);
    if ('error' in installed || 'error' in packaged || installed.content === packaged.content)
      return [];
    return [`Modified ${name} occupies ${join(dir, name)}; run install --openclaw to restore it`];
  });
}

export function detect(context: DetectContext): HookDetection {
  const configPath = getOpenClawPluginDir(context.environment);
  const unusable = inspectManagedPluginDir(PLATFORM, configPath);
  if (unusable) return unusable;

  const entry = readPluginFile(configPath, OPENCLAW_PLUGIN_ENTRY_FILE);
  const entryError =
    'error' in entry
      ? entry.error
      : entry.content.startsWith(OPENCLAW_MANAGED_HEADER)
        ? undefined
        : `Unmanaged ${OPENCLAW_PLUGIN_ENTRY_FILE} occupies ${join(configPath, OPENCLAW_PLUGIN_ENTRY_FILE)}; move or remove it`;
  const shapeErrors = [entryError, manifestError(configPath), packageError(configPath)].filter(
    (error) => error !== undefined,
  );
  const installed = 'content' in entry ? artifactVersion(entry.content) : undefined;
  const errors =
    shapeErrors.length > 0
      ? shapeErrors
      : modifiedFileErrors(configPath, installed, findOpenClawArtifactDir());
  if (errors.length > 0) return { platform: PLATFORM, status: 'n/a', configPath, errors };

  const outdatedError =
    installed === getPackageVersion()
      ? []
      : ['Installed OpenClaw plugin is outdated; run install --openclaw to update'];

  const disabled = enablementError(context.environment);
  if (disabled)
    return {
      platform: PLATFORM,
      status: 'disabled',
      method: 'plugin directory',
      configPath,
      errors: [disabled, ...outdatedError],
    };

  return {
    platform: PLATFORM,
    status: 'configured',
    method: 'plugin directory',
    configPath,
    errors: outdatedError.length > 0 ? outdatedError : undefined,
  };
}
