import {
  type AnalysisErrorCode,
  AnalysisLimit,
  createBudget,
  LIMITS,
  type LimitKind,
} from '@/core/budget';
import type { Decision } from '@/core/decision';
import { resolveCommandAnalysisContext } from '@/core/policy/analysis-context';
import type { CommandProgram } from '@/core/shell/model';
import type { AnalyzeInput } from '@/gate/analysis';
import type { SemanticFactStore } from '@/gate/facts';
import type { CommandTraceContext } from '@/gate/trace';
import { analyzeCommandInternal } from './analyze-command';

/** The caps the analyzer answers for itself: a denial naming the command, not a fail-closed report. */
const ANALYZER_CAP_KINDS = new Set<LimitKind>([
  'derivedTokens',
  'trackedHeredocFiles',
  'controlFlowStates',
  'wrapperPeelIterations',
  'derivedCommandShape',
  'parallelChildAnalyses',
  'parallelDerivedTokens',
  'parallelDerivedBytes',
  'parallelPlaceholderReplacements',
]);

/** @internal */
export function analyzeCommand(command: string, options: AnalyzeInput) {
  return analyzeCommandWithProgram(command, options);
}

/** Canonical pre-parsed command-analysis entry point. */
export function analyzeCommandWithProgram(
  command: string,
  options: AnalyzeInput,
  program?: CommandProgram,
  factStore?: SemanticFactStore,
): Extract<Decision, { kind: 'deny' }> | null {
  const result = analyzeCommandInternal(
    command,
    0,
    {
      ...options,
      ...resolveCommandAnalysisContext(options),
      budget: options.budget ?? createBudget(),
      factStore,
    },
    program,
  );
  if (!result) return null;
  return {
    kind: 'deny',
    reason: result.reason,
    intent: result.intent ?? 'manual_only',
    ...(result.ruleId ? { ruleId: result.ruleId } : {}),
    evidence: [{ kind: 'command', command, segment: result.segment }],
  };
}

/**
 * Runs one analysis and maps a cap the analyzer owns to the denial it answers with, so the
 * pipeline, the trace wrapper and the differential all read a breach the same way. Every other
 * cause — a path-canonicalization breach, an intake limit, a bug — is rethrown to fail closed.
 */
export function analyzeOrCapBreach(
  run: () => Extract<Decision, { kind: 'deny' }> | null,
  command: string,
  trace?: CommandTraceContext,
) {
  try {
    return { decision: run() };
  } catch (cause) {
    const breach = analyzerCapBreach(cause, command, trace);
    if (!breach) throw cause;
    return breach;
  }
}

/**
 * An analysis limit the analyzer owns, read back as the denial the shipped analyzer returns for
 * it: the whole command as evidence, the cap's wording, and an error step on the open segment or
 * globally when none is. Every other cause is not this function's to answer and gets `null`.
 *
 * @internal
 */
export function analyzerCapBreach(
  cause: unknown,
  command: string,
  trace?: CommandTraceContext,
): { decision: Extract<Decision, { kind: 'deny' }>; errorCode: AnalysisErrorCode } | null {
  if (!(cause instanceof AnalysisLimit) || !ANALYZER_CAP_KINDS.has(cause.kind)) return null;
  const limit = LIMITS[cause.kind];
  if (trace?.currentSegmentIndex !== undefined) {
    trace.recordSegment({ type: 'error', message: limit.reason });
  }
  if (trace?.currentSegmentIndex === undefined) {
    trace?.recordGlobal({ type: 'error', message: limit.reason });
  }
  return {
    decision: {
      kind: 'deny',
      reason: limit.reason,
      intent: 'stop_and_explain',
      evidence: [{ kind: 'command', command, segment: command }],
    },
    errorCode: limit.errorCode,
  };
}
