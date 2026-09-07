import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import { assertValidRulebook } from '@/core/policy/rulebook';
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

const WRITES = [
  {
    name: 'a default config with no sources',
    ported: (path: string) => writeDefaultRulesConfig(path),
    states: (written: unknown) =>
      expect(written).toEqual({ version: 1, rules: [], overrides: {}, transparent_wrappers: [] }),
  },
  {
    name: 'a default config listing two sources',
    ported: (path: string) => writeDefaultRulesConfig(path, ['team-rules', 'local-a']),
    states: (written: unknown) =>
      expect(written).toEqual({
        version: 1,
        rules: ['team-rules', 'local-a'],
        overrides: {},
        transparent_wrappers: [],
      }),
  },
  {
    name: 'the project starter rulebook',
    ported: (path: string) => writeStarterRulebook(path),
    states: (written: unknown) =>
      expect(starterExample(written)).toEqual({
        name: 'project-rules',
        author: 'project',
        description: 'Project-specific CC Safety Net rules.',
      }),
  },
  {
    name: 'the user starter rulebook',
    ported: (path: string) => writeStarterRulebook(path, 'user-rules'),
    states: (written: unknown) =>
      expect(starterExample(written)).toEqual({
        name: 'user-rules',
        author: 'user',
        description: 'User-specific CC Safety Net rules.',
      }),
  },
];

/**
 * What `rule init --example` ships is a rulebook the loader accepts whose worked example holds
 * together: docker allowed, one rule against it, and one test naming that rule. Only the
 * scope-dependent fields are handed back for the row to state.
 */
function starterExample(written: unknown) {
  const rulebook = assertValidRulebook(written);
  expect(rulebook.allowed_commands).toEqual(['docker']);
  expect(rulebook.rules.map((rule) => rule.name)).toEqual(['block-docker-system-prune']);
  expect(rulebook.tests).toEqual([
    { command: 'docker system prune', expect: 'blocked', rule: 'block-docker-system-prune' },
  ]);
  return { name: rulebook.name, author: rulebook.author, description: rulebook.description };
}

describe('writing a scope file leaves what the shipped writer leaves', () => {
  test.each(WRITES)('writes $name', (row) => {
    const portedRoot = createTempRoot('scope-config-write-ported-');
    const target = 'scope/rules/written.json';
    row.ported(join(portedRoot, target));
    const tree = snapshotTree(portedRoot);
    const written: unknown = JSON.parse(tree.at(-1)?.content ?? 'null');
    row.states(written);
    // The file is JSON a person can read and edit, so it is written indented and newline-ended.
    expect(tree.at(-1)?.content).toBe(`${JSON.stringify(written, null, 2)}\n`);
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
