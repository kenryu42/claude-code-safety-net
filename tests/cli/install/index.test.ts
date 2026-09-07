import { afterEach, expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AMP_MANAGED_HEADER } from '@/hosts/amp/artifact';
import type { InstallTarget } from '@/hosts/install/targets';
import { type FlowSpec, runFlowDifferential } from '../../helpers/command-flow';
import { type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import { fileAt } from '../../helpers/host-differential';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';

/**
 * `cc-safety-net install|uninstall --<target>` end to end: the argument parsing, the host CLI
 * calls, the files written and removed, and every line the command prints. Each row runs the flow
 * over a seeded home with fake CLIs on `PATH`, so a change in a message, a command, an exit code
 * or a byte fails the row.
 */

const flow = async (spec: FlowSpec) => await runFlowDifferential(spec);

const TARGET_FLAGS =
  '--amp, --agy-cli, --claude-code, --codex, --cursor, --gemini-cli, --copilot-cli, --grok-build, --hermes-agent, --kimi-code, --openclaw, --opencode, --pi';

afterEach(removeTempRoots);

test('a bare non-interactive install names every target flag', async () => {
  const result = await flow({ invoke: 'install' });

  expect(result).toMatchObject({
    exitCode: 1,
    lines: [''],
    errors: [`Choose exactly one install target: ${TARGET_FLAGS}`],
  });
});

test('two targets are as unusable as none, and uninstall says uninstall', async () => {
  const result = await flow({ invoke: 'uninstall', args: ['--cursor', '--amp'] });

  expect(result).toMatchObject({
    exitCode: 1,
    errors: [`Choose exactly one uninstall target: ${TARGET_FLAGS}`],
  });
});

test('an unknown flag is reported by the parser', async () => {
  const result = await flow({ invoke: 'install', args: ['--nope'] });

  expect(result).toMatchObject({
    exitCode: 1,
    errors: ['Unknown option for install: --nope'],
  });
});

/** An npx cache entry of ours, which every hook-config install clears before it writes. */
const NPX_ENTRY = '.npm/_npx/dd7a/node_modules/cc-safety-net/package.json';

const CONFIG_HOSTS = [
  { flag: '--cursor', name: 'Cursor', file: '.cursor/hooks.json' },
  { flag: '--agy-cli', name: 'Antigravity CLI', file: '.gemini/config/hooks.json' },
  { flag: '--grok-build', name: 'Grok Build', file: '.grok/hooks/cc-safety-net.json' },
  { flag: '--kimi-code', name: 'Kimi Code', file: '.kimi-code/config.toml' },
] as const;

for (const host of CONFIG_HOSTS) {
  test(`${host.name} installs, reports the second run, and uninstalls`, async () => {
    const installed = await flow({
      invoke: 'install',
      args: [host.flag],
      seed: { [NPX_ENTRY]: '{"name":"cc-safety-net"}\n' },
    });
    const written = fileAt(installed.tree, host.file);

    expect({ ...installed, tree: undefined, tmp: undefined }).toMatchObject({
      exitCode: 0,
      lines: [`Installed ${host.name} hook in <home>/${host.file}`, ''],
      errors: [],
      log: [],
    });
    expect(written).toBeString();
    // The stale npx entry is gone with the cache directory itself left in place.
    expect(installed.tree.map((entry) => entry.path)).toContain('.npm/_npx');
    expect(installed.tree.map((entry) => entry.path)).not.toContain('.npm/_npx/dd7a');

    const again = await flow({
      invoke: 'install',
      args: [host.flag],
      seed: { [host.file]: written ?? '' },
    });
    expect(again.lines).toEqual([`${host.name} hook already installed in <home>/${host.file}`, '']);
    expect(fileAt(again.tree, host.file)).toBe(written);

    const removed = await flow({
      invoke: 'uninstall',
      args: [host.flag],
      seed: { [host.file]: written ?? '' },
    });
    expect(removed.lines).toEqual([`Uninstalled ${host.name} hook from <home>/${host.file}`, '']);

    const nothing = await flow({ invoke: 'uninstall', args: [host.flag] });
    expect(nothing.lines).toEqual([`${host.name} hook not installed in <home>/${host.file}`, '']);
    expect(nothing.exitCode).toBe(0);
  });
}

test('a file where the config directory belongs stops the install', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--cursor'],
    seed: { '.cursor': 'not a directory\n' },
  });

  expect(result).toMatchObject({
    exitCode: 1,
    errors: ["EEXIST: file already exists, mkdir '<home>/.cursor'"],
  });
});

