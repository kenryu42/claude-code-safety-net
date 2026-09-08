import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Environment } from '@/core/environment';
import { atomicWriteFile } from '@/core/io/atomic-write';
import type { InstallResult } from '@/hosts/install/types';
import { managedHookCommands } from '@/hosts/managed-command';

export const CURSOR_HOOK_COMMAND = managedHookCommands.cursor;
const CURSOR_HOOK_TIMEOUT = 30;

type CursorEntry = Record<string, unknown>;
type CursorHooksConfig = { version?: unknown; hooks?: unknown; [key: string]: unknown };

export function getCursorHooksPath(environment: Environment): string {
  return join(environment.home, '.cursor', 'hooks.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalCursorEntry(): CursorEntry {
  return { command: CURSOR_HOOK_COMMAND, timeout: CURSOR_HOOK_TIMEOUT, failClosed: true };
}

function isManagedCursorEntry(entry: unknown): entry is CursorEntry {
  return isRecord(entry) && entry.command === CURSOR_HOOK_COMMAND;
}

function isCanonicalCursorEntry(entry: CursorEntry): boolean {
  return (
    Object.keys(entry).length === 3 &&
    entry.command === CURSOR_HOOK_COMMAND &&
    entry.timeout === CURSOR_HOOK_TIMEOUT &&
    entry.failClosed === true
  );
}

function readCursorJson(configPath: string): unknown {
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Cursor hooks config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function parseCursorHooksConfig(configPath: string): CursorHooksConfig {
  const parsed = readCursorJson(configPath);
  if (!isRecord(parsed)) throw new Error(`Cursor hooks config ${configPath} must be a JSON object`);
  if (parsed.version !== 1)
    throw new Error(`Cursor hooks config ${configPath} must set "version": 1`);
  if (parsed.hooks !== undefined && !isRecord(parsed.hooks))
    throw new Error(`Cursor hooks config ${configPath} "hooks" must be an object`);

  const preToolUse = isRecord(parsed.hooks) ? parsed.hooks.preToolUse : undefined;
  if (preToolUse !== undefined && !Array.isArray(preToolUse))
    throw new Error(`Cursor hooks config ${configPath} "hooks.preToolUse" must be an array`);

  return parsed;
}

function getCursorPreToolUse(config: CursorHooksConfig): unknown[] {
  const preToolUse = isRecord(config.hooks) ? config.hooks.preToolUse : undefined;
  return Array.isArray(preToolUse) ? preToolUse : [];
}

function canonicalizeCursorEntries(entries: readonly unknown[]): unknown[] {
  if (!entries.some(isManagedCursorEntry)) return [...entries, canonicalCursorEntry()];

  return entries.reduce<{ result: unknown[]; inserted: boolean }>(
    (state, entry) => {
      if (!isManagedCursorEntry(entry)) {
        state.result.push(entry);
        return state;
      }
      if (!state.inserted) {
        state.result.push(canonicalCursorEntry());
        state.inserted = true;
      }
      return state;
    },
    { result: [], inserted: false },
  ).result;
}

function writeCursorHooksConfig(
  configPath: string,
  config: CursorHooksConfig,
  preToolUse: unknown[],
): void {
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  const next = { ...config, hooks: { ...hooks, preToolUse } };
  atomicWriteFile(configPath, `${JSON.stringify(next, null, 2)}\n`);
}

export function installCursor(environment: Environment): InstallResult {
  const configPath = getCursorHooksPath(environment);

  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    atomicWriteFile(
      configPath,
      `${JSON.stringify({ version: 1, hooks: { preToolUse: [canonicalCursorEntry()] } }, null, 2)}\n`,
    );
    return { path: configPath, alreadyInstalled: false };
  }

  const config = parseCursorHooksConfig(configPath);
  const existing = getCursorPreToolUse(config);
  const managed = existing.filter(isManagedCursorEntry);
  const canonicalInPlace =
    isRecord(config.hooks) &&
    Array.isArray(config.hooks.preToolUse) &&
    managed.length === 1 &&
    managed[0] !== undefined &&
    isCanonicalCursorEntry(managed[0]);
  if (canonicalInPlace) return { path: configPath, alreadyInstalled: true };

  writeCursorHooksConfig(configPath, config, canonicalizeCursorEntries(existing));
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallCursor(environment: Environment): InstallResult {
  const configPath = getCursorHooksPath(environment);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  const config = parseCursorHooksConfig(configPath);
  const existing = getCursorPreToolUse(config);
  const filtered = existing.filter((entry) => !isManagedCursorEntry(entry));
  if (filtered.length === existing.length) return { path: configPath, alreadyInstalled: false };

  writeCursorHooksConfig(configPath, config, filtered);
  return { path: configPath, alreadyInstalled: true };
}
