import type { Budget } from '@/core/budget';
import type { BlockIntent } from '@/core/decision';
import type { Environment } from '@/core/environment';
import type { ProtectedGitMetadata } from '@/core/git/metadata';
import type { EffectiveSafetyCapabilities, PolicySnapshot } from '@/core/policy/types';
import type { CommandProgram, ShellKind } from '@/core/shell/model';
import type { CommandTraceContext } from './trace';

export type { PathResolver } from '@/core/environment';
export type { ProtectedGitMetadata } from '@/core/git/metadata';
export type { DestructiveCommandRuleMatch } from '@/core/rules/types';

/** Result of command analysis */
export interface AnalyzeResult {
  /** The reason the command was blocked */
  reason: string;
  /** The specific segment that triggered the block */
  segment: string;
  /** Stable identifier for the rule that blocked the command */
  ruleId?: string;
  /** Intended agent behavior after the block */
  intent?: BlockIntent;
}

/** Ambient process state the analyzer reads, captured once at the entry point. */
export type EnvironmentContext = Environment;

/**
 * Options for command analysis.
 * @internal
 */
export interface AnalyzeOptions {
  /** Immutable policy snapshot to evaluate. */
  policySnapshot: PolicySnapshot;
  /** Current working directory */
  cwd?: string;
  /** Shell syntax to use for command-specific analysis */
  shell?: ShellKind;
  /** Effective cwd after cd commands (null = unknown, undefined = use cwd) */
  effectiveCwd?: string | null;
  /** Environment assignments inherited by nested command analysis */
  envAssignments?: ReadonlyMap<string, string>;
  /** Fail-closed on unparseable commands */
  strict?: boolean;
  /** Block non-temp rm -rf even within cwd */
  paranoidRm?: boolean;
  /** Block interpreter one-liners */
  paranoidInterpreters?: boolean;
  /** Allow local Git discard commands in linked worktrees */
  worktreeMode?: boolean;
  /** Allow $TMPDIR paths (false when TMPDIR is overridden to non-temp) */
  allowTmpdirVar?: boolean;
  /** Recorder that captures the analysis steps for `explain` */
  trace?: CommandTraceContext;
  /** Analyze programs with unclosed quotes instead of falling back to raw-text scanning */
  analyzePartialProgram?: boolean;
}

/**
 * What the analyzer entry point needs: the caller's options plus the process state it must
 * read instead of touching env, home, tmpdir or the filesystem.
 */
export type AnalyzeInput = AnalyzeOptions & {
  /** Capability values and provenance already resolved at the caller boundary. */
  effectiveCapabilities: EffectiveSafetyCapabilities;
  environment: EnvironmentContext;
  protectedGitMetadata: ProtectedGitMetadata | null;
  /** The gate's budget for this evaluation; the entry creates one only for callers outside the pipeline. */
  budget?: Budget;
};

export interface AnalyzeNestedOverrides {
  effectiveCwd?: string | null;
  envAssignments?: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
  /** Functions the nested source can still call: set only where it runs in the same shell. */
  functionDefinitions?: ReadonlyMap<string, CommandProgram>;
}