test('a file part-way down the config path gets the parent-path hint', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--agy-cli'],
    seed: { '.gemini': 'not a directory\n' },
  });

  expect(result.exitCode).toBe(1);
  expect(result.errors[0]).toEndWith('\nCheck that every parent path component is a directory.');
});

/** The seeded copy of what a previous run wrote, so the next row starts from a real install. */
function filesUnder(tree: readonly { path: string; content?: string }[], prefix: string) {
  return Object.fromEntries(
    tree
      .filter((entry) => entry.path.startsWith(prefix) && entry.content !== undefined)
      .map((entry) => [entry.path, entry.content ?? '']),
  );
}

test('Kimi Code offers the native plugin instead of the global hook', async () => {
  const instructions = await flow({
    invoke: 'install',
    args: ['--kimi-code'],
    options: () => ({ selectKimiInstallMethod: async () => 'plugin' as const }),
  });

  expect(instructions.exitCode).toBe(0);
  expect(instructions.lines[0]).toBe('Install CC Safety Net as a native Kimi Code plugin:');
  expect(instructions.lines.join('\n')).toContain(
    '/plugins install https://github.com/kenryu42/cc-safety-net',
  );
  expect(instructions.lines.join('\n')).not.toContain('CAUTION');
  expect(instructions.tree.map((entry) => entry.path)).not.toContain('.kimi-code');

  const cancelled = await flow({
    invoke: 'install',
    args: ['--kimi-code'],
    options: () => ({ selectKimiInstallMethod: async () => null }),
  });

  expect(cancelled.lines).toEqual(['Cancelled: Kimi Code integration was not installed.', '']);
  expect(cancelled.tree.map((entry) => entry.path)).not.toContain('.kimi-code');
});

test('the plugin instructions warn while the global Kimi Code hook is still configured', async () => {
  const configured = await flow({ invoke: 'install', args: ['--kimi-code'] });
  const seed = filesUnder(configured.tree, '.kimi-code/');

  const caution = await flow({
    invoke: 'install',
    args: ['--kimi-code'],
    seed,
    options: () => ({ selectKimiInstallMethod: async () => 'plugin' as const }),
  });

  expect(caution.lines.join('\n')).toContain(
    'CAUTION: the global Kimi Code hook is installed and will run alongside the plugin.',
  );
  expect(filesUnder(caution.tree, '.kimi-code/')).toEqual(seed);
});

const HERMES_DIR = '.hermes/plugins/cc-safety-net';
const HERMES_ENABLE = 'hermes plugins enable cc-safety-net --no-allow-tool-override\t<root>';

test('Hermes Agent writes the shim and enables it through the CLI', async () => {
  const script = [{ command: 'hermes', args: ['plugins', 'enable'] }];
  const installed = await flow({ invoke: 'install', args: ['--hermes-agent'], script });

  expect(installed).toMatchObject({
    exitCode: 0,
    lines: [
      `Installed Hermes Agent plugin at <home>/${HERMES_DIR}`,
      'Restart Hermes to apply the change.',
      '',
    ],
    log: [HERMES_ENABLE],
  });
  const shim = filesUnder(installed.tree, `${HERMES_DIR}/`);
  expect(Object.keys(shim)).toEqual([`${HERMES_DIR}/__init__.py`, `${HERMES_DIR}/plugin.yaml`]);

  const enabled = await flow({
    invoke: 'install',
    args: ['--hermes-agent'],
    script,
    seed: { ...shim, '.hermes/config.yaml': 'plugins:\n  enabled:\n    - cc-safety-net\n' },
  });

  expect(enabled.lines).toEqual([
    `Hermes Agent plugin already installed at <home>/${HERMES_DIR}`,
    '',
  ]);
  expect(enabled.log).toEqual([HERMES_ENABLE]);
});

