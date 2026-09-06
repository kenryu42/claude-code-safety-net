/**
 * Pi hook detection.
 */

import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  type DetectContext,
  type HookDetection,
  readRecord,
  readStateFile,
} from '@/hosts/detect/context';

export function getPiSettingsPath(environment: Environment): string {
  return join(environment.home, '.pi', 'agent', 'settings.json');
}

export function isPiSafetyNetPackageSource(source: unknown): source is string {
  if (typeof source !== 'string') return false;
  return source === 'npm:cc-safety-net' || source.startsWith('npm:cc-safety-net@');
}

/**
 * Detect the Pi package from `settings.json`, where Pi records both the installed package and,
 * through a `-` prefix on a resource entry, which of its extensions the user switched off.
 */
export function detect(context: DetectContext): HookDetection {
  const settingsPath = getPiSettingsPath(context.environment);
  const settings = readStateFile(settingsPath);
  if (settings.kind === 'unreadable') return { platform: 'pi', status: 'not-inspected' };
  if (settings.kind === 'missing') return { platform: 'pi', status: 'n/a' };

  const packages = readRecord(settings.value, 'packages');
  if (!Array.isArray(packages)) return { platform: 'pi', status: 'n/a' };

  const entry = packages.find((candidate) =>
    isPiSafetyNetPackageSource(
      typeof candidate === 'string' ? candidate : readRecord(candidate, 'source'),
    ),
  );
  if (entry === undefined) return { platform: 'pi', status: 'n/a' };

  const extensions = readRecord(entry, 'extensions');
  const disabled =
    Array.isArray(extensions) &&
    extensions.some((resource) => typeof resource === 'string' && resource.startsWith('-'));

  if (disabled) {
    return {
      platform: 'pi',
      status: 'disabled',
      method: 'package config',
      configPath: settingsPath,
      errors: ['npm:cc-safety-net is installed but its extension is disabled in Pi settings'],
    };
  }

  return {
    platform: 'pi',
    status: 'configured',
    method: 'package config',
    configPath: settingsPath,
  };
}
