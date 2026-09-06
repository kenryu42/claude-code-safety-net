import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Environment } from '@/core/environment';
import { bindDelegatedPolicyFilesystemTarget, writePolicyFileAtomic } from '@/core/io/safe-read';
import { DESTRUCTIVE_COMMAND_RULE_ID_SET } from '@/core/rules/destructive';
import { SECRET_DEFAULT_OFF_RULE_ID_SET, SECRET_PROTECTION_RULE_ID_SET } from '@/core/rules/secret';
import {
  getDestructiveAllowPathError,
  getSecretAllowPathError,
  getSecretDenyPathError,
} from './allow-paths';
import { clampAuditRetentionDays, DEFAULT_AUDIT_RETENTION_DAYS } from './audit-retention-days';
import { resolveEffectiveDestructiveCommandRules } from './effective-rules';
import { getCCSafetyNetEnvModes } from './env';
import { mergeProjectPolicy, type ProjectPolicyProjection } from './merge';
import {
  getProjectPolicyPath,
  getUserPolicyPath,
  type RulesPolicyOptions,
  type UserScopeOptions,
} from './paths';
import { SAFETY_OVERRIDE_KEYS } from './safety-level';
import type {
  DestructiveCommandRuleOverride,
  EffectiveDestructiveCommandRuleState,
  EffectiveSafetyCapabilities,
  GuiPolicy,
  PolicySafety,
  PolicySafetyLevel,
  PolicyScopes,
  SecretProtectionConfig,
} from './types';
import { getUserPolicyDiagnostics } from './validate';

const SAFETY_LEVELS = new Set(['standard', 'strict', 'paranoid']);

/**
 * Which protective fallback backs an unreadable policy file: `salvaged` keeps
 * every recognized valid section from readable JSON, `defaults` replaces the
 * whole file because nothing salvageable parsed.
 */
type PolicyFallback = 'salvaged' | 'defaults';

type PartialPolicy = {
  safety: PolicySafety;
  worktreeMode: boolean;
  destructiveCommandProtectionEnabled: boolean;
  destructiveCommandRuleOverrides: Record<string, DestructiveCommandRuleOverride>;
  destructiveCommandAllowPaths: string[];
  secretProtection: SecretProtectionConfig;
};

type PolicyConfig = PartialPolicy & {
  errors: string[];
  fallback?: PolicyFallback;
  policyScopes?: PolicyScopes;
};

export const DEFAULT_GUI_POLICY: GuiPolicy = {
  version: 1,
  safety: {
    level: 'standard',
    overrides: {},
  },
  workflow: {
    worktree_mode: false,
  },
  destructive_command_protection: {
    enabled: true,
    overrides: {},
    allow_paths: [],
  },
  secret_protection: {
    enabled: true,
    overrides: {},
    deny_paths: [],
    allow_paths: [],
  },
  audit: {
    retention_days: DEFAULT_AUDIT_RETENTION_DAYS,
  },
};

/**
 * Effective policy for a session: the user file, then the project file layered on
 * top of it. Both files feed the same diagnostics channel, so a failure in either
 * one names itself and leaves everything it did not invalidate in force.
 */
export function loadPolicyConfig(
  environment: Environment,
  options: RulesPolicyOptions,
): PolicyConfig {
  const user = readPolicyConfig(getUserPolicyPath(environment, options), environment.home);
  const projectFile = readPolicyFile(getProjectPolicyPath(options.cwd), environment.home);
  const project = projectPolicyProjection(projectFile.parsed, environment.home);
  const merged =
    Object.keys(project.policy).length > 0
      ? mergeProjectPolicy(user.gui ?? DEFAULT_GUI_POLICY, project.policy)
      : undefined;
  const errors = [...user.errors, ...projectFile.errors, ...project.diagnostics];
  // A dropped project section leaves the rest of both files in force, which is
  // what the salvaged fallback means for the user file too. A project file that
  // contributes nothing never replaces a readable user policy either, so only an
  // unreadable user file reports built-in defaults.
  // An unreadable user file under a contributing project policy is not enforcing
  // plain defaults — the project fields still merge in — so it reports as salvage.
  const fallback =
    (user.fallback === 'defaults' && merged ? 'salvaged' : user.fallback) ??
    (user.gui ? undefined : projectFile.fallback) ??
    (errors.length > 0 ? 'salvaged' : undefined);
  // `default` means no user policy supplied a level: the file is absent, invalid,
  // or simply never set one — a normalized default level is not user provenance.
  const levelScope = project.policy.safety?.level
    ? 'project'
    : user.levelPresent
      ? 'user'
      : 'default';
  return {
    ...(merged ? normalizePolicyConfig(merged.policy) : user.policy),
    errors,
    ...(fallback ? { fallback } : {}),
    // Scope provenance appears whenever the project file exists: a malformed file
    // still degrades the snapshot, so status and the GUI must still show its row.
    ...(projectFile.exists
      ? { policyScopes: { levelScope, weakenings: merged?.weakenings ?? [] } }
      : {}),
  };
}

