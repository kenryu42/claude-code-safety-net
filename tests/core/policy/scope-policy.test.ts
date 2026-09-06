import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { bindPolicyFilesystemScope } from '@/core/io/safe-read';
import {
  getRulesConfigRuntimeErrorsForConfig,
  getUnknownOverrideErrorsForConfig,
} from '@/core/policy/scope-policy';
import { type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import { rulesConfig, v1Rulebook } from '../../helpers/rulebook-seeds';
import { createTempRoot, normalize, recordPorted, removeTempRoots } from '../../helpers/temp-home';

/**
 * What `rule add` and `doctor` report after a scope changes is exactly what the gate would find
 * when it next loads that scope, so these two projections are the reload check. The runtime
 * projection carries the scope's errors, its warnings and its unknown override keys; the override
 * projection carries the last of the three alone, and only while the scope loaded cleanly enough
 * to know its rule ids. Each row resolves both over its own copy of the tree.
 */

const TREE: TreeSpec = {
  'unknown-override/.cc-safety-net/rules/rule.json': rulesConfig(['project-rules'], {
    overrides: { 'project-rules/gone': 'off' },
  }),
  'unknown-override/.cc-safety-net/rules/project-rules/rulebook.json': v1Rulebook('project-rules'),
  'missing-rulebook/.cc-safety-net/rules/rule.json': rulesConfig(['absent-book']),
};

const SCOPES = ['unknown-override', 'missing-rulebook'];

afterEach(removeTempRoots);

function configPath(root: string, scope: string) {
  return join(root, scope, '.cc-safety-net', 'rules', 'rule.json');
}

/** The scope under its own root, so nothing outside it is in reach. */
function roots() {
  const ported = createTempRoot('scope-policy-ported-');
  writeTree(ported, TREE);
  return { ported };
}

/** Both projections of one scope, read with the default binding or with an explicit one. */
function reportsFor(scope: string, bound: boolean) {
  const root = roots();
  const ported = {
    runtime: getRulesConfigRuntimeErrorsForConfig(
      configPath(root.ported, scope),
      bound ? bindPolicyFilesystemScope(root.ported, 'project policy') : undefined,
    ),
    overrides: getUnknownOverrideErrorsForConfig(
      configPath(root.ported, scope),
      bound ? bindPolicyFilesystemScope(root.ported, 'project policy') : undefined,
    ),
  };
  const reported = normalize(ported, [[root.ported, '<root>']]);
  recordPorted(reported);
  return reported;
}

describe('a scope reload reports what the shipped one reports', () => {
  test.each(SCOPES)('resolves a %s scope with the derived binding', (scope) => {
    reportsFor(scope, false);
  });

  test.each(SCOPES)('resolves a %s scope inside an explicit binding', (scope) => {
    expect(reportsFor(scope, true)).toEqual(reportsFor(scope, false));
  });

  test('an override naming no loaded rule is a warning both projections carry', () => {
    expect(reportsFor('unknown-override', false)).toEqual({
      runtime: [
        'unknown override key "project-rules/gone" in <root>/unknown-override/.cc-safety-net/rules/rule.json; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file',
      ],
      overrides: [
        'unknown override key "project-rules/gone" in <root>/unknown-override/.cc-safety-net/rules/rule.json; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file',
      ],
    });
  });

  // A source that failed to load leaves the rule ids unknown, so the override projection reports
  // nothing rather than calling every override key unknown.
  test('a dropped source is a runtime error the override projection stays out of', () => {
    expect(reportsFor('missing-rulebook', false)).toEqual({
      runtime: [
        'missing rulebook file <root>/missing-rulebook/.cc-safety-net/rules/absent-book/rulebook.json for absent-book; create that file or remove that source from the rules config',
      ],
      overrides: [],
    });
  });
});
