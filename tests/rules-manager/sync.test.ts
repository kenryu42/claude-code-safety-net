import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Environment } from '@/core/environment';
import * as portedLimits from '@/rules-manager/resource-limits';
import * as portedSync from '@/rules-manager/sync';
import type {
  AddRulebookSourceOptions,
  AddRulebookSourceResult,
  SyncRulesConfigOptions,
  SyncRulesConfigResult,
} from '@/rules-manager/types';
import { type FakeGitHub, type ScriptedRepository, startFakeGitHub } from '../helpers/fake-github';
import type { TreeEntry, TreeSpec } from '../helpers/fixture-tree';
import {
  json,
  rulesConfig,
  type SeedRule,
  v1Rulebook,
  v2Rulebook,
} from '../helpers/rulebook-seeds';
import { expectGateView, runManagerDifferential } from '../helpers/rules-manager-differential';
import { describeAsyncOutcome, removeTempRoots } from '../helpers/temp-home';

/**
 * Everything the manager writes, refuses to write, or rolls back, driven over its `Environment`
 * against one scripted GitHub on loopback. A row records the result object and the tree and pins
 * the messages, so a reworded diagnostic or a byte that moves in `rule.json` fails here rather
 * than reaching a user.
 */

type RemoveOptions = SyncRulesConfigOptions & { deleteSource?: boolean };

/**
 * The manager surface a row drives, with the `Environment` already bound; the type names only the
 * members a row actually calls.
 */
type Manager = {
  operation(resolveUrl?: (url: string) => string): portedLimits.RuleSyncOperation;
  budget(limits: {
    maxRequests?: number;
    maxResponseBytes?: number;
  }): portedLimits.RuleSyncResourceBudget;
  sync(
    options: SyncRulesConfigOptions,
    operation: portedLimits.RuleSyncOperation,
  ): Promise<SyncRulesConfigResult>;
  plainSync(options: SyncRulesConfigOptions): Promise<SyncRulesConfigResult>;
  syncWithHooks(
    options: SyncRulesConfigOptions,
    hooks: portedSync.RuleSyncTestHooks,
  ): Promise<SyncRulesConfigResult>;
  add(
    source: string,
    options: AddRulebookSourceOptions,
    operation: portedLimits.RuleSyncOperation,
  ): Promise<AddRulebookSourceResult>;
  plainAdd(source: string, options: AddRulebookSourceOptions): Promise<AddRulebookSourceResult>;
  addWithHooks(
    source: string,
    options: AddRulebookSourceOptions,
    hooks: portedSync.RuleSyncTestHooks,
  ): Promise<AddRulebookSourceResult>;
  remove(match: string, options: RemoveOptions): Promise<SyncRulesConfigResult>;
  removeWithHooks(
    match: string,
    options: RemoveOptions,
    hooks: portedSync.RuleSyncTestHooks,
  ): Promise<SyncRulesConfigResult>;
  map<T, U>(
    sources: readonly T[],
    mapper: (source: T, index: number, signal: AbortSignal) => Promise<U>,
    operation: portedLimits.RuleSyncOperation,
  ): Promise<U[]>;
};

function manager(environment: Environment): Manager {
  return {
    operation: portedLimits.createRuleSyncOperation,
    budget: portedLimits.createRuleSyncResourceBudget,
    sync: (options, operation) =>
      portedSync.syncRulesConfigWithOperation(environment, options, operation),
    plainSync: (options) => portedSync.syncRulesConfig(environment, options),
    syncWithHooks: (options, hooks) =>
      portedSync.syncRulesConfigWithHooks(environment, options, hooks),
    add: (source, options, operation) =>
      portedSync.addRulebookSourceWithOperation(environment, source, options, operation),
    plainAdd: (source, options) => portedSync.addRulebookSource(environment, source, options),
    addWithHooks: (source, options, hooks) =>
      portedSync.addRulebookSourceWithHooks(environment, source, options, hooks),
    remove: (match, options) => portedSync.removeRulebookSource(environment, match, options),
    removeWithHooks: (match, options, hooks) =>
      portedSync.removeRulebookSourceWithHooks(environment, match, options, hooks),
    map: portedSync.mapRulebookSources,
  };
}

const SHA_MAIN = '1'.repeat(40);
const SHA_V2 = '2'.repeat(40);
const SHA_OTHER = '3'.repeat(40);
const SHA_BROKEN = '4'.repeat(40);
const SHA_BULK = '5'.repeat(40);

const RULES = 'project/.cc-safety-net/rules';
const CONFIG = `${RULES}/rule.json`;
const rulebookPath = (name: string) => `${RULES}/${name}/rulebook.json`;
const rawPath = (repo: string, sha: string, name: string) =>
  `/raw/acme/${repo}/${sha}/.cc-safety-net/rules/${name}/rulebook.json`;

