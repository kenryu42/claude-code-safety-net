import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
  readScopeRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/rules-manager/config-file';
import { snapshotTree, type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { createTempRoot, removeTempRoots } from '../helpers/temp-home';

/**
 * Every rule command starts by reading its scope's config and several end by writing one, so a
 * refusal that stops naming its reason silently turns a broken config into an empty one, and a
 * starter file that drifts by a byte changes what `rule init --example` ships. Each read row is
 * resolved over its own copy of the tree; each write row writes into its own root and states the
 * tree it leaves, contents and modes included.
 */

const OVER_LIMIT_SOURCES = Array.from({ length: 65 }, (_unused, index) => `book-${index}`);

const TREE: TreeSpec = {
  'listed/rule.json': '{"version":1,"rules":["team-rules"],"overrides":{"team-rules/x":"off"}}',
  'blank/rule.json': '   ',
  'garbled/rule.json': '{"version":1,',
  'over-limit/rule.json': JSON.stringify({ version: 1, rules: OVER_LIMIT_SOURCES }),
  nothing: null,
};

afterEach(removeTempRoots);

/** The read fixture under its own root, so nothing outside it is in reach. */
function readBoth(file: string) {
  const portedRoot = createTempRoot('scope-config-read-ported-');
  writeTree(portedRoot, TREE);
  return readScopeRulesConfig(join(portedRoot, file));
}

describe('reading a scope config reports what the shipped reader reports', () => {
  test('a missing config reads as the empty default', () => {
    expect(readBoth('nothing/rule.json')).toEqual({
      ok: true,
      config: { version: 1, rules: [], overrides: {}, transparent_wrappers: [] },
    });
  });

  test('a listed source keeps its overrides and gains the omitted fields', () => {
    expect(readBoth('listed/rule.json')).toEqual({
      ok: true,
      config: {
        version: 1,
        rules: ['team-rules'],
        overrides: { 'team-rules/x': 'off' },
        transparent_wrappers: [],
      },
    });
  });

  test.each([
    ['blank/rule.json', 'Config file is empty'],
    ['garbled/rule.json', 'Invalid JSON'],
    ['over-limit/rule.json', "Rule config exceeds CC Safety Net's safe source limit."],
  ])('%s refuses the scope with %s', (file, message) => {
    expect(readBoth(file)).toEqual({
      ok: false,
      result: { ok: false, errors: [message], entries: [] },
    });
  });
});

/** The rulebook `rule init --example` ships, under the name and authorship of its scope. */
const starterRulebook = (name: string, author: string) => ({
  rulebook_version: 1,
  name,
  version: '1.0.0',
  description: `${author === 'project' ? 'Project' : 'User'}-specific CC Safety Net rules.`,
  author,
  allowed_commands: ['docker'],
  rules: [
    {
      name: 'block-docker-system-prune',
      command: 'docker',
      subcommand: 'system',
      block_args: ['prune'],
      reason: 'Use targeted cleanup instead.',
    },
  ],
  tests: [
    { command: 'docker system prune', expect: 'blocked', rule: 'block-docker-system-prune' },
  ],
});

const WRITES = [
  {
    name: 'a default config with no sources',
    ported: (path: string) => writeDefaultRulesConfig(path),
    content: { version: 1, rules: [], overrides: {}, transparent_wrappers: [] },
  },
  {
    name: 'a default config listing two sources',
    ported: (path: string) => writeDefaultRulesConfig(path, ['team-rules', 'local-a']),
    content: {
      version: 1,
      rules: ['team-rules', 'local-a'],
      overrides: {},
      transparent_wrappers: [],
    },
  },
  {
    name: 'the project starter rulebook',
    ported: (path: string) => writeStarterRulebook(path),
    content: starterRulebook('project-rules', 'project'),
  },
  {
    name: 'the user starter rulebook',
    ported: (path: string) => writeStarterRulebook(path, 'user-rules'),
    content: starterRulebook('user-rules', 'user'),
  },
];

describe('writing a scope file leaves what the shipped writer leaves', () => {
  test.each(WRITES)('writes $name', (row) => {
    const portedRoot = createTempRoot('scope-config-write-ported-');
    const target = 'scope/rules/written.json';
    row.ported(join(portedRoot, target));
    const tree = snapshotTree(portedRoot);
    // The file is JSON a person can read and edit, so it is written indented and newline-ended.
    expect(tree.at(-1)?.content).toBe(`${JSON.stringify(row.content, null, 2)}\n`);
    // The write is owner-only inside owner-only directories, and leaves no temp file behind.
    expect(tree.map((entry) => ({ path: entry.path, kind: entry.kind }))).toEqual([
      { path: 'scope', kind: 'directory' },
      { path: 'scope/rules', kind: 'directory' },
      { path: target, kind: 'file' },
    ]);
    // Windows has no POSIX mode to assert.
    if (process.platform === 'win32') return;
    expect(
      tree.map((entry) => (lstatSync(join(portedRoot, entry.path)).mode & 0o777).toString(8)),
    ).toEqual(['700', '700', '600']);
  });
});
