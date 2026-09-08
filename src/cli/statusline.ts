import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import { resolveEffectiveDestructiveCommandRules } from '@/core/policy/effective-rules';
import { ENV_FLAGS, envTruthy, getCCSafetyNetEnvModes } from '@/core/policy/env';
import { loadPolicySnapshot } from '@/core/policy/snapshot';
import { readBoundedHookInput } from '@/gate/intake';

/**
 * Read piped stdin content asynchronously, bounded by the hook input limit.
 * Returns null if stdin is a TTY (no piped input), empty, unreadable, or over the limit.
 */
type StatuslineInput = Parameters<typeof readBoundedHookInput>[0] & { isTTY?: boolean };

async function readStdinAsync(input: StatuslineInput): Promise<string | null> {
  if (input.isTTY) {
    return null;
  }

  // A statusline is decoration: oversized or unreadable input drops the prefix instead of
  // denying, unlike the fail-closed hook path that shares this reader.
  const content = await readBoundedHookInput(input).catch(() => null);
  return content?.trim() || null;
}

function getSettingsPath(environment: Environment): string {
  // Allow override for testing
  const override = environment.env.get('CLAUDE_SETTINGS_PATH');
  if (override) {
    return override;
  }
  return join(environment.home, '.claude', 'settings.json');
}

interface ClaudeSettings {
  enabledPlugins?: Record<string, boolean>;
}

/**
 * Whether the plugin is enabled in Claude Code. Nothing is enforced while it is
 * off, however valid the configuration is.
 */
export function isPluginEnabled(environment: Environment): boolean {
  const settingsPath = getSettingsPath(environment);

  if (!existsSync(settingsPath)) {
    // Default to disabled if settings file doesn't exist
    return false;
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as ClaudeSettings;

    // If enabledPlugins doesn't exist or plugin not listed, default to disabled
    if (!settings.enabledPlugins) {
      return false;
    }

    const pluginKey = 'cc-safety-net@cc-marketplace';
    // If not explicitly set, default to disabled
    if (!(pluginKey in settings.enabledPlugins)) {
      return false;
    }

    return settings.enabledPlugins[pluginKey] === true;
  } catch (error) {
    if (envTruthy(ENV_FLAGS.debug, environment.env)) {
      console.error(
        `CC Safety Net debug: failed to read Claude settings: ${settingsPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // On any error (invalid JSON, etc.), default to disabled
    return false;
  }
}

export async function printStatusline(
  environment: Environment,
  input: StatuslineInput = process.stdin,
): Promise<void> {
  const enabled = isPluginEnabled(environment);

  // Build our status string
  let status: string;

  if (!enabled) {
    status = '🛡️ CC Safety Net ❌';
  } else {
    const snapshot = loadPolicySnapshot(environment, { cwd: process.cwd() });
    const policy = snapshot.policy;
    const modes = getCCSafetyNetEnvModes(policy, environment.env);
    const hasEffectiveRuleCustomization = Object.values(
      resolveEffectiveDestructiveCommandRules(policy, modes.capabilities),
    ).some((rule) => rule.changesInherited);
    const levelEmoji = {
      standard: '✅',
      strict: '🔒',
      paranoid: '👁️',
      custom: '🔧',
    }[hasEffectiveRuleCustomization ? 'custom' : modes.effectiveLevel];

    // One glyph for "the project scope relaxed something": the statusline is the
    // surface a teammate sees without opening anything, and `status` carries the
    // per-field deltas behind it.
    const weakened = (snapshot.policyScopes?.weakenings.length ?? 0) > 0 ? '🔻' : '';

    status = `🛡️ CC Safety Net ${levelEmoji}${modes.worktreeMode ? '🌳' : ''}${weakened}${snapshot.state === 'degraded' ? '⚠️' : ''}`;
  }

  // Check for piped stdin input and prepend with separator
  // Skip JSON input (Claude Code pipes status JSON that shouldn't be echoed)
  const stdinInput = await readStdinAsync(input);
  if (stdinInput && !stdinInput.startsWith('{')) {
    console.log(`${stdinInput} | ${status}`);
  } else {
    console.log(status);
  }
}