const dockerRule = (name: string, reason: string): SeedRule => ({
  name,
  command: 'docker',
  subcommand: 'system',
  block_args: [name],
  reason,
});

/** A version 1 rulebook at an explicit version, so an update has something to report. */
const rulebookAt = (name: string, version: string, rules: readonly SeedRule[]) =>
  json({ rulebook_version: 1, name, version, allowed_commands: ['docker'], rules });

const A_V1 = v1Rulebook('a', [dockerRule('keep', 'Keep it.'), dockerRule('drop', 'Drop it.')]);
const A_V2 = rulebookAt('a', '1.1.0', [
  dockerRule('keep', 'Changed reason.'),
  dockerRule('gain', 'Gain it.'),
]);
const B_V1 = v1Rulebook('b', [dockerRule('bkeep', 'Keep it.')]);
const B_V2 = rulebookAt('b', '1.1.0', [dockerRule('bkeep', 'Changed reason.')]);
const C_V1 = v1Rulebook('c');
const X_V1 = v1Rulebook('x');
const BAD_FIXTURE = v2Rulebook(
  'bad',
  [
    {
      name: 'block-bad',
      command: 'docker',
      match: { command_path: ['compose'] },
      reason: 'Never compose.',
    },
  ],
  [{ command: 'docker system prune', expect: 'blocked', rule: 'block-bad' }],
);

const BULK_NAMES = Array.from({ length: 64 }, (_unused, index) => `rb-${String(index + 10)}`);
const BULK_TREE = Object.fromEntries(BULK_NAMES.map((name) => [name, v1Rulebook(name)]));

function scriptedRepositories(): ScriptedRepository[] {
  return [
    {
      owner: 'acme',
      repo: 'catalog',
      defaultBranch: 'main',
      refs: { main: SHA_MAIN, v2: SHA_V2 },
      trees: { [SHA_MAIN]: { a: A_V1, b: B_V1, c: C_V1 }, [SHA_V2]: { a: A_V2, b: B_V2 } },
    },
    {
      owner: 'acme',
      repo: 'other',
      defaultBranch: 'main',
      refs: { main: SHA_OTHER },
      trees: { [SHA_OTHER]: { x: X_V1 } },
    },
    {
      owner: 'acme',
      repo: 'broken',
      defaultBranch: 'main',
      refs: { main: SHA_BROKEN },
      trees: { [SHA_BROKEN]: { bad: BAD_FIXTURE } },
    },
    {
      owner: 'acme',
      repo: 'bulk',
      defaultBranch: 'main',
      refs: { main: SHA_BULK },
      trees: { [SHA_BULK]: BULK_TREE },
    },
  ];
}

let github: FakeGitHub;

beforeAll(async () => {
  github = await startFakeGitHub(scriptedRepositories());
});

afterAll(async () => {
  await github.close();
});

afterEach(() => {
  github.reset();
  github.repositories.splice(0, github.repositories.length, ...scriptedRepositories());
  removeTempRoots();
});

const contentAt = (tree: TreeEntry[], path: string) =>
  tree.find((entry) => entry.path === path)?.content;

/** The request log this row produced, emptied so the next row starts from nothing. Fanout order
 *  is not deterministic, so the log is recorded as a sorted set of calls. */
const takeRequests = () => github.requests.splice(0).sort();

const waitFor = async (ready: () => boolean) => {
  while (!ready()) await new Promise((resolve) => setTimeout(resolve, 10));
};

/** One `rule add` over the seeded project scope, pointed at the scripted GitHub. */
const addRow = (seed: TreeSpec, source: string, options: AddRulebookSourceOptions = {}) =>
  runManagerDifferential(seed, async (side, environment) => {
    const api = manager(environment);
    return api.add(source, { ...options, cwd: side.project }, api.operation(github.resolveUrl));
  });

/** One `rule update` over the seeded project scope. */
const syncRow = (seed: TreeSpec, options: SyncRulesConfigOptions) =>
  runManagerDifferential(seed, async (side, environment) => {
    const api = manager(environment);
    return api.sync({ ...options, cwd: side.project }, api.operation(github.resolveUrl));
  });

/** One `rule remove` over the seeded project scope; nothing here ever reaches the network. */
const removeRow = (seed: TreeSpec, match: string, options: RemoveOptions = {}) =>
  runManagerDifferential(seed, async (side, environment) =>
    manager(environment).remove(match, { ...options, cwd: side.project }),
  );

