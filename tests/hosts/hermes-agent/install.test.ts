import { afterEach, describe, expect, test } from 'bun:test';
import { buildHermesAgentPluginFiles } from '@/hosts/hermes-agent/artifact';
import { detect as detectHermes } from '@/hosts/hermes-agent/detect';
import {
  installHermesAgent,
  readOwnedHermesAgentFiles,
  uninstallHermesAgent,
} from '@/hosts/hermes-agent/install';
import { describeOutcome, type TreeEntry, type TreeSpec } from '../../helpers/fixture-tree';
import { differential, hostRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Hermes owns a directory rather than a config file, so the installer's job is bounded: write the
 * two managed files, refuse every managed path that is not a plain file of ours, and on the way
 * out remove only what it wrote — the user's own files keep the directory alive.
 */

const DIR = '.hermes/plugins/cc-safety-net';
const DIR_PATH = `<home>/${DIR}`;
const NOT_ENABLED =
  'cc-safety-net is not enabled in Hermes; run `hermes plugins enable cc-safety-net`';
/** What both directions say about anything but a plain directory at the managed path. */
const NOT_A_DIRECTORY: readonly [string, string] = [
  `Refusing to install ${DIR_PATH}: not a regular directory. Move or remove it and rerun install --hermes-agent.`,
  `Refusing to remove ${DIR_PATH}: not a regular directory. Move or remove it and rerun uninstall --hermes-agent.`,
];
const NOT_A_DIRECTORY_ERRORS = [
  `${DIR_PATH} is a symlink or not a directory; move or remove it before installing`,
];

/** The managed files under one directory: a seed spec, and what a snapshot should hold. */
const managedFiles = (dir: string, version: string): Record<string, string> =>
  Object.fromEntries(
    buildHermesAgentPluginFiles(version).map((file) => [`${dir}/${file.name}`, file.content]),
  );

const installedTree = (dir: string) => ({ [dir]: 'directory', ...managedFiles(dir, 'dev') });

/** Everything a snapshot holds at or under `prefix`: content, a link target, or the entry kind. */
const entriesUnder = (tree: TreeEntry[] | undefined, prefix: string) =>
  Object.fromEntries(
    (tree ?? [])
      .filter((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}/`))
      .map((entry) => [entry.path, entry.content ?? entry.target ?? entry.kind]),
  );

const { row } = hostRunner({
  ported: (environment) => ({
    install: () => installHermesAgent(environment),
    detect: () => detectHermes({ environment, cwd: environment.home }),
    uninstall: () => uninstallHermesAgent(environment),
  }),
});

/** Install wrote our two files, the detector saw them, a reinstall changed nothing, and the
 * uninstall reclaimed the whole directory. */
function expectHermesRow(
  steps: Awaited<ReturnType<typeof row>>['steps'],
  expected: { dir: string; alreadyInstalled: boolean },
) {
  const path = `<home>/${expected.dir}`;
  expect({
    install: steps?.install.result,
    installed: entriesUnder(steps?.install.tree, expected.dir),
    detected: steps?.install.detection,
    reinstall: steps?.reinstall.result,
    reinstallTree: steps?.reinstall.tree,
    left: entriesUnder(steps?.uninstall.tree, expected.dir),
    detectedAfter: steps?.uninstall.detection,
    finalUninstall: steps?.finalUninstall,
  }).toEqual({
    install: { ok: true, value: { path, alreadyInstalled: expected.alreadyInstalled } },
    installed: installedTree(expected.dir),
    detected: {
      platform: 'hermes-agent',
      status: 'disabled',
      method: 'plugin directory',
      configPath: path,
      errors: [NOT_ENABLED],
    },
    reinstall: { ok: true, value: { path, alreadyInstalled: true } },
    reinstallTree: steps?.install.tree,
    left: {},
    detectedAfter: { platform: 'hermes-agent', status: 'n/a', configPath: path },
    finalUninstall: { ok: true, value: { path, alreadyInstalled: false } },
  });
}

afterEach(removeTempRoots);

describe('the Hermes Agent plugin directory differential', () => {
  test('writes the shim and its manifest into a home that has neither', async () => {
    expectHermesRow((await row({})).steps, { dir: DIR, alreadyInstalled: false });
  });

  test('reports an identical install without rewriting it', async () => {
    expectHermesRow((await row(managedFiles(DIR, 'dev'))).steps, {
      dir: DIR,
      alreadyInstalled: true,
    });
  });

  test('replaces files stamped with an older version', async () => {
    expectHermesRow((await row(managedFiles(DIR, '1.0.0'))).steps, {
      dir: DIR,
      alreadyInstalled: false,
    });
  });

  test.each([
    [
      'a padded HERMES_HOME, trimmed the way Hermes trims it',
      ' <home>/hermes-home ',
      'hermes-home',
    ],
    ['an empty HERMES_HOME, which falls back to the default home', '', '.hermes'],
  ])('follows %s', async (_case, hermesHome, hermesDir) => {
    const dir = `${hermesDir}/plugins/cc-safety-net`;
    const { steps } = await row({}, { HERMES_HOME: hermesHome });

    expectHermesRow(steps, { dir, alreadyInstalled: false });
  });
});

describe('refusing a managed path that is not ours', () => {
  /** case, seed, what the directory still holds, the install and remove refusals, and what the
   * detector reports about the same path. */
  const REFUSALS: readonly (readonly [
    string,
    TreeSpec,
    Record<string, string>,
    string,
    string,
    string[],
  ])[] = [
    [
      'a symlink standing in for the plugin directory',
      { 'elsewhere/keep.txt': 'kept', [DIR]: { symlink: '../../elsewhere' } } as TreeSpec,
      { [DIR]: '../../elsewhere' },
      ...NOT_A_DIRECTORY,
      NOT_A_DIRECTORY_ERRORS,
    ],
    [
      'a plain file standing in for the plugin directory',
      { [DIR]: 'not a directory' } as TreeSpec,
      { [DIR]: 'not a directory' },
      ...NOT_A_DIRECTORY,
      NOT_A_DIRECTORY_ERRORS,
    ],
    [
      'a shim someone else wrote',
      { ...managedFiles(DIR, 'dev'), [`${DIR}/__init__.py`]: 'print("mine")\n' } as TreeSpec,
      {
        [DIR]: 'directory',
        ...managedFiles(DIR, 'dev'),
        [`${DIR}/__init__.py`]: 'print("mine")\n',
      },
      `Refusing to overwrite unmanaged file at ${DIR_PATH}/__init__.py. Move or remove it.`,
      `Refusing to remove unmanaged file at ${DIR_PATH}/__init__.py. Move or remove it.`,
      [`Unmanaged __init__.py occupies ${DIR_PATH}/__init__.py; move or remove it`],
    ],
    [
      'a manifest that is a symlink',
      {
        ...managedFiles(DIR, 'dev'),
        [`${DIR}/plugin.yaml`]: { symlink: 'elsewhere.yaml' },
      } as TreeSpec,
      {
        [DIR]: 'directory',
        ...managedFiles(DIR, 'dev'),
        [`${DIR}/plugin.yaml`]: 'elsewhere.yaml',
      },
      `Refusing to overwrite ${DIR_PATH}/plugin.yaml: not a regular file. Move or remove it.`,
      `Refusing to remove ${DIR_PATH}/plugin.yaml: not a regular file. Move or remove it.`,
      [`${DIR_PATH}/plugin.yaml is a symlink or not a regular file; move or remove it`],
    ],
  ];

  test.each(
    REFUSALS,
  )('leaves %s exactly as it found it', async (_case, seed, left, installMessage, uninstallMessage, errors) => {
    const { steps } = await row(seed);

    expect({
      install: steps?.install.result,
      uninstall: steps?.uninstall.result,
      detected: steps?.install.detection,
      left: entriesUnder(steps?.uninstall.tree, DIR),
    }).toEqual({
      install: { ok: false, error: { name: 'Error', message: installMessage } },
      uninstall: { ok: false, error: { name: 'Error', message: uninstallMessage } },
      detected: { platform: 'hermes-agent', status: 'n/a', configPath: DIR_PATH, errors },
      left,
    });
  });
});

describe('removing the Hermes Agent plugin', () => {
  const uninstallOnly = async (seed: TreeSpec) =>
    await differential({
      seed,
      ported: (environment) => describeOutcome(() => uninstallHermesAgent(environment)),
    });

  test('takes its own bytecode cache with it but keeps a directory the user still uses', async () => {
    const removal = await uninstallOnly({
      ...managedFiles(DIR, 'dev'),
      [`${DIR}/__pycache__/x.pyc`]: 'cached',
      [`${DIR}/notes.txt`]: 'mine',
    });

    expect(removal.outcome).toEqual({
      kind: 'returned',
      value: { ok: true, value: { path: DIR_PATH, alreadyInstalled: true } },
    });
    expect(entriesUnder(removal.tree, DIR)).toEqual({
      [DIR]: 'directory',
      [`${DIR}/notes.txt`]: 'mine',
    });
  });

  test('reports nothing to remove for a home that never had the plugin', async () => {
    const removal = await uninstallOnly({});

    expect(removal.outcome).toEqual({
      kind: 'returned',
      value: { ok: true, value: { path: DIR_PATH, alreadyInstalled: false } },
    });
    expect(entriesUnder(removal.tree, DIR)).toEqual({});
  });
});

describe('reading the owned Hermes Agent files', () => {
  const owned = async (seed: TreeSpec) =>
    (
      await differential({
        seed,
        ported: (environment) => describeOutcome(() => readOwnedHermesAgentFiles(environment)),
      })
    ).outcome;

  test('names the managed files a removal would delete, and nothing else', async () => {
    expect(await owned(managedFiles(DIR, 'dev'))).toEqual({
      kind: 'returned',
      value: { ok: true, value: buildHermesAgentPluginFiles('dev') },
    });
  });

  test('finds nothing in a home without the plugin directory', async () => {
    expect(await owned({})).toEqual({ kind: 'returned', value: { ok: true, value: [] } });
  });

  test('refuses the whole removal when one managed path is not ours', async () => {
    expect(
      await owned({ ...managedFiles(DIR, 'dev'), [`${DIR}/plugin.yaml`]: 'name: theirs\n' }),
    ).toEqual({
      kind: 'returned',
      value: {
        ok: false,
        error: {
          name: 'Error',
          message: `Refusing to remove unmanaged file at ${DIR_PATH}/plugin.yaml. Move or remove it.`,
        },
      },
    });
  });
});
