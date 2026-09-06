import { expect } from 'bun:test';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Environment } from '@/core/environment';
import { loadRulesPolicy as portedLoadRulesPolicy } from '@/core/policy/scope-policy';
import { snapshotTree, type TreeSpec, writeTree } from './fixture-tree';
import { createTempRoot, environmentFor, isolationEnv, normalize, recordPorted } from './temp-home';

/**
 * The rulebook manager over a seeded home, driven through its `Environment`, recording everything
 * the run can be observed by: what the calls returned and what the tree holds afterwards. The
 * gate's own view of the changed scope is recorded too, because a manager that reports success
 * while the guard would refuse to load the scope has not synchronized anything.
 */

export type Side = {
  root: string;
  home: string;
  project: string;
  values: Record<string, string | undefined>;
};

/** What the atomic writer names its sibling temp file; a run that left one behind failed halfway
 *  through a write no row spells. */
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
  run: (side: Side, environment: Environment) => Promise<T>,
) {
  const side = seedSide(spec);
  const ported = await observe(side, () => run(side, environmentFor(side.home, side.values)));
  recordPorted(ported);
  expect(ported.tree.filter((entry) => POLICY_TEMP_NAME_RE.test(entry.path))).toEqual([]);
  return { results: ported.results, tree: ported.tree, side };
}

async function observe<T>(side: Side, run: () => Promise<T>) {
  const results = await run();
  return normalize({ results, tree: snapshotTree(side.root) }, replacementsFor(side.root));
}

/**
 * What the guard would load from the same home, projected to the summary a manager result
 * carries. An `ok` result claims the scope now loads cleanly and holds exactly the reported
 * rulebooks; a result that failed on the post-change reload claims the guard sees that diagnostic.
 */
export function expectGateView(side: Side, scope: 'user' | 'project', result: ManagerResult) {
  const ported = gateView(
    portedLoadRulesPolicy(environmentFor(side.home, side.values), { cwd: side.project }),
    scope,
    side.root,
  );
  recordPorted(ported);
  if (!result.ok) {
    for (const error of result.errors) expect(ported.warnings).toContain(error);
    return;
  }
  expect(ported.errors).toEqual([]);
  expect(ported.rulebooks).toEqual(
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
