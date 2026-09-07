import { afterEach, describe, expect, test } from 'bun:test';
import { realpathSync, writeFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import {
  fetchHealth as portedHealth,
  fetchIntegrations as portedIntegrations,
  runIntegration as portedRunIntegration,
} from '@/gui/index';
import { getIntegrationDisplayName, installIntegrationMetadata } from '@/hosts/catalog';
import { mockVersionFetcher } from '../helpers';
import type { TreeSpec } from '../helpers/fixture-tree';
import { differential, expectSameSides } from '../helpers/host-differential';
import {
  createTempRoot,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
  snapshotHome,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * The three probes the dashboard opens on that reach outside the policy files: the integrations
 * table, the overview health strip and the installer the Integrations tab drives. Each helper reads
 * its home off the `Environment` it is handed, so every row runs over a seeded home with a stubbed
 * version fetcher — nothing here spawns a host CLI, and no probe reaches npm or the network.
 */

const PLUGIN_ID = 'cc-safety-net@cc-marketplace';
const CLAUDE_PLUGINS = '.claude/plugins/installed_plugins.json';

const installedPlugin = (enabled: boolean): TreeSpec => ({
  [CLAUDE_PLUGINS]: `${JSON.stringify({ plugins: { [PLUGIN_ID]: [{ scope: 'user' }] } })}\n`,
  '.claude/settings.json': `${JSON.stringify({ enabledPlugins: { [PLUGIN_ID]: enabled } })}\n`,
});

type Integrations = Awaited<ReturnType<typeof portedIntegrations>>;
type Health = Awaited<ReturnType<typeof portedHealth>>;

const UPDATE = { currentVersion: 'dev', latestVersion: '9.9.9', updateAvailable: true };

const integrationsOver = async (seed: TreeSpec) => {
  const outcome = expectSameSides(
    await differential({
      seed,
      ported: (environment) => portedIntegrations(environment, { fetcher: mockVersionFetcher }),
    }),
  ).outcome;
  if (outcome.kind !== 'returned') throw new Error(`fetchIntegrations threw: ${outcome.message}`);
  return outcome.value as Integrations;
};

const healthOver = async (seed: TreeSpec) => {
  const outcome = expectSameSides(
    await differential({
      seed,
      ported: (environment) =>
        portedHealth(environment, {
          fetcher: mockVersionFetcher,
          checkUpdates: async () => UPDATE,
        }),
    }),
  ).outcome;
  if (outcome.kind !== 'returned') throw new Error(`fetchHealth threw: ${outcome.message}`);
  return outcome.value as Health;
};

const statusOf = (status: Integrations, target: string) =>
  status.targets.find((entry) => entry.target === target)?.status;

describe('the GUI integrations probe', () => {
  afterEach(removeTempRoots);

  test('lists every catalog target in order with its display name and this build', async () => {
    const status = await integrationsOver({});

    expect(status.targets.map((entry) => entry.target)).toStrictEqual(
      installIntegrationMetadata.map((meta) => meta.id),
    );
    expect(status.targets.map((entry) => entry.label)).toStrictEqual(
      installIntegrationMetadata.map((meta) => getIntegrationDisplayName(meta.id)),
    );
    // The versions come from the stubbed fetcher, so the row proves the mapping and not a host.
    expect(status.targets.find((entry) => entry.target === 'claude-code')?.version).toBe('1.0.0');
    expect(status.system.version).toBe('dev');
    expect(status.system.platform).toBe(`${process.platform} ${process.arch}`);
  });

  test.each([
    ['active', true],
    ['disabled', false],
  ] as const)('reads the Claude Code plugin state off disk as %s', async (expected, enabled) => {
    expect(statusOf(await integrationsOver(installedPlugin(enabled)), 'claude-code')).toBe(
      expected,
    );
  });

  test('reports a plugin record it cannot parse as uninspected, not as absent', async () => {
    const unreadable = await integrationsOver({ [CLAUDE_PLUGINS]: 'nope' });

    expect(statusOf(unreadable, 'claude-code')).toBe('not-inspected');
    expect(statusOf(await integrationsOver({}), 'claude-code')).toBe('not-installed');
  });
});

describe('the GUI health probe', () => {
  afterEach(removeTempRoots);

  test('lists only the runtimes it detected and passes the update check through', async () => {
    const enabled = await healthOver(installedPlugin(true));
    const bare = await healthOver({});

    expect(enabled.update).toStrictEqual(UPDATE);
    expect(enabled.hooks).toContainEqual({
      platform: 'claude-code',
      label: getIntegrationDisplayName('claude-code'),
      configured: true,
    });
    // A runtime with nothing installed is absent from the strip rather than listed as inactive.
    expect(bare.hooks.map((hook) => hook.platform)).not.toContain('claude-code');
    expect(bare.update).toStrictEqual(UPDATE);
  });
});

describe('the GUI installer wrapper', () => {
  afterEach(removeTempRoots);

  const CURSOR_HOOKS = '.cursor/hooks.json';
  // Nothing this row runs may probe a host CLI, ask npm for a version or read what is configured
  // on the machine, so the three discovery inputs are answered before the install starts.
  const OVERRIDES = {
    probeTargets: () => false,
    fetchVersion: async () => null,
    detectConfiguredTargets: async () => [],
  };

  type Runner = typeof portedRunIntegration;

  const hooksFile = (tree: readonly { path: string; content?: string }[]) =>
    tree.find((entry) => entry.path === CURSOR_HOOKS)?.content ?? '';

  const homeFor = (label: string) => {
    const home = join(createTempRoot(`gui-install-${label}-`), 'home');
    isolationEnv(home);
    return home;
  };

  const folded = <T>(value: T, home: string) =>
    normalize(value, [
      [realpathSync(home), '<home>'],
      [home, '<home>'],
    ]);

  const lifecycle = (run: Runner, home: string) =>
    withProcessEnv(isolationEnv(home), async () => {
      const install = await run('install', 'cursor', OVERRIDES);
      const installed = snapshotHome(home);
      const uninstall = await run('uninstall', 'cursor', OVERRIDES);
      return folded({ install, installed, uninstall, removed: snapshotHome(home) }, home);
    });

  const bothSides = async (run: (runner: Runner, home: string) => Promise<unknown>) => {
    const ported = await run(portedRunIntegration, homeFor('ported'));
    recordPorted(ported);
    return ported;
  };

  test('installs and removes the target the GUI asked for, reporting what it wrote', async () => {
    const result = (await bothSides(lifecycle)) as Awaited<ReturnType<typeof lifecycle>>;

    expect(result.install).toStrictEqual({
      ok: true,
      output: `Installed Cursor hook in <home>/${CURSOR_HOOKS}`,
    });
    expect(hooksFile(result.installed)).toContain('cc-safety-net hook --cursor');
    expect(result.uninstall).toStrictEqual({
      ok: true,
      output: `Uninstalled Cursor hook from <home>/${CURSOR_HOOKS}`,
    });
    // The uninstall empties the hook list the install added; the runtime keeps its own file.
    expect(hooksFile(result.removed)).not.toContain('cc-safety-net');
  });

  test('reports a failed install with the error the installer printed', async () => {
    const result = (await bothSides((run, home) =>
      withProcessEnv(isolationEnv(home), async () => {
        // The suite runs as root, so an unwritable location is modelled as a file where the
        // installer needs a directory.
        writeFileSync(join(home, '.cursor'), 'not a directory\n');
        return folded(await run('install', 'cursor', OVERRIDES), home);
      }),
    )) as { ok: boolean; output: string };

    expect(result.ok).toBeFalse();
    expect(result.output).toContain(posix.join('<home>', '.cursor'));
  });

  test('serializes overlapping runs so neither captures the other output', async () => {
    const result = (await bothSides((run, home) =>
      withProcessEnv(isolationEnv(home), async () => {
        const first = run('install', 'cursor', OVERRIDES);
        const second = run('uninstall', 'cursor', OVERRIDES);
        return folded({ first: await first, second: await second, tree: snapshotHome(home) }, home);
      }),
    )) as {
      first: { ok: boolean; output: string };
      second: { ok: boolean; output: string };
      tree: { path: string }[];
    };

    // The install ran first and the uninstall undid it, which only holds if the queue kept them
    // in order rather than letting the second capture start inside the first.
    expect(result.first.output).toBe(
      `Installed Cursor hook in ${posix.join('<home>', CURSOR_HOOKS)}`,
    );
    expect(result.second.output).toBe(
      `Uninstalled Cursor hook from ${posix.join('<home>', CURSOR_HOOKS)}`,
    );
    expect(hooksFile(result.tree)).not.toContain('cc-safety-net');
  });

  test('leaves the console it borrowed exactly as it found it', async () => {
    const before = { log: console.log, error: console.error };

    await bothSides((run, home) =>
      withProcessEnv(isolationEnv(home), async () =>
        folded(await run('install', 'cursor', OVERRIDES), home),
      ),
    );

    expect(console.log).toBe(before.log);
    expect(console.error).toBe(before.error);
  });
});
