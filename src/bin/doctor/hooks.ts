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
  claudePluginListOutput?: string | null;
  geminiExtensionsListOutput?: string | null;
  copilotCliVersion?: string | null;
  copilotPluginInstalled?: boolean;
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

interface CodexConfig {
  pluginHooks?: boolean;
  safetyNetEnabled?: boolean;
}

const COPILOT_PLUGIN_CONFIG_PATH = 'copilot-plugin';
const CLAUDE_PLUGIN_LIST_CONFIG_PATH = 'claude plugin list';
const CLAUDE_SAFETY_NET_PLUGIN_ID = 'safety-net@cc-marketplace';
const GEMINI_EXTENSIONS_LIST_CONFIG_PATH = 'gemini extensions list';
const GEMINI_SAFETY_NET_SOURCE = 'https://github.com/kenryu42/gemini-safety-net';
const CODEX_PLUGIN_HOOKS_WARNING =
  'Codex plugin hooks are behind a feature flag. Add `plugin_hooks = true` under [features] in $CODEX_HOME/config.toml.';
const CODEX_SAFETY_NET_PLUGIN_ID = 'safety-net@cc-marketplace';

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
function detectClaudeCode(pluginListOutput: string | null | undefined): HookStatus {
  if (!pluginListOutput) {
    return { platform: 'claude-code', status: 'n/a' };
  }

  const pluginBlock = _findClaudeSafetyNetPluginBlock(pluginListOutput);
  if (!pluginBlock) {
    return { platform: 'claude-code', status: 'n/a' };
  }

  if (/^\s*Status:\s*.*\bdisabled\b\s*$/im.test(pluginBlock)) {
    return {
      platform: 'claude-code',
      status: 'disabled',
      method: 'plugin list',
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    };
  }

  if (/^\s*Status:\s*.*\benabled\b\s*$/im.test(pluginBlock)) {
    return {
      platform: 'claude-code',
      status: 'configured',
      method: 'plugin list',
      configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
      selfTest: runSelfTest(),
    };
  }

  return {
    platform: 'claude-code',
    status: 'disabled',
    method: 'plugin list',
    configPath: CLAUDE_PLUGIN_LIST_CONFIG_PATH,
    errors: ['Status is not enabled'],
  };
}

function _findClaudeSafetyNetPluginBlock(output: string): string | undefined {
  const pluginLinePattern = new RegExp(
    `^\\s*(?:[^\\w\\s@]+\\s+)?${_escapeRegExp(CLAUDE_SAFETY_NET_PLUGIN_ID)}\\s*$`,
  );
  const pluginStartPattern = /^\s*(?:[^\w\s@]+\s+)?\S+@\S+\s*$/;
  const lines = output.split('\n');
  const startIndex = lines.findIndex((line) => pluginLinePattern.test(line));

  if (startIndex === -1) return undefined;

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && pluginStartPattern.test(line),
  );
  return lines.slice(startIndex, endIndex === -1 ? undefined : endIndex).join('\n');
}

function _escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
 * Detect Gemini CLI hook configuration.
 *
 * Checks:
 * 1. `gemini extensions list` output for the safety-net source URL
 * 2. Effective enabled state using workspace over user scope, defaulting to enabled
 *
 * Status meanings:
 * - 'configured': Extension source is installed and effectively enabled
 * - 'disabled': Extension source is installed but effectively disabled
 * - 'n/a': Extension source is not installed, or list output is unavailable
 */
function detectGeminiCLI(extensionsListOutput: string | null | undefined): HookStatus {
  if (!extensionsListOutput) {
    return { platform: 'gemini-cli', status: 'n/a' };
  }

  const extension = _parseGeminiExtensionsList(extensionsListOutput).find((item) =>
    item.source?.includes(GEMINI_SAFETY_NET_SOURCE),
  );

  if (!extension) {
    return { platform: 'gemini-cli', status: 'n/a' };
  }

  const effectiveEnabled = extension.enabledWorkspace ?? extension.enabledUser ?? true;
  const errors = effectiveEnabled
    ? []
    : [
        extension.enabledWorkspace === false
          ? 'Enabled (Workspace) is false'
          : 'Enabled (User) is false',
      ];

  if (errors.length > 0) {
    return {
      platform: 'gemini-cli',
      status: 'disabled',
      method: 'extension list',
      configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
      errors,
    };
  }

  return {
    platform: 'gemini-cli',
    status: 'configured',
    method: 'extension list',
    configPath: GEMINI_EXTENSIONS_LIST_CONFIG_PATH,
    selfTest: runSelfTest(),
  };
}

