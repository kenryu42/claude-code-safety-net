import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { AMP_MANAGED_HEADER } from '@/hosts/amp/artifact';
import {
  ampArtifactCandidates,
  getAmpPluginPath,
  installAmp,
  resolveAmpArtifactPath,
  uninstallAmp,
} from '@/hosts/amp/install';
import type { AmpRunner } from '@/hosts/amp/run';
import type { InstallResult } from '@/hosts/install/types';
import { AMP_CLONE_REF, type AmpScript, createScriptedAmpRunner } from '../../helpers/amp-runner';
import { describeOutcome, type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import { differential, expectSameSides, fileAt } from '../../helpers/host-differential';
import { createTempRoot, describeAsyncOutcome, removeTempRoots } from '../../helpers/temp-home';

/**
 * Amp install has no config file: the plugin is pushed into the account's hosted Personal Plugins
 * repository, so what is contract here is the exact command sequence, the bytes staged into the
 * throwaway checkout (artifact plus the policy the plugin reads on an Orb), and the refusals that
 * keep it off anything it did not write. Every subprocess is scripted, so nothing here can reach
 * a real repository.
 */

const ARTIFACT = `${AMP_MANAGED_HEADER}\n// version: dev\nexport default function plugin() {}\n`;
const ENTRY = 'cc-safety-net/index.ts';
const LEGACY = 'cc-safety-net.ts';
const LOCAL_PLUGINS = '.config/amp/plugins';
const PLUGIN_PATH = `${AMP_CLONE_REF}/cc-safety-net`;
const CHECKOUT = '<home>/tmp/cc-safety-net-amp-<id>';
const POLICY_FILE = '.cc-safety-net/policy.json';

const REPOSITORIES = { command: ['amp', 'plugins', 'repositories', '--json'], cwd: undefined };
const CLONE = { command: ['amp', 'clone', 'user-plugins', CHECKOUT], cwd: undefined };
const STATUS = { command: ['git', 'status', '--porcelain'], cwd: CHECKOUT };
const PUSH = { command: ['git', 'push', 'origin', 'HEAD'], cwd: CHECKOUT };
const stage = (...pathspecs: string[]) => ({
  command: ['git', 'add', '--', ...pathspecs],
  cwd: CHECKOUT,
});
const commit = (message: string) => ({
  command: [
    'git',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'user.name=cc-safety-net',
    '-c',
    'user.email=cc-safety-net@localhost',
    'commit',
    '-m',
    message,
  ],
  cwd: CHECKOUT,
});

type Row = AmpScript & { home?: TreeSpec; action?: 'uninstall' };

/**
 * One install or uninstall against both implementations: the same home seed, the same scripted
 * hosted repository, and the same fixture artifact, which lives outside either home because it is
 * input the CLI ships rather than anything the install writes.
 */
async function ampRow(row: Row = {}) {
  const artifactRoot = createTempRoot('next-amp-artifact-');
  writeTree(artifactRoot, { 'index.ts': ARTIFACT });
  const drive = async (act: (run: AmpRunner) => Promise<InstallResult>) => {
    const runner = createScriptedAmpRunner(row);
    return {
      result: await describeAsyncOutcome(() => act(runner.run)),
      calls: runner.calls,
      snapshots: runner.snapshots,
    };
  };
  const side = expectSameSides(
    await differential({
      seed: row.home ?? {},
      ported: (environment) =>
        drive((run) =>
          row.action === 'uninstall'
            ? uninstallAmp(environment, run)
            : installAmp(environment, join(artifactRoot, 'index.ts'), run),
        ),
    }),
  );
  if (side.outcome.kind === 'threw') throw new Error(side.outcome.message);
  return { ...side.outcome.value, tree: side.tree };
}

const installed = (row: Awaited<ReturnType<typeof ampRow>>, pathspecs = [ENTRY]) =>
  fileAt(row.snapshots[`git add -- ${pathspecs.join(' ')}`], ENTRY);

afterEach(removeTempRoots);

describe('publishing the plugin to the hosted repository', () => {
  test('writes the artifact into a fresh checkout, commits it and pushes', async () => {
    const row = await ampRow();
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: false },
    });
    expect(row.calls).toEqual([
      REPOSITORIES,
      CLONE,
      stage(ENTRY),
      STATUS,
      commit('chore: update cc-safety-net plugin to vdev'),
      PUSH,
    ]);
    expect(installed(row)).toBe(ARTIFACT);
  });

  test('appends the user policy so the plugin still has it on an Orb', async () => {
    const row = await ampRow({
      home: {
        [POLICY_FILE]:
          '{"version":1,"safety":{"level":"strict"},"secret_protection":{"deny_paths":["~/vault"]}}',
      },
    });
    expect(installed(row)?.slice(ARTIFACT.length)).toBe(
      ';globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = {"version":1,"safety":{"level":"strict","overrides":{}},"workflow":{"worktree_mode":false},"destructive_command_protection":{"enabled":true,"overrides":{},"allow_paths":[]},"secret_protection":{"enabled":true,"overrides":{},"deny_paths":["~/vault"],"allow_paths":[]},"audit":{"retention_days":30}};\n',
    );
  });

  test.each([
    ['a policy file that is not JSON at all', 'not json'],
    ['a policy file holding a JSON array', '[]'],
  ])('publishes the artifact alone with %s', async (_case, policy) => {
    expect(installed(await ampRow({ home: { [POLICY_FILE]: policy } }))).toBe(ARTIFACT);
  });

  test('touches no git command when the hosted copy already matches', async () => {
    const row = await ampRow({ seed: { [ENTRY]: ARTIFACT } });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: true },
    });
    expect(row.calls).toEqual([REPOSITORIES, CLONE]);
  });

  test('migrates a managed legacy root file into the directory plugin', async () => {
    const row = await ampRow({ seed: { [LEGACY]: ARTIFACT } });
    expect(row.calls).toEqual([
      REPOSITORIES,
      CLONE,
      stage(ENTRY, LEGACY),
      STATUS,
      commit('chore: update cc-safety-net plugin to vdev'),
      PUSH,
    ]);
    expect(row.snapshots[`git add -- ${ENTRY} ${LEGACY}`]?.map((entry) => entry.path)).toEqual([
      'cc-safety-net',
      ENTRY,
    ]);
    expect(installed(row, [ENTRY, LEGACY])).toBe(ARTIFACT);
  });

  test('reports the repository as up to date when staging changed nothing', async () => {
    // Under core.autocrlf a reclone smudges the committed LF plugin, so the artifact differs on
    // disk while `git add` renormalizes it straight back to HEAD.
    const row = await ampRow({ porcelain: '' });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: true },
    });
    expect(row.calls).toEqual([REPOSITORIES, CLONE, stage(ENTRY), STATUS]);
  });

  test('surfaces the failing step, so a rejected push is not reported as installed', async () => {
    const row = await ampRow({ failing: ['git push origin HEAD'] });
    expect(row.result).toEqual({
      kind: 'threw',
      message: 'Failed to run git push origin HEAD (exit 1).\nscripted failure',
    });
  });
});

