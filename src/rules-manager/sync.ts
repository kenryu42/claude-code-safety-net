import { join, resolve } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  getPolicyFilesystemTargetForPath,
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  type PolicyFilesystemTarget,
  readPolicyDirectoryEntries,
  readPolicyFile,
  removeEmptyPolicyDirectory,
  removePolicyFile,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import { writeJsonAtomic } from '@/core/policy/config-file';
import { getLocalRulebookPath } from '@/core/policy/paths';
import { RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR } from '@/core/policy/resource-limits';
import {
  type ActiveRulebookSummary,
  type RulesConfig,
  readRulesConfig,
} from '@/core/policy/rules-config';
import {
  getRulebookNameForSpec,
  getRulesConfigRuntimeErrorsForConfig,
  loadScopePolicy,
  validateRulebookContent,
} from '@/core/policy/scope-policy';
import {
  isGitHubRepositorySource,
  isGitHubRulebookSource,
  NAME_PATTERN,
  RULEBOOK_FILE,
} from '@/core/policy/source-syntax';
import { readScopeRulesConfig } from './config-file';
import { getScopePaths, type ScopePaths } from './paths';
import {
  type DiscoveredGitHubRepository,
  discoverGitHubRepositoryRulebooks,
  type ResolvedRulebook,
  resolveRulebookSourceForSync,
} from './resolver';
import {
  createRuleSyncOperation,
  isRuleSyncResourceLimitError,
  RULE_SYNC_RESOURCE_LIMITS,
  type RuleSyncOperation,
} from './resource-limits';
import { getRemoveMatches, getSelectedUpdateSpecs } from './sources';
import type {
  AddRulebookSourceOptions,
  AddRulebookSourceResult,
  SyncRulesConfigOptions,
  SyncRulesConfigResult,
} from './types';

/** @internal */
export interface RuleSyncTestHooks {
  _testDeleteLocalSourceDir?: (dir: string) => void;
  _testAfterPolicyRename?: (path: string) => void;
}

interface RemoveRulebookSourceOptions extends SyncRulesConfigOptions {
  deleteSource?: boolean;
}

interface FailedRulebookSource {
  ok: false;
  spec: string;
  message: string;
}

type SourceResolution = { ok: true; item: ResolvedRulebook } | FailedRulebookSource;

export async function syncRulesConfig(
  environment: Environment,
  options: SyncRulesConfigOptions = {},
): Promise<SyncRulesConfigResult> {
  const projected = projectSyncOptions(options);
  return verifyRuntimeRulesPolicy(
    environment,
    projected,
    await syncRulesConfigInternal(environment, projected, createRuleSyncOperation()),
  );
}

/** @internal Runs synchronization with an explicit operation for deterministic transport tests. */
export async function syncRulesConfigWithOperation(
  environment: Environment,
  options: SyncRulesConfigOptions,
  operation: RuleSyncOperation,
): Promise<SyncRulesConfigResult> {
  const projected = projectSyncOptions(options);
  return verifyRuntimeRulesPolicy(
    environment,
    projected,
    await syncRulesConfigInternal(environment, projected, operation),
  );
}

/** @internal Runs synchronization with explicit fault hooks. */
export async function syncRulesConfigWithHooks(
  environment: Environment,
  options: SyncRulesConfigOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
  const projected = projectSyncOptions(options);
  return verifyRuntimeRulesPolicy(
    environment,
    projected,
    await syncRulesConfigInternal(environment, projected, createRuleSyncOperation(), hooks),
  );
}

/**
 * Validating each source does not prove the synchronized scope loads cleanly: an unknown override
 * key only appears once the policy is reloaded the way the guard loads it.
 * Report what that reload finds instead of reporting success while the runtime state stays degraded.
 * The reload covers the scope being synchronized, so diagnostics owned by the other scope are left
 * alone: this run cannot repair them, and failing on them would break synchronizing one scope while
 * the other is still being set up. A rulebook name colliding across scopes is one of those, and it
 * resolves deterministically in favour of the first claim, so it warns rather than failing here.
 * `--check` validates the scope in isolation and would miss the same classes, so it verifies too.
 */