test('a failed Hermes disable is warned about and the files go anyway', async () => {
  const installed = await flow({
    invoke: 'install',
    args: ['--hermes-agent'],
    script: [{ command: 'hermes', args: ['plugins', 'enable'] }],
  });
  const removed = await flow({
    invoke: 'uninstall',
    args: ['--hermes-agent'],
    seed: filesUnder(installed.tree, `${HERMES_DIR}/`),
    script: [{ command: 'hermes', args: ['plugins', 'disable'], exit: 1, stderr: 'nope\n' }],
  });

  expect(removed.exitCode).toBe(0);
  expect(removed.lines).toEqual([
    `Uninstalled Hermes Agent plugin from <home>/${HERMES_DIR}`,
    'Restart Hermes to apply the change.',
    '',
  ]);
  expect(removed.warnings).toHaveLength(1);
  expect(removed.warnings[0]).toEndWith(
    '\nRemoving the plugin files anyway; cc-safety-net may still be listed in the Hermes config.',
  );
  expect(removed.tree.map((entry) => entry.path)).not.toContain(HERMES_DIR);
});

const CLAUDE_PLUGIN = 'cc-safety-net@cc-marketplace';
const CLAUDE_LEGACY = 'safety-net@cc-marketplace';
const claudeCall = (rest: string) => `claude plugin ${rest}\t<root>`;
const installedPlugins = (...ids: readonly string[]) =>
  `${JSON.stringify({ plugins: Object.fromEntries(ids.map((id) => [id, ['kenryu42/cc-marketplace']])) })}\n`;
const enabledPlugins = (enabled: boolean) =>
  `${JSON.stringify({ enabledPlugins: { [CLAUDE_PLUGIN]: enabled } })}\n`;

test('Claude Code adds the marketplace, then updates and enables what is already there', async () => {
  const script = [{ command: 'claude' }];
  const fresh = await flow({ invoke: 'install', args: ['--claude-code'], script });

  expect(fresh).toMatchObject({
    exitCode: 0,
    lines: ['Installed Claude Code integration', ''],
    log: [
      claudeCall('marketplace add kenryu42/cc-marketplace'),
      claudeCall('marketplace update cc-marketplace'),
      claudeCall(`install ${CLAUDE_PLUGIN}`),
    ].sort(),
  });

  const updated = await flow({
    invoke: 'install',
    args: ['--claude-code'],
    script,
    seed: {
      '.claude/plugins/installed_plugins.json': installedPlugins(CLAUDE_PLUGIN),
      '.claude/settings.json': enabledPlugins(true),
    },
  });

  expect(updated).toMatchObject({
    exitCode: 0,
    lines: ['Updated Claude Code integration', ''],
    log: [
      claudeCall('marketplace update cc-marketplace'),
      claudeCall(`update ${CLAUDE_PLUGIN}`),
    ].sort(),
  });

  const reEnabled = await flow({
    invoke: 'install',
    args: ['--claude-code'],
    script,
    seed: {
      '.claude/plugins/installed_plugins.json': installedPlugins(CLAUDE_PLUGIN),
      '.claude/settings.json': enabledPlugins(false),
    },
  });

  expect(reEnabled.log).toEqual(
    [
      claudeCall('marketplace update cc-marketplace'),
      claudeCall(`update ${CLAUDE_PLUGIN}`),
      claudeCall(`enable ${CLAUDE_PLUGIN}`),
    ].sort(),
  );
});

test('the pre-rename Claude Code plugin is cleaned up, and a failed cleanup only warns', async () => {
  const seed = {
    '.claude/plugins/installed_plugins.json': installedPlugins(CLAUDE_PLUGIN, CLAUDE_LEGACY),
    '.claude/settings.json': enabledPlugins(true),
  };
  const cleaned = await flow({
    invoke: 'install',
    args: ['--claude-code'],
    script: [{ command: 'claude' }],
    seed,
  });

  expect(cleaned).toMatchObject({
    exitCode: 0,
    warnings: [],
    log: [
      claudeCall('marketplace update cc-marketplace'),
      claudeCall(`update ${CLAUDE_PLUGIN}`),
      claudeCall(`uninstall ${CLAUDE_LEGACY}`),
    ].sort(),
  });

  const warned = await flow({
    invoke: 'install',
    args: ['--claude-code'],
    seed,
    script: [
      { command: 'claude', args: ['plugin', 'uninstall'], exit: 1, stderr: 'no such plugin\n' },
      { command: 'claude' },
    ],
  });

  expect(warned.exitCode).toBe(0);
  expect(warned.lines).toEqual(['Updated Claude Code integration', '']);
  expect(warned.warnings).toHaveLength(1);
  expect(warned.warnings[0]).toStartWith(`Failed to run claude plugin uninstall ${CLAUDE_LEGACY}`);
});

