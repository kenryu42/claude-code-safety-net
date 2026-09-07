import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { bindPolicyFilesystemScope } from '@/core/io/safe-read';
import {
  getRulesConfigRuntimeErrorsForConfig,
  getUnknownOverrideErrorsForConfig,
} from '@/core/policy/scope-policy';
import { type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import { rulesConfig, v1Rulebook } from '../../helpers/rulebook-seeds';
import {
  createTempRoot,
  normalize,
  removeTempRoots,
  WINDOWS_SEPARATOR_FOLDS,
} from '../../helpers/temp-home';

/**
 * What `rule add` and `doctor` report after a scope changes is exactly what the gate would find
 * when it next loads that scope, so these two projections are the reload check. The runtime
 * projection carries the scope's errors, its warnings and its unknown override keys; the override
 * projection carries the last of the three alone, and only while the scope loaded cleanly enough
 * to know its rule ids. Each row resolves both over its own copy of the tree.
 *
 * Both diagnostics are printed verbatim by `rule add` and `doctor`, so the exact wording — the
 * failing key, what stays in force, and the repair — is the contract and is asserted literally.
 */

const TREE: TreeSpec = {
  'unknown-override/.cc-safety-net/rules/rule.json': rulesConfig(['project-rules'], {
    overrides: { 'project-rules/gone': 'off' },
  }),
  'unknown-override/.cc-safety-net/rules/project-rules/rulebook.json': v1Rulebook('project-rules'),
  'missing-rulebook/.cc-safety-net/rules/rule.json': rulesConfig(['absent-book']),
};

const UNKNOWN_OVERRIDE_WARNING =
  'unknown override key "project-rules/gone" in <root>/unknown-override/.cc-safety-net/rules/rule.json; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file';

const MISSING_RULEBOOK_ERROR =
  'missing rulebook file <root>/missing-rulebook/.cc-safety-net/rules/absent-book/rulebook.json for absent-book; create that file or remove that source from the rules config';

/** One row of `docs/config-recovery.md`: the scope, and what both projections say about it. */
const SCOPES: readonly {
  readonly scope: string;
  readonly behavior: string;
  readonly reports: { readonly runtime: readonly string[]; readonly overrides: readonly string[] };
}[] = [
  {
    scope: 'unknown-override',
    behavior:
      'an override naming no loaded rule is a warning both projections carry, and every other rule stays loaded',
    reports: { runtime: [UNKNOWN_OVERRIDE_WARNING], overrides: [UNKNOWN_OVERRIDE_WARNING] },
  },
  {
    scope: 'missing-rulebook',
    behavior:
      'a dropped source is a runtime error the override projection stays out of, because a source that failed to load leaves the rule ids unknown',
    reports: { runtime: [MISSING_RULEBOOK_ERROR], overrides: [] },
  },
];

afterEach(removeTempRoots);

function configPath(root: string, scope: string) {
  return join(root, scope, '.cc-safety-net', 'rules', 'rule.json');
}

/** Both projections of one scope, read with the default binding or with an explicit one. */
function reportsFor(scope: string, bound: boolean) {
  const root = createTempRoot('scope-policy-');
  writeTree(root, TREE);
  const scopeBinding = bound ? bindPolicyFilesystemScope(root, 'project policy') : undefined;
  return normalize(
    {
      runtime: getRulesConfigRuntimeErrorsForConfig(configPath(root, scope), scopeBinding),
      overrides: getUnknownOverrideErrorsForConfig(configPath(root, scope), scopeBinding),
    },
    [[root, '<root>'], ...WINDOWS_SEPARATOR_FOLDS],
  );
}

describe('a scope reload reports what the gate would find', () => {
  test.each(
    SCOPES.map((row) => [row.behavior, row.scope, row.reports] as const),
  )('%s', (_behavior, scope, reports) => {
    expect(reportsFor(scope, false)).toEqual({
      runtime: [...reports.runtime],
      overrides: [...reports.overrides],
    });
  });

  test.each(
    SCOPES.map((row) => [row.scope, row.reports] as const),
  )('an explicit filesystem binding changes nothing about the %s scope', (scope, reports) => {
    expect(reportsFor(scope, true)).toEqual({
      runtime: [...reports.runtime],
      overrides: [...reports.overrides],
    });
  });
});