function verifyRuntimeRulesPolicy(
  environment: Environment,
  options: SyncRulesConfigOptions,
  result: SyncRulesConfigResult,
): SyncRulesConfigResult {
  if (!result.ok) return result;
  const scope = getScopePaths(environment, options);
  const remaining = [
    ...new Set(getRulesConfigRuntimeErrorsForConfig(scope.configPath, scope.filesystemScope)),
  ];
  if (remaining.length === 0) return result;
  return { ok: false, errors: remaining, entries: result.entries };
}

async function syncRulesConfigInternal(
  environment: Environment,
  options: SyncRulesConfigOptions,
  operation: RuleSyncOperation,
  hooks: RuleSyncTestHooks = {},
  forceRefetch: ReadonlySet<string> = new Set(),
  newlyAdded: ReadonlySet<string> = new Set(),
): Promise<SyncRulesConfigResult> {
  try {
    const scope = getScopePaths(environment, options);
    const scopeConfig = readScopeRulesConfig(scope.configTarget);
    if (!scopeConfig.ok) return scopeConfig.result;
    const config = scopeConfig.config;

    if (options.check) {
      return checkRulesConfig(config, scope, options);
    }
    const selectedSpecs = options.only
      ? getSelectedUpdateSpecs(config, options.only)
      : { ok: true as const, specs: config.rules };
    if (!selectedSpecs.ok) {
      return selectedSpecs.result;
    }
    // Every configured source is resolved so the report covers the whole scope; only the
    // selected ones re-fetch, and everything else reads the file already on disk. A newly
    // added source always re-fetches: a leftover vendored file under the same name would
    // otherwise be activated under the new spec without ever being fetched or validated.
    const refetched = new Set([...(options.refresh ? selectedSpecs.specs : []), ...forceRefetch]);
    const resolveSpec = (spec: string) =>
      resolveRulebookSourceForSync(
        spec,
        scope.configDir,
        scope.filesystemScope,
        operation,
        refetched.has(spec),
        // A selective update must not fetch its unselected siblings; every other
        // run may vendor a missing source so the whole scope converges.
        !options.refresh || refetched.has(spec),
      );
    // `rule update` refreshes each selected source independently: a source that fails to fetch
    // or validate keeps its vendored copy instead of blocking the sources that did update.
    // Resource-budget failures stay fatal for the whole operation.
    const resolutions = await mapRulebookSources<string, SourceResolution>(
      config.rules,
      options.refresh
        ? (spec) =>
            resolveSpec(spec)
              .then((item) => ({ ok: true as const, item }))
              .catch((error: unknown) => {
                if (isRuleSyncResourceLimitError(error)) throw error;
                return {
                  ok: false as const,
                  spec,
                  message: error instanceof Error ? error.message : String(error),
                };
              })
        : async (spec) => ({ ok: true, item: await resolveSpec(spec) }),
      operation,
    );
    const failures = resolutions.filter((item): item is FailedRulebookSource => !item.ok);
    const resolved = resolutions
      .filter((item): item is Extract<SourceResolution, { ok: true }> => item.ok)
      .map((item) => item.item);
    // A rulebook name is a file path, so two sources claiming one name vendor into the same
    // file: writing would destroy the other source's active rulebook, which no later restore
    // brings back. Refuse the write instead and name both sources. Names that differ only in
    // case collide too, because a case-insensitive filesystem maps them to the same file.
    const collisions = resolved.flatMap((item) => getNameCollisionFailure(item, config.rules));
    // A file already sitting at a newly added source's target has unknown provenance —
    // a hand-authored rulebook that was never listed in rule.json. Overwriting it is
    // unrecoverable data loss, so the add refuses instead.
    const unclaimed = resolved.flatMap((item) => getUnclaimedFileFailure(item, newlyAdded, scope));
    const blocked = new Set([...collisions, ...unclaimed].map((failure) => failure.spec));
    const reported = [...failures, ...collisions, ...unclaimed];
    // A failing add rolls its config edit back, so vendoring any newly added
    // sibling would strand a file no source claims — and that orphan then trips
    // the unclaimed-file refusal on the next add once upstream content moves.
    // A write that throws mid-sequence restores every file this run already
    // replaced: fetch failures keep per-source semantics, but a half-applied
    // write batch must not stay active under a result that reports failure.
    const written: { target: PolicyFilesystemTarget; previous: string | null }[] = [];
    const changes = runRestoringWrittenOnFailure(written, () =>
      resolved.flatMap((item) =>
        blocked.has(item.spec) || (reported.length > 0 && newlyAdded.has(item.spec))
          ? []
          : vendorRulebook(item, scope, hooks, written),
      ),
    );
    return {
      ok: reported.length === 0,
      errors: reported.map((failure) => `Failed to update ${failure.spec}: ${failure.message}`),
      entries: resolved.map(summarizeRulebook),
      changes,
    };
  } catch (error) {
    return failWithError(error);
  }
}

