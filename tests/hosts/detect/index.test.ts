import { afterEach, expect, test } from 'bun:test';
import { detectAllHooks } from '@/hosts/detect/index';
import { buildHermesAgentPluginFiles } from '@/hosts/hermes-agent/artifact';
import { buildOpenClawArtifactHeader } from '@/hosts/openclaw/artifact';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { differential, expectSameSides } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Doctor's view of the world: one detector per catalog entry, in doctor order, projected onto the
 * status shape the report renders. The rows below drive all thirteen at once, so a detector wired
 * to the wrong id, a missing entry, or a projection that calls an unreadable file "not installed"
 * shows up as a changed row rather than as a passing per-host test.
 */

const AMP_ACTIVE = '✓ cc-safety-net (User Plugins) active\n';
const AMP_STALE = '✓ cc-safety-net (User Plugins) stale\n';
const CODEX_SOURCE = 'https://github.com/kenryu42/cc-safety-net.git';
const codexRow = (state: string) => `cc-safety-net  ${CODEX_SOURCE}  ${state}\n`;

const hermesFiles = (): TreeSpec =>
  Object.fromEntries(
    buildHermesAgentPluginFiles('dev').map((file) => [
      `.hermes/plugins/cc-safety-net/${file.name}`,
      file.content,
    ]),
  );

const openclawFiles = (): TreeSpec => ({
  '.openclaw/extensions/cc-safety-net/index.js': `${buildOpenClawArtifactHeader('dev')}export default {};\n`,
  '.openclaw/extensions/cc-safety-net/openclaw.plugin.json': '{\n  "id": "cc-safety-net"\n}\n',
  '.openclaw/extensions/cc-safety-net/package.json':
    '{\n  "openclaw": { "extensions": ["./index.js"] }\n}\n',
});

const claudeInstalled = {
  '.claude/plugins/installed_plugins.json': '{"plugins":{"cc-safety-net@cc-marketplace":[{}]}}',
};
const copilotPlugin = {
  '.copilot/installed-plugins/cc-marketplace/cc-safety-net/plugin.json': '{}',
};
const geminiExtension = { '.gemini/extensions/gemini-safety-net': null };

const CONFIGURED: TreeSpec = {
  ...claudeInstalled,
  '.claude/settings.json': '{"enabledPlugins":{"cc-safety-net@cc-marketplace":true}}',
  ...copilotPlugin,
  ...geminiExtension,
  ...hermesFiles(),
  '.hermes/config.yaml': 'plugins:\n  enabled:\n    - cc-safety-net\n',
  ...openclawFiles(),
  '.openclaw/openclaw.json': '{"plugins":{"entries":{"cc-safety-net":{"enabled":true}}}}',
  '.cursor/hooks.json':
    '{"version":1,"hooks":{"preToolUse":[{"command":"npx -y cc-safety-net hook --cursor","timeout":30,"failClosed":true}]}}',
  '.gemini/config/hooks.json':
    '{"cc-safety-net":{"enabled":true,"PreToolUse":[{"hooks":[{"type":"command","command":"npx -y cc-safety-net hook --agy-cli","timeout":30}]}]}}',
  '.grok/hooks/cc-safety-net.json':
    '{"hooks":{"PreToolUse":[{"hooks":[{"type":"command","command":"npx -y cc-safety-net hook --grok-build","timeout":30}]}]}}',
  '.kimi-code/config.toml':
    '[[hooks]]\nevent = "PreToolUse"\ncommand = "npx -y cc-safety-net hook --kimi-code"\n',
  '.config/opencode/opencode.json': '{"plugin":["cc-safety-net"]}',
  '.pi/agent/settings.json': '{"packages":["npm:cc-safety-net"]}',
};

const DISABLED: TreeSpec = {
  ...claudeInstalled,
  '.claude/settings.json': '{"enabledPlugins":{"cc-safety-net@cc-marketplace":false}}',
  ...copilotPlugin,
  '.copilot/settings.json': '{"enabledPlugins":{"cc-safety-net@cc-marketplace":false}}',
  ...geminiExtension,
  '.gemini/extensions/extension-enablement.json': '{"gemini-safety-net":{"overrides":["!user"]}}',
  ...hermesFiles(),
  ...openclawFiles(),
  '.gemini/config/hooks.json':
    '{"cc-safety-net":{"enabled":false,"PreToolUse":[{"hooks":[{"command":"npx -y cc-safety-net hook --agy-cli"}]}]}}',
  '.pi/agent/settings.json':
    '{"packages":[{"source":"npm:cc-safety-net","extensions":["-cc-safety-net"]}]}',
};

