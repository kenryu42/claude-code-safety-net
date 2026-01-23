/**
 * Shared types for the safety-net plugin.
 */

/** Custom rule definition from .safety-net.json */
export interface CustomRule {
  /** Unique identifier for the rule */
  name: string;
  /** Base command to match (e.g., "git", "npm") */
  command: string;
  /** Optional subcommand to match (e.g., "add", "install") */
  subcommand?: string;
  /** Arguments that trigger the block */
  block_args: string[];
  /** Message shown when blocked */
  reason: string;
}

/** Configuration loaded from .safety-net.json */
export interface Config {
  /** Schema version (must be 1) */
  version: number;
  /** Custom blocking rules */
  rules: CustomRule[];
}

/** Result of config validation */
export interface ValidationResult {
  /** List of validation error messages */
  errors: string[];
  /** Set of rule names found (for duplicate detection) */
  ruleNames: Set<string>;
}

/** Result of command analysis */
export interface AnalyzeResult {
  /** The reason the command was blocked */
  reason: string;
  /** The specific segment that triggered the block */
  segment: string;
}

/** Claude Code hook input format */
export interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: {
    command: string;
    description?: string;
  };
  tool_use_id?: string;
}

/** Claude Code hook output format */
export interface HookOutput {
  hookSpecificOutput: {
    hookEventName: string;
    permissionDecision: 'allow' | 'deny';
    permissionDecisionReason?: string;
  };
}

/** Gemini CLI hook input format */
export interface GeminiHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name: string;
  timestamp?: string;
  tool_name?: string;
  tool_input?: {
    command?: string;
    [key: string]: unknown;
  };
}

/** Gemini CLI hook output format */
export interface GeminiHookOutput {
  decision: 'deny';
  reason: string;
  systemMessage: string;
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
}

/** GitHub Copilot CLI preToolUse hook input format */
export interface CopilotCliHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: string;
}

/** GitHub Copilot CLI preToolUse hook output format */
export interface CopilotCliHookOutput {
  permissionDecision: 'allow' | 'deny' | 'ask';
  permissionDecisionReason?: string;
}

/** Options for command analysis */
export interface AnalyzeOptions {
  /** Current working directory */
  cwd?: string;
  /** Effective cwd after cd commands (null = unknown, undefined = use cwd) */
  effectiveCwd?: string | null;
  /** Loaded configuration */
  config?: Config;
  /** Fail-closed on unparseable commands */
  strict?: boolean;
  /** Block non-temp rm -rf even within cwd */
  paranoidRm?: boolean;
  /** Block interpreter one-liners */
  paranoidInterpreters?: boolean;
  /** Allow $TMPDIR paths (false when TMPDIR is overridden to non-temp) */
  allowTmpdirVar?: boolean;
}

/** Audit log entry */
export interface AuditLogEntry {
  ts: string;
  command: string;
  segment: string;
  reason: string;
  cwd?: string | null;
}

/** Constants */
export const MAX_RECURSION_DEPTH = 10;
export const MAX_STRIP_ITERATIONS = 20;

export const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
export const COMMAND_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
export const MAX_REASON_LENGTH = 256;

/** Shell operators that split commands */
export const SHELL_OPERATORS = new Set(['&&', '||', '|&', '|', '&', ';', '\n']);

/** Shell wrappers that need recursive analysis */
export const SHELL_WRAPPERS = new Set(['bash', 'sh', 'zsh', 'ksh', 'dash', 'fish', 'csh', 'tcsh']);

/** Interpreters that can execute code */
export const INTERPRETERS = new Set(['python', 'python3', 'python2', 'node', 'ruby', 'perl']);

/** Dangerous commands to detect in interpreter code */
export const DANGEROUS_PATTERNS = [
  /\brm\s+.*-[rR].*-f\b/,
  /\brm\s+.*-f.*-[rR]\b/,
  /\brm\s+-rf\b/,
  /\brm\s+-fr\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+checkout\s+--\b/,
  /\bgit\s+clean\s+-f\b/,
  /\bfind\b.*\s-delete\b/,
];

export const PARANOID_INTERPRETERS_SUFFIX =
  '\n\n(Paranoid mode: interpreter one-liners are blocked.)';

/** Trace step for explain command - discriminated union of all step types */
export type TraceStep =
  | { type: 'parse'; input: string; segments: string[][] }
  | { type: 'env-strip'; input: string[]; envVars: Record<string, '<redacted>'>; output: string[] }
  | { type: 'leading-tokens-stripped'; input: string[]; removed: string[]; output: string[] }
  | { type: 'shell-wrapper'; wrapper: string; innerCommand: string }
  | { type: 'interpreter'; interpreter: string; codeArg: string; paranoidBlocked: boolean }
  | { type: 'busybox'; subcommand: string }
  | {
      type: 'recurse';
      reason: 'shell-wrapper' | 'interpreter' | 'busybox';
      innerCommand: string;
      depth: number;
    }
  | {
      type: 'rule-check';
      ruleModule: string;
      ruleFunction: string;
      matched: boolean;
      reason?: string;
    }
  | {
      type: 'tmpdir-check';
      tmpdirValue: string | null;
      isOverriddenToNonTemp: boolean;
      allowTmpdirVar: boolean;
    }
  | { type: 'fallback-scan'; tokensScanned: string[]; embeddedCommandFound?: string }
  | { type: 'custom-rules-check'; rulesChecked: boolean; matched: boolean; reason?: string }
  | { type: 'cwd-change'; segment: string; effectiveCwdNowUnknown: true }
  | { type: 'dangerous-text'; token: string; matched: boolean; reason?: string }
  | { type: 'strict-unparseable'; rawCommand: string; reason: string }
  | { type: 'segment-skipped'; index: number; reason: 'prior-segment-blocked' }
  | { type: 'error'; message: string; partial?: boolean };

/** Trace data for explain command */
export interface ExplainTrace {
  steps: TraceStep[];
  segments: { index: number; steps: TraceStep[] }[];
}

/** Options for explain command */
export interface ExplainOptions {
  json?: boolean;
  cwd?: string;
  asciiOnly?: boolean;
  strict?: boolean;
  config?: Config;
}

/** Result of explain command */
export interface ExplainResult {
  trace: ExplainTrace;
  result: 'blocked' | 'allowed';
  reason?: string;
  segment?: string;
  configSource: string | null;
  configValid: boolean;
}
