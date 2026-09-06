/**
 * Real-host tests for the Hermes Agent and OpenClaw integrations. Every case here boots a host
 * binary, which costs minutes rather than seconds, so they are opt-in: `bun run test:e2e:live`
 * with `hermes` and `openclaw` on PATH. A case whose binary is absent skips.
 *
 * What these prove, and what the packaged suite in `tests/e2e/hermes-openclaw.test.ts` cannot:
 *
 * - Hermes: the real `hermes` binary is driven end to end through `hermes hooks test`, which
 *   serialises the payload with Hermes' own `_serialize_payload` and parses the reply with its
 *   own `_parse_response`, and the real `hermes plugins` CLI discovers the plugin our installer
 *   writes and loses it again on uninstall. The dispatch through Hermes' own PluginManager is
 *   still NOT covered: it only happens inside an agent turn, which needs a model and network.
 * - OpenClaw: the real `openclaw` binary is driven end to end. Our own CLI installs the built
 *   plugin through OpenClaw's `plugins` CLI, the host reports it `loaded` with the
 *   `before_tool_call` hook registered, and a real gateway agent turn puts a real `exec` tool
 *   call through that hook — an allowed command runs, `git reset --hard` is blocked before it can
 *   touch the workspace. The model is a loopback stub so no turn needs network or an API key;
 *   OpenClaw's own agent runtime, tool construction, and hook dispatch are the real ones.
 *   Still UNPROVEN, and not to be cited from here: Codex-native relay, and the sandbox and
 *   remote-node execution hosts.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listAuditLogFiles, readAuditLogEntries } from '@/audit/reader';
import { createTestEnvironment } from '@/core/environment';
import { redactSecrets } from '@/core/redaction';
import { getHermesAgentPluginDir } from '@/hosts/hermes-agent/install';
import { OPENCLAW_PLUGIN_ID } from '@/hosts/openclaw/artifact';
import { getOpenClawPluginDir } from '@/hosts/openclaw/install';
import { buildOpenClawBundle, buildRuntimeBundles } from '../../scripts/build-runtime';
import {
  buildE2EArtifacts,
  describeHermesGates,
  isolatedEnv,
  parseJsonOutput,
  readHermesDirective,
  runCommand,
  runNode,
  SESSION_PREFIX,
  snapshotRealHostState,
  withHostWorkspace,
} from '../e2e/harness';
import {
  openClawEnv,
  reserveLoopbackPort,
  runOpenClaw,
  startOpenClawGateway,
  startStubModelServer,
  writeOpenClawConfig,
} from './openclaw-host';

// Live tests drive real host binaries and take minutes, so they are opt-in:
// `bun run test:e2e:live`.
const liveEnabled = process.env.CC_SAFETY_NET_E2E_LIVE === '1';
const hermesBin = Bun.which('hermes');
const openClawBin = Bun.which('openclaw');
const skipHermes = !liveEnabled || hermesBin === null;
const skipOpenClaw = !liveEnabled || openClawBin === null;

/** A cold gateway compiles its plugin bundles on first boot, and a turn waits on that. */
const GATEWAY_READY_TIMEOUT_MS = 180_000;
const AGENT_TURN_TIMEOUT_MS = 120_000;
const OPENCLAW_CLI_TIMEOUT_MS = 60_000;
const REAL_OPENCLAW_TIMEOUT_MS = 300_000;

let buildRoot = '';
let cliPath = '';

beforeAll(async () => {
  if (skipHermes && skipOpenClaw) return;
  buildRoot = await buildE2EArtifacts('cc-safety-net-e2e-live-hosts-', [
    buildRuntimeBundles,
    buildOpenClawBundle,
  ]);
  cliPath = join(buildRoot, 'dist', 'bin', 'cc-safety-net.js');
});

afterAll(() => {
  if (buildRoot) rmSync(buildRoot, { recursive: true, force: true });
});

// The real `hermes` binary dispatching a configured pre_tool_call shell hook at the built CLI.
const hermesBinaryGate = {
  agent: 'hermes-agent',
  async run(command: string, cwd: string, home: string, sessionId: string, action: () => void) {
    const hermesHome = join(home, '.hermes');
    mkdirSync(hermesHome, { recursive: true });
    writeFileSync(
      join(hermesHome, 'config.yaml'),
      `hooks:\n  pre_tool_call:\n    - matcher: "terminal"\n      command: "node ${cliPath} hook --hermes-agent"\n      timeout: 30\n`,
    );
    const payloadPath = join(home, 'hermes-payload.json');
    writeFileSync(payloadPath, JSON.stringify({ args: { command }, session_id: sessionId }));

    const { stdout } = await runCommand(
      [
        'hermes',
        'hooks',
        'test',
        'pre_tool_call',
        '--for-tool',
        'terminal',
        '--payload-file',
        payloadPath,
      ],
      '',
      cwd,
      home,
    );
    // Hermes reports what the hook wrote and what its dispatcher made of it.
    expect(stdout).toContain('exit=0');
    expect(stdout).not.toContain('stderr:');
    const directive = /parsed \(Hermes wire shape\): (.+)$/m.exec(stdout);
    if (!directive) expect(stdout).toContain('parsed: <none');
    return readHermesDirective(
      directive?.[1] ? parseJsonOutput('Hermes dispatcher', directive[1]) : null,
      action,
    );
  },
};