describe('refusing a hosted repository that holds something else', () => {
  test.each([
    [
      'an unmanaged legacy root file',
      { [LEGACY]: 'export default function other() {}\n' },
      `Refusing to overwrite unmanaged file ${LEGACY} in your Amp personal plugins repository. Remove it there and rerun install --amp.`,
    ],
    [
      'a symlink where the plugin directory belongs',
      { 'cc-safety-net': { symlink: 'somewhere-else' } },
      'Refusing to overwrite cc-safety-net in your Amp personal plugins repository: not a regular directory. Remove it there and rerun install --amp.',
    ],
    [
      'an unmanaged entry inside the plugin directory',
      { [ENTRY]: 'export default function other() {}\n' },
      `Refusing to overwrite unmanaged file ${ENTRY} in your Amp personal plugins repository. Remove it there and rerun install --amp.`,
    ],
  ])('leaves %s alone', async (_case, seed: TreeSpec, message) => {
    const row = await ampRow({ seed });
    expect(row.result).toEqual({ kind: 'threw', message });
    expect(row.calls).toEqual([REPOSITORIES, CLONE]);
  });
});

describe('reading which repository to clone', () => {
  test.each([
    [
      'no amp CLI on PATH',
      { status: null, errorCode: 'ENOENT', stderr: 'spawn amp ENOENT' },
      'Amp CLI not found. Install the amp CLI, sign in with "amp login", and rerun install --amp.\nspawn amp ENOENT',
    ],
    [
      'a signed-out CLI',
      { status: 1, stdout: 'x' },
      'Failed to run amp plugins repositories --json (exit 1). Sign in with "amp login" and rerun install --amp.\nx',
    ],
    [
      'an account whose personal repository is read-only',
      'none-writable' as const,
      'Your Amp account has no writable Personal Plugins repository. Sign in with "amp login", open Amp once to create it, and rerun install --amp.',
    ],
  ])('stops at %s', async (_case, repositories: AmpScript['repositories'], message) => {
    const row = await ampRow({ repositories });
    expect(row.result).toEqual({ kind: 'threw', message });
    expect(row.calls).toEqual([REPOSITORIES]);
  });
});

