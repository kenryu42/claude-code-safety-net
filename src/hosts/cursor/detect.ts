/**
 * Cursor hook detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import { CURSOR_HOOK_COMMAND, getCursorHooksPath } from '@/hosts/cursor/install';
import type { DetectContext, HookDetection } from '@/hosts/detect/context';

function _findCursorManagedEntries(config: unknown): Array<Record<string, unknown>> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
  const hooks = (config as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) return [];
  const preToolUse = (hooks as Record<string, unknown>).preToolUse;
  if (!Array.isArray(preToolUse)) return [];

  return preToolUse.filter(
    (entry): entry is Record<string, unknown> =>
      !!entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      (entry as Record<string, unknown>).command === CURSOR_HOOK_COMMAND,
  );
}

function _cursorDriftErrors(entries: Array<Record<string, unknown>>): string[] {
  const errors: string[] = [];
  if (entries.length > 1) {
    errors.push('Multiple managed cc-safety-net hooks found; reinstall to collapse duplicates');
  }
  const entry = entries[0];
  if (entry && entry.failClosed !== true) {
    errors.push('Managed hook is missing "failClosed": true; reinstall to repair');
  }
  if (entry && entry.timeout !== 30) {
    errors.push('Managed hook "timeout" is not 30; reinstall to repair');
  }
  return errors;
}

export function detect(context: DetectContext): HookDetection {
  const configPath = getCursorHooksPath(context.environment);

  if (!existsSync(configPath)) {
    return { platform: 'cursor', status: 'n/a', configPath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (e) {
    return {
      platform: 'cursor',
      status: 'n/a',
      configPath,
      errors: [
        `Failed to parse Cursor hooks config ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  const entries = _findCursorManagedEntries(parsed);
  if (entries.length === 0) {
    return { platform: 'cursor', status: 'n/a', configPath };
  }

  const errors = _cursorDriftErrors(entries);
  return {
    platform: 'cursor',
    status: 'configured',
    method: 'hook config',
    configPath,
    errors: errors.length > 0 ? errors : undefined,
  };
}
