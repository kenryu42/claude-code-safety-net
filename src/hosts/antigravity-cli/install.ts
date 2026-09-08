import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Environment } from '@/core/environment';
import { atomicWriteFile } from '@/core/io/atomic-write';
import { getAntigravityHooksPath } from '@/hosts/antigravity-cli/hook';
import type { InstallResult } from '@/hosts/install/types';
import { managedHookCommands } from '@/hosts/managed-command';

const ANTIGRAVITY_HOOK_COMMAND = managedHookCommands['antigravity-cli'];
const MANAGED_HOOK_NAME = 'cc-safety-net';

type AntigravityHookHandler = {
  type?: string;
  command?: string;
  timeout?: number;
};

type AntigravityPreToolUseEntry = {
  hooks?: AntigravityHookHandler[];
  [key: string]: unknown;
};

type AntigravityHookDefinition = {
  enabled?: boolean;
  PreToolUse?: AntigravityPreToolUseEntry[];
  [key: string]: unknown;
};

// Read-side values stay unknown: the file is hand-editable, so any key can
// hold any JSON shape and must be preserved rather than crashed on.
type AntigravityHooksConfig = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function managedHookEntry(): AntigravityHookDefinition {
  return {
    PreToolUse: [
      {
        hooks: [
          {
            type: 'command',
            command: ANTIGRAVITY_HOOK_COMMAND,
            timeout: 30,
          },
        ],
      },
    ],
  };
}

function parseAntigravityHooksConfig(configPath: string): AntigravityHooksConfig {
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error('Antigravity hooks config must be a JSON object');
    }
    return config as AntigravityHooksConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Antigravity hooks config ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function getManagedHookDefinition(config: AntigravityHooksConfig): {
  definition: Record<string, unknown>;
  preToolUse: unknown[];
} {
  const existing = config[MANAGED_HOOK_NAME];
  if (existing === undefined) {
    const created = managedHookEntry();
    config[MANAGED_HOOK_NAME] = created;
    return { definition: created, preToolUse: created.PreToolUse ?? [] };
  }

  if (!isRecord(existing)) {
    throw new Error(`Antigravity hooks config entry "${MANAGED_HOOK_NAME}" must be an object`);
  }

  const preToolUse = Array.isArray(existing.PreToolUse) ? existing.PreToolUse : [];
  existing.PreToolUse = preToolUse;
  return { definition: existing, preToolUse };
}

function hasManagedHookCommand(definition: Record<string, unknown>): boolean {
  if (!Array.isArray(definition.PreToolUse)) return false;

  return definition.PreToolUse.some(
    (entry) =>
      isRecord(entry) &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((hook) => isRecord(hook) && hook.command === ANTIGRAVITY_HOOK_COMMAND),
  );
}

function hasActiveManagedHook(config: AntigravityHooksConfig): boolean {
  return Object.values(config).some(
    (definition) =>
      isRecord(definition) && definition.enabled !== false && hasManagedHookCommand(definition),
  );
}

function enableManagedHookDefinition(config: AntigravityHooksConfig): boolean {
  if (config[MANAGED_HOOK_NAME] === undefined) return false;

  const managed = getManagedHookDefinition(config);
  if (managed.definition.enabled !== false || !hasManagedHookCommand(managed.definition)) {
    return false;
  }

  managed.definition.enabled = true;
  return true;
}

function appendManagedHook(config: AntigravityHooksConfig): void {
  if (config[MANAGED_HOOK_NAME] === undefined) {
    config[MANAGED_HOOK_NAME] = managedHookEntry();
    return;
  }

  const managed = getManagedHookDefinition(config);
  managed.definition.enabled = true;
  managed.preToolUse.push(managedHookEntry().PreToolUse?.[0] ?? { hooks: [] });
}

function removeManagedHook(config: AntigravityHooksConfig): boolean {
  let removed = false;
  for (const definition of Object.values(config)) {
    if (!isRecord(definition) || !Array.isArray(definition.PreToolUse)) continue;
    definition.PreToolUse = definition.PreToolUse.flatMap((entry) => {
      if (!isRecord(entry) || !Array.isArray(entry.hooks)) return [entry];

      const hooks = entry.hooks.filter(
        (hook) => !isRecord(hook) || hook.command !== ANTIGRAVITY_HOOK_COMMAND,
      );
      if (hooks.length !== entry.hooks.length) removed = true;
      return hooks.length === 0 ? [] : [{ ...entry, hooks }];
    });
  }
  return removed;
}

function writeAntigravityHooksConfig(configPath: string, config: AntigravityHooksConfig): void {
  atomicWriteFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

export function installAntigravityCli(environment: Environment): InstallResult {
  const configPath = getAntigravityHooksPath(environment.home);
  mkdirSync(dirname(configPath), { recursive: true });

  if (!existsSync(configPath)) {
    writeAntigravityHooksConfig(configPath, { [MANAGED_HOOK_NAME]: managedHookEntry() });
    return { path: configPath, alreadyInstalled: false };
  }

  const config = parseAntigravityHooksConfig(configPath);
  if (hasActiveManagedHook(config)) return { path: configPath, alreadyInstalled: true };
  if (enableManagedHookDefinition(config)) {
    writeAntigravityHooksConfig(configPath, config);
    return { path: configPath, alreadyInstalled: false };
  }

  appendManagedHook(config);
  writeAntigravityHooksConfig(configPath, config);
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallAntigravityCli(environment: Environment): InstallResult {
  const configPath = getAntigravityHooksPath(environment.home);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  const config = parseAntigravityHooksConfig(configPath);
  const removed = removeManagedHook(config);
  if (!removed) return { path: configPath, alreadyInstalled: false };

  writeAntigravityHooksConfig(configPath, config);
  return { path: configPath, alreadyInstalled: true };
}