function getNameCollisionFailure(
  item: ResolvedRulebook,
  configured: readonly string[],
): FailedRulebookSource[] {
  if (!isGitHubRulebookSource(item.spec)) return [];
  const name = getRulebookNameForSpec(item.spec);
  const others = configured.filter(
    (spec) =>
      spec !== item.spec && getRulebookNameForSpec(spec).toLowerCase() === name.toLowerCase(),
  );
  if (others.length === 0) return [];
  return [
    {
      ok: false,
      spec: item.spec,
      message: `rulebook name "${name}" is also claimed by ${others.join(', ')}; rename one of them`,
    },
  ];
}

function getUnclaimedFileFailure(
  item: ResolvedRulebook,
  newlyAdded: ReadonlySet<string>,
  scope: ScopePaths,
): FailedRulebookSource[] {
  if (!newlyAdded.has(item.spec) || !isGitHubRulebookSource(item.spec)) return [];
  const path = getLocalRulebookPath(scope.configDir, item.rulebook.name);
  const previous = readPolicyFile(getPolicyFilesystemTargetForPath(scope.filesystemScope, path));
  if (previous === null || previous === item.content) return [];
  return [
    {
      ok: false,
      spec: item.spec,
      message: `${path} already exists and no configured source claims it; remove or rename the file, then re-run rule add`,
    },
  ];
}

/**
 * A remote rulebook becomes a file in the repository, next to the local ones: the fetched bytes
 * are written verbatim so the diff a reviewer sees is the rulebook itself, and every later load
 * reads that file instead of the network.
 */
function vendorRulebook(
  item: ResolvedRulebook,
  scope: ScopePaths,
  hooks: RuleSyncTestHooks,
  written?: { target: PolicyFilesystemTarget; previous: string | null }[],
): string[] {
  if (!isGitHubRulebookSource(item.spec)) return [];
  const path = getLocalRulebookPath(scope.configDir, item.rulebook.name);
  const target = getPolicyFilesystemTargetForPath(scope.filesystemScope, path);
  const previous = readPolicyFile(target);
  if (previous === item.content) return [];
  written?.push({ target, previous });
  writePolicyFileAtomic(target, item.content, undefined, hooks._testAfterPolicyRename);
  return describeVendoredChange(item, previous);
}

/** Restores the recorded writes when the wrapped vendoring throws, then rethrows. */
function runRestoringWrittenOnFailure<T>(
  written: readonly { target: PolicyFilesystemTarget; previous: string | null }[],
  run: () => T,
): T {
  try {
    return run();
  } catch (error) {
    for (const entry of [...written].reverse()) {
      if (entry.previous === null) {
        removePolicyFile(entry.target);
        continue;
      }
      writePolicyFileAtomic(entry.target, entry.previous);
    }
    throw error;
  }
}

function describeVendoredChange(item: ResolvedRulebook, previous: string | null): string[] {
  if (previous === null) return [`Vendored ${item.spec} (${item.rulebook.version})`];
  const validated = validateRulebookContent(previous);
  const before = 'problem' in validated ? null : validated.rulebook;
  const beforeRules = new Map(before?.rules.map((rule) => [rule.name, JSON.stringify(rule)]) ?? []);
  const afterRules = new Set(item.rulebook.rules.map((rule) => rule.name));
  return [
    `Updated ${item.spec} (${before?.version ?? 'unreadable'} -> ${item.rulebook.version})`,
    ...[...afterRules].filter((name) => !beforeRules.has(name)).map((name) => `  + ${name}`),
    ...[...beforeRules.keys()].filter((name) => !afterRules.has(name)).map((name) => `  - ${name}`),
    // A changed matcher or reason under an unchanged name is what the reviewer of
    // an update most needs to see; name sets alone would show nothing.
    ...item.rulebook.rules
      .filter((rule) => {
        const existing = beforeRules.get(rule.name);
        return existing !== undefined && existing !== JSON.stringify(rule);
      })
      .map((rule) => `  ~ ${rule.name}`),
  ];
}

