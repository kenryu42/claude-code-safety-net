/**
 * GitHub Copilot CLI hook detection.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import { stripJsonComments } from '@/core/io/jsonc';
import { COPILOT_PLUGIN_DIR, COPILOT_PLUGIN_ID } from '@/hosts/copilot-cli/plugin-id';
import {
  type DetectContext,
  type HookDetection,
  readRecord,
  readStateFile,
} from '@/hosts/detect/context';

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

function _isSafetyNetCopilotCommand(command: string | undefined): boolean {
  if (!command?.includes('cc-safety-net')) return false;
  return /(^|\s)hook\s+(?:[^\s]+\s+)*(--copilot-cli|-cp)(\s|$)/.test(command);
}

/** Null when the version is absent or unparseable, which callers report distinctly. */
function _isAtLeastVersion(
  version: string | null | undefined,
  threshold: readonly [number, number, number],
): boolean | null {
  if (!version) return null;

  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;

  const parsed = [Number(match[1]), Number(match[2]), Number(match[3])];
  for (let index = 0; index < threshold.length; index++) {
    const left = parsed[index] ?? 0;
    const right = threshold[index] ?? 0;
    if (left !== right) return left > right;
  }

  return true;
}

function _supportsCopilotUserHookFiles(version: string | null | undefined): boolean | null {
  return _isAtLeastVersion(version, [0, 0, 422]);
}

function _supportsCopilotInlineHooks(version: string | null | undefined): boolean | null {
  return _isAtLeastVersion(version, [1, 0, 8]);
}

export function _getCopilotConfigHome(environment: Environment): string {
  return environment.env.get('COPILOT_HOME') || join(environment.home, '.copilot');
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

function _isStringOrAbsent(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function _isCopilotHookConfig(value: unknown): value is CopilotHookConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  if (config.disableAllHooks !== undefined && typeof config.disableAllHooks !== 'boolean') {
    return false;
  }
  if (config.hooks === undefined) return true;
  if (!config.hooks || typeof config.hooks !== 'object' || Array.isArray(config.hooks)) {
    return false;
  }
  const preToolUse = (config.hooks as Record<string, unknown>).preToolUse;
  if (preToolUse === undefined) return true;
  return (
    Array.isArray(preToolUse) &&
    preToolUse.every(
      (entry) =>
        entry !== null &&
        typeof entry === 'object' &&
        !Array.isArray(entry) &&
        _isStringOrAbsent((entry as Record<string, unknown>).type) &&
        _isStringOrAbsent((entry as Record<string, unknown>).command) &&
        _isStringOrAbsent((entry as Record<string, unknown>).bash) &&
        _isStringOrAbsent((entry as Record<string, unknown>).powershell),
    )
  );
}

function _readCopilotConfigFile(
  configPath: string,
  errors?: string[],
): CopilotHookConfig | undefined {
  try {
    const parsed: unknown = JSON.parse(stripJsonComments(readFileSync(configPath, 'utf-8')));
    if (!_isCopilotHookConfig(parsed)) {
      errors?.push(
        `Invalid hook config ${configPath}: hooks.preToolUse must be an array of hook objects`,
      );
      return undefined;
    }
    return parsed;
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
      `GitHub Copilot CLI ${version} does not support ${sourceDescription}; requires ${requiredVersion}+`,
    );
    return;
  }

  errors.push(
    `GitHub Copilot CLI version unavailable; skipping ${sourceDescription} because it requires ${requiredVersion}+`,
  );
}

function _resolveCopilotInlineDisableSource(
  precedence: readonly (CopilotInlineConfigSource | undefined)[],
): string | undefined {
  for (const source of precedence) {
    if (source?.config.disableAllHooks === true) return source.path;
    if (source?.config.disableAllHooks === false) return undefined;
  }

  return undefined;
}

/**
 * Check if GitHub Copilot CLI hooks are enabled via supported repository, user, and inline config sources.
 */
