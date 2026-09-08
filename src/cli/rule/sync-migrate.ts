import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  getPolicyFilesystemTargetForPath,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyFile,
  removePolicyDirectory,
  removePolicyFile,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import { getLocalRulebookPath } from '@/core/policy/paths';
import { readRulesConfig } from '@/core/policy/rules-config';
import { validateRulebookContent } from '@/core/policy/scope-policy';
import {
  isGitHubRulebookSource,
  parseGitHubSource,
  RULEBOOK_FILE,
} from '@/core/policy/source-syntax';
import { getScopePaths, type ScopePaths } from '@/rules-manager/paths';
import type { SyncRulesConfigOptions } from '@/rules-manager/types';

/**
 * `rule sync` no longer synchronizes anything: every rulebook is a live file. What is left is a
 * one-time, offline migration of the lock and cache a version 2 install published, so a scope that
 * still carries them keeps enforcing the rulebooks it already had.
 */
const DEPRECATION_NOTICE =
  '`cc-safety-net rule sync` is deprecated: rulebooks are live files that need no synchronization. This run only migrates the lock and cache an earlier version left behind.';

const CACHE_DIR = 'cache';
const CACHE_RULEBOOKS_DIR = 'rulebooks';

/** The v2 lock is read once, here, so nothing else has to model a retired file format. */
interface V2LockEntry {
  spec: string;
  digest: string;
  name?: unknown;
  owner?: unknown;
  repo?: unknown;
  display_ref?: unknown;
}

export function runRuleSyncMigration(
  environment: Environment,
  options: SyncRulesConfigOptions = {},
): number {
  const scope = getScopePaths(environment, options);
  const cacheTarget = getPolicyFilesystemTargetForPath(
    scope.filesystemScope,
    getV2CacheDir(scope.configDir),
  );
  const lock = readPolicyFile(scope.lockTarget);

  console.log(DEPRECATION_NOTICE);
  if (lock === null && !existsSync(cacheTarget.path)) {
    console.log(
      `No v2 lock or cache leftovers found in ${dirname(scope.configDir)}; nothing to migrate.`,
    );
    return 0;
  }

  const entries = readV2LockEntries(lock);
  const configRead = readRulesConfig(scope.configTarget);
  // An unreadable config still lists sources whose only offline copies are the lock
  // and cache, and a missing config with lock entries leaves the lock as the only
  // record of the source specs; pruning either would destroy them with no way back.
  if (!configRead.config && (readPolicyFile(scope.configTarget) !== null || entries.size > 0)) {
    console.error(
      `Cannot migrate: the rules config in ${dirname(scope.configDir)} is missing or unreadable while v2 leftovers remain. Restore rule.json, then re-run rule sync.`,
    );
    return 1;
  }
  const configured = configRead.config?.rules ?? [];
  for (const line of configured.flatMap((spec) =>
    migrateVendoredRulebook(spec, entries, scope, cacheTarget, options.global === true),
  )) {
    console.log(line);
  }

  removePolicyFile(scope.lockTarget);
  removePolicyDirectory(cacheTarget);
  console.log(`Removed the v2 lock and cache under ${dirname(scope.configDir)}.`);
  return 0;
}

/** The leftovers doctor reports, in both scopes, without reading or removing anything. */
export function findRuleV2Leftovers(environment: Environment, cwd: string): string[] {
  return [
    ...new Set(
      [{ cwd }, { cwd, global: true }].flatMap((options) => {
        const scope = getScopePaths(environment, options);
        return [scope.lockPath, getV2CacheDir(scope.configDir)];
      }),
    ),
  ].filter((path) => existsSync(path));
}

/**
 * A cached copy that still matches its recorded digest is the same content `rule add` would have
 * vendored, so it migrates offline. Anything else has to be fetched again.
 */
function migrateVendoredRulebook(
  spec: string,
  entries: Map<string, V2LockEntry>,
  scope: ScopePaths,
  cacheTarget: PolicyFilesystemTarget,
  global: boolean,
): string[] {
  if (!isGitHubRulebookSource(spec)) return [];
  const name = parseGitHubSource(spec).name;
  const target = getPolicyFilesystemTargetForPath(
    scope.filesystemScope,
    getLocalRulebookPath(scope.configDir, name),
  );
  const existing = readPolicyFile(target);
  if (existing !== null && isUsableVendoredRulebook(existing, name)) return [];

  const entry = entries.get(spec);
  const cached = entry
    ? readCachedRulebook(entry, name, cacheTarget.path, scope.filesystemScope)
    : null;
  if (cached === null) {
    return [
      `Could not migrate ${spec} from the v2 cache. Run \`cc-safety-net rule update ${spec}${global ? ' --global' : ''}\` to vendor it.`,
    ];
  }
  writePolicyFileAtomic(target, cached);
  // A broken destination counted as migrated would delete the last digest-verified
  // copy while the source stays inactive, so it is restored instead.
  if (existing !== null) return [`Restored ${spec} from the v2 cache over an invalid file.`];
  return [`Vendored ${spec} from the v2 cache.`];
}

function isUsableVendoredRulebook(content: string, name: string): boolean {
  const validated = validateRulebookContent(content);
  return !('problem' in validated) && validated.rulebook.name === name;
}

function readCachedRulebook(
  entry: V2LockEntry,
  name: string,
  cacheDir: string,
  filesystemScope: PolicyFilesystemScope,
): string | null {
  const path = join(
    cacheDir,
    CACHE_RULEBOOKS_DIR,
    `${getV2CacheSlug(entry)}--${entry.digest.replace('sha256:', '').slice(0, 12)}`,
    RULEBOOK_FILE,
  );
  const content = readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path));
  if (content === null || sha256Digest(content) !== entry.digest) return null;
  const validated = validateRulebookContent(content);
  if ('problem' in validated || validated.rulebook.name !== name) return null;
  return content;
}

/** Where a v2 install cached rulebooks: a `cache` directory beside the scope's `rules` one. */
function getV2CacheDir(configDir: string): string {
  return join(dirname(configDir), CACHE_DIR);
}

function getV2CacheSlug(entry: V2LockEntry): string {
  const parts = [entry.owner, entry.repo, entry.display_ref, entry.name];
  const source = parts.every((part) => typeof part === 'string' && part !== '')
    ? `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`
    : entry.spec;
  return (
    source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'rulebook'
  );
}

function readV2LockEntries(content: string | null): Map<string, V2LockEntry> {
  const document = content === null ? null : parseJson(content);
  const rulebooks =
    isRecord(document) && Array.isArray(document.rulebooks) ? document.rulebooks : [];
  return new Map(rulebooks.filter(isV2LockEntry).map((entry) => [entry.spec, entry]));
}

function isV2LockEntry(value: unknown): value is V2LockEntry {
  return isRecord(value) && typeof value.spec === 'string' && typeof value.digest === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

function sha256Digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
