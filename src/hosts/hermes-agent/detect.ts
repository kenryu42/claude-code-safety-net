/**
 * Hermes Agent plugin detection.
 *
 * Reads the managed `<Hermes home>/plugins/cc-safety-net/` artifact for installed, loadable, and
 * outdated state, and Hermes' own `plugins.enabled` allow-list for enablement — Hermes loads
 * user plugins only when they are listed there (`hermes_cli/plugins.py`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  type DetectContext,
  type HookDetection,
  inspectManagedPluginDir,
  lstatOrUndefined,
} from '@/hosts/detect/context';
import {
  buildHermesAgentPluginFiles,
  HERMES_AGENT_PLUGIN_NAME,
} from '@/hosts/hermes-agent/artifact';
import {
  getHermesAgentPluginDir,
  getHermesHomeDir,
  isManagedHermesAgentFile,
} from '@/hosts/hermes-agent/install';
import { getPackageVersion } from '@/hosts/system-info';

const PLATFORM = 'hermes-agent';
// A top-level mapping key, i.e. one that starts in the first column.
const TOP_LEVEL_KEY = /^([^\s#][^:]*):/;
const NESTED_KEY = /^\s+([A-Za-z_][\w-]*):/;
const SEQUENCE_ITEM = /^\s+-\s*(.*)$/;

function unquote(value: string): string {
  return value.trim().replace(/^(["'])(.*)\1$/, '$2');
}

/** The indented lines belonging to the top-level `plugins:` mapping. */
function pluginsBlock(raw: string): string[] {
  const lines = raw.split(/\r?\n/);
  const start = lines.findIndex((line) => TOP_LEVEL_KEY.exec(line)?.[1]?.trim() === 'plugins');
  if (start === -1) return [];

  const body = lines.slice(start + 1);
  const end = body.findIndex((line) => TOP_LEVEL_KEY.test(line));
  return end === -1 ? body : body.slice(0, end);
}

/**
 * Read one `plugins.<key>` sequence out of Hermes' config.yaml without a YAML parser.
 * Hermes writes the file with `yaml.safe_dump(default_flow_style=False)`, so the lists are block
 * sequences under a top-level `plugins:` mapping. Anything else reads as "not listed", which
 * surfaces as a visible, recoverable "disabled" in doctor.
 */
function readPluginList(raw: string, key: string): string[] {
  const block = pluginsBlock(raw);
  const start = block.findIndex((line) => NESTED_KEY.exec(line)?.[1] === key);
  if (start === -1) return [];

  const body = block.slice(start + 1);
  const end = body.findIndex((line) => !SEQUENCE_ITEM.test(line));
  return (end === -1 ? body : body.slice(0, end)).map((line) =>
    unquote(SEQUENCE_ITEM.exec(line)?.[1] ?? ''),
  );
}

function readHermesConfig(environment: Environment): string | undefined {
  try {
    return readFileSync(join(getHermesHomeDir(environment), 'config.yaml'), 'utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Whether Hermes' own config would load the plugin. Read-only, so the installer can ask it
 * before running `hermes plugins enable` to tell an inert reinstall from one that turns the
 * plugin back on.
 */
export function isHermesAgentPluginEnabled(environment: Environment): boolean {
  const config = readHermesConfig(environment) ?? '';
  return (
    readPluginList(config, 'enabled').includes(HERMES_AGENT_PLUGIN_NAME) &&
    !readPluginList(config, 'disabled').includes(HERMES_AGENT_PLUGIN_NAME)
  );
}

function artifactVersion(content: string): string | undefined {
  return /^# version:\s*(.+)$/m.exec(content)?.[1]?.trim();
}

/** Read one managed file, reporting why it cannot be trusted instead of throwing. */
function inspectFile(
  path: string,
  expected: { name: string; content: string },
): { content: string } | { error: string } {
  const info = lstatOrUndefined(path);
  if (!info)
    return { error: `${expected.name} is missing from ${path}; run install --hermes-agent` };
  if (info.isSymbolicLink() || !info.isFile())
    return { error: `${path} is a symlink or not a regular file; move or remove it` };

  try {
    const content = readFileSync(path, 'utf-8');
    if (!isManagedHermesAgentFile(content))
      return { error: `Unmanaged ${expected.name} occupies ${path}; move or remove it` };
    // A header and a version stamp are not a plugin: a truncated or edited body leaves Hermes
    // unable to register the hook. Files stamped with another version are reported as outdated
    // below instead, where their contents are expected to differ.
    if (artifactVersion(content) === getPackageVersion() && content !== expected.content)
      return {
        error: `Modified ${expected.name} occupies ${path}; run install --hermes-agent to restore it`,
      };
    return { content };
  } catch (e) {
    return { error: `Failed to read ${path}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function detect(context: DetectContext): HookDetection {
  const configPath = getHermesAgentPluginDir(context.environment);
  const unusable = inspectManagedPluginDir(PLATFORM, configPath);
  if (unusable) return unusable;

  const files = buildHermesAgentPluginFiles(getPackageVersion()).map((file) =>
    inspectFile(join(configPath, file.name), file),
  );
  const errors = files.flatMap((file) => ('error' in file ? [file.error] : []));
  if (errors.length > 0) return { platform: PLATFORM, status: 'n/a', configPath, errors };

  const outdated = files.some(
    (file) => 'content' in file && artifactVersion(file.content) !== getPackageVersion(),
  );
  const outdatedError = outdated
    ? ['Installed Hermes Agent plugin is outdated; run install --hermes-agent to update']
    : [];

  if (!isHermesAgentPluginEnabled(context.environment))
    return {
      platform: PLATFORM,
      status: 'disabled',
      method: 'plugin directory',
      configPath,
      errors: [
        `${HERMES_AGENT_PLUGIN_NAME} is not enabled in Hermes; run \`hermes plugins enable ${HERMES_AGENT_PLUGIN_NAME}\``,
        ...outdatedError,
      ],
    };

  return {
    platform: PLATFORM,
    status: 'configured',
    method: 'plugin directory',
    configPath,
    errors: outdated ? outdatedError : undefined,
  };
}