function _parseGeminiExtensionsList(
  output: string,
): Array<{ source?: string; enabledUser?: boolean; enabledWorkspace?: boolean }> {
  const blocks = output.split('\n').reduce<string[]>((result, line) => {
    if (/^\S/.test(line) || result.length === 0) {
      result.push(line);
      return result;
    }

    const index = result.length - 1;
    result[index] = `${result[index]}\n${line}`;
    return result;
  }, []);

  return blocks.map((block) => ({
    source: /^\s*Source:\s*(.+)$/m.exec(block)?.[1],
    enabledUser: _parseGeminiEnabledValue(block, 'User'),
    enabledWorkspace: _parseGeminiEnabledValue(block, 'Workspace'),
  }));
}

function _parseGeminiEnabledValue(block: string, scope: 'User' | 'Workspace'): boolean | undefined {
  const match = new RegExp(`^\\s*Enabled \\(${scope}\\):\\s*(true|false)\\s*$`, 'im').exec(block);
  if (!match) return undefined;
  return match[1] === 'true';
}

function _getCodexHome(homeDir: string): string {
  return process.env.CODEX_HOME || join(homeDir, '.codex');
}

function _parseCodexConfig(content: string): CodexConfig {
  const result: CodexConfig = {};
  content.split('\n').reduce<string | undefined>((activeSection, line) => {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) return activeSection;

    const sectionMatch = /^\[([^\]]+)]\s*(?:#.*)?$/.exec(trimmed);
    if (sectionMatch) return sectionMatch[1];

    if (activeSection === 'features') {
      const pluginHooksMatch = /^plugin_hooks\s*=\s*(true|false)\s*(?:#.*)?$/.exec(trimmed);
      if (pluginHooksMatch) result.pluginHooks = pluginHooksMatch[1] === 'true';
    }

    if (activeSection === `plugins."${CODEX_SAFETY_NET_PLUGIN_ID}"`) {
      const enabledMatch = /^enabled\s*=\s*(true|false)\s*(?:#.*)?$/.exec(trimmed);
      if (enabledMatch) result.safetyNetEnabled = enabledMatch[1] === 'true';
    }

    return activeSection;
  }, undefined);

  return result;
}

function _readCodexConfig(configPath: string, errors: string[]): CodexConfig {
  try {
    return _parseCodexConfig(readFileSync(configPath, 'utf-8'));
  } catch (e) {
    errors.push(`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`);
    return {};
  }
}

/**
 * Detect Codex plugin configuration.
 */
function detectCodex(homeDir: string): HookStatus {
  const codexHome = _getCodexHome(homeDir);
  const pluginCachePath = join(codexHome, 'plugins', 'cache', 'cc-marketplace', 'safety-net');
  const errors: string[] = [];

  if (!existsSync(pluginCachePath)) {
    return { platform: 'codex', status: 'n/a', configPath: pluginCachePath };
  }

  try {
    if (readdirSync(pluginCachePath).length === 0) {
      return { platform: 'codex', status: 'n/a', configPath: pluginCachePath };
    }
  } catch (e) {
    return {
      platform: 'codex',
      status: 'n/a',
      configPath: pluginCachePath,
      errors: [`Failed to read ${pluginCachePath}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const configPath = join(codexHome, 'config.toml');
  const config = _readCodexConfig(configPath, errors);

  if (config.safetyNetEnabled !== true) {
    return {
      platform: 'codex',
      status: 'disabled',
      method: 'plugin cache',
      configPath,
      errors: [
        ...errors,
        `Codex plugin ${CODEX_SAFETY_NET_PLUGIN_ID} is not enabled. Add enabled = true under [plugins."${CODEX_SAFETY_NET_PLUGIN_ID}"] in $CODEX_HOME/config.toml.`,
      ],
    };
  }

  if (config.pluginHooks !== true) {
    return {
      platform: 'codex',
      status: 'disabled',
      method: 'plugin cache',
      configPath,
      errors: [...errors, CODEX_PLUGIN_HOOKS_WARNING],
    };
  }

  return {
    platform: 'codex',
    status: 'configured',
    method: 'plugin cache',
    configPath,
    selfTest: runSelfTest(),
    errors: errors.length > 0 ? errors : undefined,
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
    return JSON.parse(stripJsonComments(readFileSync(configPath, 'utf-8'))) as CopilotHookConfig;
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
  const detectCopilotCLI = (): HookStatus => {
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

    if (options?.copilotPluginInstalled === true || hooksCheck.activeConfigPaths.length > 0) {
      const viaPlugin = options?.copilotPluginInstalled === true;
      const primaryConfigPath = hooksCheck.activeConfigPaths[0];
      return {
        platform: 'copilot-cli',
        status: 'configured',
        method: viaPlugin ? 'plugin list' : 'hook config',
        configPath: primaryConfigPath ?? (viaPlugin ? COPILOT_PLUGIN_CONFIG_PATH : undefined),
        configPaths:
          hooksCheck.activeConfigPaths.length > 0 ? hooksCheck.activeConfigPaths : undefined,
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
    detectClaudeCode(options?.claudePluginListOutput),
    detectOpenCode(homeDir),
    detectGeminiCLI(options?.geminiExtensionsListOutput),
    detectCopilotCLI(),
    detectCodex(homeDir),
  ];
}
