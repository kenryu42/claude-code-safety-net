import { expect } from 'bun:test';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@next/core/environment';
import { loadRulesPolicy as portedLoadRulesPolicy } from '@next/core/policy/scope-policy';
import { loadRulesPolicy as shippedLoadRulesPolicy } from '@/rules/policy/scope-policy';
import { snapshotTree, type TreeSpec, writeTree } from './fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  withProcessEnv,
} from './temp-home';

/**
 * The rulebook manager under both implementations at once. Each row seeds two identical homes,
 * drives the shipped manager through `process.env` and the ported one through its `Environment`,
 * and compares everything the run can be observed by: what the calls returned and what the two
 * trees hold afterwards. The gate's own view of the changed scope is compared too, because a
 * manager that reports success while the guard would refuse to load the scope has not synchronized
 * anything.
 */

export type Side = {
  root: string;
  home: string;
  project: string;
  values: Record<string, string | undefined>;
};

export type Sides = { shipped: Side; ported: Side };

/** What the atomic writer names its sibling temp file; a leftover one is invisible in a diff of
 *  the two trees, because both implementations would leave the same one behind. */
const POLICY_TEMP_NAME_RE = /\.[0-9a-f]{16}\.tmp$/;

type GatePolicy = {
  errors: string[];
  warnings: string[];
  rulebooks: readonly {
    source: 'user' | 'project';
    spec: string;
    name: string;
    version: string;
    rules: string[];
  }[];
};

type ManagerResult = {
  ok: boolean;
  errors: string[];
  entries: { spec: string; name: string; version: string; ruleCount: number }[];
};

function seedSide(spec: TreeSpec): Side {
  const root = createTempRoot('rules-manager-');
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeTree(root, spec);
  return { root, home, project, values: isolationEnv(home) };
}

export async function runManagerDifferential<T>(
  spec: TreeSpec,
  run: (side: Side, environment?: Environment) => Promise<T>,
) {
  const sides = { shipped: seedSide(spec), ported: seedSide(spec) };
  const shipped = await observe(sides.shipped, () =>
    withProcessEnv(sides.shipped.values, () => run(sides.shipped)),
  );
  const ported = await observe(sides.ported, () =>
    run(sides.ported, environmentFor(sides.ported.home, sides.ported.values)),
  );
  expect(ported).toStrictEqual(shipped);
  recordPorted(ported);
  expect(shipped.tree.filter((entry) => POLICY_TEMP_NAME_RE.test(entry.path))).toEqual([]);
  return { results: shipped.results, tree: shipped.tree, sides };
}

async function observe<T>(side: Side, run: () => Promise<T>) {
  const results = await run();
  return normalize({ results, tree: snapshotTree(side.root) }, replacementsFor(side.root));
}

/**
 * What the guard would load from the same two homes, projected to the summary a manager result
 * carries. An `ok` result claims the scope now loads cleanly and holds exactly the reported
 * rulebooks; a result that failed on the post-change reload claims the guard sees that diagnostic.
 */
export function expectGateView(sides: Sides, scope: 'user' | 'project', result: ManagerResult) {
  const shipped = gateView(
    withProcessEnv(sides.shipped.values, () =>
      shippedLoadRulesPolicy({ cwd: sides.shipped.project }),
    ),
    scope,
    sides.shipped.root,
  );
  const ported = gateView(
    portedLoadRulesPolicy(environmentFor(sides.ported.home, sides.ported.values), {
      cwd: sides.ported.project,
    }),
    scope,
    sides.ported.root,
  );
  expect(ported).toStrictEqual(shipped);
  recordPorted(ported);
  if (!result.ok) {
    for (const error of result.errors) expect(shipped.warnings).toContain(error);
    return;
  }
  expect(shipped.errors).toEqual([]);
  expect(shipped.rulebooks).toEqual(
    result.entries.map((entry) => ({
      spec: entry.spec,
      name: entry.name,
      version: entry.version,
      ruleCount: entry.ruleCount,
    })),
  );
}

function gateView(policy: GatePolicy, scope: 'user' | 'project', root: string) {
  return normalize(
    {
      errors: policy.errors,
      warnings: policy.warnings,
      rulebooks: policy.rulebooks
        .filter((rulebook) => rulebook.source === scope)
        .map((rulebook) => ({
          spec: rulebook.spec,
          name: rulebook.name,
          version: rulebook.version,
          ruleCount: rulebook.rules.length,
        })),
    },
    replacementsFor(root),
  );
}

/** Both spellings of the root: the temp path itself and what it canonicalizes to, because a
 *  diagnostic can carry either one. */
function replacementsFor(root: string) {
  return [
    [root, '<root>'],
    [realpathSync(root), '<root>'],
  ] as const;
}