test('uninstalling Claude Code removes the plugin and the marketplace', async () => {
  const result = await flow({
    invoke: 'uninstall',
    args: ['--claude-code'],
    script: [{ command: 'claude' }],
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: ['Uninstalled Claude Code integration', ''],
    log: [
      claudeCall(`uninstall ${CLAUDE_PLUGIN}`),
      claudeCall('marketplace remove cc-marketplace'),
    ].sort(),
  });
});

const CODEX_TRUST =
  'Start Codex, open `/hooks`, select the cc-safety-net PreToolUse hook, and press `t` to trust it.';
const codexCall = (rest: string) => `codex plugin ${rest}\t<root>`;
const codexScript = (listOutput: string) => [
  { command: 'codex', args: ['plugin', 'list'], stdout: listOutput },
  { command: 'codex' },
];

test('Codex adds the marketplace only when its plugin list has none', async () => {
  const fresh = await flow({
    invoke: 'install',
    args: ['--codex'],
    script: codexScript('No marketplaces registered.\n'),
  });

  expect(fresh).toMatchObject({
    exitCode: 0,
    lines: ['Installed Codex integration', CODEX_TRUST, ''],
    log: [
      codexCall('list'),
      codexCall('marketplace add kenryu42/cc-marketplace'),
      codexCall(`add ${CLAUDE_PLUGIN}`),
    ].sort(),
  });

  const registered = await flow({
    invoke: 'install',
    args: ['--codex'],
    script: codexScript(
      'Marketplace `cc-marketplace`\n  cc-safety-net  https://x  not installed\n',
    ),
  });

  expect(registered.lines).toEqual(['Installed Codex integration', CODEX_TRUST, '']);
  expect(registered.log).toEqual(
    [
      codexCall('list'),
      codexCall('marketplace upgrade cc-marketplace'),
      codexCall(`add ${CLAUDE_PLUGIN}`),
    ].sort(),
  );
});

test('an installed Codex row updates, and a legacy row is removed afterwards', async () => {
  const updated = await flow({
    invoke: 'install',
    args: ['--codex'],
    script: codexScript('  cc-safety-net  https://x  installed, enabled\n'),
  });

  expect(updated.lines).toEqual(['Updated Codex integration', CODEX_TRUST, '']);

  const legacy = await flow({
    invoke: 'install',
    args: ['--codex'],
    script: codexScript(
      '  cc-safety-net  https://x  installed, enabled\n  safety-net@cc-marketplace  https://x  installed, enabled\n',
    ),
  });

  expect(legacy).toMatchObject({
    exitCode: 0,
    warnings: [],
    log: [
      codexCall('list'),
      codexCall('marketplace upgrade cc-marketplace'),
      codexCall(`add ${CLAUDE_PLUGIN}`),
      codexCall(`remove ${CLAUDE_LEGACY}`),
    ].sort(),
  });
});

test('Copilot CLI installs the plugin and flips its disabled flag in place', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--copilot-cli'],
    script: [
      { command: 'copilot', args: ['plugin', 'list'], stdout: 'No plugins installed\n' },
      { command: 'copilot', args: ['plugin', 'marketplace', 'list'], stdout: 'cc-marketplace\n' },
      { command: 'copilot' },
    ],
    seed: {
      '.copilot/settings.json': `{\n  // comment\n  "enabledPlugins": { "${CLAUDE_PLUGIN}": false }\n}\n`,
    },
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: [
      'Installed GitHub Copilot CLI integration',
      `Enabled ${CLAUDE_PLUGIN} plugin in <home>/.copilot/settings.json`,
      '',
    ],
    log: [
      'copilot plugin list\t<root>',
      'copilot plugin marketplace list\t<root>',
      'copilot plugin marketplace update cc-marketplace\t<root>',
      `copilot plugin install ${CLAUDE_PLUGIN}\t<root>`,
    ].sort(),
  });
  expect(fileAt(result.tree, '.copilot/settings.json')).toBe(
    `{\n  // comment\n  "enabledPlugins": { "${CLAUDE_PLUGIN}": true }\n}\n`,
  );
});