const PROJECT_AUDIT_DIAGNOSTIC =
  'project policy audit settings are ignored; audit is user scope only';

/**
 * Presence-aware projection of the project policy file: only the fields the file
 * actually sets survive, so an unset field inherits from user scope instead of
 * being overwritten by the default `normalizeGuiPolicy` would substitute. Invalid
 * fields are salvaged exactly like the user file's — the recognized valid ones stay
 * in effect and the rest drops, with the diagnostics reported separately.
 */
export function projectPolicyProjection(
  value: unknown,
  home: string,
): {
  policy: ProjectPolicyProjection;
  diagnostics: string[];
} {
  if (!isRecord(value)) return { policy: {}, diagnostics: [] };
  const safety = isRecord(value.safety) ? value.safety : {};
  const workflow = isRecord(value.workflow) ? value.workflow : {};
  const destructive = isRecord(value.destructive_command_protection)
    ? value.destructive_command_protection
    : {};
  const secret = isRecord(value.secret_protection) ? value.secret_protection : {};
  const safetySection = {
    ...(SAFETY_LEVELS.has(safety.level as string)
      ? { level: safety.level as PolicySafetyLevel }
      : {}),
    ...(isRecord(safety.overrides)
      ? withPresentFields({ overrides: pickBooleans(safety.overrides, SAFETY_OVERRIDE_KEYS) })
      : {}),
  };
  const destructiveSection = {
    ...(typeof destructive.enabled === 'boolean' ? { enabled: destructive.enabled } : {}),
    ...(destructive.overrides !== undefined
      ? { overrides: repairRuleOverrides(destructive.overrides, DESTRUCTIVE_COMMAND_RULE_ID_SET) }
      : {}),
    ...(destructive.allow_paths !== undefined
      ? { allow_paths: repairAllowPaths(destructive.allow_paths, home) }
      : {}),
  };
  const secretSection = {
    ...(typeof secret.enabled === 'boolean' ? { enabled: secret.enabled } : {}),
    ...(secret.overrides !== undefined
      ? { overrides: repairRuleOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET) }
      : {}),
    ...(secret.deny_paths !== undefined
      ? { deny_paths: repairDenyPaths(secret.deny_paths, home) }
      : {}),
    ...(secret.allow_paths !== undefined
      ? { allow_paths: repairSecretAllowPaths(secret.allow_paths, home) }
      : {}),
  };
  return {
    policy: withPresentFields({
      safety: safetySection,
      workflow:
        typeof workflow.worktree_mode === 'boolean'
          ? { worktree_mode: workflow.worktree_mode }
          : {},
      destructive_command_protection: destructiveSection,
      secret_protection: secretSection,
    }),
    diagnostics: value.audit === undefined ? [] : [PROJECT_AUDIT_DIAGNOSTIC],
  };
}

function pickBooleans<K extends string>(source: Record<string, unknown>, keys: readonly K[]) {
  return Object.fromEntries(
    keys.flatMap((key) => (typeof source[key] === 'boolean' ? [[key, source[key]]] : [])),
  ) as Partial<Record<K, boolean>>;
}

/** Drops the sections the project file left empty, so absence stays absence. */
function withPresentFields<T extends Record<string, object>>(sections: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(sections).flatMap((entry) => (Object.keys(entry[1]).length > 0 ? [entry] : [])),
  ) as Partial<T>;
}

/**
 * The single normalizer from untrusted JSON to the canonical policy-file shape.
 * Schema-valid input passes through unchanged (every field satisfies the per-field
 * checks); invalid input keeps each recognized valid field and substitutes a
 * protective default for the rest.
 */
