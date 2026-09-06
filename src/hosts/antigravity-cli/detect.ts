/**
 * Antigravity CLI hook detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import { getAntigravityHooksPath } from '@/hosts/antigravity-cli/hook';
import type { DetectContext, HookDetection } from '@/hosts/detect/context';

const ANTIGRAVITY_HOOK_COMMAND_PATTERN =
  /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*(?:--agy-cli|-ac)(\s|["']|$)/;

function _findAntigravitySafetyNetHooks(
  config: unknown,
): Array<{ enabled: boolean; command: string }> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [];

  return Object.values(config as Record<string, unknown>).flatMap((definition) => {
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) return [];

    const record = definition as Record<string, unknown>;
    const preToolUse = record.PreToolUse;
    if (!Array.isArray(preToolUse)) return [];

    return preToolUse.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
      const hooks = (entry as Record<string, unknown>).hooks;
      if (!Array.isArray(hooks)) return [];

      return hooks.flatMap((hook) => {
        if (!hook || typeof hook !== 'object' || Array.isArray(hook)) return [];
        const command = (hook as Record<string, unknown>).command;
        if (typeof command !== 'string' || !ANTIGRAVITY_HOOK_COMMAND_PATTERN.test(command)) {
          return [];
        }
        return [{ command, enabled: record.enabled !== false }];
      });
    });
  });
}

export function detect(context: DetectContext): HookDetection {
  const configPath = getAntigravityHooksPath(context.environment.home);

  if (!existsSync(configPath)) {
    return { platform: 'antigravity-cli', status: 'n/a', configPath };
  }

  let matches: Array<{ enabled: boolean; command: string }>;
  try {
    matches = _findAntigravitySafetyNetHooks(JSON.parse(readFileSync(configPath, 'utf-8')));
  } catch (e) {
    return {
      platform: 'antigravity-cli',
      status: 'n/a',
      configPath,
      errors: [
        `Failed to parse Antigravity hooks config ${configPath}: ${e instanceof Error ? e.message : String(e)}`,
      ],
    };
  }

  if (matches.some((match) => match.enabled)) {
    return {
      platform: 'antigravity-cli',
      status: 'configured',
      method: 'hook config',
      configPath,
    };
  }

  if (matches.length > 0) {
    return {
      platform: 'antigravity-cli',
      status: 'disabled',
      method: 'hook config',
      configPath,
    };
  }

  return { platform: 'antigravity-cli', status: 'n/a', configPath };
}
