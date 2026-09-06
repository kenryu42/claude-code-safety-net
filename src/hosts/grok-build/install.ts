import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Environment } from '@/core/environment';
import { atomicWriteFile } from '@/core/io/atomic-write';
import type { InstallResult } from '@/hosts/install/types';
import { managedHookCommands } from '@/hosts/managed-command';

export const GROK_BUILD_HOOK_COMMAND = managedHookCommands['grok-build'];
export const GROK_BUILD_HOOK_TIMEOUT = 30;

// A dedicated file under the always-trusted global hooks dir. cc-safety-net names the
// file, but users may append their own entries: install and uninstall only ever touch
// entries carrying the managed command and preserve everything else.
export function getGrokBuildHooksPath(environment: Environment): string {
  return join(
    environment.env.get('GROK_HOME') ?? join(environment.home, '.grok'),
    'hooks',
    'cc-safety-net.json',
  );
}

type GrokBuildConfig = { hooks?: unknown; [key: string]: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalEntry() {
  return {
    // No matcher: every tool call is inspected, so file and patch tools reach the
    // adapter's path protections instead of only run_terminal_command.
    hooks: [
      { type: 'command', command: GROK_BUILD_HOOK_COMMAND, timeout: GROK_BUILD_HOOK_TIMEOUT },
    ],
  };
}

function isManagedHandler(hook: unknown): boolean {
  return isRecord(hook) && hook.command === GROK_BUILD_HOOK_COMMAND;
}

// Strip managed handlers out of each entry, keeping sibling handlers (and the entry's
// matcher) intact; entries left with no handlers disappear entirely.
function withoutManagedHandlers(entries: readonly unknown[]): unknown[] {
  return entries.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) return [entry];
    const foreign = entry.hooks.filter((hook) => !isManagedHandler(hook));
    if (foreign.length === entry.hooks.length) return [entry];
    return foreign.length === 0 ? [] : [{ ...entry, hooks: foreign }];
  });
}

function parseGrokBuildConfig(raw: string): GrokBuildConfig | null {
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getPreToolUse(config: GrokBuildConfig): unknown[] {
  const preToolUse = isRecord(config.hooks) ? config.hooks.PreToolUse : undefined;
  return Array.isArray(preToolUse) ? preToolUse : [];
}

function writeGrokBuildConfig(
  configPath: string,
  config: GrokBuildConfig,
  preToolUse: unknown[],
): void {
  const hooks = isRecord(config.hooks) ? config.hooks : {};
  atomicWriteFile(
    configPath,
    `${JSON.stringify({ ...config, hooks: { ...hooks, PreToolUse: preToolUse } }, null, 2)}\n`,
  );
}

export function installGrokBuild(environment: Environment): InstallResult {
  const configPath = getGrokBuildHooksPath(environment);
  if (!existsSync(configPath)) {
    mkdirSync(dirname(configPath), { recursive: true });
    writeGrokBuildConfig(configPath, {}, [canonicalEntry()]);
    return { path: configPath, alreadyInstalled: false };
  }

  const config = parseGrokBuildConfig(readFileSync(configPath, 'utf-8'));
  // Invalid JSON in a file this integration names cannot carry usable foreign hooks
  // (Grok skips unparsable hook files entirely); repair it to canonical.
  if (!config) {
    writeGrokBuildConfig(configPath, {}, [canonicalEntry()]);
    return { path: configPath, alreadyInstalled: false };
  }

  const existing = getPreToolUse(config);
  const managed = existing.filter(
    (entry) => isRecord(entry) && Array.isArray(entry.hooks) && entry.hooks.some(isManagedHandler),
  );
  if (managed.length === 1 && JSON.stringify(managed[0]) === JSON.stringify(canonicalEntry())) {
    return { path: configPath, alreadyInstalled: true };
  }

  writeGrokBuildConfig(configPath, config, [...withoutManagedHandlers(existing), canonicalEntry()]);
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallGrokBuild(environment: Environment): InstallResult {
  const configPath = getGrokBuildHooksPath(environment);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  const config = parseGrokBuildConfig(readFileSync(configPath, 'utf-8'));
  // Unparsable content is not provably ours to delete; leave it in place.
  if (!config) return { path: configPath, alreadyInstalled: false };

  const existing = getPreToolUse(config);
  const stripped = withoutManagedHandlers(existing);
  if (JSON.stringify(stripped) === JSON.stringify(existing)) {
    return { path: configPath, alreadyInstalled: false };
  }

  const hooks = isRecord(config.hooks) ? config.hooks : {};
  const onlyOurs =
    stripped.length === 0 && Object.keys(config).length === 1 && Object.keys(hooks).length === 1;
  if (onlyOurs) {
    rmSync(configPath);
    return { path: configPath, alreadyInstalled: true };
  }

  writeGrokBuildConfig(configPath, config, stripped);
  return { path: configPath, alreadyInstalled: true };
}