export function normalizeGuiPolicy(value: unknown, home: string): GuiPolicy {
  if (!isRecord(value)) return createDefaultGuiPolicy();

  const safety = isRecord(value.safety) ? value.safety : {};
  const safetyOverrides = isRecord(safety.overrides) ? safety.overrides : {};
  const workflow = isRecord(value.workflow) ? value.workflow : {};
  const destructiveCommand = isRecord(value.destructive_command_protection)
    ? value.destructive_command_protection
    : {};
  const secret = isRecord(value.secret_protection) ? value.secret_protection : {};
  return {
    version: 1,
    safety: {
      level: SAFETY_LEVELS.has(safety.level as string)
        ? (safety.level as PolicySafetyLevel)
        : 'standard',
      overrides: pickBooleans(safetyOverrides, SAFETY_OVERRIDE_KEYS),
    },
    workflow: {
      worktree_mode: typeof workflow.worktree_mode === 'boolean' ? workflow.worktree_mode : false,
    },
    destructive_command_protection: {
      enabled: typeof destructiveCommand.enabled === 'boolean' ? destructiveCommand.enabled : true,
      overrides: repairRuleOverrides(destructiveCommand.overrides, DESTRUCTIVE_COMMAND_RULE_ID_SET),
      allow_paths: repairAllowPaths(destructiveCommand.allow_paths, home),
    },
    secret_protection: {
      enabled: typeof secret.enabled === 'boolean' ? secret.enabled : true,
      overrides: repairRuleOverrides(secret.overrides, SECRET_PROTECTION_RULE_ID_SET),
      deny_paths: repairDenyPaths(secret.deny_paths, home),
      allow_paths: repairSecretAllowPaths(secret.allow_paths, home),
    },
    audit: {
      retention_days: clampAuditRetentionDays(
        isRecord(value.audit) ? value.audit.retention_days : undefined,
      ),
    },
  };
}

function repairRuleOverrides(value: unknown, knownRuleIds: ReadonlySet<string>) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([id, override]) =>
      knownRuleIds.has(id) && (override === 'on' || override === 'off') ? [[id, override]] : [],
    ),
  ) as Record<string, 'on' | 'off'>;
}

function repairDenyPaths(value: unknown, home: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((path): path is string => getSecretDenyPathError(path, home) === null);
}

function repairAllowPaths(value: unknown, home: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((path): path is string => getDestructiveAllowPathError(path, home) === null);
}

