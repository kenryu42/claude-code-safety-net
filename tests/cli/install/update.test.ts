import { afterEach, expect, test } from 'bun:test';
import { join } from 'node:path';
import { expectSameFlow, type FlowSpec, runFlowDifferential } from '../../helpers/command-flow';
import { fileAt } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * `cc-safety-net update` over whatever is already installed: which integrations it finds, which
 * host CLIs it probes and drives, the caches it clears once up front, and the update nudge it
 * prints only for a persistent install. Both implementations run over identically seeded homes
 * with the same fake CLIs on `PATH`, so any divergence fails the row.
 */

const flow = async (spec: FlowSpec) => expectSameFlow(await runFlowDifferential(spec));

const NUDGE =
  'Update available: cc-safety-net dev → 9.9.9. Update this CLI with your package manager, e.g. `npm i -g cc-safety-net@latest` for a global install.';
const PERSISTENT_SCRIPT = '/opt/cc-safety-net/bin/cc-safety-net';
/** bunx names its cache entries after the running user; the suite's own id is the one it uses. */
const BUNX_ENTRY = `bunx-${process.getuid?.() ?? 0}-cc-safety-net@`;

/** Detection asks three host CLIs for their state; every row scripts that instead of spawning. */
const versions = (canned: Record<string, string> = {}) => ({
  fetchVersion: async (args: string[]) => canned[args.join(' ')] ?? null,
  checkLatestVersion: async () => ({
    currentVersion: 'dev',
    latestVersion: '9.9.9',
    updateAvailable: true,
  }),
  scriptPath: PERSISTENT_SCRIPT,
});

afterEach(removeTempRoots);

test('an empty home has nothing to update and still gets the nudge', async () => {
  const result = await flow({ invoke: 'update', options: () => versions() });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: [
      'No installed integrations found. Run `cc-safety-net install` to set one up.',
      '',
      NUDGE,
      '',
    ],
    errors: [],
    log: [],
  });
});

test('an unparseable argument fails before anything is detected', async () => {
  const result = await flow({ invoke: 'update', args: ['--x'], options: () => versions() });

  expect(result).toMatchObject({
    exitCode: 1,
    lines: [''],
    errors: ['Unknown option for update: --x'],
    log: [],
  });
});

const CURSOR_HOOKS = '.cursor/hooks.json';
const KIMI_CONFIG = '.kimi-code/config.toml';
const HERMES_DIR = '.hermes/plugins/cc-safety-net';
const NPX_ENTRY = '.npm/_npx/9f1/node_modules/cc-safety-net/package.json';
// Detected by the hook pattern, but not the canonical command the installer writes, so the
// update rewrites it instead of reporting it up to date.
const DRIFTED_KIMI_HOOK = `[[hooks]]
event = "PreToolUse"
command = "npx cc-safety-net hook --kimi-code"
`;

/** The four seeded integrations plus a Gemini extension whose CLI is not installed. */
async function seedInstalledHome() {
  const cursor = await flow({ invoke: 'install', args: ['--cursor'] });
  const hermes = await flow({
    invoke: 'install',
    args: ['--hermes-agent'],
    script: [{ command: 'hermes' }],
  });

  return {
    [CURSOR_HOOKS]: fileAt(cursor.tree, CURSOR_HOOKS) ?? '',
    [KIMI_CONFIG]: DRIFTED_KIMI_HOOK,
    [`${HERMES_DIR}/__init__.py`]: fileAt(hermes.tree, `${HERMES_DIR}/__init__.py`) ?? '',
    [`${HERMES_DIR}/plugin.yaml`]: fileAt(hermes.tree, `${HERMES_DIR}/plugin.yaml`) ?? '',
    '.claude/plugins/installed_plugins.json':
      '{"plugins":{"cc-safety-net@cc-marketplace":["kenryu42/cc-marketplace"]}}\n',
    '.claude/settings.json': '{"enabledPlugins":{"cc-safety-net@cc-marketplace":true}}\n',
    '.gemini/extensions/gemini-safety-net/gemini-extension.json': '{}\n',
    [NPX_ENTRY]: '{"name":"cc-safety-net"}\n',
  };
}

const UPDATE_REPORTS = [
  'Updated Claude Code integration',
  `Cursor hook up to date in <home>/${CURSOR_HOOKS}`,
  'Gemini CLI not found; skipped',
  `Updated Hermes Agent plugin at <home>/${HERMES_DIR}`,
  'Restart Hermes to apply the change.',
  `Updated Kimi Code hook in <home>/${KIMI_CONFIG}`,
];

test('every installed integration is updated in catalog order behind one cache clear', async () => {
  const result = await flow({
    invoke: 'update',
    seed: await seedInstalledHome(),
    script: [{ command: 'claude' }, { command: 'hermes' }],
    extraCommands: ['gemini'],
    options: () => versions(),
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: [...UPDATE_REPORTS, '', NUDGE, ''],
    errors: [],
    log: [
      'claude --version\t<root>',
      'gemini --version\t<root>',
      'hermes --version\t<root>',
      'claude plugin marketplace update cc-marketplace\t<root>',
      'claude plugin update cc-safety-net@cc-marketplace\t<root>',
      'hermes plugins enable cc-safety-net --no-allow-tool-override\t<root>',
    ].sort(),
  });
  expect(result.tree.map((entry) => entry.path)).not.toContain('.npm/_npx/9f1');
  expect(fileAt(result.tree, KIMI_CONFIG)).toBe(
    `${DRIFTED_KIMI_HOOK}\n[[hooks]]\nevent = "PreToolUse"\ncommand = "npx -y cc-safety-net hook --kimi-code"\n`,
  );
});

