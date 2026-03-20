/**
 * Hook detection with integrated self-test for the doctor command.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HookStatus, SelfTestCase, SelfTestResult, SelfTestSummary } from '@/bin/doctor/types';
import { analyzeCommand } from '@/core/analyze';
import type { LoadConfigOptions } from '@/core/config';
import type { Config } from '@/types';

interface HookDetectOptions extends LoadConfigOptions {
  homeDir?: string;
  copilotCliVersion?: string | null;
}

interface CopilotHookEntry {
  type?: string;
  bash?: string;
  powershell?: string;
  command?: string;
}

interface CopilotHookConfig {
  disableAllHooks?: boolean;
  hooks?: {
    preToolUse?: CopilotHookEntry[];
  };
}

interface CopilotInlineConfigSource {
  path: string;
  config: CopilotHookConfig;
}

interface CopilotDetectionState {
  activeConfigPaths: string[];
  disabledBy?: string;
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

function _isSafetyNetCopilotCommand(command: string | undefined): boolean {
  if (!command?.includes('cc-safety-net')) return false;
  return /(^|\s)(--copilot-cli|-cp)(\s|$)/.test(command);
}

function _parseSemver(version: string | null | undefined): [number, number, number] | null {
  if (!version) return null;

  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function _compareSemver(
  version: string | null | undefined,
  threshold: readonly [number, number, number],
): number | null {
  const parsed = _parseSemver(version);
  if (!parsed) return null;

  for (let index = 0; index < threshold.length; index++) {
    const left = parsed[index] ?? 0;
    const right = threshold[index] ?? 0;
    if (left > right) return 1;
    if (left < right) return -1;
  }

  return 0;
}

function _supportsCopilotUserHookFiles(version: string | null | undefined): boolean | null {
  const comparison = _compareSemver(version, [0, 0, 422]);
  if (comparison === null) return null;
  return comparison >= 0;
}

function _supportsCopilotInlineHooks(version: string | null | undefined): boolean | null {
  const comparison = _compareSemver(version, [1, 0, 8]);
  if (comparison === null) return null;
  return comparison >= 0;
}

function _getCopilotConfigHome(homeDir: string): string {
  return process.env.COPILOT_HOME || join(homeDir, '.copilot');
}

function _hasSafetyNetCopilotHook(config: CopilotHookConfig): boolean {
  const preToolUseHooks = config.hooks?.preToolUse ?? [];
  return preToolUseHooks.some((hook) => {
    if (hook.type !== 'command') return false;
    return (
      _isSafetyNetCopilotCommand(hook.command) ||
      _isSafetyNetCopilotCommand(hook.bash) ||
      _isSafetyNetCopilotCommand(hook.powershell)
    );
  });
}

function _readCopilotConfigFile(
  configPath: string,
  errors?: string[],
): CopilotHookConfig | undefined {
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8')) as CopilotHookConfig;
  } catch (e) {
    errors?.push(`Failed to parse ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

function _listJsonFiles(dirPath: string, errors?: string[]): string[] {
  try {
    return readdirSync(dirPath)
      .filter((name) => name.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch (e) {
    errors?.push(`Failed to read ${dirPath}: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

function _collectSafetyNetCopilotHookFiles(dirPath: string, errors: string[]): string[] {
  if (!existsSync(dirPath)) return [];

  const matches: string[] = [];
  for (const filename of _listJsonFiles(dirPath, errors)) {
    const configPath = join(dirPath, filename);
    const config = _readCopilotConfigFile(configPath, errors);
    if (config && _hasSafetyNetCopilotHook(config)) {
      matches.push(configPath);
    }
  }

  return matches;
}

function _collectCopilotInlineConfig(
  configPath: string,
  errors?: string[],
): CopilotInlineConfigSource | undefined {
  if (!existsSync(configPath)) return undefined;

  const config = _readCopilotConfigFile(configPath, errors);
  if (!config) return undefined;

  return { path: configPath, config };
}

function _warnOnUnsupportedCopilotSource(
  errors: string[],
  version: string | null | undefined,
  sourceDescription: string,
  requiredVersion: string,
): void {
  if (version) {
    errors.push(
      `Copilot CLI ${version} does not support ${sourceDescription}; requires ${requiredVersion}+`,
    );
    return;
  }

  errors.push(
    `Copilot CLI version unavailable; skipping ${sourceDescription} because it requires ${requiredVersion}+`,
  );
}

function _resolveCopilotInlineDisableSource(inlineSources: {
  userConfig?: CopilotInlineConfigSource;
  repoSettings?: CopilotInlineConfigSource;
  localSettings?: CopilotInlineConfigSource;
}): string | undefined {
  const precedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig,
  ];

  for (const source of precedence) {
    if (source?.config.disableAllHooks === true) return source.path;
    if (source?.config.disableAllHooks === false) return undefined;
  }

  return undefined;
}

/**
 * Check if Copilot CLI hooks are enabled via supported repository, user, and inline config sources.
 */