describe('adding rulebook sources', () => {
  test('adds a local source and reports what the guard would load', async () => {
    const { results, tree, side } = await addRow(
      { [CONFIG]: rulesConfig([]), [rulebookPath('local')]: v1Rulebook('local') },
      'local',
    );
    expect(results).toStrictEqual({
      ok: true,
      errors: [],
      entries: [{ spec: 'local', name: 'local', version: '1.0.0', ruleCount: 1 }],
      changes: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig(['local']));
    expectGateView(side, 'project', results);
  });

  test('adds every rulebook a repository publishes and vendors the served bytes', async () => {
    const { results, tree, side } = await runManagerDifferential(
      { [CONFIG]: rulesConfig([]) },
      async (side, environment) => {
        const api = manager(environment);
        const result = await api.add(
          'acme/catalog',
          { cwd: side.project },
          api.operation(github.resolveUrl),
        );
        return { result, requests: takeRequests() };
      },
    );
    expect(results.result.add).toStrictEqual({
      source: 'acme/catalog',
      ref: 'main',
      selected: ['a', 'b', 'c'],
      added: ['a', 'b', 'c'],
      alreadyConfigured: [],
      commits: [SHA_MAIN],
    });
    expect(results.result.changes).toStrictEqual([
      'Vendored acme/catalog#main/a (1.0.0)',
      'Vendored acme/catalog#main/b (1.0.0)',
      'Vendored acme/catalog#main/c (1.0.0)',
    ]);
    expect(contentAt(tree, CONFIG)).toBe(
      rulesConfig(['acme/catalog#main/a', 'acme/catalog#main/b', 'acme/catalog#main/c']),
    );
    expect(contentAt(tree, rulebookPath('a'))).toBe(A_V1);
    expect(contentAt(tree, rulebookPath('b'))).toBe(B_V1);
    expect(contentAt(tree, rulebookPath('c'))).toBe(C_V1);
    // Discovery is three requests; each rulebook then costs a commit and a raw read.
    expect(results.requests).toHaveLength(9);
    expectGateView(side, 'project', results.result);
  });

  test('adds only the selected rulebook', async () => {
    const { results, tree } = await addRow({ [CONFIG]: rulesConfig([]) }, 'acme/catalog', {
      rulebooks: ['b'],
    });
    expect(results.add?.selected).toStrictEqual(['b']);
    expect(results.add?.added).toStrictEqual(['b']);
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig(['acme/catalog#main/b']));
    expect(contentAt(tree, rulebookPath('a'))).toBeUndefined();
  });

  test('adds from an explicit ref', async () => {
    const { results, tree } = await addRow({ [CONFIG]: rulesConfig([]) }, 'acme/catalog', {
      ref: 'v2',
    });
    expect(results.add).toStrictEqual({
      source: 'acme/catalog',
      ref: 'v2',
      selected: ['a', 'b'],
      added: ['a', 'b'],
      alreadyConfigured: [],
      commits: [SHA_V2],
    });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig(['acme/catalog#v2/a', 'acme/catalog#v2/b']));
    expect(contentAt(tree, rulebookPath('a'))).toBe(A_V2);
  });

  test('re-adding a commit-pinned rulebook configures and writes nothing', async () => {
    const seed = {
      [CONFIG]: rulesConfig([`acme/catalog#${SHA_MAIN}/a`]),
      [rulebookPath('a')]: A_V1,
    };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) => {
      const api = manager(environment);
      const result = await api.add(
        'acme/catalog',
        { cwd: side.project, rulebooks: ['a'] },
        api.operation(github.resolveUrl),
      );
      return { result, requests: takeRequests() };
    });
    expect(results.result.add).toStrictEqual({
      source: 'acme/catalog',
      ref: 'main',
      selected: ['a'],
      added: [],
      alreadyConfigured: ['a'],
      commits: [],
    });
    expect(results.result.changes).toStrictEqual([]);
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
    // Discovery alone: the pinned spec is already vendored, so nothing is fetched for it.
    expect(results.requests).toHaveLength(3);
  });

  test('names the rulebooks a repository does not publish', async () => {
    const { results, tree } = await addRow({ [CONFIG]: rulesConfig([]) }, 'acme/catalog', {
      rulebooks: ['zed'],
    });
    expect(results).toStrictEqual({
      ok: false,
      errors: ['Rulebooks not found in acme/catalog at main: zed\nAvailable rulebooks: a, b, c'],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig([]));
  });

  test('refuses a rulebook name another configured source already claims', async () => {
    // The local file is byte-identical to what the repository serves, so the only thing wrong
    // with the add is the name two sources would then claim.
    const seed = { [CONFIG]: rulesConfig(['a']), [rulebookPath('a')]: A_V1 };
    const { results, tree } = await addRow(seed, 'acme/catalog', { rulebooks: ['a'] });
    expect(results.ok).toBeFalse();
    expect(results.errors).toStrictEqual([
      'Failed to update acme/catalog#main/a: rulebook name "a" is also claimed by a; rename one of them',
    ]);
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
    expect(contentAt(tree, rulebookPath('a'))).toBe(seed[rulebookPath('a')]);
  });

  test('refuses to overwrite a file no configured source claims', async () => {
    const handAuthored = v1Rulebook('a', [dockerRule('hand-authored', 'Written by hand.')]);
    const { results, tree } = await addRow(
      { [CONFIG]: rulesConfig([]), [rulebookPath('a')]: handAuthored },
      'acme/catalog',
      { rulebooks: ['a'] },
    );
    expect(results.ok).toBeFalse();
    expect(results.errors).toStrictEqual([
      'Failed to update acme/catalog#main/a: <root>/project/.cc-safety-net/rules/a/rulebook.json already exists and no configured source claims it; remove or rename the file, then re-run rule add',
    ]);
    expect(contentAt(tree, rulebookPath('a'))).toBe(handAuthored);
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig([]));
  });

  // The siblings a refused add must not strand. `b` and `c` resolve, but the run reports a
  // failure and rolls its config edit back, so vendoring them would leave two files no source
  // claims — and those orphans are exactly what the unclaimed-file refusal trips over next time.
  test('a refused name stops the rest of the catalogue from being vendored', async () => {
    const claimed = { [CONFIG]: rulesConfig(['a']), [rulebookPath('a')]: A_V1 };
    const { results, tree } = await addRow(claimed, 'acme/catalog');
    expect(results.errors).toStrictEqual([
      'Failed to update acme/catalog#main/a: rulebook name "a" is also claimed by a; rename one of them',
    ]);
    expect(results.ok).toBeFalse();
    expect(contentAt(tree, CONFIG)).toBe(claimed[CONFIG]);
    for (const orphan of ['b', 'c']) expect(contentAt(tree, rulebookPath(orphan))).toBeUndefined();
  });

  test('a failed fetch leaves no config and no vendored file behind', async () => {
    github.faults.set(rawPath('catalog', SHA_MAIN, 'b'), {
      kind: 'response',
      status: 500,
      body: 'upstream boom',
    });
    const { results, tree } = await addRow({}, 'acme/catalog');
    expect(results).toStrictEqual({
      ok: false,
      errors: ['Failed to fetch acme/catalog#main/b: GitHub raw returned 500'],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBeUndefined();
    expect(contentAt(tree, rulebookPath('a'))).toBeUndefined();
    expect(contentAt(tree, rulebookPath('c'))).toBeUndefined();
  });

  test('a rulebook whose own fixture fails is never vendored', async () => {
    const { results, tree } = await addRow({ [CONFIG]: rulesConfig([]) }, 'acme/broken');
    expect(results).toStrictEqual({
      ok: false,
      errors: ['tests[0]: expected "block-bad" to block "docker system prune" but no rule matched'],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig([]));
    expect(contentAt(tree, rulebookPath('bad'))).toBeUndefined();
  });

  test('repository-only flags are refused on a local source', async () => {
    const seed = { [CONFIG]: rulesConfig([]), [rulebookPath('local')]: v1Rulebook('local') };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) => {
      const api = manager(environment);
      const operation = api.operation(github.resolveUrl);
      return [
        await api.add('local', { cwd: side.project, rulebooks: ['a'] }, operation),
        await api.add('local', { cwd: side.project, ref: 'main' }, operation),
        await api.add('acme/catalog', { cwd: side.project, rulebooks: [] }, operation),
      ];
    });
    expect(results.map((result) => result.errors)).toStrictEqual([
      ['--only can only select rulebooks from an owner/repo source'],
      ['--ref can only select a ref for an owner/repo source: local'],
      ['--only requires at least one rulebook name'],
    ]);
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
  });
});

