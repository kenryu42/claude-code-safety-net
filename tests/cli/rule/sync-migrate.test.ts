import { afterEach, describe, expect, test } from 'bun:test';
import { join, posix } from 'node:path';
import {
  findRuleV2Leftovers as findPorted,
  runRuleSyncMigration as runPortedMigration,
} from '@/cli/rule/sync-migrate';
import { captureConsole } from '../../helpers/console-capture';
import { type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import {
  json,
  rulesConfig,
  sha256Digest,
  v1Rulebook,
  v2CacheDir,
  v2Lock,
} from '../../helpers/rulebook-seeds';
import { runManagerDifferential } from '../../helpers/rules-manager-differential';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
} from '../../helpers/temp-home';

/**
 * Doctor's only reason to name a version 2 lock or cache is that the file is there, so each row
 * puts one where a scope would have left it and asserts the run names the same
 * absolute paths in the same order — project scope first, then user scope, lock before cache.
 * The user scope is resolved from `CC_SAFETY_NET_HOME`, which the last row moves.
 */

afterEach(() => {
  removeTempRoots();
});

function findLeftovers(spec: TreeSpec, overrides: Record<string, string | undefined> = {}) {
  const root = createTempRoot('rule-leftovers-');
  const home = join(root, 'home');
  const values = isolationEnv(
    home,
    Object.fromEntries(
      Object.entries(overrides).map(([name, value]) => [
        name,
        value === undefined ? undefined : join(root, value),
      ]),
    ),
  );
  writeTree(root, spec);
  return { root, paths: findPorted(environmentFor(home, values), join(root, 'project')) };
}

describe('findRuleV2Leftovers', () => {
  test('a scope with nothing left behind reports nothing', () => {
    expect(findLeftovers({ 'project/.cc-safety-net/rules/rule.json': '{}\n' }).paths).toEqual([]);
  });

  test('a project lock is reported on its own', () => {
    const { root, paths } = findLeftovers({ 'project/.cc-safety-net/rules/rule.lock': '{}\n' });
    expect(paths).toEqual([join(root, 'project/.cc-safety-net/rules/rule.lock')]);
  });

  test('a user cache directory is reported on its own', () => {
    const { root, paths } = findLeftovers({ 'home/.cc-safety-net/cache/rulebooks': null });
    expect(paths).toEqual([join(root, 'home/.cc-safety-net/cache')]);
  });

  test('both scopes report lock before cache, project before user', () => {
    const { root, paths } = findLeftovers({
      'project/.cc-safety-net/rules/rule.lock': '{}\n',
      'project/.cc-safety-net/cache/rulebooks': null,
      'home/.cc-safety-net/rules/rule.lock': '{}\n',
      'home/.cc-safety-net/cache/rulebooks': null,
    });
    expect(paths).toEqual([
      join(root, 'project/.cc-safety-net/rules/rule.lock'),
      join(root, 'project/.cc-safety-net/cache'),
      join(root, 'home/.cc-safety-net/rules/rule.lock'),
      join(root, 'home/.cc-safety-net/cache'),
    ]);
  });

  test('CC_SAFETY_NET_HOME moves the user scope the probe reads', () => {
    const { root, paths } = findLeftovers(
      {
        'home/.cc-safety-net/rules/rule.lock': '{}\n',
        'relocated/rules/rule.lock': '{}\n',
      },
      { CC_SAFETY_NET_HOME: 'relocated' },
    );
    expect(paths).toEqual([join(root, 'relocated/rules/rule.lock')]);
  });
});

/**
 * The other half of `rule sync`: the one-time, offline migration of a version 2 lock and cache.
 * Each row seeds the leftovers a v2 install would have published, runs the migration on both
 * implementations over twin trees, and compares the report, the exit code and what survived —
 * because the failure that matters here is a run that prunes the last offline copy of a rulebook
 * it could not vendor.
 */

const PROJECT_SCOPE = 'project/.cc-safety-net';
const USER_SCOPE = 'home/.cc-safety-net';
const SPEC = 'acme/repo#main/x';
const CACHED_RULEBOOK = v1Rulebook('x');
const DIGEST = sha256Digest(CACHED_RULEBOOK);
const LOCK_ENTRY = {
  spec: SPEC,
  digest: DIGEST,
  name: 'x',
  owner: 'acme',
  repo: 'repo',
  // The ref the v2 install displayed, which is what it slugged the cache directory with; a
  // different spelling from the spec's `main` is what tells the two slug sources apart.
  display_ref: 'v2.0',
};
const STALE_ENTRY = { ...LOCK_ENTRY, digest: sha256Digest('{"rulebook_version":1}\n') };
const CANNOT_MIGRATE = `Cannot migrate: the rules config in ${posix.join('<root>', PROJECT_SCOPE)} is missing or unreadable while v2 leftovers remain. Restore rule.json, then re-run rule sync.`;

