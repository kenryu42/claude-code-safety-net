import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import {
  readScopeRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@/rules-manager/config-file';
import { snapshotTree, type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { createTempRoot, normalize, removeTempRoots } from '../helpers/temp-home';

/**
 * Every rule command starts by reading its scope's config and several end by writing one, so a
 * refusal that stops naming its reason silently turns a broken config into an empty one, and a
 * starter file that drifts by a byte changes what `rule init --example` ships. Each read row is
 * resolved over its own copy of the tree; each write row writes into its own root and pins the
 * tree, modes included.
 */

const OVER_LIMIT_SOURCES = Array.from({ length: 65 }, (_unused, index) => `book-${index}`);

const TREE: TreeSpec = {
  'listed/rule.json': '{"version":1,"rules":["team-rules"],"overrides":{"team-rules/x":"off"}}',
  'blank/rule.json': '   ',
  'garbled/rule.json': '{"version":1,',
  'over-limit/rule.json': JSON.stringify({ version: 1, rules: OVER_LIMIT_SOURCES }),
  nothing: null,
};

const READS = [
  'listed/rule.json',
  'blank/rule.json',
  'garbled/rule.json',
  'over-limit/rule.json',
  'nothing/rule.json',
];

afterEach(removeTempRoots);

/** The read fixture under its own root, so nothing outside it is in reach. */
function readBoth(file: string) {
  const portedRoot = createTempRoot('scope-config-read-ported-');
  writeTree(portedRoot, TREE);
  const ported = readScopeRulesConfig(join(portedRoot, file));
  expect(normalize(ported, [[portedRoot, '<root>']])).toMatchSnapshot();
  return ported;
}

describe('reading a scope config reports what the shipped reader reports', () => {
  test.each(READS)('reads %s the same way', (file) => {
    readBoth(file);
  });

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

const WRITES = [
  {
    name: 'a default config with no sources',
    ported: (path: string) => writeDefaultRulesConfig(path),
  },
  {
    name: 'a default config listing two sources',
    ported: (path: string) => writeDefaultRulesConfig(path, ['team-rules', 'local-a']),
  },
  {
    name: 'the project starter rulebook',
    ported: (path: string) => writeStarterRulebook(path),
  },
  {
    name: 'the user starter rulebook',
    ported: (path: string) => writeStarterRulebook(path, 'user-rules'),
  },
];

describe('writing a scope file leaves what the shipped writer leaves', () => {
  test.each(WRITES)('writes $name', (row) => {
    const portedRoot = createTempRoot('scope-config-write-ported-');
    const target = 'scope/rules/written.json';
    row.ported(join(portedRoot, target));
    const tree = snapshotTree(portedRoot);
    expect(tree).toMatchSnapshot();
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
