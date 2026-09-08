import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Environment } from '@/core/environment';
import { atomicWriteFile } from '@/core/io/atomic-write';
import {
  appendTomlArrayItem,
  findTopLevelTomlArray,
  removeTomlArrayItem,
  removeTomlTableBlocks,
  removeTopLevelEmptyTomlArray,
} from '@/core/io/toml';
import type { InstallResult } from '@/hosts/install/types';
import { managedHookCommands } from '@/hosts/managed-command';

const KIMI_HOOK_COMMAND = managedHookCommands['kimi-code'];
const KIMI_HOOK_BLOCK = `[[hooks]]
event = "PreToolUse"
command = "${KIMI_HOOK_COMMAND}"`;
const KIMI_INLINE_HOOK = `{ event = "PreToolUse", command = "${KIMI_HOOK_COMMAND}" }`;
const KIMI_TOML_ERRORS = {
  stringError: 'Unterminated string in Kimi Code config',
  bracketError: 'Unmatched hooks array in Kimi Code config',
};

function getKimiConfigPath(environment: Environment) {
  return join(
    environment.env.get('KIMI_CODE_HOME') ?? join(environment.home, '.kimi-code'),
    'config.toml',
  );
}

function appendKimiHook(content: string) {
  const inlineHooksRange = findTopLevelTomlArray(content, 'hooks', KIMI_TOML_ERRORS);
  if (inlineHooksRange && content.slice(inlineHooksRange.start + 1, inlineHooksRange.end).trim()) {
    return appendTomlArrayItem(content, inlineHooksRange, KIMI_INLINE_HOOK);
  }

  const trimmed = removeTopLevelEmptyTomlArray(content, 'hooks').trimEnd();
  if (trimmed === '') return `${KIMI_HOOK_BLOCK}\n`;
  return `${trimmed}\n\n${KIMI_HOOK_BLOCK}\n`;
}

export function installKimiCode(environment: Environment): InstallResult {
  const configPath = getKimiConfigPath(environment);
  mkdirSync(dirname(configPath), { recursive: true });

  if (!existsSync(configPath)) {
    atomicWriteFile(configPath, `${KIMI_HOOK_BLOCK}\n`);
    return { path: configPath, alreadyInstalled: false };
  }

  const content = readFileSync(configPath, 'utf-8');
  if (content.includes(KIMI_HOOK_COMMAND)) return { path: configPath, alreadyInstalled: true };

  atomicWriteFile(configPath, appendKimiHook(content));
  return { path: configPath, alreadyInstalled: false };
}

export function uninstallKimiCode(environment: Environment): InstallResult {
  const configPath = getKimiConfigPath(environment);
  if (!existsSync(configPath)) return { path: configPath, alreadyInstalled: false };

  const content = readFileSync(configPath, 'utf-8');
  if (!content.includes(KIMI_HOOK_COMMAND)) return { path: configPath, alreadyInstalled: false };

  const inlineHooksRange = findTopLevelTomlArray(content, 'hooks', KIMI_TOML_ERRORS);
  const updated = inlineHooksRange
    ? removeTomlArrayItem(content, inlineHooksRange, KIMI_INLINE_HOOK)
    : `${removeTomlTableBlocks(content, 'hooks', KIMI_HOOK_COMMAND)}\n`;

  atomicWriteFile(configPath, updated);
  return { path: configPath, alreadyInstalled: true };
}
