import { describe, expect, test } from 'bun:test';
import { AnalysisLimit, type CountedKind, createBudget, LIMITS } from '@/core/budget';

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
    const structural = new AnalysisLimit('structuralShellSyntax').message;
    expect(structural).toMatchSnapshot();
    const derivedShape = new AnalysisLimit('derivedCommandShape').message;
    expect(derivedShape).toMatchSnapshot();
    expect(new AnalysisLimit('derivedCommandShape').kind).toBe('derivedCommandShape');
    expect(new AnalysisLimit('toolInputShape').kind).toBe('toolInputShape');
    expect(new AnalysisLimit('toolInputShape').name).toBe('AnalysisLimit');
  });

  test('keeps the shipped caps and wordings', () => {
    expect(LIMITS.realpathAttempts.cap).toMatchSnapshot();
    expect(LIMITS.processedCandidateBytes.cap).toMatchSnapshot();
    expect(LIMITS.pathEnvironmentExpansion.cap).toMatchSnapshot();
    expect(LIMITS.recursionDepth.cap).toMatchSnapshot();
    expect(LIMITS.derivedTokens.cap).toMatchSnapshot();
    expect(LIMITS.trackedHeredocFiles.cap).toMatchSnapshot();
    expect(LIMITS.wrapperPeelIterations.cap).toMatchSnapshot();
    expect(LIMITS.parallelChildAnalyses.cap).toMatchSnapshot();
    expect(LIMITS.parallelDerivedTokens.cap).toMatchSnapshot();
    expect(LIMITS.parallelDerivedBytes.cap).toMatchSnapshot();
    expect(LIMITS.parallelPlaceholderReplacements.cap).toMatchSnapshot();
    expect(LIMITS.toolInputDepth.cap).toMatchSnapshot();
    expect(LIMITS.toolInputNodes.cap).toMatchSnapshot();
    expect(LIMITS.toolInputKeys.cap).toMatchSnapshot();
    expect(LIMITS.toolInputStringBytes.cap).toMatchSnapshot();
    expect(LIMITS.toolInputAggregateStringBytes.cap).toMatchSnapshot();

    // The wording each kind reports is the sentence the gate produces for it: the two
    // analyzer sentences for the caps the analyzer answers itself, the command-analysis sentence
    // for the path and structural kinds, and the fail-closed sentence for the intake kinds.
    const derivedKinds = [
      'derivedTokens',
      'trackedHeredocFiles',
      'controlFlowStates',
      'wrapperPeelIterations',
      'derivedCommandShape',
    ] as const;
    const parallelKinds = [
      'parallelChildAnalyses',
      'parallelDerivedTokens',
      'parallelDerivedBytes',
      'parallelPlaceholderReplacements',
    ] as const;
    const commandAnalysisKinds = [
      'realpathAttempts',
      'processedCandidateBytes',
      'pathEnvironmentExpansion',
      'structuralShellSyntax',
    ] as const;
    for (const kind of derivedKinds) {
      expect(LIMITS[kind].reason).toMatchSnapshot();
    }
    for (const kind of parallelKinds) {
      expect(LIMITS[kind].reason).toMatchSnapshot();
    }
    for (const kind of commandAnalysisKinds) {
      expect(LIMITS[kind].reason).toMatchSnapshot();
    }
    expect(LIMITS.recursionDepth.reason).toMatchSnapshot();
    expect(LIMITS.toolInputShape.reason).toMatchSnapshot();
    expect(LIMITS.hookInputBytes.cap).toBe(8 * 1024 * 1024);

    // The lists above are fixed, so a kind added to the table later could slip past the wording
    // assertion unnoticed; together with the recursion denial and the intake kinds they account
    // for every entry, and a new one lands in none of them.
    expect(
      [
        ...derivedKinds,
        ...parallelKinds,
        ...commandAnalysisKinds,
        'recursionDepth',
        ...Object.entries(LIMITS)
          .filter(([, limit]) => limit.errorCode === 'tool-input-limit')
          .map(([kind]) => kind),
      ].sort(),
    ).toStrictEqual(Object.keys(LIMITS).sort());
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
