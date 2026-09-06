/**
 * OpenCode hook detection.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripJsonComments } from '@/core/io/jsonc';
import type { DetectContext, HookDetection } from '@/hosts/detect/context';
import { getOpenCodeConfigDir } from '@/hosts/opencode/install';

/**
 * Detect OpenCode plugin configuration.
 * OpenCode only has 'configured' or 'n/a' status (no disabled state).
 */
export function detect(context: DetectContext): HookDetection {
  const errors: string[] = [];
  const configDir = getOpenCodeConfigDir(context.environment);
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
