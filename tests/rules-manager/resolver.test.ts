import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import * as portedResolver from '@/rules-manager/resolver';
import * as portedLimits from '@/rules-manager/resource-limits';
import { type FakeGitHub, startFakeGitHub } from '../helpers/fake-github';
import { type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { v1Rulebook, v2Rulebook } from '../helpers/rulebook-seeds';
import {
  createTempRoot,
  describeAsyncOutcome,
  normalize,
  recordPorted,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * The resolver is the only part of the manager that touches the network, so every row here runs
 * against one scripted GitHub on loopback and records what it produced, what it spent from its
 * budget, and which requests it made. The caps are asserted from
 * the outside — a body one byte over is refused, a body of exactly the cap is accepted — so a
 * limit that quietly moves fails a row instead of shipping.
 */

type Budget = {
  requests: number;
  responseBytes: number;
  maxRequests: number;
  maxResponseBytes: number;
};

type Operation = {
  controller: AbortController;
  budget: Budget;
  resolveUrl?: (url: string) => string;
};

type Kind = 'metadata' | 'commit' | 'tree' | 'raw';
type ResolvedRulebook = { spec: string; rulebook: { name: string }; content: string };

/** Only the members a row calls, spelled with the arguments a row passes: the filesystem scope is
 *  a module-private nominal type, so a row leaves it to its default. */
type Side = {
  createRuleSyncResourceBudget(limits?: {
    maxRequests?: number;
    maxResponseBytes?: number;
  }): Budget;
  createRuleSyncOperation(resolveUrl?: (url: string) => string): Operation;
  fetchGitHubResource(
    url: string,
    kind: Kind,
    options?: { timeoutMs?: number; budget?: Budget; signal?: AbortSignal },
  ): Promise<{ response: Response; content: string }>;
  discoverGitHubRepositoryRulebooks(
    source: string,
    options?: { ref?: string; operation?: Operation },
  ): Promise<{
    source: string;
    owner: string;
    repo: string;
    ref: string;
    commit: string;
    names: string[];
  }>;
  resolveRulebookSource(
    spec: string,
    configDir: string,
    filesystemScope?: undefined,
    operation?: Operation,
  ): Promise<ResolvedRulebook>;
  resolveRulebookSourceForSync(
    spec: string,
    configDir: string,
    filesystemScope: undefined,
    operation: Operation,
    refetch: boolean,
    fetchWhenMissing: boolean,
  ): Promise<ResolvedRulebook>;
};

const SIDES = [{ ...portedResolver, ...portedLimits }] as [Side];

const RESOURCE_LIMIT_ERROR = "Rule synchronization exceeds CC Safety Net's safe resource limits.";
const RULES_SUBPATH = join('.cc-safety-net', 'rules');
const KIND_CAPS = [
  ['metadata', 524_288],
  ['commit', 262_144],
  ['tree', 16_777_216],
  ['raw', 4_194_304],
] as const;

let github: FakeGitHub;

afterEach(() => {
  github.reset();
  removeTempRoots();
});

/** The call over its own copy of the seeded scope, recorded whole with the requests it made; the
 *  observation comes back for the row to pin. */
async function agree<T>(run: (side: Side, configDir: string) => Promise<T>, spec: TreeSpec = {}) {
  const ported = await observe(SIDES[0], run, spec);
  recordPorted(ported, [[github.origin, '<github>']]);
  return ported;
}

async function observe<T>(
  side: Side,
  run: (side: Side, configDir: string) => Promise<T>,
  spec: TreeSpec,
) {
  const root = createTempRoot('resolver-scope-');
  writeTree(root, spec);
  const before = github.requests.length;
  const value = await run(side, join(root, RULES_SUBPATH));
  // Sorted: a row cares which requests were made, not which of two sockets answered first.
  return normalize({ value, requests: github.requests.slice(before).sort() }, [[root, '<root>']]);
}

/** One bounded fetch reduced to what a row compares: the status and the head of the body it
 *  accepted, or the message it refused with. */
async function fetchRow(
  side: Side,
  path: string,
  kind: Kind,
  options: { timeoutMs?: number; budget?: Budget; signal?: AbortSignal } = {},
) {
  const budget = options.budget ?? side.createRuleSyncResourceBudget();
  const outcome = await describeAsyncOutcome(async () => {
    const result = await side.fetchGitHubResource(`${github.origin}${path}`, kind, {
      budget,
      timeoutMs: options.timeoutMs,
      signal: options.signal,
    });
    return {
      status: result.response.status,
      length: result.content.length,
      head: result.content.slice(0, 24),
    };
  });
  return { outcome, budget };
}

const spend = (budget: Budget) => ({
  requests: budget.requests,
  responseBytes: budget.responseBytes,
});

/** A resolution reduced to the spec it answered, the rulebook name it accepted and the bytes it
 *  produced, with what the operation spent reaching it. */
async function resolutionRow(
  side: Side,
  resolve: (operation: Operation) => Promise<ResolvedRulebook>,
) {
  const operation = side.createRuleSyncOperation(github.resolveUrl);
  const outcome = await describeAsyncOutcome(async () => {
    const resolved = await resolve(operation);
    return { spec: resolved.spec, name: resolved.rulebook.name, content: resolved.content };
  });
  return { outcome, spend: spend(operation.budget) };
}

const kindPath = (kind: Kind, label: string) =>
  `/${kind === 'raw' ? 'raw' : 'api'}/${label}-${kind}`;

describe('the bounded GitHub fetch', () => {
  beforeAll(async () => {
    github = await startFakeGitHub([]);
  });
  afterAll(() => github.close());

  test('refuses the 132nd request of an operation before it reaches the network', async () => {
    github.faults.set('/api/tiny', { kind: 'response', body: '{}' });
    const agreed = await agree(async (side) => {
      const budget = side.createRuleSyncResourceBudget();
      const outcomes: string[] = [];
      for (let index = 0; index <= budget.maxRequests; index += 1) {
        const row = await fetchRow(side, '/api/tiny', 'metadata', { budget });
        outcomes.push(row.outcome.kind === 'threw' ? row.outcome.message : 'accepted');
      }
      return { outcomes, spend: spend(budget) };
    });
    expect(agreed.value.outcomes.slice(0, 131)).toEqual(Array(131).fill('accepted'));
    expect(agreed.value.outcomes[131]).toBe(RESOURCE_LIMIT_ERROR);
    expect(agreed.value.spend).toEqual({ requests: 131, responseBytes: 262 });
    expect(agreed.requests).toHaveLength(131);
  }, 30_000);

  test('refuses the response that would overrun the operation byte budget', async () => {
    github.faults.set('/api/six-hundred', { kind: 'response', body: Buffer.alloc(600, 0x20) });
    const agreed = await agree(async (side) => {
      const budget = side.createRuleSyncResourceBudget({ maxResponseBytes: 1000 });
      const first = await fetchRow(side, '/api/six-hundred', 'raw', { budget });
      const second = await fetchRow(side, '/api/six-hundred', 'raw', { budget });
      return {
        first: first.outcome,
        second: second.outcome,
        requests: budget.requests,
        // The refused chunk is charged before the throw; the exact total depends on how the
        // transport split the body, so only the overrun itself is a stable fact.
        overBudget: budget.responseBytes > budget.maxResponseBytes,
      };
    });
    expect(agreed.value.first).toEqual({
      kind: 'returned',
      value: { status: 200, length: 600, head: ' '.repeat(24) },
    });
    expect(agreed.value.second).toEqual({ kind: 'threw', message: RESOURCE_LIMIT_ERROR });
    expect(agreed.value).toMatchObject({ requests: 2, overBudget: true });
  });

  test('refuses a declared Content-Length over the cap without reading a byte', async () => {
    github.faults.set('/raw/declared', {
      kind: 'response',
      headers: { 'content-length': String(4_194_304 + 1) },
      body: '{}',
    });
    const agreed = await agree(async (side) => {
      const row = await fetchRow(side, '/raw/declared', 'raw');
      return { outcome: row.outcome, spend: spend(row.budget) };
    });
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'GitHub raw response exceeds 4194304 bytes',
    });
    expect(agreed.value.spend).toEqual({ requests: 1, responseBytes: 0 });
  });

  test.each(KIND_CAPS)(
    'refuses a %s body one byte past its cap while it streams',
    async (kind, cap) => {
      github.faults.set(kindPath(kind, 'overflow'), {
        kind: 'response',
        body: Buffer.alloc(cap + 1, 0x20),
      });
      const agreed = await agree(async (side) => {
        const row = await fetchRow(side, kindPath(kind, 'overflow'), kind);
        // The bytes read before the cap is crossed depend on how the transport split the body.
        return { outcome: row.outcome, requests: row.budget.requests };
      });
      expect(agreed.value).toEqual({
        outcome: { kind: 'threw', message: `GitHub ${kind} response exceeds ${cap} bytes` },
        requests: 1,
      });
    },
    30_000,
  );

  test.each(KIND_CAPS)(
    'accepts a %s body of exactly its cap',
    async (kind, cap) => {
      github.faults.set(kindPath(kind, 'exact'), {
        kind: 'response',
        body: Buffer.concat([Buffer.from('{}'), Buffer.alloc(cap - 2, 0x20)]),
      });
      const agreed = await agree(async (side) => {
        const row = await fetchRow(side, kindPath(kind, 'exact'), kind);
        return { outcome: row.outcome, spend: spend(row.budget) };
      });
      expect(agreed.value).toEqual({
        outcome: {
          kind: 'returned',
          value: { status: 200, length: cap, head: `{}${' '.repeat(22)}` },
        },
        spend: { requests: 1, responseBytes: cap },
      });
    },
    30_000,
  );

  test('reassembles multibyte text split across writes', async () => {
    const body = '{"n":"é\u{1f600}"}';
    // 7 lands inside the two bytes of é, 10 inside the four bytes of the emoji.
    github.faults.set('/raw/multibyte', { kind: 'response', body, chunkBoundaries: [7, 10] });
    const agreed = await agree(async (side) => {
      const row = await fetchRow(side, '/raw/multibyte', 'raw');
      return { outcome: row.outcome, spend: spend(row.budget) };
    });
    expect(agreed.value).toEqual({
      outcome: { kind: 'returned', value: { status: 200, length: body.length, head: body } },
      spend: { requests: 1, responseBytes: 14 },
    });
  });

  test('gives up on a body that never ends', async () => {
    github.faults.set('/api/stalled', { kind: 'response', body: '{', endless: true });
    const agreed = await agree(async (side) => {
      const row = await fetchRow(side, '/api/stalled', 'metadata', { timeoutMs: 50 });
      // Whether the one byte already written was charged is a race with the timeout.
      return { outcome: row.outcome, requests: row.budget.requests };
    });
    expect(agreed.value).toEqual({
      outcome: { kind: 'threw', message: 'GitHub request timed out' },
      requests: 1,
    });
  });

  test('refuses to follow a redirect', async () => {
    github.faults.set('/api/moved', {
      kind: 'response',
      status: 302,
      headers: { location: `${github.origin}/api/tiny` },
    });
    const agreed = await agree(async (side) => {
      const row = await fetchRow(side, '/api/moved', 'metadata');
      return { outcome: row.outcome, spend: spend(row.budget) };
    });
    // The rejection comes from the runtime, so only its shape is contract: the redirect is never
    // followed, and the refused request is still charged.
    expect(agreed.value.outcome.kind).toBe('threw');
    expect(agreed.value.spend).toEqual({ requests: 1, responseBytes: 0 });
    expect(agreed.requests).toEqual(['GET /api/moved']);
  });

  test('charges a failed request without reading its body', async () => {
    github.faults.set('/api/server-error', {
      kind: 'response',
      status: 500,
      body: Buffer.alloc(100 * 1024, 0x20),
    });
    const agreed = await agree(async (side) => {
      const row = await fetchRow(side, '/api/server-error', 'metadata');
      return { outcome: row.outcome, spend: spend(row.budget) };
    });
    expect(agreed.value).toEqual({
      outcome: { kind: 'returned', value: { status: 500, length: 0, head: '' } },
      spend: { requests: 1, responseBytes: 0 },
    });
  });

  test('refuses an already-aborted operation before it sends anything', async () => {
    github.faults.set('/api/tiny', { kind: 'response', body: '{}' });
    const agreed = await agree(async (side) => {
      const controller = new AbortController();
      controller.abort(new Error('operation cancelled'));
      const row = await fetchRow(side, '/api/tiny', 'metadata', { signal: controller.signal });
      return { outcome: row.outcome, spend: spend(row.budget) };
    });
    expect(agreed.value).toEqual({
      outcome: { kind: 'threw', message: 'operation cancelled' },
      spend: { requests: 0, responseBytes: 0 },
    });
    expect(agreed.requests).toEqual([]);
  });
});