function summarizeRulebook(item: ResolvedRulebook): ActiveRulebookSummary {
  return {
    spec: item.spec,
    name: item.rulebook.name,
    version: item.rulebook.version,
    ruleCount: item.rulebook.rules.length,
  };
}

export async function addRulebookSource(
  environment: Environment,
  source: string,
  options: AddRulebookSourceOptions = {},
): Promise<AddRulebookSourceResult> {
  return addRulebookSourceInternal(
    environment,
    source,
    projectAddOptions(options),
    createRuleSyncOperation(),
  );
}

/** @internal Adds a source with an explicit operation for deterministic transport tests. */
export async function addRulebookSourceWithOperation(
  environment: Environment,
  source: string,
  options: AddRulebookSourceOptions,
  operation: RuleSyncOperation,
): Promise<AddRulebookSourceResult> {
  return addRulebookSourceInternal(environment, source, projectAddOptions(options), operation);
}

/** @internal Adds a source with explicit fault hooks. */
export async function addRulebookSourceWithHooks(
  environment: Environment,
  source: string,
  options: AddRulebookSourceOptions,
  hooks: RuleSyncTestHooks,
): Promise<AddRulebookSourceResult> {
  return addRulebookSourceInternal(
    environment,
    source,
    projectAddOptions(options),
    createRuleSyncOperation(),
    hooks,
  );
}

async function addRulebookSourceInternal(
  environment: Environment,
  source: string,
  options: AddRulebookSourceOptions,
  operation: RuleSyncOperation,
  hooks: RuleSyncTestHooks = {},
): Promise<AddRulebookSourceResult> {
  let configSnapshot: { target: PolicyFilesystemTarget; content: string | null } | null = null;
  let configWriteArmed = false;
  try {
    const scope = getScopePaths(environment, options);
    const before = readPolicyFile(scope.configTarget);
    configSnapshot = { target: scope.configTarget, content: before };
    const scopeConfig = readScopeRulesConfig(scope.configTarget);
    if (!scopeConfig.ok) return scopeConfig.result;
    const config = scopeConfig.config;
    const repositorySource = isGitHubRepositorySource(source);
    assertRepositoryAddOptions(source, options, repositorySource);
    const repository = repositorySource
      ? await discoverGitHubRepositoryRulebooks(source, { ref: options.ref, operation })
      : null;
    const selectedNames = repository
      ? selectRepositoryRulebooks(repository, options.rulebooks)
      : [];
    const selectedSpecs = repository
      ? selectedNames.map(
          (name) =>
            getConfiguredRepositorySpec(config.rules, repository, name) ??
            `${source}#${repository.ref}/${name}`,
        )
      : [source];
    const sources = selectedSpecs.filter((spec) => !config.rules.includes(spec));
    const nextRules = [...config.rules, ...sources];
    if (nextRules.length > RULE_SOURCE_LIMIT) return sourceLimitResult();
    if (nextRules.length !== config.rules.length) {
      configWriteArmed = true;
      writeJsonAtomic(
        scope.configTarget,
        {
          version: 1,
          rules: nextRules,
          overrides: config.overrides ?? {},
          transparent_wrappers: config.transparent_wrappers ?? [],
        },
        undefined,
        hooks._testAfterPolicyRename,
      );
    }
    const result = await syncRulesConfigInternal(
      environment,
      options,
      operation,
      hooks,
      new Set(sources),
      new Set(sources),
    );
    if (!result.ok) restoreConfig(scope.configTarget, before);
    if (!result.ok || !repository) return result;
    const added = selectedNames.filter((_, index) => sources.includes(selectedSpecs[index] ?? ''));
    return {
      ...result,
      add: {
        source,
        ref: repository.ref,
        selected: selectedNames,
        added,
        alreadyConfigured: selectedNames.filter((name) => !added.includes(name)),
        // Discovery resolved the ref once, so every rulebook this add vendored came
        // from that single commit. An idempotent re-add vendors nothing, and naming
        // the advanced commit would describe content the files do not contain.
        commits: sources.length > 0 ? [repository.commit] : [],
      },
    };
  } catch (error) {
    if (configWriteArmed && configSnapshot) {
      try {
        restoreConfig(configSnapshot.target, configSnapshot.content);
      } catch (rollbackError) {
        return failWithError(rollbackError);
      }
    }
    return failWithError(error);
  }
}