describe('updating rulebook sources', () => {
  const vendoredCatalog = (names: readonly string[]): TreeSpec =>
    Object.fromEntries([
      [CONFIG, rulesConfig(names.map((name) => `acme/catalog#main/${name}`))],
      ...names.map((name) => [rulebookPath(name), { a: A_V1, b: B_V1, c: C_V1 }[name] as string]),
    ]);

  const advanceMain = () => {
    (github.repositories[0] as ScriptedRepository).refs.main = SHA_V2;
  };

  test('reports what moved upstream and keeps a source it could not fetch', async () => {
    advanceMain();
    const { results, tree } = await syncRow(vendoredCatalog(['a', 'b', 'c']), { refresh: true });
    expect(results.ok).toBeFalse();
    expect(results.errors).toStrictEqual([
      'Failed to update acme/catalog#main/c: Failed to fetch acme/catalog#main/c: GitHub raw returned 404',
    ]);
    expect(results.changes).toStrictEqual([
      'Updated acme/catalog#main/a (1.0.0 -> 1.1.0)',
      '  + gain',
      '  - drop',
      '  ~ keep',
      'Updated acme/catalog#main/b (1.0.0 -> 1.1.0)',
      '  ~ bkeep',
    ]);
    expect(contentAt(tree, rulebookPath('a'))).toBe(A_V2);
    expect(contentAt(tree, rulebookPath('b'))).toBe(B_V2);
    expect(contentAt(tree, rulebookPath('c'))).toBe(C_V1);
  });

  test('a selective update never reaches the network for an unvendored sibling', async () => {
    const seed = { ...vendoredCatalog(['a', 'b']) };
    delete seed[rulebookPath('b')];
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) => {
      const api = manager(environment);
      const result = await api.sync(
        { cwd: side.project, refresh: true, only: 'a' },
        api.operation(github.resolveUrl),
      );
      return { result, requests: takeRequests() };
    });
    expect(results.result.ok).toBeFalse();
    expect(results.result.errors).toStrictEqual([
      'Failed to update acme/catalog#main/b: acme/catalog#main/b is not vendored; run rule update acme/catalog#main/b to vendor it',
    ]);
    expect(results.requests.some((request) => request.includes('/b/rulebook.json'))).toBeFalse();
    expect(contentAt(tree, rulebookPath('b'))).toBeUndefined();
  });

  test('a source that fails to fetch keeps its vendored copy while its sibling updates', async () => {
    advanceMain();
    github.faults.set(rawPath('catalog', SHA_V2, 'b'), {
      kind: 'response',
      status: 500,
      body: 'upstream boom',
    });
    const { results, tree } = await syncRow(vendoredCatalog(['a', 'b']), { refresh: true });
    expect(results.errors).toStrictEqual([
      'Failed to update acme/catalog#main/b: Failed to fetch acme/catalog#main/b: GitHub raw returned 500',
    ]);
    expect(contentAt(tree, rulebookPath('a'))).toBe(A_V2);
    expect(contentAt(tree, rulebookPath('b'))).toBe(B_V1);
  });

  test('an unchanged upstream reports no change and writes nothing', async () => {
    const { results, tree, side } = await syncRow(vendoredCatalog(['a', 'b']), { refresh: true });
    expect(results.ok).toBeTrue();
    expect(results.changes).toStrictEqual([]);
    expect(contentAt(tree, rulebookPath('a'))).toBe(A_V1);
    expect(contentAt(tree, rulebookPath('b'))).toBe(B_V1);
    expectGateView(side, 'project', results);
  });

  test('a selector matching nothing names itself', async () => {
    const { results } = await runManagerDifferential(
      vendoredCatalog(['a']),
      async (side, environment) => {
        const api = manager(environment);
        const result = await api.sync(
          { cwd: side.project, refresh: true, only: 'nope' },
          api.operation(github.resolveUrl),
        );
        return { result, requests: takeRequests() };
      },
    );
    expect(results.result).toStrictEqual({
      ok: false,
      errors: ['No configured rulebook matches nope'],
      entries: [],
    });
    expect(results.requests).toStrictEqual([]);
  });
});

