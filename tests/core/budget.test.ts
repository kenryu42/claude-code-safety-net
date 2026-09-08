import { describe, expect, test } from 'bun:test';
import { AnalysisLimit, type CountedKind, createBudget, LIMITS } from '@/core/budget';

/**
 * The five sentences the gate reports a refusal with. Which kinds share one is the contract: a
 * reader of a denial learns which class of limit stopped the command, not which counter.
 */
const ANALYSIS =
  'CC Safety Net could not analyze the command because it exceeds safe analysis limits. Simplify or split the command and retry.';
const RECURSION =
  'Command exceeds maximum recursion depth and cannot be safely analyzed. Flatten the nesting and retry.';
const DERIVED_WORK =
  "Command analysis exceeds CC Safety Net's derived-command work limit. Reduce nested or embedded command complexity and retry.";
const PARALLEL =
  "Parallel command expands beyond CC Safety Net's analysis limits. Reduce the template or explicit argument list and retry.";
const FAILED_CLOSED =
  'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.';

/** Every cap the gate ships, as the number it is. A change to one is a change to what the gate
 *  accepts, so each is spelled here rather than recorded. */
const CAPS: Readonly<Record<CountedKind, number>> = {
  realpathAttempts: 16_384,
  processedCandidateBytes: 4 * 1024 * 1024,
  pathEnvironmentExpansion: 64,
  recursionDepth: 10,
  derivedTokens: 16_384,
  trackedHeredocFiles: 64,
  controlFlowStates: 64,
  wrapperPeelIterations: 20,
  parallelChildAnalyses: 1_024,
  parallelDerivedTokens: 16_384,
  parallelDerivedBytes: 1024 * 1024,
  parallelPlaceholderReplacements: 16_384,
  hookInputBytes: 8 * 1024 * 1024,
  toolInputDepth: 64,
  toolInputNodes: 10_000,
  toolInputKeys: 10_000,
  toolInputStringBytes: 1024 * 1024,
  toolInputAggregateStringBytes: 4 * 1024 * 1024,
  toolInputGitDiffCandidates: 64,
};

/** Every kind in the table, including the three that refuse on shape rather than on a count. */
const REASONS: Readonly<Record<keyof typeof LIMITS, string>> = {
  realpathAttempts: ANALYSIS,
  processedCandidateBytes: ANALYSIS,
  pathEnvironmentExpansion: ANALYSIS,
  structuralShellSyntax: ANALYSIS,
  recursionDepth: RECURSION,
  derivedTokens: DERIVED_WORK,
  trackedHeredocFiles: DERIVED_WORK,
  controlFlowStates: DERIVED_WORK,
  wrapperPeelIterations: DERIVED_WORK,
  derivedCommandShape: DERIVED_WORK,
  parallelChildAnalyses: PARALLEL,
  parallelDerivedTokens: PARALLEL,
  parallelDerivedBytes: PARALLEL,
  parallelPlaceholderReplacements: PARALLEL,
  // Read before any tool input is parsed, so the intake denial is the one it reports.
  hookInputBytes: 'Failed to parse hook input JSON.',
  toolInputDepth: FAILED_CLOSED,
  toolInputNodes: FAILED_CLOSED,
  toolInputKeys: FAILED_CLOSED,
  toolInputStringBytes: FAILED_CLOSED,
  toolInputAggregateStringBytes: FAILED_CLOSED,
  toolInputGitDiffCandidates: FAILED_CLOSED,
  toolInputShape: FAILED_CLOSED,
};

const COUNTED_KINDS: readonly CountedKind[] = [
  'realpathAttempts',
  'processedCandidateBytes',
  'pathEnvironmentExpansion',
  'recursionDepth',
  'derivedTokens',
  'trackedHeredocFiles',
  'controlFlowStates',
  'wrapperPeelIterations',
  'parallelChildAnalyses',
  'parallelDerivedTokens',
  'parallelDerivedBytes',
  'parallelPlaceholderReplacements',
  'hookInputBytes',
  'toolInputDepth',
  'toolInputNodes',
  'toolInputKeys',
  'toolInputStringBytes',
  'toolInputAggregateStringBytes',
  'toolInputGitDiffCandidates',
];

function limitThrownBy(call: () => void): AnalysisLimit | undefined {
  try {
    call();
    return undefined;
  } catch (error) {
    return error instanceof AnalysisLimit ? error : undefined;
  }
}

describe('analysis budget', () => {
  test('names every capped kind in the table', () => {
    expect(COUNTED_KINDS.length).toBe(
      Object.values(LIMITS).filter((limit) => 'cap' in limit).length,
    );
  });

  test('each counter breaches independently one unit past its cap', () => {
    for (const kind of COUNTED_KINDS) {
      const budget = createBudget();
      budget.charge(kind, LIMITS[kind].cap);
      const breach = limitThrownBy(() => budget.charge(kind));
      expect(breach?.kind).toBe(kind);
      expect(breach?.message).toBe(LIMITS[kind].reason);
      expect([...budget.counters.keys()]).toEqual([kind]);
      // The breach leaves every other counter its full cap on the same budget.
      for (const other of COUNTED_KINDS.filter((candidate) => candidate !== kind)) {
        expect(limitThrownBy(() => budget.charge(other, LIMITS[other].cap))).toBeUndefined();
      }
    }
  });

  test('charges one unit by default and counts cumulatively', () => {
    const budget = createBudget();
    for (let token = 0; token < LIMITS.derivedTokens.cap; token++) budget.charge('derivedTokens');
    expect(budget.counters.get('derivedTokens')).toBe(LIMITS.derivedTokens.cap);
    expect(limitThrownBy(() => budget.charge('derivedTokens'))?.kind).toBe('derivedTokens');
  });

  test('carries a kind for the refusals without a numeric cap', () => {
    expect(new AnalysisLimit('structuralShellSyntax').message).toBe(ANALYSIS);
    expect(new AnalysisLimit('derivedCommandShape').message).toBe(DERIVED_WORK);
    expect(new AnalysisLimit('derivedCommandShape').kind).toBe('derivedCommandShape');
    expect(new AnalysisLimit('toolInputShape').kind).toBe('toolInputShape');
    expect(new AnalysisLimit('toolInputShape').name).toBe('AnalysisLimit');
  });

  test('every capped kind ships the cap this table names', () => {
    // Keyed by kind, so a cap added to the table without a row here fails rather than passes.
    expect(Object.keys(CAPS).sort()).toStrictEqual(
      Object.entries(LIMITS)
        .filter(([, limit]) => 'cap' in limit)
        .map(([kind]) => kind)
        .sort(),
    );
    for (const [kind, cap] of Object.entries(CAPS)) {
      expect(LIMITS[kind as CountedKind].cap, kind).toBe(cap);
    }
  });

  test('every kind reports the sentence this table names', () => {
    expect(Object.keys(REASONS).sort()).toStrictEqual(Object.keys(LIMITS).sort());
    for (const [kind, reason] of Object.entries(REASONS)) {
      expect(LIMITS[kind as keyof typeof LIMITS].reason, kind).toBe(reason);
    }
  });

  test('maps every kind to a shipped audit error class', () => {
    const codes = new Set(Object.values(LIMITS).map((limit) => limit.errorCode));
    expect([...codes].sort()).toEqual([
      'path-canonicalization-limit',
      'structural-shell-syntax-limit',
      'tool-input-limit',
    ]);
  });
});
