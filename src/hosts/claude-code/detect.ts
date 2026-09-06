/**
 * Claude Code hook detection.
 */

import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  type DetectContext,
  type HookDetection,
  readRecord,
  readStateFile,
} from '@/hosts/detect/context';

const CLAUDE_SAFETY_NET_PLUGIN_ID = 'cc-safety-net@cc-marketplace';

function getClaudeInstalledPluginsPath(environment: Environment): string {
  return join(environment.home, '.claude', 'plugins', 'installed_plugins.json');
}

function isInstalledPluginRecord(value: unknown, pluginId: string): boolean {
  const record = readRecord(readRecord(value, 'plugins'), pluginId);
  return Array.isArray(record) && record.length > 0;
}

/** Whether Claude Code records the given plugin id as installed. */
export function hasClaudeInstalledPlugin(environment: Environment, pluginId: string): boolean {
  const installed = readStateFile(getClaudeInstalledPluginsPath(environment));
  return installed.kind === 'ok' && isInstalledPluginRecord(installed.value, pluginId);
}

/**
 * Detect Claude Code hook configuration from the plugin records Claude Code writes:
 * `installed_plugins.json` says what is installed, `settings.json` says what is on. Reading
 * them avoids `claude plugin list`, which rewrites `~/.claude.json` in a possibly running session.
 */
export function detectClaudeCode(environment: Environment): HookDetection {
  const installedPath = getClaudeInstalledPluginsPath(environment);
  const installed = readStateFile(installedPath);
  if (installed.kind === 'unreadable') return { platform: 'claude-code', status: 'not-inspected' };
  if (installed.kind === 'missing') return { platform: 'claude-code', status: 'n/a' };
  if (!isInstalledPluginRecord(installed.value, CLAUDE_SAFETY_NET_PLUGIN_ID)) {
    return { platform: 'claude-code', status: 'n/a' };
  }

  const settingsPath = join(environment.home, '.claude', 'settings.json');
  const settings = readStateFile(settingsPath);
  if (settings.kind === 'unreadable') return { platform: 'claude-code', status: 'not-inspected' };

  const enabled =
    settings.kind === 'ok' &&
    readRecord(readRecord(settings.value, 'enabledPlugins'), CLAUDE_SAFETY_NET_PLUGIN_ID) === true;

  if (!enabled) {
    return {
      platform: 'claude-code',
      status: 'disabled',
      method: 'plugin config',
      configPath: settingsPath,
      errors: [`${CLAUDE_SAFETY_NET_PLUGIN_ID} is installed but not enabled in Claude Code`],
    };
  }

  return {
    platform: 'claude-code',
    status: 'configured',
    method: 'plugin config',
    configPath: installedPath,
  };
}

export function detect(context: DetectContext): HookDetection {
  return detectClaudeCode(context.environment);
}