const GEMINI_EXTENSION = '.gemini/extensions/gemini-safety-net';
const geminiCall = (rest: string) => `gemini extensions ${rest}\t<root>`;

test('Gemini CLI installs, updates, or updates and enables its extension', async () => {
  const script = [{ command: 'gemini' }];
  const fresh = await flow({ invoke: 'install', args: ['--gemini-cli'], script });

  expect(fresh).toMatchObject({
    exitCode: 0,
    lines: ['Installed Gemini CLI integration', ''],
    log: [geminiCall('install https://github.com/kenryu42/gemini-safety-net --consent')],
  });

  const configured = await flow({
    invoke: 'install',
    args: ['--gemini-cli'],
    script,
    seed: { [`${GEMINI_EXTENSION}/gemini-extension.json`]: '{}\n' },
  });

  expect(configured.lines).toEqual(['Updated Gemini CLI integration', '']);
  expect(configured.log).toEqual([geminiCall('update gemini-safety-net')]);

  const disabled = await flow({
    invoke: 'install',
    args: ['--gemini-cli'],
    script,
    seed: {
      [`${GEMINI_EXTENSION}/gemini-extension.json`]: '{}\n',
      '.gemini/extensions/extension-enablement.json':
        '{"gemini-safety-net":{"overrides":["!*"]}}\n',
    },
  });

  expect(disabled.log).toEqual(
    [geminiCall('update gemini-safety-net'), geminiCall('enable gemini-safety-net')].sort(),
  );
});

test('Pi drops the extensions filter its settings carried', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--pi'],
    script: [{ command: 'pi' }],
    seed: {
      '.pi/agent/settings.json':
        '{"packages":[{"source":"npm:cc-safety-net","extensions":["-cc-safety-net"]}]}',
    },
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: [
      'Installed Pi integration',
      'Enabled npm:cc-safety-net extensions in <home>/.pi/agent/settings.json',
      '',
    ],
    log: ['pi install npm:cc-safety-net\t<root>'],
  });
  expect(fileAt(result.tree, '.pi/agent/settings.json')).toBe(
    `${JSON.stringify({ packages: [{ source: 'npm:cc-safety-net' }] }, null, 2)}\n`,
  );
});

/** A directory a fake CLI copies into place, standing in for what the host would download. */
function fixtureDir(spec: TreeSpec): string {
  const dir = join(createTempRoot('cc-safety-net-fixture-'), 'fixture');
  mkdirSync(dir, { recursive: true });
  writeTree(dir, spec);
  return dir;
}

const OPENCODE_CACHE = '.cache/opencode/packages/cc-safety-net@latest';
const opencodePackage = (body: string) =>
  fixtureDir({
    'node_modules/cc-safety-net/package.json': '{"name":"cc-safety-net","main":"index.mjs"}\n',
    'node_modules/cc-safety-net/index.mjs': body,
  });
const opencodeScript = (seedDir: string) => [
  {
    command: 'opencode',
    args: ['plugin', '-g', '-f', 'cc-safety-net@latest'],
    seedDir,
    seedInto: `<home>/${OPENCODE_CACHE}`,
  },
];

test('OpenCode installs only when the cached plugin actually exports a factory', async () => {
  const loaded = await flow({
    invoke: 'install',
    args: ['--opencode'],
    script: opencodeScript(opencodePackage('export const CCSafetyNetPlugin = () => ({});\n')),
  });

  expect(loaded).toMatchObject({
    exitCode: 0,
    lines: ['Installed OpenCode integration', ''],
    log: ['opencode plugin -g -f cc-safety-net@latest\t<root>'],
  });

  const inert = await flow({
    invoke: 'install',
    args: ['--opencode'],
    script: opencodeScript(opencodePackage('export const CCSafetyNetPlugin = 42;\n')),
  });

  expect(inert).toMatchObject({
    exitCode: 1,
    errors: [
      `The cached OpenCode plugin at <home>/${OPENCODE_CACHE}/node_modules/cc-safety-net/index.mjs does not export a callable CCSafetyNetPlugin, so OpenCode would load nothing and fail open.`,
    ],
  });
});

