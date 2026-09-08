import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import {
  type ChooseDirectoryResult,
  isDirectoryPickerAvailable as portedAvailable,
  chooseDirectory as portedChoose,
} from '@/gui/choose-directory';
import { createFakeBin, type FakeScriptEntry } from '../helpers/fake-bin';
import { createTempRoot, normalize, removeTempRoots } from '../helpers/temp-home';

/**
 * The native folder dialog: which platforms can open one, and what the picked path comes back as.
 * Every row pins the answer and the argv the fake dialog recorded — a fake `zenity`, `kdialog` or
 * missing `osascript` on a `PATH` of our own, so no test opens a window.
 */

const EXECUTE_BIT = process.platform !== 'win32';

const executableDir = (root: string, name: string) => {
  const dir = join(root, `${name}-bin`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  return dir;
};

describe('whether a folder dialog can be opened', () => {
  afterEach(removeTempRoots);

  test('agrees with the shipped answer on every platform and PATH shape', () => {
    const root = createTempRoot('gui-picker-paths-');
    const zenity = executableDir(root, 'zenity');
    const kdialog = executableDir(root, 'kdialog');

    const unreadable = join(root, 'not-a-directory');
    writeFileSync(unreadable, 'a PATH entry that is a file, not a directory');
    const shadowed = join(root, 'shadowed');
    mkdirSync(join(shadowed, 'zenity'), { recursive: true });
    const notExecutable = join(root, 'not-executable');
    mkdirSync(notExecutable, { recursive: true });
    writeFileSync(join(notExecutable, 'zenity'), '#!/bin/sh\nexit 0\n', { mode: 0o644 });

    const rows: readonly [string, NodeJS.ProcessEnv, boolean][] = [
      ['darwin', {}, true],
      ['win32', {}, true],
      ['linux', {}, false],
      ['linux', { DISPLAY: ':0', PATH: zenity }, true],
      ['linux', { WAYLAND_DISPLAY: 'wayland-0', PATH: kdialog }, true],
      ['linux', { DISPLAY: ':0', PATH: [unreadable, shadowed].join(delimiter) }, false],
      ['linux', { DISPLAY: ':0', PATH: notExecutable }, false],
      ['freebsd', { DISPLAY: ':0', PATH: zenity }, false],
    ];

    // A Linux dialog is found by its execute bit, which a Windows filesystem has no way to set,
    // so the rows that find one only hold on a host that has the bit.
    for (const [platform, env, available] of rows.filter(
      ([host, , found]) => !found || EXECUTE_BIT || host !== 'linux',
    )) {
      expect(portedAvailable(platform, env)).toBe(available);
    }
  });
});

const DIALOG_ROWS: readonly {
  readonly label: string;
  readonly platform: string;
  readonly script: (root: string) => readonly FakeScriptEntry[];
  readonly picked: boolean;
  readonly result: ChooseDirectoryResult;
  readonly argv: string[];
}[] = [
  {
    label: 'a chosen folder',
    platform: 'linux',
    script: (root) => [{ command: 'zenity', stdout: `${join(root, 'picked')}\n` }],
    picked: true,
    result: { path: '<root>/picked' },
    argv: ['zenity --file-selection --directory --title=Choose the project folder'],
  },
  {
    label: 'a chosen folder reported with a trailing separator',
    platform: 'linux',
    script: (root) => [{ command: 'zenity', stdout: `${join(root, 'picked')}/\n` }],
    picked: true,
    result: { path: '<root>/picked' },
    argv: ['zenity --file-selection --directory --title=Choose the project folder'],
  },
  {
    label: 'a cancelled dialog',
    platform: 'linux',
    script: () => [{ command: 'zenity', stdout: '' }],
    picked: false,
    result: { cancelled: true },
    argv: ['zenity --file-selection --directory --title=Choose the project folder'],
  },
  {
    label: 'a path that is not a folder on disk',
    platform: 'linux',
    script: (root) => [{ command: 'zenity', stdout: `${join(root, 'missing')}\n` }],
    picked: false,
    result: { error: 'That selection is not a folder on disk' },
    argv: ['zenity --file-selection --directory --title=Choose the project folder'],
  },
  {
    label: 'the second dialog when only it is installed',
    platform: 'linux',
    script: (root) => [{ command: 'kdialog', stdout: `${join(root, 'picked')}\n` }],
    picked: true,
    result: { path: '<root>/picked' },
    argv: ['kdialog --getexistingdirectory . --title Choose the project folder'],
  },
  {
    label: 'no dialog at all',
    platform: 'linux',
    script: () => [],
    picked: false,
    result: { error: 'No folder dialog is available on this system' },
    argv: [],
  },
  {
    label: 'a macOS host whose osascript cannot be started',
    platform: 'darwin',
    script: () => [],
    picked: false,
    result: { error: 'Could not open the folder dialog (osascript)' },
    argv: [],
  },
];

describe('opening the folder dialog', () => {
  afterEach(removeTempRoots);

  const runSide = async (row: (typeof DIALOG_ROWS)[number]) => {
    const root = createTempRoot('gui-picker-ported-');
    const fake = createFakeBin(root, row.script(root));
    if (row.picked) mkdirSync(join(root, 'picked'), { recursive: true });
    const result = await portedChoose(row.platform, { ...fake.env, DISPLAY: ':0' });
    return normalize({ result, argv: fake.readLog().map((line) => line.split('\t')[0]) }, [
      [root, '<root>'],
    ]);
  };

  test.each(
    DIALOG_ROWS.filter((row) => EXECUTE_BIT || row.platform !== 'linux').map(
      (row) => [row.label, row] as const,
    ),
  )('reports %s the same way', async (_label, row) => {
    expect(await runSide(row)).toStrictEqual({ result: row.result, argv: row.argv });
  });
});
