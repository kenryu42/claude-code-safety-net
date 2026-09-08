import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  inspectManagedPluginDir,
  lstatOrUndefined,
  readRecord,
  readStateFile,
} from '@/hosts/detect/context';
import { writeTree } from '../../helpers/fixture-tree';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';

/**
 * The state-file helpers every detector shares. A runtime's file is either missing (an answer),
 * readable (an answer) or neither, and the third case must stay distinguishable from the first so
 * a host with an unreadable config is reported as uninspected rather than as not installed.
 */

const stripComments = (raw: string) => raw.replace(/^\s*\/\/.*$/gm, '');

function seed() {
  const root = createTempRoot('next-detect-context-');
  writeTree(root, {
    'settings.json': '{"enabled": true}',
    'broken.json': '{"enabled":',
    'commented.json': '// managed\n{"enabled": false}',
    'as-directory.json': null,
    'plugin-dir': null,
    'plugin-file': '',
    'link-to-dir': { symlink: 'plugin-dir' },
  });
  return root;
}

afterEach(removeTempRoots);

describe('the shared detector context', () => {
  test('tells a missing state file apart from an unreadable one', () => {
    const root = seed();
    const cases = [
      ['absent.json', undefined],
      ['settings.json', undefined],
      ['broken.json', undefined],
      ['as-directory.json', undefined],
      ['commented.json', stripComments],
    ] as const;
    const read = (readFile: typeof readStateFile) =>
      cases.map(([name, preprocess]) => readFile(join(root, name), preprocess));

    expect(read(readStateFile)).toEqual([
      { kind: 'missing' },
      { kind: 'ok', value: { enabled: true } },
      { kind: 'unreadable' },
      { kind: 'unreadable' },
      { kind: 'ok', value: { enabled: false } },
    ]);
  });

  test('probes a path without following the link that sits on it', () => {
    const root = seed();
    const describeEntry = (stat: ReturnType<typeof lstatOrUndefined>) =>
      stat === undefined
        ? 'absent'
        : stat.isSymbolicLink()
          ? 'symlink'
          : stat.isDirectory()
            ? 'directory'
            : 'file';
    const names = ['absent.json', 'settings.json', 'plugin-dir', 'link-to-dir'];
    const probe = (lstat: typeof lstatOrUndefined) =>
      names.map((name) => describeEntry(lstat(join(root, name))));

    expect(probe(lstatOrUndefined)).toEqual(['absent', 'file', 'directory', 'symlink']);
  });

  test('refuses a managed plugin path that is not a real directory', () => {
    const root = seed();
    const names = ['absent', 'plugin-dir', 'plugin-file', 'link-to-dir'];
    const inspect = (guard: typeof inspectManagedPluginDir) =>
      names.map((name) => guard('openclaw', join(root, name)));

    expect(inspect(inspectManagedPluginDir)).toEqual([
      { platform: 'openclaw', status: 'n/a', configPath: join(root, 'absent') },
      undefined,
      {
        platform: 'openclaw',
        status: 'n/a',
        configPath: join(root, 'plugin-file'),
        errors: [
          `${join(root, 'plugin-file')} is a symlink or not a directory; move or remove it before installing`,
        ],
      },
      {
        platform: 'openclaw',
        status: 'n/a',
        configPath: join(root, 'link-to-dir'),
        errors: [
          `${join(root, 'link-to-dir')} is a symlink or not a directory; move or remove it before installing`,
        ],
      },
    ]);
  });

  test('reads a key only out of a real object', () => {
    const values: readonly [unknown, string][] = [
      [{ hooks: [1] }, 'hooks'],
      [{ hooks: [1] }, 'missing'],
      [null, 'hooks'],
      ['hooks', 'hooks'],
      [42, 'hooks'],
      [['hooks'], '0'],
      [{ hooks: undefined }, 'hooks'],
    ];
    const read = (readOne: typeof readRecord) =>
      values.map(([value, key]) => readOne(value, key) ?? 'undefined');

    expect(read(readRecord)).toEqual([
      [1],
      'undefined',
      'undefined',
      'undefined',
      'undefined',
      'hooks',
      'undefined',
    ]);
  });
});
