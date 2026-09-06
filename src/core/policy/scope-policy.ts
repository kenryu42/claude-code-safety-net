import { dirname } from 'node:path';
import type { Environment } from '@/core/environment';
import {
  bindPolicyFilesystemScope,
  getPolicyFilesystemTargetForPath,
  isSamePolicyFilesystemTarget,
  PolicyFilesystemError,
  type PolicyFilesystemScope,
  readPolicyFile,
} from '@/core/io/safe-read';
import {
  getLocalRulebookPath,
  getPolicyPaths,
  RULE_UPDATE_COMMAND,
  type RulesPolicyOptions,
} from './paths';
import { assertValidRulebook, type Rulebook } from './rulebook';
import {
  type ActiveRulebookSummary,
  type LoadedRulebookInfo,
  type LoadedRulesPolicy,
  type RuleOverride,
  type RulesConfig,
  readRulesConfig,
} from './rules-config';
import { isGitHubRulebookSource, parseGitHubSource } from './source-syntax';
import type { CustomRule } from './types';

interface ScopePolicy {
  rules: CustomRule[];
  rulebooks: LoadedRulebookInfo[];
  entries: ActiveRulebookSummary[];
  knownRuleIds: Set<string>;
  errors: string[];
  warnings: string[];
  canValidateOverrides: boolean;
}

export function loadRulesPolicy(
  environment: Environment,
  options: RulesPolicyOptions,
): LoadedRulesPolicy {
  const paths = getPolicyPaths(environment, options);
  let sameConfigPath = false;
  try {
    sameConfigPath = isSamePolicyFilesystemTarget(
      paths.userConfigTarget,
      paths.projectConfigTarget,
    );
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return invalidLoadedRulesPolicy(paths, error.message);
    }
    throw error;
  }
  const user = readRulesConfig(paths.userConfigTarget);
  const project = sameConfigPath
    ? { config: null, errors: [] }
    : readRulesConfig(paths.projectConfigTarget);
  const userReadErrors = formatPolicyReadErrors(paths.userConfigPath, user.errors);
  const projectReadErrors = formatPolicyReadErrors(paths.projectConfigPath, project.errors);

  // Shared across both scopes so a name claimed by the user scope shadows the
  // project one, keeping user policy authoritative over an ambiguous name.
  const claimedRulebookNames = new Set<string>();
  const userPolicy = user.config
    ? loadScopePolicy(
        user.config,
        dirname(paths.userConfigPath),
        'user',
        paths.userScope,
        claimedRulebookNames,
      )
    : emptyScopePolicy();
  const projectPolicy = project.config
    ? loadScopePolicy(
        project.config,
        dirname(paths.projectConfigPath),
        'project',
        paths.projectScope,
        claimedRulebookNames,
      )
    : emptyScopePolicy();

  const userOverrides = user.config?.overrides ?? {};
  const projectOverrides = project.config?.overrides ?? {};

  return {
    rules: [
      ...applyOverrides(userPolicy.rules, userOverrides),
      ...applyOverrides(projectPolicy.rules, projectOverrides),
    ],
    transparent_wrappers: mergeTransparentWrappers(user.config, project.config),
    rulebooks: [...userPolicy.rulebooks, ...projectPolicy.rulebooks],
    errors: [
      ...userReadErrors,
      ...projectReadErrors,
      ...userPolicy.errors,
      ...projectPolicy.errors,
    ],
    warnings: [
      ...userPolicy.warnings,
      ...projectPolicy.warnings,
      ...(userPolicy.canValidateOverrides
        ? getUnknownOverrideErrors(userOverrides, userPolicy.knownRuleIds, paths.userConfigPath)
        : []),
      ...(userPolicy.canValidateOverrides
        ? getProjectOverrideUserRuleErrors(
            projectOverrides,
            userPolicy.knownRuleIds,
            paths.projectConfigPath,
          )
        : []),
      ...(projectPolicy.canValidateOverrides
        ? getUnknownOverrideErrors(
            projectOverrides,
            projectPolicy.knownRuleIds,
            paths.projectConfigPath,
          )
        : []),
    ],
    userConfig: user.config ?? undefined,
    projectConfig: project.config ?? undefined,
    ...paths,
  };
}

export function getRulesConfigRuntimeErrorsForConfig(
  configPath: string,
  filesystemScope?: PolicyFilesystemScope,
): string[] {
  const loaded = loadScopePolicyForConfig(configPath, filesystemScope);
  if (!loaded) return [];
  return [
    ...loaded.scope.errors,
    ...loaded.scope.warnings,
    ...getUnknownOverrideErrorsForScope(loaded.config, loaded.scope, configPath),
  ];
}