test('uninstalling OpenCode drops our entry and leaves the JSONC comments alone', async () => {
  const config = '.config/opencode/opencode.jsonc';
  const result = await flow({
    invoke: 'uninstall',
    args: ['--opencode'],
    seed: {
      [config]: '{\n  // plugins\n  "plugin": ["cc-safety-net@latest", "other-plugin"]\n}\n',
    },
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: [`Uninstalled OpenCode plugin from <home>/${config}`, ''],
    log: [],
  });
  // Removing the first item takes its comma with it and leaves the separating space.
  expect(fileAt(result.tree, config)).toBe('{\n  // plugins\n  "plugin": [ "other-plugin"]\n}\n');
});

const OPENCLAW_NOTE = [
  'Restart the OpenClaw Gateway to apply the change.',
  'If plugins.allow is set in openclaw.json, it must also list cc-safety-net.',
];
const openclawScript = (status: string) => [
  {
    command: 'openclaw',
    args: ['plugins', 'inspect'],
    stdout: `${JSON.stringify({ plugin: { status } })}\n`,
    stderr: 'plugin lifecycle trace\n',
  },
  { command: 'openclaw' },
];
const openclawCalls = [
  'openclaw plugins install <repo>/dist/openclaw/cc-safety-net --force\t<root>',
  'openclaw plugins enable cc-safety-net\t<root>',
  'openclaw plugins inspect cc-safety-net --runtime --json\t<root>',
].sort();

test('OpenClaw installs the packaged plugin and verifies that it loaded', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--openclaw'],
    script: openclawScript('loaded'),
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: ['Installed OpenClaw integration', ...OPENCLAW_NOTE, ''],
    log: openclawCalls,
  });
});

test('an OpenClaw plugin that did not load fails the install', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--openclaw'],
    script: openclawScript('error'),
  });

  expect(result).toMatchObject({
    exitCode: 1,
    lines: [''],
    errors: [
      'OpenClaw reports the cc-safety-net plugin with status "error". Run `openclaw plugins inspect cc-safety-net --runtime` for details.',
    ],
    log: openclawCalls,
  });
});

test('an OpenClaw extension directory that is not ours is never touched', async () => {
  const result = await flow({
    invoke: 'uninstall',
    args: ['--openclaw'],
    script: [{ command: 'openclaw' }],
    seed: { '.openclaw/extensions/cc-safety-net/index.js': 'module.exports = {};\n' },
  });

  expect(result).toMatchObject({
    exitCode: 1,
    errors: [
      'Refusing to modify <home>/.openclaw/extensions/cc-safety-net: it does not hold a cc-safety-net managed OpenClaw plugin. Move or remove it, then run the command again.',
    ],
    log: [],
  });
  expect(fileAt(result.tree, '.openclaw/extensions/cc-safety-net/index.js')).toBe(
    'module.exports = {};\n',
  );
});

const AMP_REPOSITORIES = `${JSON.stringify([
  { scope: 'user', exists: true, viewerCanWrite: true, cloneRef: 'amp://user-plugins' },
])}\n`;
const AMP_POLICY_STAMP =
  ';globalThis.__CC_SAFETY_NET_EMBEDDED_POLICY__ = {"version":1,"safety":{"level":"strict","overrides":{}},"workflow":{"worktree_mode":false},"destructive_command_protection":{"enabled":true,"overrides":{},"allow_paths":[]},"secret_protection":{"enabled":true,"overrides":{},"deny_paths":[],"allow_paths":[]},"audit":{"retention_days":30}};\n';
const AMP_NOTE =
  'Amp personal plugins apply to every Amp session, including Orb threads. Restart Amp or run "plugins: reload" to apply the change.';