describe('repository discovery', () => {
  const catalogSha = 'a'.repeat(40);
  const releaseSha = 'b'.repeat(40);
  const emptySha = 'e'.repeat(40);
  const treePath = `/api/repos/acme/catalog/git/trees/${catalogSha}`;

  beforeAll(async () => {
    github = await startFakeGitHub([
      {
        owner: 'acme',
        repo: 'catalog',
        defaultBranch: 'main',
        refs: { main: catalogSha, 'release/v2': releaseSha },
        trees: {
          [catalogSha]: { team: v1Rulebook('team'), infra: v1Rulebook('infra') },
          [releaseSha]: { team: v1Rulebook('team') },
        },
      },
      {
        owner: 'acme',
        repo: 'empty',
        defaultBranch: 'main',
        refs: { main: emptySha },
        trees: { [emptySha]: {} },
      },
    ]);
  });
  afterAll(() => github.close());

  const discovery = (source: string, ref?: string) =>
    agree(async (side) => {
      const operation = side.createRuleSyncOperation(github.resolveUrl);
      const outcome = await describeAsyncOutcome(() =>
        side.discoverGitHubRepositoryRulebooks(source, { ref, operation }),
      );
      return { outcome, spend: spend(operation.budget) };
    });

  test('lists every rulebook of the default branch, sorted and pinned to a commit', async () => {
    const agreed = await discovery('acme/catalog');
    expect(agreed.value.outcome).toEqual({
      kind: 'returned',
      value: {
        source: 'acme/catalog',
        owner: 'acme',
        repo: 'catalog',
        ref: 'main',
        commit: catalogSha,
        names: ['infra', 'team'],
      },
    });
    expect(agreed.value.spend.requests).toBe(3);
    expect(agreed.requests).toEqual([
      'GET /api/repos/acme/catalog',
      'GET /api/repos/acme/catalog/commits/main',
      `GET /api/repos/acme/catalog/git/trees/${catalogSha}?recursive=1`,
    ]);
  });

  test('an explicit ref skips the metadata request', async () => {
    const agreed = await discovery('acme/catalog', 'release/v2');
    expect(agreed.value.outcome).toEqual({
      kind: 'returned',
      value: {
        source: 'acme/catalog',
        owner: 'acme',
        repo: 'catalog',
        ref: 'release/v2',
        commit: releaseSha,
        names: ['team'],
      },
    });
    expect(agreed.value.spend.requests).toBe(2);
    expect(agreed.requests).toEqual([
      'GET /api/repos/acme/catalog/commits/release%2Fv2',
      `GET /api/repos/acme/catalog/git/trees/${releaseSha}?recursive=1`,
    ]);
  });

  test('a ref that is not a path segment is refused before any request', async () => {
    const agreed = await discovery('acme/catalog', 'bad ref');
    expect(agreed.value).toEqual({
      outcome: {
        kind: 'threw',
        message: 'GitHub rulebook refs must use valid path segments: bad ref',
      },
      spend: { requests: 0, responseBytes: 0 },
    });
    expect(agreed.requests).toEqual([]);
  });

  test('a ref GitHub does not know reports the status it answered with', async () => {
    const agreed = await discovery('acme/catalog', 'nope');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'Failed to resolve acme/catalog: GitHub returned 404',
    });
    expect(agreed.requests).toEqual(['GET /api/repos/acme/catalog/commits/nope']);
  });

  test('a repository with nothing under the rules directory names the directory', async () => {
    const agreed = await discovery('acme/empty');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'No rulebooks found in acme/empty under .cc-safety-net/rules/',
    });
    expect(agreed.value.spend.requests).toBe(3);
  });

  test('a source that is not owner/repo is refused before any request', async () => {
    const agreed = await discovery('not a repo');
    expect(agreed.value).toEqual({
      outcome: { kind: 'threw', message: 'Invalid GitHub repository source: not a repo' },
      spend: { requests: 0, responseBytes: 0 },
    });
    expect(agreed.requests).toEqual([]);
  });

  test('a tree response that is not an object is refused', async () => {
    github.faults.set(treePath, { kind: 'response', body: '[]' });
    const agreed = await discovery('acme/catalog');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'Failed to inspect acme/catalog: unexpected GitHub tree response',
    });
  });

  test('a repository without a default branch is refused', async () => {
    github.faults.set('/api/repos/acme/catalog', {
      kind: 'response',
      body: '{"default_branch":""}',
    });
    const agreed = await discovery('acme/catalog');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'Failed to inspect acme/catalog: missing default branch',
    });
    expect(agreed.value.spend.requests).toBe(1);
  });
});

