/**
 * Type definitions for the doctor command.
 */

import type {
  ConfigStateInfo,
  DestructiveCommandRuleOverride,
  EffectiveSafetyCapabilities,
  EffectiveSafetyLevel,
  PolicyScopes,
} from '@/core/policy/types';
import type { IntegrationId } from '@/hosts/catalog';
import type { SelfTestSummary } from '@/hosts/self-test';

/** Hook platform identifiers */
export type HookPlatform = IntegrationId;

/**
 * Hook configuration inspection status.
 * `not-inspected` means the runtime's own state file exists but could not be read, so its
 * configuration is unknown rather than absent.
 */
type HookInspectionStatus = 'verified' | 'failed' | 'not-applicable' | 'not-inspected';

/** Hook discovery and configuration inspection result */
export interface HookStatus {
  platform: HookPlatform;
  detected: boolean;
  configured: boolean;
  inspectionStatus: HookInspectionStatus;
  method?: string;
  configPath?: string;
  configPaths?: readonly string[];
  errors?: string[];
}

/** Update check result */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
}

/** System information. */
export interface SystemInfo {
  /** cc-safety-net version */
  version: string;
  /** Per-integration version, keyed by id, from the catalog's `probeCommand`. Copilot's probe is
   * `copilot --binary-version`; `copilot --version` is never run because it downloads a ~160 MB
   * package cache. */
  versions: Partial<Record<IntegrationId, string | null>>;
  /** Codex plugin list output (from `codex plugin list`) */
  codexPluginListOutput: string | null;
  /** Amp plugin list output (from `amp plugins list`) */
  ampPluginListOutput: string | null;
  /** Node.js version (from `node --version`) */
  nodeVersion: string | null;
  /** npm version (from `npm --version`) */
  npmVersion: string | null;
  /** Bun version (from `bun --version`) */
  bunVersion: string | null;
  /** Platform (e.g., "darwin arm64") */
  platform: string;
}

/** Config source info */
export interface ConfigSourceInfo {
  path: string;
  exists: boolean;
  valid: boolean;
  ruleCount: number;
  errors?: string[];
}

/** Effective rule with source tracking */
export interface EffectiveRule {
  source: 'user' | 'project';
  name: string;
  command: string;
  subcommand?: string;
  blockArgs: string[];
  reason: string;
}

/** Shadowed rule info */
export interface ShadowedRule {
  name: string;
  shadowedBy: 'project';
}

/** Environment variable info */
export interface EnvVarInfo {
  name: string;
  value: string | undefined;
  isSet: boolean;
  legacyName?: string;
  legacyValue?: string;
  legacyIsSet?: boolean;
  description: string;
  defaultBehavior: string;
}

interface EffectiveSafetyInfo {
  selectedPreset: 'standard' | 'strict' | 'paranoid';
  level: EffectiveSafetyLevel;
  capabilities: EffectiveSafetyCapabilities;
  ruleOverrides: Readonly<Record<string, DestructiveCommandRuleOverride>>;
  weakenedRuleOverrides: string[];
  /** Set only when a project policy file was read: which scope supplied the
   *  preset, and what the project scope relaxed. */
  policyScopes?: PolicyScopes;
  ruleCounts: {
    stored: number;
    effective: number;
  };
}

export type DoctorFindingSeverity = 'info' | 'warning' | 'error';

export interface DoctorFinding {
  checkId: string;
  severity: DoctorFindingSeverity;
  title: string;
  detail: string;
  fixHint?: string;
  integration?: string;
  path?: string;
}

export type ProtectedDirectoryKind = 'policy' | 'config' | 'audit';

export type ProtectedDirectoryIssue = 'ownership' | 'permissions' | 'symlink' | 'not-directory';

export interface ProtectedDirectoryPosture {
  kind: ProtectedDirectoryKind;
  path?: string;
  status: 'safe' | 'unsafe' | 'unknown' | 'not-applicable';
  issues: ProtectedDirectoryIssue[];
}

export interface DoctorPosture {
  directories: ProtectedDirectoryPosture[];
}

/** Audit activity summary */
export interface ActivitySummary {
  totalBlocked: number;
  sessionCount: number;
  recentEntries: Array<{
    timestamp: string;
    command: string;
    reason: string;
    relativeTime: string;
  }>;
  oldestEntry?: string;
  newestEntry?: string;
  /** Audit sources this summary had to drop: unreadable files, malformed records. */
  unreadable: number;
}

/** Full doctor report */
export interface DoctorReport {
  hooks: HookStatus[];
  engineSelfTest: SelfTestSummary;
  userConfig: ConfigSourceInfo;
  projectConfig: ConfigSourceInfo;
  /** Whether the runtime enforces the configured policy or a fallback. */
  configState: ConfigStateInfo;
  effectiveRules: EffectiveRule[];
  shadowedRules: ShadowedRule[];
  environment: EnvVarInfo[];
  effectiveSafety: EffectiveSafetyInfo;
  /** Lock and cache files a version 2 install left behind, present only when some exist. */
  v2Leftovers?: readonly string[];
  posture: DoctorPosture;
  findings: DoctorFinding[];
  activity: ActivitySummary;
  update: UpdateInfo;
  system: SystemInfo;
}

/** Doctor command options */
export interface DoctorOptions {
  json?: boolean;
  cwd?: string;
  skipUpdateCheck?: boolean;
}
