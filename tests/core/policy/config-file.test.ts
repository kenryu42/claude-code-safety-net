import { afterEach, describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as ported from '@/core/policy/config-file';
import { snapshotTree, type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
  rootFolds,
} from '../../helpers/temp-home';

/**
 * The legacy config validator, the legacy paths and the atomic writer moved into one core
 * module, each run over its own copy of the fixture tree. Only the diagnostics are contract
 * here: doctor prints them verbatim, so a reworded or reordered message is a changed report.
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

/** The fixture tree under its own root, so nothing outside it is in reach. */
function tree() {
  const root = createTempRoot('config-file-ported-');
  writeTree(root, TREE);
  return root;
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
    const root = tree();
    expect(reported(ported.validateRulesConfigFile(join(root, file)), root)).toMatchSnapshot();
  });

  test.each(FILES)('validates %s as a legacy config the same way', (file) => {
    const root = tree();
    expect(reported(ported.validateConfigFile(join(root, file)), root)).toMatchSnapshot();
  });

  test('names the same diagnostics for an inline rule of the wrong shape', () => {
    const root = tree();
    expect(ported.validateConfigFile(join(root, 'legacy/bad-rule.json')).errors).toEqual([
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
    recordPorted(ported.getLegacyProjectConfigPath(root), rootFolds(root));
  });

  test('the user config sits under a relocated safety-net home', () => {
    const home = createTempRoot('config-file-home-');
    const env = isolationEnv(home);
    recordPorted(ported.getLegacyUserRulesConfigPath(environmentFor(home, env)), rootFolds(home));
  });

  // Without the relocation the path falls back to the process home, which `os.homedir()` reads
  // from the account rather than from `HOME`, so the environment reports that same home. The
  // path is computed and recorded; nothing under it is opened.
  test('the user config sits under the default safety-net directory', () => {
    const home = createTempRoot('config-file-home-');
    const env = isolationEnv(home, { CC_SAFETY_NET_HOME: undefined });
    recordPorted(ported.getLegacyUserRulesConfigPath(environmentFor(homedir(), env)), [
      [homedir(), '<home>'],
    ]);
  });
});

describe('the atomic writer leaves the same file behind', () => {
  afterEach(removeTempRoots);

  test.each([
    ['an explicit owner-only mode', 0o600],
    ['the writer default', undefined],
  ] as const)('writes the same bytes with %s', (_label, mode) => {
    const portedRoot = createTempRoot('config-file-write-ported-');
    ported.writeJsonAtomic(
      join(portedRoot, 'rule.json'),
      { version: 1, rules: ['project-rules'], overrides: {} },
      mode,
    );
    expect(snapshotTree(portedRoot)).toMatchSnapshot();
  });
});