describe('rulebook resolution', () => {
  const rulesSha = 'c'.repeat(40);
  const rawPath = (name: string) =>
    `/raw/acme/rules/${rulesSha}/.cc-safety-net/rules/${name}/rulebook.json`;
  const publishedTeam = v1Rulebook('team');
  const vendoredTeam = v1Rulebook('team', [
    {
      name: 'block-docker-system-prune',
      command: 'docker',
      subcommand: 'system',
      block_args: ['prune'],
      reason: 'Vendored copy.',
    },
  ]);
  const flawed = v2Rulebook(
    'flawed',
    [
      {
        name: 'block-terraform-destroy',
        command: 'terraform',
        match: { command_path: ['destroy'] },
        reason: 'Destroys infrastructure.',
      },
    ],
    [{ command: 'terraform plan', expect: 'blocked', rule: 'block-terraform-destroy' }],
  );
  /** What a fetch of the published copy answers with, asserted by three rows that reach it by
   *  different routes. */
  const fetchedTeam = {
    kind: 'returned' as const,
    value: { spec: 'acme/rules#main/team', name: 'team', content: publishedTeam },
  };
  const fixtureFailure =
    'tests[0]: expected "block-terraform-destroy" to block "terraform plan" but no rule matched';
  const vendored = (name: string, content: string) => ({
    [`${RULES_SUBPATH}/${name}/rulebook.json`]: content,
  });

  beforeAll(async () => {
    github = await startFakeGitHub([
      {
        owner: 'acme',
        repo: 'rules',
        defaultBranch: 'main',
        refs: { main: rulesSha },
        trees: {
          [rulesSha]: { team: publishedTeam, skewed: v1Rulebook('other'), flawed },
        },
      },
    ]);
  });
  afterAll(() => github.close());

  const resolution = (spec: string, tree: TreeSpec = {}) =>
    agree(
      (side, configDir) =>
        resolutionRow(side, (operation) =>
          side.resolveRulebookSource(spec, configDir, undefined, operation),
        ),
      tree,
    );

  const forSync = (
    spec: string,
    refetch: boolean,
    fetchWhenMissing: boolean,
    tree: TreeSpec = {},
  ) =>
    agree(
      (side, configDir) =>
        resolutionRow(side, (operation) =>
          side.resolveRulebookSourceForSync(
            spec,
            configDir,
            undefined,
            operation,
            refetch,
            fetchWhenMissing,
          ),
        ),
      tree,
    );

  test('a local source resolves to the file the scope holds', async () => {
    const agreed = await resolution('team', vendored('team', publishedTeam));
    expect(agreed.value).toEqual({
      outcome: {
        kind: 'returned',
        value: { spec: 'team', name: 'team', content: publishedTeam },
      },
      spend: { requests: 0, responseBytes: 0 },
    });
    expect(agreed.requests).toEqual([]);
  });

  test('a local source with no file names the source', async () => {
    const agreed = await resolution('team');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'Rulebook source not found: team',
    });
  });

  test('a local rulebook naming itself something else is refused', async () => {
    const agreed = await resolution('team', vendored('team', v1Rulebook('other')));
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'rulebook name "other" must match local source "team"',
    });
  });

  test('a local rulebook that is not JSON is refused', async () => {
    const agreed = await resolution('team', vendored('team', 'not json'));
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'Invalid local rulebook source.',
    });
  });

  test('a local rulebook whose own fixture fails is refused', async () => {
    const agreed = await resolution('flawed', vendored('flawed', flawed));
    expect(agreed.value.outcome).toEqual({ kind: 'threw', message: fixtureFailure });
  });

  test('a source that is not a bare name is refused before any read', async () => {
    const agreed = await resolution('bad name');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message:
        'Local rulebook sources must be bare names matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/: bad name',
    });
  });

  test('a GitHub source resolves the ref to a commit and fetches that commit', async () => {
    const agreed = await resolution('acme/rules#main/team');
    expect(agreed.value.outcome).toEqual(fetchedTeam);
    expect(agreed.value.spend.requests).toBe(2);
    expect(agreed.requests).toEqual([
      'GET /api/repos/acme/rules/commits/main',
      `GET ${rawPath('team')}`,
    ]);
  });

  test('a fetched rulebook naming itself something else is refused', async () => {
    const agreed = await resolution('acme/rules#main/skewed');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'rulebook name "other" must match GitHub source "skewed"',
    });
  });

  test('a raw response GitHub failed reports the status', async () => {
    github.faults.set(rawPath('team'), { kind: 'response', status: 500, body: 'no' });
    const agreed = await resolution('acme/rules#main/team');
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: 'Failed to fetch acme/rules#main/team: GitHub raw returned 500',
    });
    expect(agreed.value.spend.requests).toBe(2);
  });

  test('a fetched rulebook whose own fixture fails is refused', async () => {
    const agreed = await resolution('acme/rules#main/flawed');
    expect(agreed.value.outcome).toEqual({ kind: 'threw', message: fixtureFailure });
  });

  test('a vendored copy is read without a request', async () => {
    const agreed = await forSync(
      'acme/rules#main/team',
      false,
      false,
      vendored('team', vendoredTeam),
    );
    expect(agreed.value).toEqual({
      outcome: {
        kind: 'returned',
        value: { spec: 'acme/rules#main/team', name: 'team', content: vendoredTeam },
      },
      spend: { requests: 0, responseBytes: 0 },
    });
    expect(agreed.requests).toEqual([]);
  });

  test('a refresh fetches over the vendored copy', async () => {
    const agreed = await forSync(
      'acme/rules#main/team',
      true,
      false,
      vendored('team', vendoredTeam),
    );
    expect(agreed.value.outcome).toEqual(fetchedTeam);
    expect(agreed.value.spend.requests).toBe(2);
  });

  test('an unselected source with nothing vendored is reported, not fetched', async () => {
    const agreed = await forSync('acme/rules#main/team', false, false);
    expect(agreed.value).toEqual({
      outcome: {
        kind: 'threw',
        message:
          'acme/rules#main/team is not vendored; run rule update acme/rules#main/team to vendor it',
      },
      spend: { requests: 0, responseBytes: 0 },
    });
    expect(agreed.requests).toEqual([]);
  });

  test('a source with nothing vendored is fetched when the run may heal it', async () => {
    const agreed = await forSync('acme/rules#main/team', false, true);
    expect(agreed.value.outcome).toEqual(fetchedTeam);
    expect(agreed.value.spend.requests).toBe(2);
  });

  test('a vendored copy naming itself something else names the file', async () => {
    const agreed = await forSync(
      'acme/rules#main/team',
      false,
      false,
      vendored('team', v1Rulebook('other')),
    );
    expect(agreed.value.outcome).toEqual({
      kind: 'threw',
      message: `rulebook name "other" in <root>/${RULES_SUBPATH}/team/rulebook.json must match "team"`,
    });
    expect(agreed.requests).toEqual([]);
  });
});
