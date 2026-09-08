/**
 * Packaged host tests for the Hermes Agent and OpenClaw integrations that boot no host binary.
 *
 * What is proven here, on every machine:
 *
 * - Hermes: the built adapter's stdin/stdout contract, driven with the payload Hermes'
 *   `_serialize_payload` emits, and the Python plugin it ships — written by the built CLI's
 *   installer and executed by real `python3`. The dispatch through Hermes' own PluginManager is
 *   NOT covered: it only happens inside an agent turn, which needs a model and network.
 * - OpenClaw: the built plugin bundle registers `before_tool_call` for `exec` and enforces
 *   through it. These cases run the bundle directly, which is the only way to reach shapes the
 *   host will not produce on demand (`host: "sandbox"`, an explicit `host: "gateway"`, and the
 *   malformed-call fail-closed path).
 *
 * Nothing here starts `hermes` or `openclaw`, so nothing here proves the real hosts dispatch at
 * our integrations. That proof lives in `tests/e2e-live/hermes-openclaw.live.test.ts` and runs
 * under `bun run test:e2e:live`; do not cite this file for it.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { createTestEnvironment } from '@/core/environment';
import { HERMES_AGENT_PLUGIN_NAME } from '@/hosts/hermes-agent/artifact';
import { getHermesAgentPluginDir } from '@/hosts/hermes-agent/install';
import { OPENCLAW_PLUGIN_ENTRY_FILE, OPENCLAW_PLUGIN_ID } from '@/hosts/openclaw/artifact';
import { buildOpenClawBundle, buildRuntimeBundles } from '../../scripts/build-runtime';
import { OPENCLAW_HOST_SCRIPT } from '../../scripts/integration-host-scripts';
import { writeFakeCommands } from '../helpers/fake-commands';
import {
  buildE2EArtifacts,
  describeHermesGates,
  expectAllowedAction,
  expectSingleAudit,
  type GateResult,
  NODE_EXECUTABLE,
  parseJsonOutput,
  readHermesDirective,
  runBuiltHost,
  runCommand,
  runNode,
  SESSION_PREFIX,
  withHostWorkspace,
} from './harness';

const python3Bin = Bun.which('python3');

let buildRoot = '';
let cliPath = '';
let openClawEntryPath = '';
let hermesStubBinDir = '';

/**
 * The stub `hermes` the built CLI's install step drives: it runs `hermes plugins enable`, so a
 * machine without the real binary would fail this gate on the installer rather than on the
 * protection it is meant to prove. Its bytes are fixed and it is written once — macOS scans each
 * newly written executable on its first exec — with the log path arriving by environment.
 */
function writeHermesStub(home: string) {
  return writeFakeCommands(home, {
    hermes: `appendFileSync(
  process.env.CC_SAFETY_NET_TEST_COMMAND_LOG ?? '',
  commandLine + '\\n',
);`,
  });
}

beforeAll(async () => {
  buildRoot = await buildE2EArtifacts('cc-safety-net-e2e-hosts-', [
    buildRuntimeBundles,
    buildOpenClawBundle,
  ]);
  cliPath = join(buildRoot, 'dist', 'bin', 'cc-safety-net.js');
  hermesStubBinDir = writeHermesStub(join(buildRoot, 'host-bin'));
  openClawEntryPath = join(
    buildRoot,
    'dist',
    'openclaw',
    OPENCLAW_PLUGIN_ID,
    OPENCLAW_PLUGIN_ENTRY_FILE,
  );
});

afterAll(() => {
  if (buildRoot) rmSync(buildRoot, { recursive: true, force: true });
});

// The built CLI adapter, driven with the payload Hermes' `_serialize_payload` emits. This runs
// everywhere; the live suite's `hermes` cases prove the literal below is the real wire shape.
const hermesHookGate = {
  agent: 'hermes-agent',
  async run(command: string, cwd: string, home: string, sessionId: string, action: () => void) {
    const { stdout } = await runNode(
      [cliPath, 'hook', '--hermes-agent'],
      {
        hook_event_name: 'pre_tool_call',
        tool_name: 'terminal',
        tool_input: { command },
        session_id: sessionId,
        cwd,
        extra: { task_id: `${sessionId}-task`, tool_call_id: `${sessionId}-call` },
      },
      cwd,
      home,
    );
    return readHermesDirective(
      stdout.trim() ? parseJsonOutput('Hermes adapter', stdout) : null,
      action,
    );
  },
};

// The Python plugin the installer ships, written by the built CLI and executed by real python3
// with `npx` standing in for the published package so no install reaches the network.
const HERMES_PLUGIN_HOST = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("ccsn_hermes_plugin", sys.argv[4])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
hooks = {}
class Ctx:
    def register_hook(self, name, callback):
        hooks[name] = callback