describe('clearing a local plugin that masks the personal one', () => {
  const local = (relative: string) => `<home>/${LOCAL_PLUGINS}/${relative}`;
  const masking = (relative: string) =>
    `Local Amp plugin ${local(relative)} is not a managed copy and masks the personal plugin. Remove it and rerun install --amp.`;

  test('names the same system-scope path on both sides', async () => {
    expect(
      expectSameSides(
        await differential({
          seed: {},
          ported: (environment) => getAmpPluginPath(environment),
        }),
      ).outcome,
    ).toEqual({ kind: 'returned', value: local(LEGACY) });
  });

  test.each([
    ['a managed copy of the legacy file', { [`${LOCAL_PLUGINS}/${LEGACY}`]: ARTIFACT }],
    ['a managed copy of the directory plugin', { [`${LOCAL_PLUGINS}/${ENTRY}`]: ARTIFACT }],
  ])('removes %s once the personal plugin is published', async (_case, home: TreeSpec) => {
    const row = await ampRow({ home });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: false },
    });
    expect(row.tree.map((entry) => entry.path)).toEqual([
      '.config',
      '.config/amp',
      LOCAL_PLUGINS,
      'tmp',
    ]);
  });

  test.each([
    [
      'a hand-written local file',
      { [`${LOCAL_PLUGINS}/${LEGACY}`]: 'export default function mine() {}\n' },
      masking(LEGACY),
      `${LOCAL_PLUGINS}/${LEGACY}`,
    ],
    [
      'a local directory holding more than our entry',
      {
        [`${LOCAL_PLUGINS}/${ENTRY}`]: ARTIFACT,
        [`${LOCAL_PLUGINS}/cc-safety-net/README.md`]: 'notes\n',
      },
      masking('cc-safety-net'),
      `${LOCAL_PLUGINS}/cc-safety-net/README.md`,
    ],
  ])('fails the install on %s and keeps it', async (_case, home: TreeSpec, message, kept) => {
    const row = await ampRow({ home });
    expect(row.result).toEqual({ kind: 'threw', message });
    expect(row.tree.map((entry) => entry.path)).toContain(kept);
  });

  test('keeps an unmanaged local plugin on uninstall, with nothing left to mask', async () => {
    const seeded = { [`${LOCAL_PLUGINS}/${LEGACY}`]: 'export default function mine() {}\n' };
    const row = await ampRow({ action: 'uninstall', home: seeded });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: false },
    });
    expect(fileAt(row.tree, `${LOCAL_PLUGINS}/${LEGACY}`)).toBe(
      seeded[`${LOCAL_PLUGINS}/${LEGACY}`],
    );
  });
});

describe('removing the plugin from the hosted repository', () => {
  const removal = commit('chore: remove cc-safety-net plugin vdev');

  test('removes only our entry from the directory plugin', async () => {
    const row = await ampRow({
      action: 'uninstall',
      seed: { [ENTRY]: ARTIFACT, 'cc-safety-net/README.md': 'notes\n' },
    });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: true },
    });
    expect(row.calls).toEqual([
      REPOSITORIES,
      CLONE,
      { command: ['git', 'rm', '--', ENTRY], cwd: CHECKOUT },
      STATUS,
      removal,
      PUSH,
    ]);
  });

  test('names the legacy root file when the checkout never migrated', async () => {
    const row = await ampRow({ action: 'uninstall', seed: { [LEGACY]: ARTIFACT } });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: `${AMP_CLONE_REF}/${LEGACY}`, alreadyInstalled: true },
    });
    expect(row.calls).toEqual([
      REPOSITORIES,
      CLONE,
      { command: ['git', 'rm', '--', LEGACY], cwd: CHECKOUT },
      STATUS,
      removal,
      PUSH,
    ]);
  });

  test('commits nothing when the repository holds no plugin of ours', async () => {
    const row = await ampRow({ action: 'uninstall' });
    expect(row.result).toEqual({
      kind: 'returned',
      value: { path: PLUGIN_PATH, alreadyInstalled: false },
    });
    expect(row.calls).toEqual([REPOSITORIES, CLONE]);
  });
});

describe('finding the packaged artifact', () => {
  test('resolves the same shipped dist path from either module', () => {
    const candidates = ampArtifactCandidates();
    // The module sits three directories under the repository root, so the packaged artifact the
    // release stamps is the one an install without an explicit path publishes.
    expect(candidates.at(-1)).toBe(join(import.meta.dir, '..', '..', '..', 'dist', 'amp', ENTRY));
  });

  test.each([
    ['the first candidate that is a regular file', ['missing.ts', 'artifact/index.ts'], 1],
    ['nothing when only a directory sits there', ['artifact', 'artifact/index.ts'], 1],
  ])('picks %s', (_case, relatives, expected) => {
    const root = createTempRoot('next-amp-candidates-');
    writeTree(root, { 'artifact/index.ts': ARTIFACT });
    const candidates = relatives.map((relative) => join(root, relative));
    expect(resolveAmpArtifactPath(candidates)).toBe(candidates[expected] as string);
  });

  test('reports a missing packaged artifact the same way', () => {
    const candidates = [join(createTempRoot('next-amp-candidates-'), 'index.ts')];
    expect(describeOutcome(() => resolveAmpArtifactPath(candidates))).toEqual({
      ok: false,
      error: {
        name: 'Error',
        message: 'Packaged Amp plugin artifact not found. Reinstall cc-safety-net and try again.',
      },
    });
  });
});