describeHermesGates([{ name: 'the real hermes binary', gate: hermesBinaryGate, skip: skipHermes }]);

describe.skipIf(skipHermes)('packaged Hermes Agent plugin under the real hermes CLI', () => {
  test('installs a plugin the real host discovers, and uninstall removes it again', async () => {
    await withHostWorkspace(async ({ cwd, home }) => {
      await runNode([cliPath, 'install', '--hermes-agent'], '', cwd, home);

      expect(await listRealHermesPlugins(cwd, home)).toContain(
        'Block destructive commands and secret-file access before Hermes runs a tool.',
      );

      await runNode([cliPath, 'uninstall', '--hermes-agent'], '', cwd, home);

      expect(await listRealHermesPlugins(cwd, home)).toBe('');
      expect(
        existsSync(
          getHermesAgentPluginDir(
            createTestEnvironment({ home, tmpdir: tmpdir(), env: new Map() }),
          ),
        ),
      ).toBe(false);
    });
  });
});

async function listRealHermesPlugins(cwd: string, home: string) {
  const { stdout } = await runCommand(['hermes', 'plugins', 'list'], '', cwd, home, {
    // Rich wraps the table to the terminal width, which would split the description mid-word.
    env: { COLUMNS: '400' },
  });
  return stdout
    .split('\n')
    .filter((line) => line.includes('cc-safety-net'))
    .join('\n');
}

describe.skipIf(skipOpenClaw)('packaged OpenClaw plugin under the real openclaw CLI', () => {
  test(
    'the built CLI installs a plugin the real host loads, and native uninstall removes it again',
    async () => {
      await withHostWorkspace(async ({ cwd, home }) => {
        await runCommand(['node', cliPath, 'install', '--openclaw'], '', cwd, home, {
          env: openClawEnv(home),
        });

        expect(await listRealOpenClawPlugins(cwd, home)).toContain(OPENCLAW_PLUGIN_ID);
        // The registration the hook depends on: an enabled plugin whose runtime imported
        // cleanly and whose before_tool_call hook the host actually holds.
        expect(await inspectRealOpenClawPlugin(cwd, home)).toMatchObject({
          plugin: { id: OPENCLAW_PLUGIN_ID, enabled: true, status: 'loaded' },
          typedHooks: [{ name: 'before_tool_call', priority: 50 }],
        });

        // `--force` is required: uninstall otherwise waits for a TTY confirmation.
        await runOpenClawChecked(
          ['plugins', 'uninstall', OPENCLAW_PLUGIN_ID, '--force'],
          cwd,
          home,
        );

        expect(await listRealOpenClawPlugins(cwd, home)).toBe('');
        expect(
          existsSync(
            getOpenClawPluginDir(createTestEnvironment({ home, tmpdir: tmpdir(), env: new Map() })),
          ),
        ).toBe(false);
      });
    },
    REAL_OPENCLAW_TIMEOUT_MS,
  );
});

describe.skipIf(skipOpenClaw)(
  'packaged OpenClaw protection through a real gateway agent turn',
  () => {
    // One gateway serves both cases: a boot costs more than the turns it hosts.
    let context: Awaited<ReturnType<typeof startRealOpenClawGateway>> | undefined;

    beforeAll(async () => {
      context = await startRealOpenClawGateway();
    }, REAL_OPENCLAW_TIMEOUT_MS);

    afterAll(async () => {
      await context?.close();
    });

    test(
      'allows a harmless command and lets the real host run it',
      async () => {
        const gateway = requireGateway(context);
        const marker = join(gateway.workspace, 'openclaw-allowed-ran');
        gateway.stub.armExec(`touch ${marker}`);

        await gateway.runTurn('allow');

        expect(existsSync(marker)).toBe(true);
        expect(readOpenClawDenials(gateway.home, `touch ${marker}`)).toEqual([]);
      },
      REAL_OPENCLAW_TIMEOUT_MS,
    );

    test(
      'blocks git reset --hard before the real host can run it',
      async () => {
        const gateway = requireGateway(context);
        // The sentinel is a tracked file with an uncommitted edit: only a `git reset --hard` that
        // actually ran would restore the committed contents.
        const sentinel = join(gateway.workspace, 'sentinel.txt');
        writeFileSync(sentinel, 'uncommitted');
        gateway.stub.armExec('git reset --hard');

        await gateway.runTurn('block');

        expect(readFileSync(sentinel, 'utf8')).toBe('uncommitted');
        expect(readOpenClawDenials(gateway.home, 'git reset --hard')).toMatchObject([
          { decision: 'deny', agent: 'openclaw', toolName: 'exec', ruleId: 'git.reset-hard' },
        ]);
      },
      REAL_OPENCLAW_TIMEOUT_MS,
    );
  },
);