function _checkCopilotEnabled(
  homeDir: string,
  cwd: string,
  copilotCliVersion: string | null | undefined,
  errors: string[],
): CopilotDetectionState {
  const configHome = _getCopilotConfigHome(homeDir);
  const repoHookDir = join(cwd, '.github', 'hooks');
  const userHookDir = join(configHome, 'hooks');
  const repoConfigDir = join(cwd, '.github', 'copilot');
  const inlineSupport = _supportsCopilotInlineHooks(copilotCliVersion);
  const inlineErrors = inlineSupport === true ? errors : undefined;
  const inlineSources = {
    userConfig: _collectCopilotInlineConfig(join(configHome, 'config.json'), inlineErrors),
    repoSettings: _collectCopilotInlineConfig(join(repoConfigDir, 'settings.json'), inlineErrors),
    localSettings: _collectCopilotInlineConfig(
      join(repoConfigDir, 'settings.local.json'),
      inlineErrors,
    ),
  };

  if (inlineSupport !== false) {
    const disableSource = _resolveCopilotInlineDisableSource(inlineSources);
    if (disableSource) {
      if (inlineSupport === null) {
        errors.push(
          `Copilot CLI version unavailable; treating disableAllHooks in ${disableSource} as active`,
        );
      }
      return { activeConfigPaths: [], disabledBy: disableSource };
    }
  }

  const repoHookPaths = _collectSafetyNetCopilotHookFiles(repoHookDir, errors);

  const userHookSupport = _supportsCopilotUserHookFiles(copilotCliVersion);
  const userHookErrors = userHookSupport === true ? errors : undefined;
  const userHookFiles = existsSync(userHookDir) ? _listJsonFiles(userHookDir, userHookErrors) : [];
  const userHookPaths: string[] = [];
  for (const filename of userHookFiles) {
    const configPath = join(userHookDir, filename);
    const config = _readCopilotConfigFile(configPath, userHookErrors);
    if (config && _hasSafetyNetCopilotHook(config)) {
      userHookPaths.push(configPath);
    }
  }
  if (userHookSupport !== true && userHookPaths.length > 0) {
    _warnOnUnsupportedCopilotSource(
      errors,
      copilotCliVersion,
      `user hook files in ${userHookDir}`,
      '0.0.422',
    );
    userHookPaths.length = 0;
  }

  const inlinePaths: string[] = [];
  const inlineSourcesByPrecedence = [
    inlineSources.localSettings,
    inlineSources.repoSettings,
    inlineSources.userConfig,
  ];

  for (const source of inlineSourcesByPrecedence) {
    if (!source) continue;
    if (!_hasSafetyNetCopilotHook(source.config)) continue;

    if (inlineSupport === true) {
      inlinePaths.push(source.path);
      continue;
    }

    _warnOnUnsupportedCopilotSource(
      errors,
      copilotCliVersion,
      'inline hook definitions in Copilot config files',
      '1.0.8',
    );
    break;
  }

  return {
    activeConfigPaths: [
      ...inlinePaths.filter((path) => path.endsWith('settings.local.json')),
      ...inlinePaths.filter((path) => path.endsWith('settings.json')),
      ...repoHookPaths,
      ...inlinePaths.filter((path) => path.endsWith('config.json')),
      ...userHookPaths,
    ],
  };
}

/**
 * Detect all hooks and run self-tests for configured ones.
 */
export function detectAllHooks(cwd: string, options?: HookDetectOptions): HookStatus[] {
  const homeDir = options?.homeDir ?? homedir();
  const detectCopilot = (): HookStatus => {
    const errors: string[] = [];
    const hooksCheck = _checkCopilotEnabled(homeDir, cwd, options?.copilotCliVersion, errors);

    if (hooksCheck.disabledBy) {
      return {
        platform: 'copilot-cli',
        status: 'disabled',
        method: 'hook config',
        configPath: hooksCheck.disabledBy,
        configPaths: [hooksCheck.disabledBy],
        errors: errors.length > 0 ? errors : undefined,
      };
    }

    if (hooksCheck.activeConfigPaths.length > 0) {
      return {
        platform: 'copilot-cli',
        status: 'configured',
        method: 'hook config',
        configPath: hooksCheck.activeConfigPaths[0],
        configPaths: hooksCheck.activeConfigPaths,
        selfTest: runSelfTest(),
        errors: errors.length > 0 ? errors : undefined,
      };
    }

    return {
      platform: 'copilot-cli',
      status: 'n/a',
      errors: errors.length > 0 ? errors : undefined,
    };
  };

  return [
    detectClaudeCode(homeDir),
    detectOpenCode(homeDir),
    detectGeminiCLI(homeDir, cwd),
    detectCopilot(),
  ];
}
