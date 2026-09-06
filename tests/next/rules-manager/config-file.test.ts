import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  readScopeRulesConfig,
  writeDefaultRulesConfig,
  writeStarterRulebook,
} from '@next/rules-manager/config-file';
import {
  readScopeRulesConfig as shippedReadScopeRulesConfig,
  writeDefaultRulesConfig as shippedWriteDefaultRulesConfig,
  writeStarterRulebook as shippedWriteStarterRulebook,
} from '@/rules/policy/config-file';
import { snapshotTree, type TreeSpec, writeTree } from '../helpers/fixture-tree';
import { createTempRoot, normalize, removeTempRoots } from '../helpers/temp-home';

/**
 * Every rule command starts by reading its scope's config and several end by writing one, so a
 * refusal that stops naming its reason silently turns a broken config into an empty one, and a
 * starter file that drifts by a byte changes what `rule init --example` ships. Each read row is
 * resolved on both implementations over the same tree built twice; each write row runs both
 * writers into their own root and compares the trees, modes included.
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

/** The read fixture under one root per implementation, so neither can see the other's. */
function readBoth(file: string) {
  const shippedRoot = createTempRoot('scope-config-read-shipped-');
  const portedRoot = createTempRoot('scope-config-read-ported-');
  writeTree(shippedRoot, TREE);
  writeTree(portedRoot, TREE);
  const ported = readScopeRulesConfig(join(portedRoot, file));
  const read = normalize(ported, [[portedRoot, '<root>']]);
  expect(read).toEqual(
    normalize(shippedReadScopeRulesConfig(join(shippedRoot, file)), [[shippedRoot, '<root>']]),
  );
  expect(read).toMatchSnapshot();
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
    shipped: (path: string) => shippedWriteDefaultRulesConfig(path),
    ported: (path: string) => writeDefaultRulesConfig(path),
  },
  {
    name: 'a default config listing two sources',
    shipped: (path: string) => shippedWriteDefaultRulesConfig(path, ['team-rules', 'local-a']),
    ported: (path: string) => writeDefaultRulesConfig(path, ['team-rules', 'local-a']),
  },
  {
    name: 'the project starter rulebook',
    shipped: (path: string) => shippedWriteStarterRulebook(path),
    ported: (path: string) => writeStarterRulebook(path),
  },
  {
    name: 'the user starter rulebook',
    shipped: (path: string) => shippedWriteStarterRulebook(path, 'user-rules'),
    ported: (path: string) => writeStarterRulebook(path, 'user-rules'),
  },
];

describe('writing a scope file leaves what the shipped writer leaves', () => {
  test.each(WRITES)('writes $name', (row) => {
    const shippedRoot = createTempRoot('scope-config-write-shipped-');
    const portedRoot = createTempRoot('scope-config-write-ported-');
    const target = 'scope/rules/written.json';
    row.shipped(join(shippedRoot, target));
    row.ported(join(portedRoot, target));
    const tree = snapshotTree(portedRoot);
    expect(tree).toEqual(snapshotTree(shippedRoot));
    expect(tree).toMatchSnapshot();
    // The write is owner-only inside owner-only directories, and leaves no temp file behind.
    expect(tree.map((entry) => ({ path: entry.path, kind: entry.kind, mode: entry.mode }))).toEqual(
      [
        { path: 'scope', kind: 'directory', mode: 0o700 },
        { path: 'scope/rules', kind: 'directory', mode: 0o700 },
        { path: target, kind: 'file', mode: 0o600 },
      ],
    );
  });
});
