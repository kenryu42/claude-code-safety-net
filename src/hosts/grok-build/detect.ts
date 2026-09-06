/**
 * Grok Build hook detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { DetectContext, HookDetection } from '@/hosts/detect/context';
import {
  GROK_BUILD_HOOK_COMMAND,
  GROK_BUILD_HOOK_TIMEOUT,
  getGrokBuildHooksPath,
} from '@/hosts/grok-build/install';

function _isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _findGrokBuildManagedEntries(config: unknown): Array<Record<string, unknown>> {
  if (!_isRecord(config) || !_isRecord(config.hooks)) return [];
  const preToolUse = config.hooks.PreToolUse;
  if (!Array.isArray(preToolUse)) return [];

  return preToolUse.filter(
    (entry): entry is Record<string, unknown> =>
      _isRecord(entry) &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((hook) => _isRecord(hook) && hook.command === GROK_BUILD_HOOK_COMMAND),
  );
}

function _grokBuildDriftErrors(entry: Record<string, unknown>): string[] {
  const handlers = Array.isArray(entry.hooks) ? entry.hooks.filter(_isRecord) : [];
  // Validate one coherent handler: two half-right handlers must not read as healthy.
  const managed = handlers.find((hook) => hook.command === GROK_BUILD_HOOK_COMMAND);
  return [
    // Grok Build treats an absent, empty, or "*" matcher as matching every tool
    // (xai-grok-hooks matcher.rs compiles "" and "*" to MatcherKind::All, never an error).
    ...(entry.matcher === undefined || entry.matcher === '' || entry.matcher === '*'
      ? []
      : ['Managed hook has a "matcher" that narrows coverage; reinstall to repair']),
    ...(managed?.type === 'command'
      ? []
      : ['Managed hook "type" is not "command"; reinstall to repair']),
    ...(managed?.timeout === GROK_BUILD_HOOK_TIMEOUT
      ? []
      : [`Managed hook "timeout" is not ${GROK_BUILD_HOOK_TIMEOUT}; reinstall to repair`]),
  ];
}

export function detect(context: DetectContext): HookDetection {
  const configPath = getGrokBuildHooksPath(context.environment);

  if (!existsSync(configPath)) {
    return { platform: 'grok-build', status: 'n/a', configPath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (e) {
    return {
      platform: 'grok-build',
      status: 'n/a',
      configPath,
      errors: [
        `Failed to parse Grok Build hooks config ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const entry = _findGrokBuildManagedEntries(parsed)[0];
  if (!entry) {
    return { platform: 'grok-build', status: 'n/a', configPath };
  }

  const errors = _grokBuildDriftErrors(entry);
  return {
    platform: 'grok-build',
    status: 'configured',
    method: 'hook config',
    configPath,
    errors: errors.length > 0 ? errors : undefined,
  };
}
