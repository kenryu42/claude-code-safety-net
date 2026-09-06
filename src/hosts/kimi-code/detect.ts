/**
 * Kimi Code hook detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import type { DetectContext, HookDetection } from '@/hosts/detect/context';

const KIMI_HOOK_COMMAND_PATTERN = /cc-safety-net\s+hook\s+(?:[^\s]+\s+)*--kimi-code(\s|["']|$)/;

function _getKimiConfigPath(environment: Environment): string {
  return join(
    environment.env.get('KIMI_CODE_HOME') || join(environment.home, '.kimi-code'),
    'config.toml',
  );
}

export function detect(context: DetectContext): HookDetection {
  const configPath = _getKimiConfigPath(context.environment);

  if (!existsSync(configPath)) {
    return { platform: 'kimi-code', status: 'n/a', configPath };
  }

  try {
    if (!KIMI_HOOK_COMMAND_PATTERN.test(readFileSync(configPath, 'utf-8'))) {
      return { platform: 'kimi-code', status: 'n/a', configPath };
    }
  } catch (e) {
    return {
      platform: 'kimi-code',
      status: 'n/a',
      configPath,
      errors: [`Failed to read ${configPath}: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  return {
    platform: 'kimi-code',
    status: 'configured',
    method: 'hook config',
    configPath,
  };
}
