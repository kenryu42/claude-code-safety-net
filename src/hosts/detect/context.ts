/**
 * Shared input and state-file helpers for the per-integration hook detectors.
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import type { Environment } from '@/core/environment';
import type { HookPlatform } from '@/hosts/doctor-types';

type HookDetectionStatus = 'configured' | 'n/a' | 'disabled' | 'not-inspected';

export interface HookDetection {
  platform: HookPlatform;
  status: HookDetectionStatus;
  method?: string;
  configPath?: string;
  configPaths?: readonly string[];
  errors?: string[];
}

/**
 * Every integration is detected from the files its runtime writes, except Codex and Amp, whose
 * `codex plugin list` / `amp plugins list` output the caller passes in because those commands
 * touch nothing. Amp's managed plugin lives in the account's hosted personal repository, so
 * only that command can see it.
 */
export interface DetectContext {
  environment: Environment;
  cwd: string;
  ampPluginListOutput?: string | null;
  codexPluginListOutput?: string | null;
  copilotCliVersion?: string | null;
}

/**
 * Read a runtime's own state file. Missing is an answer ("not installed"); unparseable is not,
 * so the caller can report it as uninspected instead of guessing.
 */
export function readStateFile(
  path: string,
  preprocess: (raw: string) => string = (raw) => raw,
): { kind: 'missing' } | { kind: 'unreadable' } | { kind: 'ok'; value: unknown } {
  if (!existsSync(path)) return { kind: 'missing' };

  try {
    return { kind: 'ok', value: JSON.parse(preprocess(readFileSync(path, 'utf-8'))) };
  } catch {
    return { kind: 'unreadable' };
  }
}

/** Probe a path without following symlinks; a path we cannot stat is simply absent. */
export function lstatOrUndefined(path: string) {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

/**
 * Guard shared by the detectors that own a managed plugin *directory*: a missing directory is
 * "not installed", and anything that is not a real directory is reported instead of read, so a
 * symlink planted at the managed path can never be mistaken for our own install.
 * Returns `undefined` when the directory is usable.
 */
export function inspectManagedPluginDir(
  platform: HookPlatform,
  configPath: string,
): HookDetection | undefined {
  const info = lstatOrUndefined(configPath);
  if (!info) return { platform, status: 'n/a', configPath };
  if (!info.isSymbolicLink() && info.isDirectory()) return undefined;
  return {
    platform,
    status: 'n/a',
    configPath,
    errors: [`${configPath} is a symlink or not a directory; move or remove it before installing`],
  };
}

export function readRecord(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}