/**
 * Bring up an isolated OpenClaw installation: the built plugin installed through our own CLI, a
 * loopback stub model, and a gateway bound to a free port. The workspace is a git repository so
 * the `git reset --hard` case has something real to destroy.
 */
async function startRealOpenClawGateway() {
  const root = mkdtempSync(join(tmpdir(), 'cc-safety-net-openclaw-'));
  const home = join(root, 'home');
  const workspace = join(root, 'workspace');
  mkdirSync(home);
  mkdirSync(workspace);
  const before = snapshotRealHostState();

  const stub = startStubModelServer();
  const gatewayPort = reserveLoopbackPort();
  const token = 'stub-gateway-token';
  writeOpenClawConfig(home, { modelPort: stub.port, gatewayPort, token, workspace });

  const env = { ...isolatedEnv(home), ...openClawEnv(home) };
  await runCommand(['node', cliPath, 'install', '--openclaw'], '', workspace, home, {
    env: openClawEnv(home),
  });

  writeFileSync(join(workspace, 'sentinel.txt'), 'committed');
  // `-b main` keeps git from printing its default-branch advice on stderr.
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['config', 'user.email', 'test@example.com'],
    ['config', 'user.name', 'test'],
    ['add', 'sentinel.txt'],
    ['commit', '-q', '-m', 'sentinel'],
  ]) {
    await runCommand(['git', ...args], '', workspace, home);
  }

  const gateway = await startOpenClawGateway({
    cwd: workspace,
    env,
    port: gatewayPort,
    token,
    readyTimeoutMs: GATEWAY_READY_TIMEOUT_MS,
  });

  return {
    home,
    workspace,
    stub,
    async runTurn(sessionSlug: string) {
      const result = await runOpenClaw(
        [
          'agent',
          '--agent',
          'main',
          '--session-key',
          `agent:main:${SESSION_PREFIX}-${sessionSlug}`,
          '--message',
          'run the command',
          '--timeout',
          String(Math.floor(AGENT_TURN_TIMEOUT_MS / 1000)),
          '--json',
        ],
        { cwd: workspace, env, timeoutMs: AGENT_TURN_TIMEOUT_MS },
      );
      if (result.exitCode !== 0) {
        throw new Error(
          `OpenClaw agent turn failed (exit ${result.exitCode}):\n${redactSecrets(result.stdout)}\n${redactSecrets(result.stderr)}`,
        );
      }
      return result;
    },
    async close() {
      await gateway.stop();
      stub.stop();
      expect(snapshotRealHostState()).toBe(before);
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function requireGateway<T>(context: T | undefined): T {
  if (!context) throw new Error('The real OpenClaw gateway did not start');
  return context;
}

/**
 * Every deny CC Safety Net wrote for one command under the isolated home. Scoping by command
 * rather than by session keeps each case independent of the order the suite runs them in: the
 * gateway is shared, so the log is too.
 */
function readOpenClawDenials(home: string, command: string) {
  return listAuditLogFiles(join(home, '.cc-safety-net', 'logs'))
    .flatMap((file) => readAuditLogEntries(file))
    .filter((entry) => entry.decision === 'deny' && entry.command === command);
}

async function runOpenClawChecked(args: readonly string[], cwd: string, home: string) {
  const result = await runOpenClaw(args, {
    cwd,
    env: { ...isolatedEnv(home), ...openClawEnv(home) },
    timeoutMs: OPENCLAW_CLI_TIMEOUT_MS,
  });
  if (result.exitCode === 0 && result.stderr.trim() === '') return result.stdout;
  throw new Error(
    `openclaw ${args.join(' ')} violated the E2E contract:\n${redactSecrets(JSON.stringify(result, null, 2))}`,
  );
}

async function listRealOpenClawPlugins(cwd: string, home: string) {
  const stdout = await runOpenClawChecked(['plugins', 'list', '--enabled'], cwd, home);
  return stdout
    .split('\n')
    .filter((line) => line.includes(OPENCLAW_PLUGIN_ID))
    .join('\n');
}

async function inspectRealOpenClawPlugin(cwd: string, home: string) {
  return parseJsonOutput(
    'OpenClaw inspect',
    await runOpenClawChecked(
      ['plugins', 'inspect', OPENCLAW_PLUGIN_ID, '--runtime', '--json'],
      cwd,
      home,
    ),
  );
}
