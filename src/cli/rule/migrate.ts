import { dirname, join } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyFile,
  removePolicyFile,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import {
  getLegacyUserRulesConfigPath,
  validateConfig,
  writeJsonAtomic,
} from '@/core/policy/config-file';
import { getProjectRulesConfigPath, getUserRulesConfigPath } from '@/core/policy/paths';
import { readRulesConfig } from '@/core/policy/rules-config';
import type { CustomRule } from '@/core/policy/types';
import { getLegacyProjectRulesConfigPath, getScopePaths } from '@/rules-manager/paths';
import { syncRulesConfig } from '@/rules-manager/sync';
import type { SyncRulesConfigOptions } from '@/rules-manager/types';

const PROJECT_MIGRATED_FROM = '.safety-net.json';
const USER_MIGRATED_FROM = '~/.cc-safety-net/config.json';

interface RulesMigrateOptions {
  cleanup: boolean;
  cwd: string;
}

interface MigrateRulesScopeOptions {
  legacyPath: string;
  configPath: string;
  defaultRulebookName: string;
  migratedFrom: string;
  cleanup: boolean;
  syncOptions: SyncRulesConfigOptions;
}

interface LegacyRulesConfig {
  version: 1;
  rules: CustomRule[];
}

type FileSnapshot = { target: PolicyFilesystemTarget; content: string | null };

export async function runRulesMigrate(
  environment: Environment,
  options: RulesMigrateOptions,
): Promise<number> {
  const results = [
    await migrateRulesScope(environment, {
      legacyPath: getLegacyProjectRulesConfigPath({ cwd: options.cwd }),
      configPath: getProjectRulesConfigPath(options.cwd),
      defaultRulebookName: 'project-rules',
      migratedFrom: PROJECT_MIGRATED_FROM,
      cleanup: options.cleanup,
      syncOptions: { cwd: options.cwd },
    }),
    await migrateRulesScope(environment, {
      legacyPath: getLegacyUserRulesConfigPath(environment),
      configPath: getUserRulesConfigPath(environment),
      defaultRulebookName: 'user-rules',
      migratedFrom: USER_MIGRATED_FROM,
      cleanup: options.cleanup,
      syncOptions: { cwd: options.cwd, global: true },
    }),
  ];
  return results.every((result) => result) ? 0 : 1;
}

async function migrateRulesScope(
  environment: Environment,
  options: MigrateRulesScopeOptions,
): Promise<boolean> {
  const scope = getScopePaths(environment, options.syncOptions);
  const legacyTarget = getPolicyFilesystemTargetForPath(scope.filesystemScope, options.legacyPath);
  const legacyContent = readPolicyFile(legacyTarget);
  if (legacyContent === null) {
    console.log(`No legacy config found at ${options.legacyPath}`);
    return true;
  }

  const legacy = readLegacyRulesConfig(legacyContent);
  if (!legacy.ok) {
    for (const error of legacy.errors) console.error(error);
    return false;
  }

  const loaded = readRulesConfig(scope.configTarget);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors) console.error(error);
    return false;
  }

  const config = loaded.config ?? {
    version: 1 as const,
    rules: [],
    overrides: {},
    transparent_wrappers: [],
  };
  const rulebookName = getMigratedRulebookName(
    dirname(options.configPath),
    config.rules,
    options.defaultRulebookName,
    options.migratedFrom,
    scope.filesystemScope,
  );
  const rulebookPath = join(dirname(options.configPath), rulebookName, 'rulebook.json');
  const rulebookTarget = getPolicyFilesystemTargetForPath(scope.filesystemScope, rulebookPath);
  const snapshots = [snapshotFile(scope.configTarget), snapshotFile(rulebookTarget)];

  const result = await writeAndSyncMigratedRulebook(
    environment,
    options,
    scope.configTarget,
    rulebookTarget,
    rulebookName,
    legacy.config.rules,
    config.rules.includes(rulebookName) ? config.rules : [...config.rules, rulebookName],
    config.overrides ?? {},
    config.transparent_wrappers ?? [],
  );
  if (!result.ok) {
    restoreFiles(snapshots);
    for (const error of result.errors) console.error(error);
    return false;
  }

  if (!options.cleanup) {
    console.log(`Migrated legacy config at ${options.legacyPath}. Legacy file is no longer used.`);
    return true;
  }

  if (
    !isCleanupVerified(
      scope.configTarget,
      rulebookTarget,
      rulebookName,
      options.migratedFrom,
      legacy.config.rules,
    )
  ) {
    console.error(`Migration cleanup verification failed for ${options.legacyPath}`);
    return false;
  }

  removePolicyFile(legacyTarget);
  console.log(`Deleted legacy config at ${options.legacyPath}`);
  return true;
}