const UNREADABLE: TreeSpec = {
  '.claude/plugins/installed_plugins.json': null,
  ...copilotPlugin,
  '.copilot/settings.json': null,
  ...geminiExtension,
  '.gemini/extensions/extension-enablement.json': null,
  '.pi/agent/settings.json': null,
};

type Outputs = {
  ampPluginListOutput?: string | null;
  codexPluginListOutput?: string | null;
  copilotCliVersion?: string | null;
};

const all = async (seed: TreeSpec, outputs: Outputs = {}) =>
  expectSameSides(
    await differential({
      seed,
      ported: (environment) => detectAllHooks(environment, environment.home, outputs),
    }),
  ).outcome;

/** One line per host: what doctor would print about it, without the paths. */
const summarize = (statuses: unknown) =>
  (statuses as ReadonlyArray<Record<string, unknown>>).map(
    (status) =>
      `${status.platform} ${status.detected ? 'detected' : 'absent'} ${status.configured ? 'configured' : 'inactive'} ${status.inspectionStatus}`,
  );

const PLATFORMS = [
  'claude-code',
  'amp',
  'antigravity-cli',
  'codex',
  'cursor',
  'gemini-cli',
  'copilot-cli',
  'grok-build',
  'hermes-agent',
  'kimi-code',
  'openclaw',
  'opencode',
  'pi',
] as const;

afterEach(removeTempRoots);

test('an untouched home reports every host as not applicable, in doctor order', async () => {
  const outcome = await all({});

  expect(outcome.kind).toBe('returned');
  expect(summarize(outcome.kind === 'returned' ? outcome.value : [])).toEqual(
    PLATFORMS.map((platform) => `${platform} absent inactive not-applicable`),
  );
});

test('a home with every host configured reports all thirteen as verified', async () => {
  const outcome = await all(CONFIGURED, {
    ampPluginListOutput: AMP_ACTIVE,
    codexPluginListOutput: codexRow('installed, enabled'),
    copilotCliVersion: '1.0.8',
  });

  expect(summarize(outcome.kind === 'returned' ? outcome.value : [])).toEqual(
    PLATFORMS.map((platform) => `${platform} detected configured verified`),
  );
});

test('a home where every host that can be switched off is switched off', async () => {
  const outcome = await all(DISABLED, {
    ampPluginListOutput: AMP_STALE,
    codexPluginListOutput: codexRow('installed, disabled'),
    copilotCliVersion: '1.0.8',
  });

  expect(summarize(outcome.kind === 'returned' ? outcome.value : [])).toEqual([
    'claude-code detected inactive verified',
    'amp detected inactive verified',
    'antigravity-cli detected inactive verified',
    'codex detected inactive verified',
    'cursor absent inactive not-applicable',
    'gemini-cli detected inactive verified',
    'copilot-cli detected inactive verified',
    'grok-build absent inactive not-applicable',
    'hermes-agent detected inactive verified',
    'kimi-code absent inactive not-applicable',
    'openclaw detected inactive verified',
    'opencode absent inactive not-applicable',
    'pi detected inactive verified',
  ]);
});

test('a home whose state files cannot be read reports uninspected, never absent', async () => {
  const outcome = await all(UNREADABLE, { copilotCliVersion: '1.0.8' });

  expect(summarize(outcome.kind === 'returned' ? outcome.value : [])).toEqual([
    'claude-code absent inactive not-inspected',
    'amp absent inactive not-applicable',
    'antigravity-cli absent inactive not-applicable',
    'codex absent inactive not-applicable',
    'cursor absent inactive not-applicable',
    'gemini-cli absent inactive not-inspected',
    'copilot-cli absent inactive not-inspected',
    'grok-build absent inactive not-applicable',
    'hermes-agent absent inactive not-applicable',
    'kimi-code absent inactive not-applicable',
    'openclaw absent inactive not-applicable',
    'opencode absent inactive not-applicable',
    'pi absent inactive not-inspected',
  ]);
});

test('a config that will not parse is a failed inspection, with the reason attached', async () => {
  const outcome = await all({ '.cursor/hooks.json': '{ "hooks"' });
  const cursor = (outcome.kind === 'returned' ? outcome.value : [])[PLATFORMS.indexOf('cursor')];

  expect(cursor).toEqual({
    platform: 'cursor',
    detected: false,
    configured: false,
    inspectionStatus: 'failed',
    method: undefined,
    configPath: '<home>/.cursor/hooks.json',
    configPaths: undefined,
    errors: [
      "Failed to parse Cursor hooks config <home>/.cursor/hooks.json: JSON Parse error: Expected ':' before value in object property definition",
    ],
  });
});
