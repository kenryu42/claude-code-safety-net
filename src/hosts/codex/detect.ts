/**
 * Codex hook detection.
 */

import type { DetectContext, HookDetection } from '@/hosts/detect/context';

const CODEX_PLUGIN_LIST_CONFIG_PATH = 'codex plugin list';
const CODEX_SAFETY_NET_SOURCE = 'https://github.com/kenryu42/cc-safety-net.git';

/**
 * Detect Codex plugin configuration.
 */
export function detect(context: DetectContext): HookDetection {
  if (!context.codexPluginListOutput) {
    return { platform: 'codex', status: 'n/a' };
  }

  const pluginLine = context.codexPluginListOutput
    .split('\n')
    .find((line) => line.includes(CODEX_SAFETY_NET_SOURCE));

  if (!pluginLine) {
    return { platform: 'codex', status: 'n/a' };
  }

  // `codex plugin list` prints every marketplace row as "installed, enabled",
  // "installed, disabled", or "not installed". "installed," matches either installed
  // state and can never match "not installed", so a registered-but-never-installed
  // row reports absent instead of disabled.
  if (!pluginLine.includes('installed,')) {
    return { platform: 'codex', status: 'n/a' };
  }

  if (!pluginLine.includes('installed, enabled')) {
    return {
      platform: 'codex',
      status: 'disabled',
      method: CODEX_PLUGIN_LIST_CONFIG_PATH,
      configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
      errors: [`Codex plugin line for ${CODEX_SAFETY_NET_SOURCE} must contain installed, enabled.`],
    };
  }

  return {
    platform: 'codex',
    status: 'configured',
    method: CODEX_PLUGIN_LIST_CONFIG_PATH,
    configPath: CODEX_PLUGIN_LIST_CONFIG_PATH,
  };
}