describe('removing rulebook sources', () => {
  const LOCAL_SCOPE = {
    [CONFIG]: rulesConfig(['local']),
    [rulebookPath('local')]: v1Rulebook('local'),
  };

  test('removes an exact local spec', async () => {
    const { results, tree, side } = await removeRow(LOCAL_SCOPE, 'local');
    expect(results).toStrictEqual({ ok: true, errors: [], entries: [], changes: [] });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig([]));
    expect(contentAt(tree, rulebookPath('local'))).toBe(v1Rulebook('local'));
    expectGateView(side, 'project', results);
  });

  test('removes by rulebook name and leaves the vendored file alone', async () => {
    const { results, tree } = await removeRow(
      {
        [CONFIG]: rulesConfig(['acme/other#main/x', 'local']),
        [rulebookPath('x')]: X_V1,
        [rulebookPath('local')]: v1Rulebook('local'),
      },
      'x',
    );
    expect(results.ok).toBeTrue();
    expect(results.entries).toStrictEqual([
      { spec: 'local', name: 'local', version: '1.0.0', ruleCount: 1 },
    ]);
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig(['local']));
    expect(contentAt(tree, rulebookPath('x'))).toBe(X_V1);
  });

  test('removes every rulebook a repository contributes at its single ref', async () => {
    const { results, tree } = await removeRow(
      { [CONFIG]: rulesConfig(['acme/other#main/x']), [rulebookPath('x')]: X_V1 },
      'acme/other',
    );
    expect(results.ok).toBeTrue();
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig([]));
  });

  test('an ambiguous repository match asks for an explicit ref', async () => {
    const seed = { [CONFIG]: rulesConfig(['acme/catalog#main/a', 'acme/catalog#v2/b']) };
    const { results, tree } = await removeRow(seed, 'acme/catalog');
    expect(results).toStrictEqual({
      ok: false,
      errors: [
        'Multiple refs are configured for acme/catalog. Use an explicit ref:',
        '  cc-safety-net rule remove acme/catalog#<ref>',
      ],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
  });

  test('an explicit ref removes only that ref', async () => {
    const { results, tree } = await removeRow(
      {
        [CONFIG]: rulesConfig(['acme/catalog#main/a', 'acme/catalog#v2/b']),
        [rulebookPath('a')]: A_V1,
        [rulebookPath('b')]: B_V2,
      },
      'acme/catalog#main',
    );
    expect(results.ok).toBeTrue();
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig(['acme/catalog#v2/b']));
  });

  test('--delete-source deletes the rulebook file and then the emptied directory', async () => {
    const { results, tree } = await removeRow(LOCAL_SCOPE, 'local', { deleteSource: true });
    expect(results.ok).toBeTrue();
    expect(tree.some((entry) => entry.path.startsWith(`${RULES}/local`))).toBeFalse();
  });

  test('--delete-source refuses a directory that holds anything else', async () => {
    const { results, tree } = await removeRow(
      { ...LOCAL_SCOPE, [`${RULES}/local/notes.md`]: 'keep me\n' },
      'local',
      { deleteSource: true },
    );
    expect(results.ok).toBeFalse();
    expect(results.entries).toStrictEqual([]);
    expect(results.errors).toStrictEqual([
      'Local rulebook source directory contains extra files: <root>/project/.cc-safety-net/rules/local. delete manually if you really want to remove the directory.',
    ]);
    expect(contentAt(tree, `${RULES}/local/notes.md`)).toBe('keep me\n');
    expect(contentAt(tree, rulebookPath('local'))).toBe(v1Rulebook('local'));
  });

  test('--delete-source refuses a directory with no rulebook file', async () => {
    const { results, tree } = await removeRow(
      { [CONFIG]: rulesConfig(['local']), [`${RULES}/local`]: null },
      'local',
      { deleteSource: true },
    );
    expect(results).toStrictEqual({
      ok: false,
      errors: [
        'Local rulebook source directory is missing rulebook.json: <root>/project/.cc-safety-net/rules/local',
      ],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig(['local']));
  });

  test('--delete-source refuses a GitHub source', async () => {
    const { results } = await removeRow(
      { [CONFIG]: rulesConfig(['acme/other#main/x']), [rulebookPath('x')]: X_V1 },
      'acme/other#main/x',
      { deleteSource: true },
    );
    expect(results).toStrictEqual({
      ok: false,
      errors: ['--delete-source can only delete local rulebook sources'],
      entries: [],
    });
  });

  test('a remove whose post-write sync fails restores the config', async () => {
    const seed = { ...LOCAL_SCOPE, [CONFIG]: rulesConfig(['local', 'ghost']) };
    const { results, tree } = await removeRow(seed, 'local');
    expect(results).toStrictEqual({
      ok: false,
      errors: ['Rulebook source not found: ghost'],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
  });
});

describe('the post-change runtime reload', () => {
  const withUnknownOverride = {
    [CONFIG]: rulesConfig(['local'], { overrides: { 'ghost/rule': 'off' } }),
    [rulebookPath('local')]: v1Rulebook('local'),
    [rulebookPath('second')]: v1Rulebook('second'),
  };
  const UNKNOWN_OVERRIDE =
    'unknown override key "ghost/rule" in <root>/project/.cc-safety-net/rules/rule.json; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file';

  test('--check reports what the guard would refuse, not just what each source validates', async () => {
    const { results, side } = await syncRow(withUnknownOverride, { check: true });
    expect(results).toStrictEqual({
      ok: false,
      errors: [UNKNOWN_OVERRIDE],
      entries: [{ spec: 'local', name: 'local', version: '1.0.0', ruleCount: 1 }],
    });
    expectGateView(side, 'project', results);
  });

  test('an add leaves the reload to the update that follows it', async () => {
    const { results, tree, side } = await runManagerDifferential(
      withUnknownOverride,
      async (side, environment) => {
        const api = manager(environment);
        const added = await api.add(
          'second',
          { cwd: side.project },
          api.operation(github.resolveUrl),
        );
        const updated = await api.sync(
          { cwd: side.project, refresh: true },
          api.operation(github.resolveUrl),
        );
        return { added, updated };
      },
    );
    expect(results.added.ok).toBeTrue();
    expect(results.updated).toStrictEqual({
      ok: false,
      errors: [UNKNOWN_OVERRIDE],
      entries: [
        { spec: 'local', name: 'local', version: '1.0.0', ruleCount: 1 },
        { spec: 'second', name: 'second', version: '1.0.0', ruleCount: 1 },
      ],
    });
    expect(contentAt(tree, CONFIG)).toBe(
      rulesConfig(['local', 'second'], { overrides: { 'ghost/rule': 'off' } }),
    );
    expectGateView(side, 'project', results.updated);
  });
});

describe('resource limits', () => {
  const SOURCE_LIMIT_ERROR = "Rule config exceeds CC Safety Net's safe source limit.";
  const namedSources = (count: number) =>
    Array.from({ length: count }, (_unused, index) => `src-${index}`);

  test('a config over the source limit is refused by every entry point', async () => {
    const seed = { [CONFIG]: rulesConfig(namedSources(65)) };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) => {
      const api = manager(environment);
      return {
        sync: await api.plainSync({ cwd: side.project }),
        add: await api.plainAdd('local', { cwd: side.project }),
        remove: await api.remove('src-0', { cwd: side.project }),
      };
    });
    expect(results.sync).toStrictEqual(results.add);
    expect(results.remove).toStrictEqual(results.sync);
    expect(results.sync.errors.join('\n')).toContain(SOURCE_LIMIT_ERROR);
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
  });

  test('an add past the source limit writes nothing', async () => {
    const seed = { [CONFIG]: rulesConfig(namedSources(64)) };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) =>
      manager(environment).plainAdd('extra', { cwd: side.project }),
    );
    expect(results).toStrictEqual({ ok: false, errors: [SOURCE_LIMIT_ERROR], entries: [] });
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
  });

  test('mapping more sources than the limit throws before any mapper runs', async () => {
    const { results } = await runManagerDifferential({}, async (_side, environment) => {
      const api = manager(environment);
      const mapped: number[] = [];
      const outcome = await describeAsyncOutcome(() =>
        api.map(
          Array.from({ length: 65 }, (_unused, index) => index),
          async (value: number) => {
            mapped.push(value);
            return value;
          },
          api.operation(),
        ),
      );
      return { outcome, mapped };
    });
    expect(results).toStrictEqual({
      outcome: { kind: 'threw', message: SOURCE_LIMIT_ERROR },
      mapped: [],
    });
  });

  test('adding a full catalogue spends exactly the request budget', async () => {
    const { results } = await runManagerDifferential(
      { [CONFIG]: rulesConfig([]) },
      async (side, environment) => {
        const api = manager(environment);
        const operation = api.operation(github.resolveUrl);
        const result = await api.add('acme/bulk', { cwd: side.project }, operation);
        return {
          ok: result.ok,
          entries: result.entries.length,
          added: result.add?.added.length,
          requests: operation.budget.requests,
          logged: takeRequests().length,
        };
      },
    );
    expect(results).toStrictEqual({ ok: true, entries: 64, added: 64, requests: 131, logged: 131 });
  });

  test('an exhausted request budget fails the whole operation and writes nothing', async () => {
    const { results, tree } = await runManagerDifferential(
      { [CONFIG]: rulesConfig([]) },
      async (side, environment) => {
        const api = manager(environment);
        const starved = {
          controller: new AbortController(),
          budget: api.budget({ maxRequests: 3 }),
          resolveUrl: github.resolveUrl,
        };
        const result = await api.add('acme/catalog', { cwd: side.project }, starved);
        takeRequests();
        return result;
      },
    );
    expect(results).toStrictEqual({
      ok: false,
      errors: ["Rule synchronization exceeds CC Safety Net's safe resource limits."],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(rulesConfig([]));
    expect(contentAt(tree, rulebookPath('a'))).toBeUndefined();
  });
});

