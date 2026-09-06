import type { PolicyFilesystemTarget } from '@/core/io/safe-read';
import { writeJsonAtomic } from '@/core/policy/config-file';
import { DEFAULT_CONFIG, type RulesConfig, readRulesConfig } from '@/core/policy/rules-config';
import type { SyncRulesConfigResult } from './types';

export function readScopeRulesConfig(
  path: string | PolicyFilesystemTarget,
): { ok: true; config: RulesConfig } | { ok: false; result: SyncRulesConfigResult } {
  const loaded = readRulesConfig(path);
  if (loaded.errors.length > 0) {
    return { ok: false, result: { ok: false, errors: loaded.errors, entries: [] } };
  }
  return { ok: true, config: loaded.config ?? DEFAULT_CONFIG };
}

export function writeDefaultRulesConfig(
  path: string | PolicyFilesystemTarget,
  rules: string[] = [],
): void {
  writeJsonAtomic(path, { version: 1, rules, overrides: {}, transparent_wrappers: [] });
}

export function writeStarterRulebook(
  path: string | PolicyFilesystemTarget,
  name = 'project-rules',
): void {
  writeJsonAtomic(path, {
    rulebook_version: 1,
    name,
    version: '1.0.0',
    description:
      name === 'project-rules'
        ? 'Project-specific CC Safety Net rules.'
        : 'User-specific CC Safety Net rules.',
    author: name === 'project-rules' ? 'project' : 'user',
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-docker-system-prune',
        command: 'docker',
        subcommand: 'system',
        block_args: ['prune'],
        reason: 'Use targeted cleanup instead.',
      },
    ],
    tests: [
      {
        command: 'docker system prune',
        expect: 'blocked',
        rule: 'block-docker-system-prune',
      },
    ],
  });
}
