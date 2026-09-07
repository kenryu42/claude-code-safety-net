import { afterEach, describe, expect, test } from 'bun:test';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';
import * as ported from '@/core/policy/config-file';
import { snapshotTree, type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
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
  const root = createTempRoot('config-file-');
  writeTree(root, TREE);
  return root;
}

/** The result with its own absolute root removed, so a row can state the path it names. */
function reported(
  result: { errors: string[]; ruleNames: Set<string> },
  root: string,
): { errors: string[]; ruleNames: string[] } {
  return {
    errors: result.errors.map((error) => error.replaceAll(root, '<root>')),
    ruleNames: [...result.ruleNames],
  };
}

type Expectation = { readonly errors: readonly string[]; readonly ruleNames: readonly string[] };

/**
 * Both readers share one file-reading front end, so the rows that never reach a schema — an
 * unreadable, empty or malformed file — must report identically through either one.
 */
const UNREADABLE: readonly { behavior: string; file: string; expected: Expectation }[] = [
  {
    behavior: 'a file that is not JSON reports the parse failure, not the parser message',
    file: 'not-json/rule.json',
    expected: { errors: ['Invalid JSON'], ruleNames: [] },
  },
  {
    behavior: 'an empty file names emptiness rather than a JSON error',
    file: 'empty/rule.json',
    expected: { errors: ['Config file is empty'], ruleNames: [] },
  },
  {
    behavior: 'an absent file names the path that is missing',
    file: 'absent/rule.json',
    expected: { errors: ['File not found: <root>/absent/rule.json'], ruleNames: [] },
  },
  {
    behavior: 'a regular file where the parent directory belongs is a filesystem refusal',
    file: 'blocked/rule.json',
    expected: { errors: ['Unable to access rules policy filesystem safely.'], ruleNames: [] },
  },
  {
    behavior: 'a version the reader does not support is rejected on the version alone',
    file: 'version-two/rule.json',
    expected: { errors: ['version must be 1'], ruleNames: [] },
  },
];

const AS_RULES_CONFIG: readonly { behavior: string; file: string; expected: Expectation }[] = [
  ...UNREADABLE,
  {
    behavior: 'a valid rules config reports its sources and nothing else',
    file: 'valid/rule.json',
    expected: { errors: [], ruleNames: ['project-rules'] },
  },
  {
    behavior: 'inline rule objects are not rulebook sources',
    file: 'legacy/two-rules.json',
    expected: {
      errors: [
        'rules[0]: must be a rulebook source string',
        'rules[1]: must be a rulebook source string',
      ],
      ruleNames: [],
    },
  },
  {
    behavior: 'a single inline rule object is rejected the same way',
    file: 'legacy/bad-rule.json',
    expected: { errors: ['rules[0]: must be a rulebook source string'], ruleNames: [] },
  },
];

const AS_LEGACY_CONFIG: readonly { behavior: string; file: string; expected: Expectation }[] = [
  ...UNREADABLE,
  {
    behavior: 'a rulebook source string is not an inline rule object',
    file: 'valid/rule.json',
    expected: { errors: ['rules[0]: must be an object'], ruleNames: [] },
  },
  {
    behavior: 'a valid legacy config reports its inline rule names, lowercased',
    file: 'legacy/two-rules.json',
    expected: { errors: [], ruleNames: ['no-force-push', 'no-system-prune'] },
  },
  {
    behavior:
      'an inline rule of the wrong shape names every field it failed, and its name is still collected for duplicate detection',
    file: 'legacy/bad-rule.json',
    expected: {
      errors: [
        'rules[0].name: must match pattern (letters, numbers, hyphens, underscores; max 64 chars)',
        'rules[0].block_args: must have at least one element',
        'rules[0].reason: must not be empty',
      ],
      ruleNames: ['bad name!'],
    },
  },
];

describe('reading a file as a rules config', () => {
  afterEach(removeTempRoots);

  test.each(
    AS_RULES_CONFIG.map((row) => [row.behavior, row.file, row.expected] as const),
  )('%s', (_behavior, file, expected) => {
    const root = tree();
    expect(reported(ported.validateRulesConfigFile(join(root, file)), root)).toEqual({
      errors: [...expected.errors],
      ruleNames: [...expected.ruleNames],
    });
  });
});

describe('reading a file as a legacy inline config', () => {
  afterEach(removeTempRoots);

  test.each(
    AS_LEGACY_CONFIG.map((row) => [row.behavior, row.file, row.expected] as const),
  )('%s', (_behavior, file, expected) => {
    const root = tree();
    expect(reported(ported.validateConfigFile(join(root, file)), root)).toEqual({
      errors: [...expected.errors],
      ruleNames: [...expected.ruleNames],
    });
  });
});

describe('where the version-0 leftovers live', () => {
  afterEach(removeTempRoots);

  test('the project config is .safety-net.json beside the project directory', () => {
    const root = createTempRoot('config-file-project-');
    expect(ported.getLegacyProjectConfigPath(root)).toBe(join(root, '.safety-net.json'));
  });

  test('the user config is config.json in the safety-net home', () => {
    const home = createTempRoot('config-file-home-');
    expect(ported.getLegacyUserRulesConfigPath(environmentFor(home, isolationEnv(home)))).toBe(
      join(home, '.cc-safety-net', 'config.json'),
    );
  });

  test('with no relocation the user config falls back to the home directory', () => {
    const home = createTempRoot('config-file-home-');
    const environment = environmentFor(home, isolationEnv(home, { CC_SAFETY_NET_HOME: undefined }));
    expect(ported.getLegacyUserRulesConfigPath(environment)).toBe(
      join(home, '.cc-safety-net', 'config.json'),
    );
  });
});

describe('the atomic JSON writer', () => {
  afterEach(removeTempRoots);

  test.each([
    ['an explicit owner-only mode', 0o600],
    ['the writer default, which is owner-only too', undefined],
  ] as const)('leaves one owner-only file behind with %s', (_behavior, mode) => {
    const root = createTempRoot('config-file-write-');
    ported.writeJsonAtomic(
      join(root, 'rule.json'),
      { version: 1, rules: ['project-rules'], overrides: {} },
      mode,
    );
    // One file, no half-written temp beside it, and the pretty-printed bytes with a final newline.
    expect(snapshotTree(root)).toEqual([
      {
        path: 'rule.json',
        kind: 'file',
        content: `${JSON.stringify({ version: 1, rules: ['project-rules'], overrides: {} }, null, 2)}\n`,
      },
    ]);
    // Owner-only; Windows has no POSIX mode to assert.
    if (process.platform !== 'win32')
      expect(lstatSync(join(root, 'rule.json')).mode & 0o777).toBe(0o600);
  });
});