describe('bounded fanout', () => {
  test('at most four mappers run at once and results keep their index order', async () => {
    const { results } = await runManagerDifferential({}, async (_side, environment) => {
      const api = manager(environment);
      const gates: (() => void)[] = [];
      let active = 0;
      let peak = 0;
      const mapped = api.map(
        Array.from({ length: 8 }, (_unused, index) => index),
        async (value: number) => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise<void>((release) => gates.push(release));
          active -= 1;
          return value * 2;
        },
        api.operation(),
      );
      await waitFor(() => gates.length === 4);
      for (const release of gates.splice(0)) release();
      await waitFor(() => gates.length === 4);
      for (const release of gates.splice(0)) release();
      return { values: await mapped, peak };
    });
    expect(results).toStrictEqual({ values: [0, 2, 4, 6, 8, 10, 12, 14], peak: 4 });
  });

  test('the first rejection aborts its siblings and is the error the caller sees', async () => {
    const { results } = await runManagerDifferential({}, async (_side, environment) => {
      const api = manager(environment);
      const operation = api.operation();
      const observed: number[] = [];
      const started: number[] = [];
      const outcome = await describeAsyncOutcome(() =>
        api.map(
          Array.from({ length: 8 }, (_unused, index) => index),
          async (value: number, index: number, signal: AbortSignal) => {
            started.push(index);
            if (index === 2) throw new Error('mapper rejected');
            await new Promise<void>((settle) =>
              signal.addEventListener('abort', () => settle(), { once: true }),
            );
            observed.push(index);
            return value;
          },
          operation,
        ),
      );
      return {
        outcome,
        started: started.sort(),
        observed: observed.sort(),
        aborted: operation.controller.signal.aborted,
        reason: (operation.controller.signal.reason as Error).message,
      };
    });
    expect(results).toStrictEqual({
      outcome: { kind: 'threw', message: 'mapper rejected' },
      started: [0, 1, 2, 3],
      observed: [0, 1, 3],
      aborted: true,
      reason: 'mapper rejected',
    });
  });

  test('an update holds four responses open at a time', async () => {
    const names = BULK_NAMES.slice(0, 8);
    for (const name of names) {
      github.faults.set(rawPath('bulk', SHA_BULK, name), { kind: 'defer' });
    }
    const { results } = await runManagerDifferential(
      Object.fromEntries([
        [CONFIG, rulesConfig(names.map((name) => `acme/bulk#main/${name}`))],
        ...names.map((name) => [rulebookPath(name), BULK_TREE[name] as string]),
      ]),
      async (side, environment) => {
        const api = manager(environment);
        const pending = api.sync(
          { cwd: side.project, refresh: true },
          api.operation(github.resolveUrl),
        );
        await waitFor(() => github.requests.length >= 8);
        const parked = github.maxInFlight();
        github.release();
        await waitFor(() => github.requests.length >= 16);
        const released = github.maxInFlight();
        github.release();
        const result = await pending;
        return {
          ok: result.ok,
          changes: result.changes,
          parked,
          released,
          requests: takeRequests().length,
        };
      },
    );
    expect(results).toStrictEqual({
      ok: true,
      changes: [],
      parked: 4,
      released: 4,
      requests: 16,
    });
  });
});