function _checkCopilotEnabled(
  environment: Environment,
  cwd: string,
  copilotCliVersion: string | null | undefined,
  errors: string[],
): CopilotDetectionState {
  const configHome = _getCopilotConfigHome(environment);
  const repoHookDir = join(cwd, '.github', 'hooks');
  const userHookDir = join(configHome, 'hooks');
  const repoConfigDir = join(cwd, '.github', 'copilot');
  const repoClaudeDir = join(cwd, '.claude');
  const inlineSupport = _supportsCopilotInlineHooks(copilotCliVersion);
  const inlineErrors = inlineSupport === true ? errors : undefined;
  // Repository sources outrank user sources, and within the user scope `settings.json` is the
  // current file while `config.json` stays readable because the host still merges its values.
  // Copilot also reads the cross-tool `.claude` settings files, which rank below its native ones.
  const repoInlineSources = [
    _collectCopilotInlineConfig(join(repoConfigDir, 'settings.local.json'), inlineErrors),
    _collectCopilotInlineConfig(join(repoConfigDir, 'settings.json'), inlineErrors),
    _collectCopilotInlineConfig(join(repoClaudeDir, 'settings.local.json'), inlineErrors),
    _collectCopilotInlineConfig(join(repoClaudeDir, 'settings.json'), inlineErrors),
  ];
  const userInlineSources = [
    _collectCopilotInlineConfig(join(configHome, 'settings.json'), inlineErrors),
    _collectCopilotInlineConfig(join(configHome, 'config.json'), inlineErrors),
  ];

  if (inlineSupport !== false) {
    const disableSource = _resolveCopilotInlineDisableSource([
      ...repoInlineSources,
      ...userInlineSources,
    ]);
    if (disableSource) {
      if (inlineSupport === null) {
        errors.push(
          `GitHub Copilot CLI version unavailable; treating disableAllHooks in ${disableSource} as active`,
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

  const inlineMatches: CopilotInlineConfigSource[] = [];

  for (const source of [...repoInlineSources, ...userInlineSources]) {
    if (!source) continue;
    if (!_hasSafetyNetCopilotHook(source.config)) continue;

    if (inlineSupport === true) {
      inlineMatches.push(source);
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

  const matchedInlinePaths = (group: readonly (CopilotInlineConfigSource | undefined)[]) =>
    group
      .filter(
        (source): source is CopilotInlineConfigSource => !!source && inlineMatches.includes(source),
      )
      .map((source) => source.path);

  return {
    activeConfigPaths: [
      ...matchedInlinePaths(repoInlineSources),
      ...repoHookPaths,
      ...matchedInlinePaths(userInlineSources),
      ...userHookPaths,
    ],
  };
}

export function detect(context: DetectContext): HookDetection {
  const errors: string[] = [];
  const hooksCheck = _checkCopilotEnabled(
    context.environment,
    context.cwd,
    context.copilotCliVersion,
    errors,
  );

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

  // The plugin is a checkout under the Copilot config directory, named for its marketplace
  // entry, and `settings.json` records whether it is switched on. Copilot writes that file as
  // JSONC, so its comments come out before parsing.
  const configHome = _getCopilotConfigHome(context.environment);
  const pluginDir = join(configHome, 'installed-plugins', ...COPILOT_PLUGIN_DIR);
  const pluginInstalled = existsSync(pluginDir);
  const settingsPath = join(configHome, 'settings.json');
  const settings = readStateFile(settingsPath, stripJsonComments);

  if (pluginInstalled && settings.kind === 'unreadable') {
    return { platform: 'copilot-cli', status: 'not-inspected' };
  }

  // Absent means enabled: Copilot records the key only to turn a plugin off.
  if (
    pluginInstalled &&
    settings.kind === 'ok' &&
    readRecord(readRecord(settings.value, 'enabledPlugins'), COPILOT_PLUGIN_ID) === false
  ) {
    return {
      platform: 'copilot-cli',
      status: 'disabled',
      method: 'plugin config',
      configPath: settingsPath,
      errors: [`${COPILOT_PLUGIN_ID} is installed but not enabled in Copilot CLI`],
    };
  }

  if (pluginInstalled || hooksCheck.activeConfigPaths.length > 0) {
    const viaPlugin = pluginInstalled;
    const primaryConfigPath = hooksCheck.activeConfigPaths[0];
    return {
      platform: 'copilot-cli',
      status: 'configured',
      method: viaPlugin ? 'plugin config' : 'hook config',
      configPath: primaryConfigPath ?? (viaPlugin ? pluginDir : undefined),
      configPaths:
        hooksCheck.activeConfigPaths.length > 0 ? hooksCheck.activeConfigPaths : undefined,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  return {
    platform: 'copilot-cli',
    status: 'n/a',
    errors: errors.length > 0 ? errors : undefined,
  };
}
