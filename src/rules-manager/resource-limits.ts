import { RULE_SOURCE_LIMIT } from '@/core/policy/resource-limits';

const RULE_SYNC_RESOURCE_LIMIT_ERROR =
  "Rule synchronization exceeds CC Safety Net's safe resource limits.";

export const RULE_SYNC_RESOURCE_LIMITS = Object.freeze({
  maxSources: RULE_SOURCE_LIMIT,
  concurrency: 4,
  maxRequests: 131,
  maxResponseBytes: 64 * 1024 * 1024,
});

export interface RuleSyncResourceBudget {
  requests: number;
  responseBytes: number;
  maxRequests: number;
  maxResponseBytes: number;
}

export interface RuleSyncOperation {
  controller: AbortController;
  budget: RuleSyncResourceBudget;
  resolveUrl?: (url: string) => string;
}

export function createRuleSyncResourceBudget(
  limits: Partial<Pick<RuleSyncResourceBudget, 'maxRequests' | 'maxResponseBytes'>> = {},
): RuleSyncResourceBudget {
  return {
    requests: 0,
    responseBytes: 0,
    maxRequests: limits.maxRequests ?? RULE_SYNC_RESOURCE_LIMITS.maxRequests,
    maxResponseBytes: limits.maxResponseBytes ?? RULE_SYNC_RESOURCE_LIMITS.maxResponseBytes,
  };
}

export function createRuleSyncOperation(resolveUrl?: (url: string) => string): RuleSyncOperation {
  return {
    controller: new AbortController(),
    budget: createRuleSyncResourceBudget(),
    resolveUrl,
  };
}

/** Budget exhaustion is an operation-wide failure, not one source's failure. */
export function isRuleSyncResourceLimitError(error: unknown): boolean {
  return error instanceof Error && error.message === RULE_SYNC_RESOURCE_LIMIT_ERROR;
}

export function reserveGitHubRequest(budget: RuleSyncResourceBudget): void {
  if (budget.requests >= budget.maxRequests) throw new Error(RULE_SYNC_RESOURCE_LIMIT_ERROR);
  budget.requests++;
}

export function reserveGitHubResponseBytes(budget: RuleSyncResourceBudget, bytes: number): void {
  if (bytes > budget.maxResponseBytes - budget.responseBytes) {
    budget.responseBytes += bytes;
    throw new Error(RULE_SYNC_RESOURCE_LIMIT_ERROR);
  }
  budget.responseBytes += bytes;
}