function repairSecretAllowPaths(value: unknown, home: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((path): path is string => getSecretAllowPathError(path, home) === null);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// Callers mutate the result, so every call needs its own containers rather than
// references into the shared DEFAULT_GUI_POLICY.
function createDefaultGuiPolicy(): GuiPolicy {
  return structuredClone(DEFAULT_GUI_POLICY);
}

export interface GuiPolicyReadResult {
  path: string;
  exists: boolean;
  raw: string;
  policy: GuiPolicy;
  errors: string[];
}

export interface PolicyPreview {
  selectedPreset: PolicySafetyLevel;
  effectiveLevel: ReturnType<typeof getCCSafetyNetEnvModes>['effectiveLevel'];
  capabilities: EffectiveSafetyCapabilities;
  rules: Readonly<Record<string, EffectiveDestructiveCommandRuleState>>;
  counts: {
    enabled: number;
    disabled: number;
    effectiveCustomizations: number;
  };
}

export interface GuiPolicyWriteResult {
  path: string;
  policy: GuiPolicy;
  errors: string[];
}

export function readUserPolicyForGui(
  environment: Environment,
  options: UserScopeOptions = {},
): GuiPolicyReadResult {
  const path = getUserPolicyPath(environment, options);
  if (!existsSync(path)) {
    return {
      path,
      exists: false,
      raw: '',
      policy: createDefaultGuiPolicy(),
      errors: [],
    };
  }

  const raw = readFileSync(path, 'utf-8');
  if (!raw.trim()) {
    return {
      path,
      exists: true,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: ['Config file is empty'],
    };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const errors = getUserPolicyDiagnostics(parsed, environment.home);
    // The GUI displays the same salvaged projection the engine enforces and repair would
    // write, so a partially invalid file cannot show one policy while another is in force.
    return {
      path,
      exists: true,
      raw,
      policy: normalizeGuiPolicy(parsed, environment.home),
      errors,
    };
  } catch (error) {
    return {
      path,
      exists: true,
      raw,
      policy: createDefaultGuiPolicy(),
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

// The write goes straight through the atomic writer rather than `config-file.ts`'s
// `writeJsonAtomic`: that module loads the schema library, and the hook path imports this one.
export function writeUserPolicyFromGui(
  environment: Environment,
  policy: unknown,
  options: UserScopeOptions = {},
): GuiPolicyWriteResult {
  const path = getUserPolicyPath(environment, options);
  const errors = getUserPolicyDiagnostics(policy, environment.home);
  const normalizedPolicy =
    errors.length > 0 ? createDefaultGuiPolicy() : normalizeGuiPolicy(policy, environment.home);
  if (errors.length > 0) {
    return { path, policy: normalizedPolicy, errors };
  }

  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writePolicyFileAtomic(
    bindDelegatedPolicyFilesystemTarget(path),
    `${JSON.stringify(normalizedPolicy, null, 2)}\n`,
    0o600,
  );
  chmodSync(path, 0o600);
  return { path, policy: normalizedPolicy, errors: [] };
}

export function previewUserPolicyForGui(
  environment: Environment,
  policy: unknown,
): {
  preview?: PolicyPreview;
  errors: string[];
} {
  const errors = getUserPolicyDiagnostics(policy, environment.home);
  if (errors.length > 0) return { errors };
  return {
    preview: createPolicyPreview(normalizeGuiPolicy(policy, environment.home), environment.env),
    errors: [],
  };
}

export function createPolicyPreview(
  policy: GuiPolicy,
  env: ReadonlyMap<string, string>,
): PolicyPreview {
  const modes = getCCSafetyNetEnvModes({ safety: normalizeSafety(policy.safety) }, env);
  const rules = resolveEffectiveDestructiveCommandRules(
    {
      destructiveCommandProtectionEnabled: policy.destructive_command_protection.enabled,
      destructiveCommandRuleOverrides: policy.destructive_command_protection.overrides,
    },
    modes.capabilities,
  );
  const values = Object.values(rules);
  // Catastrophic rules are always enforced and not user-configurable, so they are surfaced
  // separately in the GUI and excluded from the configurable active/disabled tallies.
  const configurableValues = values.filter((state) => state.source !== 'catastrophic');
  return {
    selectedPreset: policy.safety.level,
    effectiveLevel: modes.effectiveLevel,
    capabilities: modes.capabilities,
    rules,
    counts: {
      enabled: configurableValues.filter((state) => state.enabled).length,
      disabled: configurableValues.filter((state) => !state.enabled).length,
      effectiveCustomizations: values.filter((state) => state.changesInherited).length,
    },
  };
}

export function repairUserPolicyForGui(
  environment: Environment,
  options: UserScopeOptions = {},
): GuiPolicyWriteResult {
  const path = getUserPolicyPath(environment, options);
  if (!existsSync(path)) return writeUserPolicyFromGui(environment, DEFAULT_GUI_POLICY, options);

  const raw = readFileSync(path, 'utf-8');
  if (!raw.trim()) return writeUserPolicyFromGui(environment, DEFAULT_GUI_POLICY, options);

  try {
    return writeUserPolicyFromGui(
      environment,
      normalizeGuiPolicy(JSON.parse(raw) as unknown, environment.home),
      options,
    );
  } catch {
    return writeUserPolicyFromGui(environment, DEFAULT_GUI_POLICY, options);
  }
}

/**
 * Reads and validates one policy file, in either scope. `parsed` is the file's JSON
 * whenever there was any to read; the caller decides what shape to project it onto.
 */
export function readPolicyFile(
  path: string,
  home: string,
): {
  exists: boolean;
  parsed?: unknown;
  errors: string[];
  fallback?: PolicyFallback;
} {
  if (!existsSync(path)) return { exists: false, errors: [] };

  try {
    const content = readFileSync(path, 'utf-8');
    if (!content.trim()) {
      return { exists: true, errors: [`${path}: Config file is empty`], fallback: 'defaults' };
    }
    const parsed = JSON.parse(content) as unknown;
    const errors = getUserPolicyDiagnostics(parsed, home);
    if (errors.length === 0) return { exists: true, parsed, errors: [] };
    return {
      exists: true,
      parsed,
      errors: errors.map((error) => `${path}: ${error}`),
      fallback: isRecord(parsed) ? 'salvaged' : 'defaults',
    };
  } catch (error) {
    // Only a parse failure means malformed JSON; every other failure names itself.
    const message = error instanceof Error ? error.message : String(error);
    return {
      exists: true,
      errors: [`${path}: ${error instanceof SyntaxError ? 'Invalid JSON' : message}`],
      fallback: 'defaults',
    };
  }
}

function readPolicyConfig(
  path: string,
  home: string,
): {
  policy: PartialPolicy;
  gui?: GuiPolicy;
  errors: string[];
  fallback?: PolicyFallback;
  /** A valid level the file itself set; normalization fills one either way. */
  levelPresent?: boolean;
} {
  const file = readPolicyFile(path, home);
  if (!file.exists) {
    // A machine with no policy file of its own — an Amp Orb — reads the snapshot that
    // `install --amp` stamped onto the published plugin artifact, normalized here exactly
    // like file contents would be, so home-relative paths resolve against this machine.
    // No diagnostics are computed for it: the snapshot is not an editable file the user can
    // fix here, so a malformed one degrades to protective defaults instead of reporting.
    const embedded = (globalThis as Record<string, unknown>).__CC_SAFETY_NET_EMBEDDED_POLICY__;
    if (!isRecord(embedded)) return { policy: createEmptyPolicy(), errors: [] };
    const gui = normalizeGuiPolicy(embedded, home);
    return {
      policy: normalizePolicyConfig(gui),
      gui,
      errors: [],
      levelPresent: hasOwnSafetyLevel(embedded),
    };
  }
  if (file.parsed === undefined) {
    return {
      policy: createEmptyPolicy(),
      errors: file.errors,
      ...(file.fallback ? { fallback: file.fallback } : {}),
    };
  }
  // Field-level normalization keeps every recognized valid section active and
  // substitutes protective defaults for the rest, so one bad field cannot
  // drop protections the rest of the file still configures.
  const gui = normalizeGuiPolicy(file.parsed, home);
  return {
    policy: normalizePolicyConfig(gui),
    gui,
    errors: file.errors,
    ...(file.fallback ? { fallback: file.fallback } : {}),
    levelPresent: hasOwnSafetyLevel(file.parsed),
  };
}

function hasOwnSafetyLevel(value: unknown): boolean {
  const safety = isRecord(value) && isRecord(value.safety) ? value.safety : {};
  return SAFETY_LEVELS.has(safety.level as string);
}

// A rule in the default-off tier stays off until an explicit 'on' override opts into it.
export function resolveSecretDisabledRules(overrides: Record<string, 'on' | 'off'>): string[] {
  const entries = Object.entries(overrides);
  const optedIn = new Set(entries.flatMap(([id, value]) => (value === 'on' ? [id] : [])));
  return [
    ...new Set([
      ...[...SECRET_DEFAULT_OFF_RULE_ID_SET].filter((id) => !optedIn.has(id)),
      ...entries.flatMap(([id, value]) => (value === 'off' ? [id] : [])),
    ]),
  ];
}

function createEmptyPolicy(): PartialPolicy {
  return {
    safety: {},
    worktreeMode: false,
    destructiveCommandProtectionEnabled: true,
    destructiveCommandRuleOverrides: {},
    destructiveCommandAllowPaths: [],
    secretProtection: {
      enabled: true,
      disabledRules: resolveSecretDisabledRules({}),
      denyPaths: [],
      allowPaths: [],
    },
  };
}

// Projects the canonical policy-file shape onto the camelCase runtime policy.
function normalizePolicyConfig(config: GuiPolicy): PartialPolicy {
  return {
    safety: normalizeSafety(config.safety),
    worktreeMode: config.workflow.worktree_mode,
    destructiveCommandProtectionEnabled: config.destructive_command_protection.enabled,
    destructiveCommandRuleOverrides: config.destructive_command_protection.overrides,
    destructiveCommandAllowPaths: config.destructive_command_protection.allow_paths,
    secretProtection: {
      enabled: config.secret_protection.enabled,
      disabledRules: resolveSecretDisabledRules(config.secret_protection.overrides),
      denyPaths: config.secret_protection.deny_paths,
      allowPaths: config.secret_protection.allow_paths,
    },
  };
}

// Undefined override keys are stripped rather than stored, so a policy that sets none
// projects to `{ level }` instead of a record of undefined capabilities.
export function normalizeSafety(safety: GuiPolicy['safety']): PolicySafety {
  const overrides = {
    ...(safety.overrides.fail_closed !== undefined
      ? { failClosed: safety.overrides.fail_closed }
      : {}),
    ...(safety.overrides.paranoid_rm !== undefined
      ? { paranoidRm: safety.overrides.paranoid_rm }
      : {}),
    ...(safety.overrides.paranoid_interpreters !== undefined
      ? { paranoidInterpreters: safety.overrides.paranoid_interpreters }
      : {}),
  };
  return {
    level: safety.level,
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
  };
}
