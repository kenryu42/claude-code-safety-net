import type { Budget } from '@/core/budget';

export type ParallelAnalysisReservation = {
  childAnalyses?: number;
  derivedTokens?: number;
  derivedBytes?: number;
  placeholderReplacements?: number;
};

/**
 * One expansion's share of the four parallel counters, charged in the order the shipped budget
 * validates them so the kind that breaches is the same one.
 */
export function reserveParallelAnalysis(
  budget: Budget,
  reservation: ParallelAnalysisReservation,
): void {
  budget.charge('parallelChildAnalyses', reservation.childAnalyses ?? 0);
  budget.charge('parallelDerivedTokens', reservation.derivedTokens ?? 0);
  budget.charge('parallelDerivedBytes', reservation.derivedBytes ?? 0);
  budget.charge('parallelPlaceholderReplacements', reservation.placeholderReplacements ?? 0);
}