async function writeAndSyncMigratedRulebook(
  environment: Environment,
  options: MigrateRulesScopeOptions,
  configTarget: PolicyFilesystemTarget,
  rulebookTarget: PolicyFilesystemTarget,
  rulebookName: string,
  rules: CustomRule[],
  configRules: string[],
  overrides: Record<string, unknown>,
  transparentWrappers: string[],
): Promise<{ ok: boolean; errors: string[] }> {
  try {
    writeJsonAtomic(configTarget, {
      version: 1,
      rules: configRules,
      overrides,
      transparent_wrappers: transparentWrappers,
    });
    writeJsonAtomic(rulebookTarget, getMigratedRulebook(rulebookName, options.migratedFrom, rules));
    return await syncRulesConfig(environment, options.syncOptions);
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
}

function readLegacyRulesConfig(
  content: string,
): { ok: true; config: LegacyRulesConfig } | { ok: false; errors: string[] } {
  try {
    const parsed = JSON.parse(content) as unknown;
    const validation = validateConfig(parsed);
    if (validation.errors.length > 0) return { ok: false, errors: validation.errors };
    return {
      ok: true,
      config: {
        version: 1,
        rules: ((parsed as Record<string, unknown>).rules as CustomRule[] | undefined) ?? [],
      },
    };
  } catch {
    return {
      ok: false,
      errors: ['Invalid JSON'],
    };
  }
}

function getMigratedRulebookName(
  configDir: string,
  sources: string[],
  defaultRulebookName: string,
  migratedFrom: string,
  filesystemScope: PolicyFilesystemScope,
): string {
  const existing = sources.find(
    (source) =>
      getMigratedFrom(
        getPolicyFilesystemTargetForPath(filesystemScope, join(configDir, source, 'rulebook.json')),
      ) === migratedFrom,
  );
  if (existing) return existing;
  if (
    readPolicyFile(
      getPolicyFilesystemTargetForPath(
        filesystemScope,
        join(configDir, defaultRulebookName, 'rulebook.json'),
      ),
    ) === null
  )
    return defaultRulebookName;

  for (let i = 2; ; i++) {
    const name = `${defaultRulebookName}-${i}`;
    if (
      readPolicyFile(
        getPolicyFilesystemTargetForPath(filesystemScope, join(configDir, name, 'rulebook.json')),
      ) === null
    )
      return name;
  }
}

function getMigratedRulebook(name: string, migratedFrom: string, rules: CustomRule[]) {
  return {
    rulebook_version: 1,
    name,
    version: '1.0.0',
    description: 'Migrated CC Safety Net rules.',
    author: 'project',
    migrated_from: migratedFrom,
    allowed_commands: [...new Set(rules.map((rule) => rule.command))],
    rules,
    tests: rules.map((rule) => ({
      command: [rule.command, rule.subcommand, rule.block_args[0]].filter(Boolean).join(' '),
      expect: 'blocked',
      rule: rule.name,
    })),
  };
}

function isCleanupVerified(
  configTarget: PolicyFilesystemTarget,
  rulebookTarget: PolicyFilesystemTarget,
  rulebookName: string,
  migratedFrom: string,
  legacyRules: CustomRule[],
): boolean {
  const config = readRulesConfig(configTarget).config;
  if (!config?.rules.includes(rulebookName)) return false;

  try {
    const content = readPolicyFile(rulebookTarget);
    if (content === null) return false;
    const rulebook = JSON.parse(content) as Record<string, unknown>;
    return (
      rulebook.migrated_from === migratedFrom &&
      JSON.stringify(rulebook.rules) === JSON.stringify(legacyRules)
    );
  } catch {
    return false;
  }
}

function snapshotFile(target: PolicyFilesystemTarget): FileSnapshot {
  return { target, content: readPolicyFile(target) };
}

function restoreFiles(snapshots: FileSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.content === null) {
      removePolicyFile(snapshot.target);
      continue;
    }
    writePolicyFileAtomic(snapshot.target, snapshot.content);
  }
}

function getMigratedFrom(target: PolicyFilesystemTarget): string | null {
  const content = readPolicyFile(target);
  if (content === null) return null;
  try {
    const rulebook = JSON.parse(content) as Record<string, unknown>;
    return typeof rulebook.migrated_from === 'string' ? rulebook.migrated_from : null;
  } catch {
    return null;
  }
}