/** @internal - exported for test coverage */
export function getUnknownOverrideErrorsForConfig(
  configPath: string,
  filesystemScope?: PolicyFilesystemScope,
): string[] {
  const loaded = loadScopePolicyForConfig(configPath, filesystemScope);
  if (!loaded) return [];
  return getUnknownOverrideErrorsForScope(loaded.config, loaded.scope, configPath);
}

function loadScopePolicyForConfig(
  configPath: string,
  filesystemScope?: PolicyFilesystemScope,
): { config: RulesConfig; scope: ScopePolicy } | null {
  const scope =
    filesystemScope ?? bindPolicyFilesystemScope(dirname(dirname(configPath)), 'rules policy');
  const config = readRulesConfig(getPolicyFilesystemTargetForPath(scope, configPath)).config;
  if (!config) {
    return null;
  }
  return {
    config,
    scope: loadScopePolicy(config, dirname(configPath), 'project', scope),
  };
}

function getUnknownOverrideErrorsForScope(
  config: RulesConfig,
  scope: ScopePolicy,
  configPath: string,
): string[] {
  return scope.canValidateOverrides
    ? getUnknownOverrideErrors(config.overrides ?? {}, scope.knownRuleIds, configPath)
    : [];
}

export function loadScopePolicy(
  config: RulesConfig,
  configDir: string,
  source: 'user' | 'project',
  filesystemScope: PolicyFilesystemScope = bindPolicyFilesystemScope(
    dirname(dirname(configDir)),
    source === 'user' ? 'user policy' : 'project policy',
  ),
  claimedRulebookNames: Set<string> = new Set(),
): ScopePolicy {
  const errors: string[] = [];
  const warnings: string[] = [];
  const loaded = config.rules.flatMap((spec) => {
    const loadedRulebook = loadRulebookForSpec(spec, configDir, filesystemScope);
    if (loadedRulebook.errors.length > 0 || !loadedRulebook.rulebook) {
      errors.push(...loadedRulebook.errors);
      return [];
    }
    const rulebook = loadedRulebook.rulebook;
    // Colliding names make rule identity ambiguous, so the first claim wins and
    // the later rulebook contributes nothing rather than shadowing its rules.
    if (claimedRulebookNames.has(rulebook.name)) {
      warnings.push(
        `duplicate active rulebook name "${rulebook.name}" for ${spec}; keeping the first and ignoring this one, so its rules are not active; rename one of them in its rulebook file and in the rules config that lists it`,
      );
      return [];
    }
    claimedRulebookNames.add(rulebook.name);
    return [
      {
        rules: toPolicyRules(rulebook),
        rulebook: {
          source,
          spec,
          name: rulebook.name,
          version: rulebook.version,
          rules: rulebook.rules.map((rule) => `${rulebook.name}/${rule.name}`),
        },
      },
    ];
  });

  const rules = loaded.flatMap((item) => item.rules);
  return {
    rules,
    rulebooks: loaded.map((item) => item.rulebook),
    entries: loaded.map((item) => ({
      spec: item.rulebook.spec,
      name: item.rulebook.name,
      version: item.rulebook.version,
      ruleCount: item.rulebook.rules.length,
    })),
    knownRuleIds: new Set(rules.map((rule) => rule.name)),
    errors,
    warnings,
    canValidateOverrides: errors.length === 0,
  };
}

/**
 * Version 2 rules carry a match contract instead of block arguments; version 1 rules keep
 * theirs and drop any stray `match` key so a loose rulebook cannot opt into v2 matching.
 */
function toPolicyRules(rulebook: Rulebook): CustomRule[] {
  if (rulebook.rulebook_version === 2) {
    return rulebook.rules.map((rule) => ({
      name: `${rulebook.name}/${rule.name}`,
      command: rule.command,
      block_args: [],
      match: rule.match,
      reason: rule.reason,
      intent: rule.intent,
    }));
  }
  return rulebook.rules.map((rule) => ({
    ...rule,
    name: `${rulebook.name}/${rule.name}`,
    match: undefined,
  }));
}

/**
 * Every source is a live file: a local rulebook is authored in place and a remote one is
 * vendored by `rule add` or `rule update`, so both load from `rules/<name>/rulebook.json` with
 * no lock entry or cached copy in between. The validation is the one a cached rulebook already
 * went through, moved to the source file.
 */
