import { describe, expect, test } from 'bun:test';
import * as ported from '@next/rules-manager/resource-limits';
import * as shipped from '@/rules/policy/resource-limits';
import { describeOutcome } from '../helpers/fixture-tree';

/**
 * The budget is the only thing standing between one `rule add` and an unbounded fetch: a request
 * counter that refuses the 132nd call and a byte counter that refuses the byte past the cap. Each
 * row exhausts one counter on both implementations and compares the outcome of every reservation,
 * so an off-by-one or a charge that stops being recorded shows up as a differing row.
 */

const SIDES = [shipped, ported] as const;

/** The same reservation sequence on both sides, compared whole before it is pinned. */
function agree<T>(run: (side: typeof ported) => T): T {
  const outcomes = SIDES.map((side) => run(side));
  expect(outcomes[1]).toEqual(outcomes[0]);
  expect(outcomes[1]).toMatchSnapshot();
  return outcomes[1] as T;
}

function reserveRequests(side: typeof ported, count: number, maxRequests?: number) {
  const budget = side.createRuleSyncResourceBudget(
    maxRequests === undefined ? {} : { maxRequests },
  );
  const outcomes = Array.from({ length: count }, () =>
    describeOutcome(() => side.reserveGitHubRequest(budget)),
  );
  return { outcomes, requests: budget.requests, maxRequests: budget.maxRequests };
}

function reserveBytes(side: typeof ported, chunks: readonly number[]) {
  const budget = side.createRuleSyncResourceBudget();
  return {
    outcomes: chunks.map((bytes) =>
      describeOutcome(() => side.reserveGitHubResponseBytes(budget, bytes)),
    ),
    responseBytes: budget.responseBytes,
  };
}

const LIMIT_ERROR = {
  ok: false,
  error: {
    name: 'Error',
    message: "Rule synchronization exceeds CC Safety Net's safe resource limits.",
  },
} as const;

describe('the request counter', () => {
  test('accepts 131 requests and refuses the next one', () => {
    const limit = ported.RULE_SYNC_RESOURCE_LIMITS.maxRequests;
    const result = agree((side) => reserveRequests(side, limit + 1));
    expect(result.outcomes.slice(0, limit).filter((outcome) => !outcome.ok)).toEqual([]);
    expect(result.outcomes[limit]).toEqual(LIMIT_ERROR);
    expect(result.requests).toBe(limit);
  });

  test('a lowered request ceiling refuses the third request', () => {
    const result = agree((side) => reserveRequests(side, 3, 2));
    expect(result.outcomes.map((outcome) => outcome.ok)).toEqual([true, true, false]);
    expect(result).toMatchObject({ requests: 2, maxRequests: 2 });
  });
});

describe('the response-byte counter', () => {
  test('accepts exactly the cap across chunks and refuses the byte after it', () => {
    const cap = ported.RULE_SYNC_RESOURCE_LIMITS.maxResponseBytes;
    const result = agree((side) => reserveBytes(side, [cap - 1, 1, 1]));
    expect(result.outcomes.map((outcome) => outcome.ok)).toEqual([true, true, false]);
    expect(result.outcomes[2]).toEqual(LIMIT_ERROR);
    // The refused chunk is charged before the throw, so the reader cannot retry it cheaply.
    expect(result.responseBytes).toBe(cap + 1);
  });

  test('a single chunk over the cap is refused whole', () => {
    const cap = ported.RULE_SYNC_RESOURCE_LIMITS.maxResponseBytes;
    const result = agree((side) => reserveBytes(side, [cap + 1]));
    expect(result.outcomes[0]).toEqual(LIMIT_ERROR);
    expect(result.responseBytes).toBe(cap + 1);
  });
});

describe('an operation', () => {
  test('carries a fresh budget, an unaborted signal and the url mapping', () => {
    const toLoopback = (url: string) => url.replace('https://api.github.com', 'http://127.0.0.1:1');
    const result = agree((side) => {
      const operation = side.createRuleSyncOperation(toLoopback);
      return {
        budget: operation.budget,
        aborted: operation.controller.signal.aborted,
        resolved: operation.resolveUrl?.('https://api.github.com/repos/acme/repo'),
      };
    });
    expect(result).toEqual({
      budget: {
        requests: 0,
        responseBytes: 0,
        maxRequests: 131,
        maxResponseBytes: 67_108_864,
      },
      aborted: false,
      resolved: 'http://127.0.0.1:1/repos/acme/repo',
    });
  });

  test('an operation built without a mapping carries none', () => {
    expect(agree((side) => side.createRuleSyncOperation().resolveUrl)).toBeUndefined();
  });
});
