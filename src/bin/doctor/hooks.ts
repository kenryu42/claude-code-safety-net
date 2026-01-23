/**
 * Hook detection with integrated self-test for the doctor command.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HookStatus, SelfTestCase, SelfTestResult, SelfTestSummary } from '@/bin/doctor/types';
import { analyzeCommand } from '@/core/analyze';
import type { LoadConfigOptions } from '@/core/config';
import type { Config } from '@/types';

interface HookDetectOptions extends LoadConfigOptions {
  homeDir?: string;
}

/** Self-test cases for validating the analyzer */
const SELF_TEST_CASES: SelfTestCase[] = [
  // Git destructive commands
  { command: 'git reset --hard', description: 'git reset --hard', expectBlocked: true },

  // Filesystem destructive commands
  { command: 'rm -rf /', description: 'rm -rf /', expectBlocked: true },

  // Commands that SHOULD be allowed (negative tests)
  { command: 'rm -rf ./node_modules', description: 'rm in cwd (safe)', expectBlocked: false },
];

/** Empty config for self-test - tests built-in rules only, not user config */
const SELF_TEST_CONFIG: Config = { version: 1, rules: [] };

/**
 * Run self-test by invoking the analyzer directly.
 * Uses an empty config to test only built-in rules, avoiding false failures
 * from user-defined custom rules that may block test commands.
 */