function loadRulebookForSpec(
  spec: string,
  configDir: string,
  filesystemScope: PolicyFilesystemScope,
): { rulebook: Rulebook | null; errors: string[] } {
  const name = getRulebookNameForSpec(spec);
  const path = getLocalRulebookPath(configDir, name);
  const file = readRulebookFile(path, filesystemScope);
  if ('error' in file) return { rulebook: null, errors: [file.error] };
  if (file.content === null) {
    return {
      rulebook: null,
      errors: [`missing rulebook file ${path} for ${spec}; ${getMissingRulebookRepair(spec)}`],
    };
  }
  const validated = validateRulebookContent(file.content);
  if ('problem' in validated) {
    return {
      rulebook: null,
      errors: [`invalid rulebook ${path}: ${validated.problem}; fix that file`],
    };
  }
  // The source name is the rulebook's identity: rule ids are `<name>/<rule>`, so a
  // name that drifts from its source silently renames every rule the overrides in
  // `rule.json` refer to.
  if (validated.rulebook.name !== name) {
    return {
      rulebook: null,
      errors: [
        `rulebook name "${validated.rulebook.name}" in ${path} must match source "${spec}"; fix that file`,
      ],
    };
  }
  return { rulebook: validated.rulebook, errors: [] };
}

/** The rulebook name a source claims, which is also the directory its rulebook file lives in. */
export function getRulebookNameForSpec(spec: string): string {
  return isGitHubRulebookSource(spec) ? parseGitHubSource(spec).name : spec;
}

function getMissingRulebookRepair(spec: string): string {
  return isGitHubRulebookSource(spec)
    ? `run ${RULE_UPDATE_COMMAND} to vendor ${spec}`
    : 'create that file or remove that source from the rules config';
}

function readRulebookFile(
  path: string,
  filesystemScope: PolicyFilesystemScope,
): { content: string | null } | { error: string } {
  try {
    return { content: readPolicyFile(getPolicyFilesystemTargetForPath(filesystemScope, path)) };
  } catch (error) {
    if (error instanceof PolicyFilesystemError) return { error: error.message };
    throw error;
  }
}

/** Schema validation only; fixtures stay with `rule verify`, so loading is a pure read. */
export function validateRulebookContent(
  content: string,
): { rulebook: Rulebook } | { problem: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { problem: 'Invalid JSON' };
  }
  try {
    return { rulebook: assertValidRulebook(parsed) };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : 'invalid rulebook' };
  }
}

function mergeTransparentWrappers(
  userConfig: RulesConfig | null,
  projectConfig: RulesConfig | null,
): string[] {
  return [
    ...new Set([
      ...(userConfig?.transparent_wrappers ?? []),
      ...(projectConfig?.transparent_wrappers ?? []),
    ]),
  ];
}

function applyOverrides(
  rules: CustomRule[],
  overrides: Record<string, RuleOverride>,
): CustomRule[] {
  return rules.flatMap((rule) => {
    const override = overrides[rule.name];
    if (override === 'off') {
      return [];
    }
    if (override && typeof override === 'object') {
      return [{ ...rule, intent: override.intent ?? rule.intent, reason: override.reason }];
    }
    return [rule];
  });
}

function getUnknownOverrideErrors(
  overrides: Record<string, RuleOverride>,
  knownRuleIds: Set<string>,
  configPath: string,
): string[] {
  return Object.keys(overrides)
    .filter((key) => !knownRuleIds.has(key))
    .map(
      (key) =>
        `unknown override key "${key}" in ${configPath}; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file`,
    );
}

function getProjectOverrideUserRuleErrors(
  projectOverrides: Record<string, RuleOverride>,
  userRuleIds: Set<string>,
  configPath: string,
): string[] {
  return Object.keys(projectOverrides)
    .filter((key) => userRuleIds.has(key))
    .map(
      (key) =>
        `project override cannot target user-scoped rule "${key}" in ${configPath}; only that override is ignored and the rule keeps its user-configured state; remove it from that file`,
    );
}

function formatPolicyReadErrors(path: string, errors: string[]): string[] {
  return errors.map((error) =>
    error.startsWith('Unable to access ') ? error : `${path}: ${error}`,
  );
}

function invalidLoadedRulesPolicy(
  paths: ReturnType<typeof getPolicyPaths>,
  error: string,
): LoadedRulesPolicy {
  return {
    rules: [],
    transparent_wrappers: [],
    rulebooks: [],
    errors: [error],
    warnings: [],
    userConfigPath: paths.userConfigPath,
    projectConfigPath: paths.projectConfigPath,
  };
}

function emptyScopePolicy(): ScopePolicy {
  return {
    rules: [],
    rulebooks: [],
    entries: [],
    knownRuleIds: new Set(),
    errors: [],
    warnings: [],
    canValidateOverrides: true,
  };
}
