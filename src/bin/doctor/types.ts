/**
 * Type definitions for the doctor command.
 */

/** Hook platform identifiers */
export type HookPlatform = 'claude-code' | 'opencode' | 'gemini-cli' | 'copilot-cli';

/** Self-test case definition */
export interface SelfTestCase {
  command: string;
  description: string;
  expectBlocked: boolean;
}

/** Self-test result for a single command */
export interface SelfTestResult {
  command: string;
  description: string;
  expected: 'blocked' | 'allowed';
  actual: 'blocked' | 'allowed';
  passed: boolean;
  reason?: string;
}

/** Self-test summary for a hook */
export interface SelfTestSummary {
  passed: number;
  failed: number;
  total: number;
  results: SelfTestResult[];
}

/** Hook configuration status */
export type HookConfigStatus = 'configured' | 'n/a' | 'disabled';

/** Hook detection result with integrated self-test */
export interface HookStatus {
  platform: HookPlatform;
  status: HookConfigStatus;
  method?: string;
  configPath?: string;
  configPaths?: readonly string[];
  errors?: string[];
  selfTest?: SelfTestSummary;
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
  description: string;
  defaultBehavior: string;
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
}

/** Update check result */
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  error?: string;
}

/** System information */
export interface SystemInfo {
  /** cc-safety-net version */
  version: string;
  /** Claude Code version (from `claude --version`) */
  claudeCodeVersion: string | null;
  /** OpenCode version (from `opencode --version`) */
  openCodeVersion: string | null;
  /** Gemini CLI version (from `gemini --version`) */
  geminiCliVersion: string | null;
  /** Copilot CLI version (from `copilot --binary-version`, falling back to `copilot --version`) */
  copilotCliVersion: string | null;
  /** Node.js version (from `node --version`) */
  nodeVersion: string | null;
  /** npm version (from `npm --version`) */
  npmVersion: string | null;
  /** Bun version (from `bun --version`) */
  bunVersion: string | null;
  /** Platform (e.g., "darwin arm64") */
  platform: string;
}

/** Full doctor report */
export interface DoctorReport {
  hooks: HookStatus[];
  userConfig: ConfigSourceInfo;
  projectConfig: ConfigSourceInfo;
  effectiveRules: EffectiveRule[];
  shadowedRules: ShadowedRule[];
  environment: EnvVarInfo[];
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