module.register(Ctx())
json.dump({"directive": hooks["pre_tool_call"](tool_name=sys.argv[1], args=json.loads(sys.argv[2]), session_id=sys.argv[3])}, sys.stdout)
`;

/**
 * The plugin reads the session's cwd record from Hermes' own `tools` package. This host is not
 * Hermes, so it supplies the two accessors at the shape the plugin imports; an empty record is
 * Hermes' first-command state, which resolves to the process directory.
 */
function writeHermesModules(home: string) {
  const pkg = join(home, 'hermes-modules', 'tools');
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, '__init__.py'), '');
  writeFileSync(
    join(pkg, 'approval.py'),
    'def get_current_session_key(default="default"):\n    return default\n',
  );
  writeFileSync(
    join(pkg, 'terminal_tool.py'),
    'def get_session_cwd(session_key):\n    return None\n',
  );
  return join(home, 'hermes-modules');
}

const hermesPluginGate = {
  agent: 'hermes-agent',
  async run(command: string, cwd: string, home: string, sessionId: string, action: () => void) {
    // The stub wins the lookup whether or not the machine has Hermes, so the gate installs the
    // same way everywhere. An enable that never ran would leave Hermes ignoring the plugin.
    const hermesCommandLog = join(home, 'hermes-cli.log');
    await runCommand([NODE_EXECUTABLE, cliPath, 'install', '--hermes-agent'], '', cwd, home, {
      env: {
        PATH: `${hermesStubBinDir}${delimiter}${process.env.PATH ?? ''}`,
        CC_SAFETY_NET_TEST_COMMAND_LOG: hermesCommandLog,
      },
    });
    expect(readFileSync(hermesCommandLog, 'utf8').trim()).toBe(
      `plugins enable ${HERMES_AGENT_PLUGIN_NAME} --no-allow-tool-override`,
    );

    const modulesDir = writeHermesModules(home);
    const binDir = writeFakeCommands(home, {
      npx: `const child = Bun.spawn(
  [${JSON.stringify(NODE_EXECUTABLE)}, ${JSON.stringify(cliPath)}, 'hook', '--hermes-agent'],
  { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await child.exited);`,
    });

    const { stdout } = await runCommand(
      [
        python3Bin ?? 'python3',
        '-c',
        HERMES_PLUGIN_HOST,
        'terminal',
        JSON.stringify({ command }),
        sessionId,
        join(
          getHermesAgentPluginDir(
            createTestEnvironment({ home, tmpdir: tmpdir(), env: new Map() }),
          ),
          '__init__.py',
        ),
      ],
      '',
      cwd,
      home,
      { env: { PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`, PYTHONPATH: modulesDir } },
    );
    return readHermesDirective(
      (parseJsonOutput('Hermes plugin', stdout).directive as Record<string, unknown> | null) ??
        null,
      action,
    );
  },
};

describeHermesGates([
  { name: 'built adapter over JSON stdin', gate: hermesHookGate, skip: false },
  { name: 'the installed plugin under python3', gate: hermesPluginGate, skip: !python3Bin },
]);

describe('packaged OpenClaw plugin protection through the built plugin directory', () => {
  // `auto` is the schema default and the only value a default install sends; `gateway` is the
  // one other host whose filesystem the agent workspace describes.
  test.each([
    ['the default host', 'default', { command: 'git status' }],
    ['an explicit gateway host', 'gateway', { command: 'git status', host: 'gateway' }],
  ] as const)('registers the exec policy hook and allows git status on %s', async (_name, slugName, params) => {
    await withHostWorkspace(async ({ cwd, home }) => {
      const sessionId = `${SESSION_PREFIX}-openclaw-safe-${slugName}`;
      await expectAllowedAction(cwd, home, sessionId, async (action) => {
        const output = await runOpenClawHost(params, cwd, home, sessionId);
        expect(output).toMatchObject({
          id: 'cc-safety-net',
          registration: { hookName: 'before_tool_call', matcher: ['exec'], priority: 50 },
        });
        return readOpenClawResult(output, action);
      });
    });
  });

  test.each([
    ['a destructive command', 'openclaw-reset', { command: 'git reset --hard' }, 'git.reset-hard'],
    [
      'an unproven execution host',
      'openclaw-sandbox',
      { command: 'git status', host: 'sandbox' },
      'CC Safety Net failed closed',
    ],
  ] as const)('blocks %s before it can run', async (_name, slugName, params, expected) => {
    await withHostWorkspace(async ({ cwd, home }) => {
      const sessionId = `${SESSION_PREFIX}-${slugName}`;
      const sentinel = join(cwd, 'openclaw-sentinel');
      writeFileSync(sentinel, 'preserve');

      const output = await runOpenClawHost(params, cwd, home, sessionId);
      const result = readOpenClawResult(output, () => rmSync(sentinel));

      expect(result.allowed).toBe(false);
      if (result.allowed) throw new Error('Expected the OpenClaw host to block the tool call');
      expect(result.reason).toContain(expected);
      expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
      expectSingleAudit(home, sessionId, { agent: 'openclaw' });
    });
  });
});

function runOpenClawHost(
  params: Record<string, unknown>,
  cwd: string,
  home: string,
  sessionId: string,
) {
  return runBuiltHost(
    openClawEntryPath,
    OPENCLAW_HOST_SCRIPT,
    { toolName: 'exec', params, agentId: 'main', sessionId, workspaceDir: cwd },
    cwd,
    home,
  );
}

function readOpenClawResult(output: Record<string, unknown>, action: () => void): GateResult {
  const result = output.result as Record<string, unknown> | null;
  if (!result) {
    action();
    return { allowed: true };
  }
  // OpenClaw treats a returned `params` as a rewrite, which fails closed for Codex-native calls.
  expect(Object.keys(result).sort()).toEqual(['block', 'blockReason']);
  expect(result.block).toBe(true);
  return { allowed: false, reason: String(result.blockReason) };
}