const ampScript = (checkout: string, porcelain: string) => [
  { command: 'amp', args: ['plugins', 'repositories'], stdout: AMP_REPOSITORIES },
  { command: 'amp', args: ['clone', 'user-plugins'], seedDir: checkout },
  { command: 'git', args: ['add'], snapshotTo: '<root>/tmp/staged' },
  { command: 'git', args: ['rm'], snapshotTo: '<root>/tmp/staged' },
  { command: 'git', args: ['status', '--porcelain'], stdout: porcelain },
  { command: 'git' },
];

test('Amp commits the plugin with the embedded policy into the personal repository', async () => {
  const result = await flow({
    invoke: 'install',
    args: ['--amp'],
    seed: { '.cc-safety-net/policy.json': '{"safety":{"level":"strict"}}\n' },
    script: ampScript(
      fixtureDir({ 'README.md': 'personal plugins\n' }),
      ' M cc-safety-net/index.ts\n',
    ),
  });

  expect({ ...result, tmp: undefined }).toMatchObject({
    exitCode: 0,
    lines: ['Installed Amp Code plugin at amp://user-plugins/cc-safety-net', AMP_NOTE, ''],
    log: [
      'amp plugins repositories --json\t<root>',
      'amp clone user-plugins <root>/tmp/cc-safety-net-amp-<id>\t<root>',
      'git add -- cc-safety-net/index.ts\t<root>/tmp/cc-safety-net-amp-<id>',
      'git status --porcelain\t<root>/tmp/cc-safety-net-amp-<id>',
      'git -c commit.gpgsign=false -c user.name=cc-safety-net -c user.email=cc-safety-net@localhost commit -m chore: update cc-safety-net plugin to vdev\t<root>/tmp/cc-safety-net-amp-<id>',
      'git push origin HEAD\t<root>/tmp/cc-safety-net-amp-<id>',
    ].sort(),
  });
  expect(result.tmp.map((entry) => entry.path)).toEqual([
    'staged',
    'staged/README.md',
    'staged/cc-safety-net',
    'staged/cc-safety-net/index.ts',
  ]);
  // Sliced rather than matched: the artifact is 400 KB, and a failed match would print it whole.
  const staged = result.tmp.find((entry) => entry.path === 'staged/cc-safety-net/index.ts');
  expect(staged?.content?.slice(0, AMP_MANAGED_HEADER.length)).toBe(AMP_MANAGED_HEADER);
  expect(staged?.content?.slice(-AMP_POLICY_STAMP.length)).toBe(AMP_POLICY_STAMP);
});

test('uninstalling Amp removes only our entry from the checkout', async () => {
  const result = await flow({
    invoke: 'uninstall',
    args: ['--amp'],
    script: ampScript(
      fixtureDir({
        'README.md': 'personal plugins\n',
        'cc-safety-net/index.ts': `${AMP_MANAGED_HEADER}\n// version: dev\n`,
      }),
      ' D cc-safety-net/index.ts\n',
    ),
  });

  expect(result).toMatchObject({
    exitCode: 0,
    lines: ['Uninstalled Amp Code plugin from amp://user-plugins/cc-safety-net', AMP_NOTE, ''],
  });
  expect(result.log).toContain(
    'git rm -- cc-safety-net/index.ts\t<root>/tmp/cc-safety-net-amp-<id>',
  );
});

test('the selector can cancel, install several targets in order, or hand over to update', async () => {
  const selection = (targets: readonly InstallTarget[] | null | 'update') => () => ({
    probeTargets: () => true,
    detectConfiguredTargets: async () => [],
    selectTargets: async () => targets,
    selectKimiInstallMethod: async () => 'global-hook' as const,
    runUpdate: async () => 7,
  });

  const cancelled = await flow({ invoke: 'install', options: selection(null) });
  expect(cancelled).toMatchObject({
    exitCode: 0,
    lines: ['Cancelled: nothing was installed.', ''],
    log: [],
  });

  const selected = await flow({
    invoke: 'install',
    options: selection(['kimi-code', 'cursor']),
  });
  expect(selected).toMatchObject({
    exitCode: 0,
    lines: [
      'Installed Cursor hook in <home>/.cursor/hooks.json',
      'Installed Kimi Code hook in <home>/.kimi-code/config.toml',
      '',
    ],
  });

  const handedOver = await flow({ invoke: 'install', options: selection('update') });
  expect(handedOver).toMatchObject({ exitCode: 7, lines: [''], log: [] });
});