test('one failing target is reported as an error while the rest still update', async () => {
  const result = await flow({
    invoke: 'update',
    seed: await seedInstalledHome(),
    script: [
      { command: 'claude', args: ['plugin', 'update'], exit: 1, stderr: 'marketplace gone\n' },
      { command: 'claude' },
      { command: 'hermes' },
    ],
    extraCommands: ['gemini'],
    options: () => versions(),
  });

  expect(result.exitCode).toBe(1);
  expect(result.lines).toEqual([
    ...UPDATE_REPORTS.filter((line) => line !== 'Updated Claude Code integration'),
    '',
    NUDGE,
    '',
  ]);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toStartWith(
    'Failed to run claude plugin update cc-safety-net@cc-marketplace (exit 1)',
  );
});

test('an npx script path skips the registry check entirely', async () => {
  const result = await flow({
    invoke: 'update',
    options: (home) => ({
      fetchVersion: async () => null,
      scriptPath: join(home, '..', '_npx', 'abc', 'node_modules', '.bin', 'cc-safety-net'),
      checkLatestVersion: () => {
        throw new Error('the registry must not be asked from an npx cache path');
      },
    }),
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: ['No installed integrations found. Run `cc-safety-net install` to set one up.', ''],
    errors: [],
  });
});

test('the bunx entry the update runs from survives while the stale one goes', async () => {
  const result = await flow({
    invoke: 'update',
    seedTmp: {
      [`${BUNX_ENTRY}latest/running.txt`]: 'running\n',
      [`${BUNX_ENTRY}1.2.3/stale.txt`]: 'stale\n',
      'bunx-0-other-tool@latest/keep.txt': 'keep\n',
    },
    options: (home) => ({
      fetchVersion: async () => null,
      scriptPath: join(
        home,
        '..',
        'tmp',
        `${BUNX_ENTRY}latest`,
        'node_modules',
        '.bin',
        'cc-safety-net',
      ),
      checkLatestVersion: () => {
        throw new Error('the registry must not be asked from a bunx cache path');
      },
    }),
  });

  expect(result.exitCode).toBe(0);
  expect(result.tmp.map((entry) => entry.path)).toEqual([
    `${BUNX_ENTRY}latest`,
    `${BUNX_ENTRY}latest/running.txt`,
    'bunx-0-other-tool@latest',
    'bunx-0-other-tool@latest/keep.txt',
  ]);
});

test('a persistent install clears its bunx entry and prints the nudge', async () => {
  const result = await flow({
    invoke: 'update',
    seedTmp: { [`${BUNX_ENTRY}latest/x.txt`]: 'stale\n' },
    options: () => versions(),
  });

  expect(result.lines).toEqual([
    'No installed integrations found. Run `cc-safety-net install` to set one up.',
    '',
    NUDGE,
    '',
  ]);
  expect(result.tmp).toEqual([]);
});

const CODEX_LIST =
  '  cc-safety-net  https://github.com/kenryu42/cc-safety-net.git  installed, enabled\n  safety-net@cc-marketplace  https://github.com/kenryu42/cc-safety-net.git  installed, enabled\n';

test('a Codex plugin list with a legacy row updates Codex and removes the old plugin', async () => {
  const result = await flow({
    invoke: 'update',
    script: [{ command: 'codex' }],
    options: () => versions({ 'codex plugin list': CODEX_LIST }),
  });

  expect(result).toMatchObject({
    exitCode: 0,
    warnings: [],
    log: [
      'codex --version\t<root>',
      'codex plugin marketplace upgrade cc-marketplace\t<root>',
      'codex plugin add cc-safety-net@cc-marketplace\t<root>',
      'codex plugin remove safety-net@cc-marketplace\t<root>',
    ].sort(),
  });
  expect(result.lines[0]).toBe('Updated Codex integration');
});

test('a Copilot plugin checkout on disk is enough to update Copilot', async () => {
  const result = await flow({
    invoke: 'update',
    seed: { '.copilot/installed-plugins/cc-marketplace/cc-safety-net/plugin.json': '{}\n' },
    script: [
      {
        command: 'copilot',
        args: ['plugin', 'list'],
        stdout: 'cc-safety-net@cc-marketplace  enabled\n',
      },
      { command: 'copilot' },
    ],
    options: () => versions(),
  });

  expect(result).toMatchObject({
    exitCode: 0,
    log: [
      'copilot --binary-version\t<root>',
      'copilot plugin list\t<root>',
      'copilot plugin marketplace update cc-marketplace\t<root>',
      'copilot plugin update cc-safety-net@cc-marketplace\t<root>',
    ].sort(),
  });
  expect(result.lines[0]).toBe('Updated GitHub Copilot CLI integration');
});
