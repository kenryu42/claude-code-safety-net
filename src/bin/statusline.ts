import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { envTruthy } from '@/core/env';

/**
 * Read piped stdin content asynchronously.
 * Returns null if stdin is a TTY (no piped input) or empty.
 */
async function readStdinAsync(): Promise<string | null> {
  if (process.stdin.isTTY) {
    return null;
  }

  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      const trimmed = data.trim();
      resolve(trimmed || null);
    });
    process.stdin.on('error', () => {
      resolve(null);
    });
  });
}

function getSettingsPath(): string {
  // Allow override for testing
  if (process.env.CLAUDE_SETTINGS_PATH) {
    return process.env.CLAUDE_SETTINGS_PATH;
  }
  return join(homedir(), '.claude', 'settings.json');
}

interface ClaudeSettings {
  enabledPlugins?: Record<string, boolean>;
}

function isPluginEnabled(): boolean {
  const settingsPath = getSettingsPath();

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

    const pluginKey = 'safety-net@cc-marketplace';
    // If not explicitly set, default to disabled
    if (!(pluginKey in settings.enabledPlugins)) {
      return false;
    }

    return settings.enabledPlugins[pluginKey] === true;
  } catch {
    // On any error (invalid JSON, etc.), default to disabled
    return false;
  }
}

export async function printStatusline(): Promise<void> {
  const enabled = isPluginEnabled();

  // Build our status string
  let status: string;

  if (!enabled) {
    status = '🛡️ Safety Net ❌';
  } else {
    const strict = envTruthy('SAFETY_NET_STRICT');
    const paranoidAll = envTruthy('SAFETY_NET_PARANOID');
    const paranoidRm = paranoidAll || envTruthy('SAFETY_NET_PARANOID_RM');
    const paranoidInterpreters = paranoidAll || envTruthy('SAFETY_NET_PARANOID_INTERPRETERS');

    let modeEmojis = '';

    // Strict mode: 🔒
    if (strict) {
      modeEmojis += '🔒';
    }

    // Paranoid modes: 👁️ if PARANOID or (PARANOID_RM + PARANOID_INTERPRETERS)
    // Otherwise individual emojis: 🗑️ for RM, 🐚 for interpreters
    if (paranoidAll || (paranoidRm && paranoidInterpreters)) {
      modeEmojis += '👁️';
    } else if (paranoidRm) {
      modeEmojis += '🗑️';
    } else if (paranoidInterpreters) {
      modeEmojis += '🐚';
    }

    // If no mode flags, show ✅
    const statusEmoji = modeEmojis || '✅';
    status = `🛡️ Safety Net ${statusEmoji}`;
  }

  // Check for piped stdin input and prepend with separator
  // Skip JSON input (Claude Code pipes status JSON that shouldn't be echoed)
  const stdinInput = await readStdinAsync();
  if (stdinInput && !stdinInput.startsWith('{')) {
    console.log(`${stdinInput} | ${status}`);
  } else {
    console.log(status);
  }
}