function assertRepositoryAddOptions(
  source: string,
  options: AddRulebookSourceOptions,
  repositorySource: boolean,
): void {
  if (!repositorySource && options.rulebooks !== undefined) {
    throw new Error('--only can only select rulebooks from an owner/repo source');
  }
  if (!repositorySource && options.ref) {
    throw new Error(`--ref can only select a ref for an owner/repo source: ${source}`);
  }
  if (options.rulebooks?.length === 0) {
    throw new Error('--only requires at least one rulebook name');
  }
  const invalidNames = options.rulebooks?.filter((name) => !NAME_PATTERN.test(name)) ?? [];
  if (invalidNames.length > 0) {
    throw new Error(`Invalid rulebook names: ${invalidNames.join(', ')}`);
  }
}

function selectRepositoryRulebooks(
  repository: DiscoveredGitHubRepository,
  requested: readonly string[] | undefined,
): string[] {
  const selected = requested ? [...new Set(requested)] : repository.names;
  const missing = selected.filter((name) => !repository.names.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Rulebooks not found in ${repository.source} at ${repository.ref}: ${missing.join(', ')}\nAvailable rulebooks: ${repository.names.join(', ')}`,
    );
  }
  return selected;
}

/**
 * The same rulebook can already be configured under a spec pinned at the very commit this ref
 * resolves to; adding it again must reuse that spec rather than configure the rulebook twice.
 */
function getConfiguredRepositorySpec(
  configured: string[],
  repository: DiscoveredGitHubRepository,
  name: string,
): string | undefined {
  const canonical = `${repository.source}#${repository.ref}/${name}`;
  if (configured.includes(canonical)) return canonical;
  const pinned = `${repository.source}#${repository.commit}/${name}`;
  return configured.find((spec) => spec === pinned);
}

/** @internal Maps rulebook sources with bounded fanout and ordered results. */
export async function mapRulebookSources<T, U>(
  sources: readonly T[],
  mapper: (source: T, index: number, signal: AbortSignal) => Promise<U>,
  operation: RuleSyncOperation = createRuleSyncOperation(),
): Promise<U[]> {
  if (sources.length > RULE_SOURCE_LIMIT) throw new Error(RULE_SOURCE_LIMIT_ERROR);
  const results = new Array<U>(sources.length);
  let nextIndex = 0;
  let firstError: { value: unknown } | undefined;
  const workers = Array.from(
    { length: Math.min(sources.length, RULE_SYNC_RESOURCE_LIMITS.concurrency) },
    async () => {
      while (!firstError) {
        const index = nextIndex;
        if (index >= sources.length) return;
        nextIndex++;
        try {
          results[index] = await mapper(sources[index] as T, index, operation.controller.signal);
        } catch (error) {
          if (!firstError) {
            firstError = { value: error };
            nextIndex = sources.length;
            operation.controller.abort(error);
          }
          return;
        }
      }
    },
  );
  await Promise.all(workers);
  if (firstError) throw firstError.value;
  return results;
}

function sourceLimitResult(): SyncRulesConfigResult {
  return { ok: false, errors: [RULE_SOURCE_LIMIT_ERROR], entries: [] };
}

function projectSyncOptions(options: SyncRulesConfigOptions): SyncRulesConfigOptions {
  return {
    cwd: options.cwd,
    userConfigDir: options.userConfigDir,
    userConfigPath: options.userConfigPath,
    projectConfigPath: options.projectConfigPath,
    global: options.global,
    check: options.check,
    only: options.only,
    refresh: options.refresh,
  };
}

function projectAddOptions(options: AddRulebookSourceOptions): AddRulebookSourceOptions {
  return {
    ...projectSyncOptions(options),
    ref: options.ref,
    rulebooks: options.rulebooks,
  };
}

function projectRemoveOptions(options: RemoveRulebookSourceOptions): RemoveRulebookSourceOptions {
  return { ...projectSyncOptions(options), deleteSource: options.deleteSource };
}

export async function removeRulebookSource(
  environment: Environment,
  match: string,
  options: RemoveRulebookSourceOptions = {},
): Promise<SyncRulesConfigResult> {
  try {
    return await removeRulebookSourceInternal(
      environment,
      match,
      projectRemoveOptions(options),
      {},
    );
  } catch (error) {
    return failWithError(error);
  }
}

/** @internal Removes a source with explicit fault hooks. */
export async function removeRulebookSourceWithHooks(
  environment: Environment,
  match: string,
  options: RemoveRulebookSourceOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
  try {
    return await removeRulebookSourceInternal(
      environment,
      match,
      projectRemoveOptions(options),
      hooks,
    );
  } catch (error) {
    return failWithError(error);
  }
}

async function removeRulebookSourceInternal(
  environment: Environment,
  match: string,
  options: RemoveRulebookSourceOptions,
  hooks: RuleSyncTestHooks,
): Promise<SyncRulesConfigResult> {
  const scope = getScopePaths(environment, options);
  const loaded = readRulesConfig(scope.configTarget);
  if (loaded.errors.length > 0) {
    return { ok: false, errors: loaded.errors, entries: [] };
  }
  if (!loaded.config) {
    return {
      ok: false,
      errors: [`No config found at ${scope.configPath}`],
      entries: [],
    };
  }
  const matches = getRemoveMatches(loaded.config.rules, match);
  if (!matches.ok) return matches.result;
  const sourceDirs = options.deleteSource
    ? getLocalSourceDirsForDelete(scope.configDir, matches.specs, scope.filesystemScope)
    : { ok: true as const, dirs: [] };
  if (!sourceDirs.ok) return sourceDirs.result;
  const before = readPolicyFile(scope.configTarget);
  if (before === null) return failWithError(new Error('Rules config is unavailable.'));
  try {
    writeJsonAtomic(
      scope.configTarget,
      {
        version: 1,
        rules: loaded.config.rules.filter((spec) => !matches.specs.includes(spec)),
        overrides: loaded.config.overrides ?? {},
        transparent_wrappers: loaded.config.transparent_wrappers ?? [],
      },
      undefined,
      hooks._testAfterPolicyRename,
    );
  } catch (error) {
    restoreConfig(scope.configTarget, before);
    throw error;
  }
  const result = await syncRulesConfigInternal(
    environment,
    options,
    createRuleSyncOperation(),
    hooks,
  );
  if (!result.ok) {
    restoreConfig(scope.configTarget, before);
    return result;
  }
  const deleteResult = deleteLocalSourceDirs(sourceDirs.dirs, hooks, scope.filesystemScope);
  if (!deleteResult.ok) {
    restoreConfig(scope.configTarget, before);
    const rollback = await syncRulesConfigInternal(
      environment,
      options,
      createRuleSyncOperation(),
      hooks,
    );
    if (!rollback.ok) {
      return {
        ok: false,
        errors: [...deleteResult.result.errors, ...rollback.errors],
        entries: rollback.entries,
      };
    }
    return deleteResult.result;
  }
  return result;
}

async function checkRulesConfig(
  config: RulesConfig,
  scope: ScopePaths,
  options: SyncRulesConfigOptions,
): Promise<SyncRulesConfigResult> {
  const result = loadScopePolicy(
    config,
    scope.configDir,
    options.global ? 'user' : 'project',
    scope.filesystemScope,
  );
  return {
    ok: result.errors.length === 0 && result.warnings.length === 0,
    errors: [...result.errors, ...result.warnings],
    entries: result.entries,
  };
}

function getLocalSourceDirsForDelete(
  configDir: string,
  specs: string[],
  filesystemScope: PolicyFilesystemScope,
): { ok: true; dirs: string[] } | { ok: false; result: SyncRulesConfigResult } {
  // A bare name is the whole identity of a local source, and it is also its directory.
  const errors = specs.flatMap((spec) =>
    NAME_PATTERN.test(spec) ? [] : ['--delete-source can only delete local rulebook sources'],
  );
  const dirs = specs.map((spec) => join(configDir, spec));
  const dirErrors =
    errors.length > 0
      ? []
      : dirs.flatMap((dir) => getLocalSourceDirDeleteError(dir, filesystemScope));
  const allErrors = [...errors, ...dirErrors];
  return allErrors.length > 0
    ? { ok: false, result: { ok: false, errors: allErrors, entries: [] } }
    : { ok: true, dirs };
}

// The caller only reaches here with a bare-name spec, so the directory is a single child of
// the config dir by construction: there is no path to resolve and nowhere to escape to.
function getLocalSourceDirDeleteError(
  dir: string,
  filesystemScope: PolicyFilesystemScope,
): string[] {
  const resolvedDir = resolve(dir);
  const target = getPolicyFilesystemTargetForPath(filesystemScope, resolvedDir);
  const entries = readPolicyDirectoryEntries(target);
  if (!entries) return [`Local rulebook source directory not found: ${dir}`];
  const rulebookEntry = entries.find((entry) => entry.name === 'rulebook.json');
  if (!rulebookEntry) {
    return [`Local rulebook source directory is missing rulebook.json: ${dir}`];
  }
  if (rulebookEntry.kind !== 'file') throw new PolicyFilesystemError(filesystemScope.label);
  readPolicyFile(
    getPolicyFilesystemTargetForPath(filesystemScope, join(resolvedDir, 'rulebook.json')),
  );
  if (entries.length > 1) {
    return [
      `Local rulebook source directory contains extra files: ${dir}. delete manually if you really want to remove the directory.`,
    ];
  }
  return [];
}

// `dirs` holds at most one entry: duplicate config specs are rejected at
// validation and GitHub multi-matches are refused by the local-only check, so
// a failed delete never leaves other requested source dirs partially removed.
function deleteLocalSourceDirs(
  dirs: string[],
  hooks: RuleSyncTestHooks,
  filesystemScope: PolicyFilesystemScope,
): { ok: true } | { ok: false; result: SyncRulesConfigResult } {
  const errors = dirs.flatMap((dir) => {
    try {
      // The preflight check ran before the sync, which can await network
      // fetches; files a concurrent process added during that gap must refuse
      // the delete, not be swept up by it. A directory that vanished during
      // the same gap is the requested end state, not a failure.
      if (!readPolicyDirectoryEntries(getPolicyFilesystemTargetForPath(filesystemScope, dir))) {
        return [];
      }
      const staleErrors = getLocalSourceDirDeleteError(dir, filesystemScope);
      if (staleErrors.length > 0) return staleErrors;
      deleteLocalSourceDir(dir, hooks, filesystemScope);
      return [];
    } catch (error) {
      return [
        `Failed to delete local rulebook source ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      ];
    }
  });
  return errors.length > 0
    ? { ok: false, result: { ok: false, errors, entries: [] } }
    : { ok: true };
}

function deleteLocalSourceDir(
  dir: string,
  hooks: RuleSyncTestHooks,
  filesystemScope: PolicyFilesystemScope,
): void {
  if (hooks._testDeleteLocalSourceDir) {
    hooks._testDeleteLocalSourceDir(dir);
    return;
  }
  // Delete exactly what the revalidation approved — the rulebook file, then
  // the directory only if still empty — instead of a recursive delete that
  // would also take files added between the revalidation and this point. A
  // file that lands after the unlink surfaces as an rmdir failure with that
  // file preserved; only the user-requested rulebook file is ever deleted.
  removePolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, join(dir, RULEBOOK_FILE)));
  removeEmptyPolicyDirectory(getPolicyFilesystemTargetForPath(filesystemScope, dir));
}

function restoreConfig(path: PolicyFilesystemTarget, content: string | null): void {
  if (content === null) {
    removePolicyFile(path);
    return;
  }
  writePolicyFileAtomic(path, content);
}

function failWithError(error: unknown): SyncRulesConfigResult {
  return {
    ok: false,
    errors: [error instanceof Error ? error.message : String(error)],
    entries: [],
  };
}