const cachedAt = (scope: string, dir: string) => `${scope}/cache/rulebooks/${dir}/rulebook.json`;
const removedUnder = (scope: string) =>
  `Removed the v2 lock and cache under ${posix.join('<root>', scope)}.`;

type Tree = { path: string; content?: string }[];

const held = (tree: Tree, path: string) => tree.find((entry) => entry.path === path)?.content;
const holdsAny = (tree: Tree, fragment: string) =>
  tree.some((entry) => entry.path.includes(fragment));

async function runMigration(spec: TreeSpec, global: boolean) {
  return runManagerDifferential(spec, (side, environment) =>
    captureConsole(() =>
      runPortedMigration(
        environment,
        global ? { cwd: side.project, global: true } : { cwd: side.project },
      ),
    ),
  );
}

const migrationRows: {
  name: string;
  files: TreeSpec;
  global?: boolean;
  code: number;
  lines: string[];
  errors?: string[];
  check: (tree: Tree) => void;
}[] = [
  {
    name: 'a scope with nothing left behind says so and touches nothing',
    files: { [`${PROJECT_SCOPE}/rules/rule.json`]: rulesConfig([]) },
    code: 0,
    lines: [
      `No v2 lock or cache leftovers found in ${posix.join('<root>', PROJECT_SCOPE)}; nothing to migrate.`,
    ],
    check: (tree) => expect(holdsAny(tree, 'rules/x')).toBeFalse(),
  },
  {
    name: 'a cached copy that still matches its digest is vendored offline',
    files: {
      [`${PROJECT_SCOPE}/rules/rule.json`]: rulesConfig([SPEC]),
      [`${PROJECT_SCOPE}/rules/rule.lock`]: v2Lock([LOCK_ENTRY]),
      [cachedAt(PROJECT_SCOPE, v2CacheDir(LOCK_ENTRY))]: CACHED_RULEBOOK,
    },
    code: 0,
    lines: [`Vendored ${SPEC} from the v2 cache.`, removedUnder(PROJECT_SCOPE)],
    check: (tree) => {
      expect(held(tree, `${PROJECT_SCOPE}/rules/x/rulebook.json`)).toBe(CACHED_RULEBOOK);
      expect(holdsAny(tree, 'cache')).toBeFalse();
      expect(holdsAny(tree, 'rule.lock')).toBeFalse();
    },
  },
  {
    name: 'a cached copy whose digest no longer matches names the command that refetches it',
    files: {
      [`${PROJECT_SCOPE}/rules/rule.json`]: rulesConfig([SPEC]),
      [`${PROJECT_SCOPE}/rules/rule.lock`]: v2Lock([STALE_ENTRY]),
      [cachedAt(PROJECT_SCOPE, v2CacheDir(STALE_ENTRY))]: CACHED_RULEBOOK,
    },
    code: 0,
    lines: [
      `Could not migrate ${SPEC} from the v2 cache. Run \`cc-safety-net rule update ${SPEC}\` to vendor it.`,
      removedUnder(PROJECT_SCOPE),
    ],
    check: (tree) => expect(holdsAny(tree, 'rules/x')).toBeFalse(),
  },
  {
    name: 'the user scope names the refetch command with the flag that reaches it',
    files: {
      [`${USER_SCOPE}/rules/rule.json`]: rulesConfig([SPEC]),
      [`${USER_SCOPE}/rules/rule.lock`]: v2Lock([STALE_ENTRY]),
    },
    global: true,
    code: 0,
    lines: [
      `Could not migrate ${SPEC} from the v2 cache. Run \`cc-safety-net rule update ${SPEC} --global\` to vendor it.`,
      removedUnder(USER_SCOPE),
    ],
    check: (tree) => expect(holdsAny(tree, 'rule.lock')).toBeFalse(),
  },
  {
    name: 'a vendored file that is already usable is left alone and reported on no line',
    files: {
      [`${USER_SCOPE}/rules/rule.json`]: rulesConfig([SPEC]),
      [`${USER_SCOPE}/rules/rule.lock`]: v2Lock([LOCK_ENTRY]),
      [`${USER_SCOPE}/rules/x/rulebook.json`]: CACHED_RULEBOOK,
      [cachedAt(USER_SCOPE, v2CacheDir(LOCK_ENTRY))]: CACHED_RULEBOOK,
    },
    global: true,
    code: 0,
    lines: [removedUnder(USER_SCOPE)],
    check: (tree) =>
      expect(held(tree, `${USER_SCOPE}/rules/x/rulebook.json`)).toBe(CACHED_RULEBOOK),
  },
  {
    name: 'a vendored file that no longer parses is restored, not counted as migrated',
    files: {
      [`${PROJECT_SCOPE}/rules/rule.json`]: rulesConfig([SPEC]),
      [`${PROJECT_SCOPE}/rules/rule.lock`]: v2Lock([LOCK_ENTRY]),
      [`${PROJECT_SCOPE}/rules/x/rulebook.json`]: '{ half a rulebook',
      [cachedAt(PROJECT_SCOPE, v2CacheDir(LOCK_ENTRY))]: CACHED_RULEBOOK,
    },
    code: 0,
    lines: [
      `Restored ${SPEC} from the v2 cache over an invalid file.`,
      removedUnder(PROJECT_SCOPE),
    ],
    check: (tree) =>
      expect(held(tree, `${PROJECT_SCOPE}/rules/x/rulebook.json`)).toBe(CACHED_RULEBOOK),
  },
  {
    name: 'a lock row that recorded only the spec still finds its cache directory',
    files: {
      [`${PROJECT_SCOPE}/rules/rule.json`]: rulesConfig([SPEC]),
      [`${PROJECT_SCOPE}/rules/rule.lock`]: json({
        version: 2,
        rulebooks: [{ spec: SPEC, digest: DIGEST }],
      }),
      [cachedAt(PROJECT_SCOPE, `acme-repo-main-x--${DIGEST.slice(7, 19)}`)]: CACHED_RULEBOOK,
    },
    code: 0,
    lines: [`Vendored ${SPEC} from the v2 cache.`, removedUnder(PROJECT_SCOPE)],
    check: (tree) =>
      expect(held(tree, `${PROJECT_SCOPE}/rules/x/rulebook.json`)).toBe(CACHED_RULEBOOK),
  },
  {
    name: 'a cache directory with no lock beside it is still pruned',
    files: {
      [`${PROJECT_SCOPE}/rules/rule.json`]: rulesConfig([]),
      [cachedAt(PROJECT_SCOPE, v2CacheDir(LOCK_ENTRY))]: CACHED_RULEBOOK,
    },
    code: 0,
    lines: [removedUnder(PROJECT_SCOPE)],
    check: (tree) => expect(holdsAny(tree, 'cache')).toBeFalse(),
  },
  {
    name: 'a rule config that cannot be read keeps the leftovers it cannot interpret',
    files: {
      [`${PROJECT_SCOPE}/rules/rule.json`]: '{ not json',
      [`${PROJECT_SCOPE}/rules/rule.lock`]: v2Lock([LOCK_ENTRY]),
      [cachedAt(PROJECT_SCOPE, v2CacheDir(LOCK_ENTRY))]: CACHED_RULEBOOK,
    },
    code: 1,
    lines: [],
    errors: [CANNOT_MIGRATE],
    check: (tree) => {
      expect(holdsAny(tree, 'rule.lock')).toBeTrue();
      expect(held(tree, cachedAt(PROJECT_SCOPE, v2CacheDir(LOCK_ENTRY)))).toBe(CACHED_RULEBOOK);
    },
  },
  {
    name: 'a missing rule config with lock rows keeps the only record of those specs',
    files: { [`${PROJECT_SCOPE}/rules/rule.lock`]: v2Lock([LOCK_ENTRY]) },
    code: 1,
    lines: [],
    errors: [CANNOT_MIGRATE],
    check: (tree) => expect(holdsAny(tree, 'rule.lock')).toBeTrue(),
  },
  {
    name: 'a missing rule config with an empty lock has nothing to lose and the lock goes',
    files: { [`${PROJECT_SCOPE}/rules/rule.lock`]: json({ version: 2, rulebooks: [] }) },
    code: 0,
    lines: [removedUnder(PROJECT_SCOPE)],
    check: (tree) => expect(holdsAny(tree, 'rule.lock')).toBeFalse(),
  },
];

describe('runRuleSyncMigration', () => {
  for (const row of migrationRows) {
    test(row.name, async () => {
      const agreed = await runMigration(row.files, row.global === true);
      expect(agreed.results.returned).toBe(row.code);
      expect(agreed.results.log[0]).toStartWith('`cc-safety-net rule sync` is deprecated:');
      expect(agreed.results.log.slice(1)).toEqual(row.lines);
      expect(agreed.results.error).toEqual(row.errors ?? []);
      row.check(agreed.tree);
    });
  }
});