describe('fault hooks', () => {
  let originalFetch: typeof fetch;

  // The hook entry points build their own operation, so the only seam left for pointing them at
  // the scripted GitHub is the global `fetch` the manager calls.
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
      originalFetch(github.resolveUrl(String(input)), init)) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('a write that throws mid-add leaves no vendored rulebook and restores the config', async () => {
    const seed = { [CONFIG]: rulesConfig([]) };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) => {
      let renames = 0;
      const result = await manager(environment).addWithHooks(
        'acme/catalog',
        { cwd: side.project },
        {
          _testAfterPolicyRename: () => {
            renames += 1;
            // The config's own rename is the first; this is the second vendored rulebook.
            if (renames === 3) throw new Error('rename failed');
          },
        },
      );
      return { result, renames };
    });
    expect(results.result.ok).toBeFalse();
    expect(results.renames).toBe(3);
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
    expect(tree.filter((entry) => entry.path.endsWith('rulebook.json'))).toStrictEqual([]);
  });

  test('a write that throws mid-update restores every file the run replaced', async () => {
    (github.repositories[0] as ScriptedRepository).refs.main = SHA_V2;
    const seed = {
      [CONFIG]: rulesConfig(['acme/catalog#main/a', 'acme/catalog#main/b']),
      [rulebookPath('a')]: A_V1,
      [rulebookPath('b')]: B_V1,
    };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) => {
      let renames = 0;
      return manager(environment).syncWithHooks(
        { cwd: side.project, refresh: true },
        {
          _testAfterPolicyRename: () => {
            renames += 1;
            if (renames === 2) throw new Error('rename failed');
          },
        },
      );
    });
    expect(results.ok).toBeFalse();
    expect(contentAt(tree, rulebookPath('a'))).toBe(A_V1);
    expect(contentAt(tree, rulebookPath('b'))).toBe(B_V1);
  });

  test('a failed source-directory delete restores the config and keeps the directory', async () => {
    const seed = {
      [CONFIG]: rulesConfig(['local']),
      [rulebookPath('local')]: v1Rulebook('local'),
    };
    const { results, tree } = await runManagerDifferential(seed, async (side, environment) =>
      manager(environment).removeWithHooks(
        'local',
        { cwd: side.project, deleteSource: true },
        {
          _testDeleteLocalSourceDir: () => {
            throw new Error('delete failed');
          },
        },
      ),
    );
    expect(results).toStrictEqual({
      ok: false,
      errors: [
        'Failed to delete local rulebook source <root>/project/.cc-safety-net/rules/local: delete failed',
      ],
      entries: [],
    });
    expect(contentAt(tree, CONFIG)).toBe(seed[CONFIG]);
    expect(contentAt(tree, rulebookPath('local'))).toBe(seed[rulebookPath('local')]);
  });
});