function runSelfTest(): SelfTestSummary {
  // Use OS-appropriate temp path for cross-platform compatibility (Windows, macOS, Linux)
  const selfTestCwd = join(tmpdir(), 'cc-safety-net-self-test');
  const results: SelfTestResult[] = SELF_TEST_CASES.map((tc) => {
    const result = analyzeCommand(tc.command, {
      cwd: selfTestCwd,
      config: SELF_TEST_CONFIG,
      strict: false,
      paranoidRm: false,
      paranoidInterpreters: false,
    });

    const wasBlocked = result !== null;
    const expected = tc.expectBlocked ? 'blocked' : 'allowed';
    const actual = wasBlocked ? 'blocked' : 'allowed';

    return {
      command: tc.command,
      description: tc.description,
      expected,
      actual,
      passed: expected === actual,
      reason: result?.reason,
    };
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { passed, failed, total: results.length, results };
}

/**
 * Strip JSONC-style comments and trailing commas from a string.
 * Handles // comments, /* comments, and trailing commas before ] or }.
 * Trailing comma removal is string-aware to avoid corrupting values like ",]".
 * @internal Exported for testing
 */
export function stripJsonComments(content: string): string {
  let result = '';
  let i = 0;
  let inString = false;
  let isEscaped = false;
  let lastCommaIndex = -1; // Track position of last comma outside strings

  while (i < content.length) {
    const char = content[i] as string; // Safe: i < content.length
    const next = content[i + 1];

    // Handle escape sequences in strings
    if (isEscaped) {
      result += char;
      isEscaped = false;
      i++;
      continue;
    }

    // Track string boundaries (only double quotes in JSON)
    if (char === '"' && !inString) {
      inString = true;
      lastCommaIndex = -1; // Reset: entering string invalidates trailing comma
      result += char;
      i++;
      continue;
    }

    if (char === '"' && inString) {
      inString = false;
      result += char;
      i++;
      continue;
    }

    if (char === '\\' && inString) {
      isEscaped = true;
      result += char;
      i++;
      continue;
    }

    // Inside string - copy everything
    if (inString) {
      result += char;
      i++;
      continue;
    }

    // Outside string - handle comments
    if (char === '/' && next === '/') {
      // Single-line comment - skip to end of line
      while (i < content.length && content[i] !== '\n') {
        i++;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      // Multi-line comment - skip to */
      i += 2;
      while (i < content.length - 1) {
        if (content[i] === '*' && content[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Track commas outside strings for trailing comma removal
    if (char === ',') {
      lastCommaIndex = result.length;
      result += char;
      i++;
      continue;
    }

    // Handle closing brackets - remove trailing comma if present
    if (char === '}' || char === ']') {
      if (lastCommaIndex !== -1) {
        // Check if only whitespace between last comma and here
        const between = result.slice(lastCommaIndex + 1);
        if (/^\s*$/.test(between)) {
          // Remove the trailing comma, keep whitespace for formatting
          result = result.slice(0, lastCommaIndex) + between;
        }
      }
      lastCommaIndex = -1;
      result += char;
      i++;
      continue;
    }

    // Any other non-whitespace character invalidates the trailing comma
    if (!/\s/.test(char)) {
      lastCommaIndex = -1;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Detect Claude Code hook configuration.
 */
function detectClaudeCode(homeDir: string): HookStatus {
  const errors: string[] = [];
  const settingsPath = join(homeDir, '.claude', 'settings.json');
  const pluginKey = 'safety-net@cc-marketplace';

  // Check marketplace plugin in settings.json
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        enabledPlugins?: Record<string, boolean>;
      };
      const pluginValue = settings.enabledPlugins?.[pluginKey];

      if (pluginValue === true) {
        return {
          platform: 'claude-code',
          status: 'configured',
          method: 'marketplace plugin',
          configPath: settingsPath,
          selfTest: runSelfTest(),
        };
      }

      if (pluginValue === false) {
        return {
          platform: 'claude-code',
          status: 'disabled',
          method: 'marketplace plugin',
          configPath: settingsPath,
        };
      }
    } catch (e) {
      errors.push(`Failed to parse settings.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    platform: 'claude-code',
    status: 'n/a',
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Detect OpenCode plugin configuration.
 * OpenCode only has 'configured' or 'n/a' status (no disabled state).
 */
function detectOpenCode(homeDir: string): HookStatus {
  const errors: string[] = [];
  const configDir = join(homeDir, '.config', 'opencode');
  const candidates = ['opencode.json', 'opencode.jsonc'];

  for (const filename of candidates) {
    const configPath = join(configDir, filename);
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        const json = stripJsonComments(content);
        const config = JSON.parse(json) as { plugin?: string[] };

        const plugins = config.plugin ?? [];
        const hasSafetyNet = plugins.some((p) => p.includes('cc-safety-net'));

        if (hasSafetyNet) {
          return {
            platform: 'opencode',
            status: 'configured',
            method: 'plugin array',
            configPath,
            selfTest: runSelfTest(),
            errors: errors.length > 0 ? errors : undefined,
          };
        }
      } catch (e) {
        errors.push(`Failed to parse ${filename}: ${e instanceof Error ? e.message : String(e)}`);
        // Continue to check next candidate
      }
    }
  }

  return {
    platform: 'opencode',
    status: 'n/a',
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Check if hooks are enabled in Gemini CLI settings.
 * Returns true if tools.enableHooks is true in either global or local settings.
 */
function checkGeminiHooksEnabled(
  homeDir: string,
  cwd: string,
  errors: string[],
): { enabled: boolean; configPath?: string } {
  const candidates = [
    join(homeDir, '.gemini', 'settings.json'), // Global settings
    join(cwd, '.gemini', 'settings.json'), // Local project settings
  ];

  for (const settingsPath of candidates) {
    if (existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
          tools?: { enableHooks?: boolean };
        };
        if (settings.tools?.enableHooks === true) {
          return { enabled: true, configPath: settingsPath };
        }
      } catch (e) {
        errors.push(
          `Failed to parse ${settingsPath}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  return { enabled: false };
}

/**
 * Detect Gemini CLI hook configuration.
 *
 * Checks:
 * 1. ~/.gemini/extensions/extension-enablement.json for plugin installation
 *    - Plugin key "gemini-safety-net" must exist
 *    - At least one override must NOT start with "!" (not negated)
 * 2. ~/.gemini/settings.json or .gemini/settings.json for hooks being enabled
 *    - tools.enableHooks must be true
 *
 * Status meanings:
 * - 'configured': Plugin installed, has enabled overrides, and hooks enabled
 * - 'disabled': Plugin installed but all overrides are negated (start with '!')
 * - 'n/a': Plugin not installed, or installed but hooks not enabled
 */
function detectGeminiCLI(homeDir: string, cwd: string): HookStatus {
  const errors: string[] = [];

  // Step 1: Check extension enablement for plugin installation
  const extensionPath = join(homeDir, '.gemini', 'extensions', 'extension-enablement.json');

  if (!existsSync(extensionPath)) {
    return { platform: 'gemini-cli', status: 'n/a' };
  }

  let isInstalled = false;
  let isEnabled = false;

  try {
    const extensionConfig = JSON.parse(readFileSync(extensionPath, 'utf-8')) as Record<
      string,
      { overrides?: string[] }
    >;
    const pluginConfig = extensionConfig['gemini-safety-net'];

    if (pluginConfig) {
      isInstalled = true;
      const overrides = pluginConfig.overrides ?? [];
      // Plugin is enabled if there's at least one override that doesn't start with "!"
      // Empty overrides array means disabled (no workspaces enabled)
      isEnabled = overrides.some((o) => !o.startsWith('!'));
    }
  } catch (e) {
    errors.push(
      `Failed to parse extension-enablement.json: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Plugin not found
  if (!isInstalled) {
    return {
      platform: 'gemini-cli',
      status: 'n/a',
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Plugin installed but all overrides are negated (disabled)
  if (!isEnabled) {
    errors.push('Plugin is installed but disabled (no enabled workspace overrides)');
    return {
      platform: 'gemini-cli',
      status: 'disabled',
      method: 'extension plugin',
      configPath: extensionPath,
      errors,
    };
  }

  // Step 2: Check if hooks are enabled in settings
  const hooksCheck = checkGeminiHooksEnabled(homeDir, cwd, errors);

  // Plugin is fully configured if installed, enabled, and hooks are enabled
  if (hooksCheck.enabled) {
    return {
      platform: 'gemini-cli',
      status: 'configured',
      method: 'extension plugin',
      configPath: extensionPath,
      selfTest: runSelfTest(),
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Plugin enabled but hooks not enabled in settings
  errors.push('Hooks are not enabled (set tools.enableHooks: true in settings.json)');
  return {
    platform: 'gemini-cli',
    status: 'n/a',
    method: 'extension plugin',
    configPath: extensionPath,
    errors,
  };
}

/**
 * Detect all hooks and run self-tests for configured ones.
 */
export function detectAllHooks(cwd: string, options?: HookDetectOptions): HookStatus[] {
  const homeDir = options?.homeDir ?? homedir();

  return [detectClaudeCode(homeDir), detectOpenCode(homeDir), detectGeminiCLI(homeDir, cwd)];
}
