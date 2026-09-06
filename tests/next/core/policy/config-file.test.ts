import { afterEach, describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as ported from '@next/core/policy/config-file';
import {
  getLegacyProjectConfigPath,
  validateConfigFile,
  validateRulesConfigFile,
} from '@/rules/config';
import { writeJsonAtomic } from '@/rules/policy/config-file';
import { getLegacyUserRulesConfigPath } from '@/rules/policy/paths';
import { snapshotTree, type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
  rootFolds,
  withProcessEnv,
} from '../../helpers/temp-home';

/**
 * The legacy config validator, the legacy paths and the atomic writer moved into one core
 * module, so each one is compared against the src home it came from over the same tree built
 * twice. Only the diagnostics are contract here: doctor prints them verbatim, so a reworded
 * or reordered message is a changed report.
 */

const TREE: TreeSpec = {
  'valid/rule.json': '{"version":1,"rules":["project-rules"],"transparent_wrappers":["rtk"]}',
  'version-two/rule.json': '{"version":2}',
  'not-json/rule.json': 'not json',
  'empty/rule.json': '',
  absent: null,
  blocked: 'a regular file where the parent directory belongs',
  'legacy/two-rules.json': JSON.stringify({
    version: 1,
    rules: [
      {
        name: 'no-force-push',
        command: 'git',
        subcommand: 'push',
        block_args: ['--force'],
        reason: 'Use --force-with-lease instead.',
      },
      {
        name: 'no-system-prune',
        command: 'docker',
        subcommand: 'system',
        block_args: ['prune'],
        reason: 'Use targeted cleanup instead.',
      },
    ],
  }),
  'legacy/bad-rule.json': JSON.stringify({
    version: 1,
    rules: [{ name: 'BAD NAME!', command: 'git', block_args: [], reason: '' }],
  }),
};

/** The same fixture tree under one root per implementation, so neither can see the other's. */
function trees() {
  const shipped = createTempRoot('config-file-shipped-');
  const portedRoot = createTempRoot('config-file-ported-');
  writeTree(shipped, TREE);
  writeTree(portedRoot, TREE);
  return { shipped, ported: portedRoot };
}

/** The result with its root spelled `<root>`; the rule-name set keeps its insertion order. */
function reported(result: { errors: string[]; ruleNames: Set<string> }, root: string) {
  return normalize({ errors: result.errors, ruleNames: [...result.ruleNames] }, [[root, '<root>']]);
}

const FILES = [
  'valid/rule.json',
  'version-two/rule.json',
  'not-json/rule.json',
  'empty/rule.json',
  'absent/rule.json',
  'blocked/rule.json',
  'legacy/two-rules.json',
  'legacy/bad-rule.json',
];

describe('the legacy config validator reports what the shipped one reports', () => {
  afterEach(removeTempRoots);

  test.each(FILES)('validates %s as a rules config the same way', (file) => {
    const root = trees();
    const rules = reported(ported.validateRulesConfigFile(join(root.ported, file)), root.ported);
    expect(rules).toEqual(
      reported(validateRulesConfigFile(join(root.shipped, file)), root.shipped),
    );
    expect(rules).toMatchSnapshot();
  });

  test.each(FILES)('validates %s as a legacy config the same way', (file) => {
    const root = trees();
    const legacy = reported(ported.validateConfigFile(join(root.ported, file)), root.ported);
    expect(legacy).toEqual(reported(validateConfigFile(join(root.shipped, file)), root.shipped));
    expect(legacy).toMatchSnapshot();
  });

  test('names the same diagnostics for an inline rule of the wrong shape', () => {
    const root = trees();
    expect(ported.validateConfigFile(join(root.ported, 'legacy/bad-rule.json')).errors).toEqual([
      'rules[0].name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)',
      'rules[0].block_args: must have at least one element',
      'rules[0].reason: must not be empty',
    ]);
  });
});

describe('the legacy paths resolve where the shipped ones resolve', () => {
  afterEach(removeTempRoots);

  test('the project config sits beside the project directory', () => {
    const root = createTempRoot('config-file-project-');
    const path = ported.getLegacyProjectConfigPath(root);
    expect(path).toBe(getLegacyProjectConfigPath(root));
    recordPorted(path, rootFolds(root));
  });

  test('the user config sits under a relocated safety-net home', () => {
    const home = createTempRoot('config-file-home-');
    const env = isolationEnv(home);
    const path = ported.getLegacyUserRulesConfigPath(environmentFor(home, env));
    expect(path).toBe(withProcessEnv(env, () => getLegacyUserRulesConfigPath()));
    recordPorted(path, rootFolds(home));
  });

  // Without the relocation both sides fall back to the process home, which `os.homedir()` reads
  // from the account rather than from `HOME`, so the environment reports that same home. The
  // path is computed and compared; nothing under it is opened.
  test('the user config sits under the default safety-net directory', () => {
    const home = createTempRoot('config-file-home-');
    const env = isolationEnv(home, { CC_SAFETY_NET_HOME: undefined });
    const path = ported.getLegacyUserRulesConfigPath(environmentFor(homedir(), env));
    expect(path).toBe(withProcessEnv(env, () => getLegacyUserRulesConfigPath()));
    recordPorted(path, [[homedir(), '<home>']]);
  });
});

describe('the atomic writer leaves the same file behind', () => {
  afterEach(removeTempRoots);

  test.each([
    ['an explicit owner-only mode', 0o600],
    ['the writer default', undefined],
  ] as const)('writes the same bytes with %s', (_label, mode) => {
    const shipped = createTempRoot('config-file-write-shipped-');
    const portedRoot = createTempRoot('config-file-write-ported-');
    const value = { version: 1, rules: ['project-rules'], overrides: {} };
    writeJsonAtomic(join(shipped, 'rule.json'), value, mode);
    ported.writeJsonAtomic(join(portedRoot, 'rule.json'), value, mode);
    const tree = snapshotTree(portedRoot);
    expect(tree).toEqual(snapshotTree(shipped));
    expect(tree).toMatchSnapshot();
  });
});
