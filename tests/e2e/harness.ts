import { describe, expect, test } from 'bun:test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { listAuditLogFiles } from '@/audit/reader';
import { redactSecrets } from '@/core/redaction';
import { createSpawnEnv, readAuditLogEntriesForSession } from '../helpers';

export const NODE_EXECUTABLE = (() => {
  const executable = Bun.which('node');
  if (executable) return executable;
  throw new Error('Node.js is required to run the packaged E2E artifacts');
})();

export type SafetyLevel = 'standard' | 'strict' | 'paranoid';

export type GateResult = { allowed: true } | { allowed: false; reason: string };

/**
 * Emit the packaged artifacts under test into a fresh cache directory and return the root that
 * holds `dist`. Callers own the root and must remove it when the suite ends.
 */
export async function buildE2EArtifacts(
  prefix: string,
  builds: readonly ((
    outdir: string,
  ) => Promise<{ success: boolean; logs: readonly { message: string }[] }>)[],
) {
  const cacheRoot = join(process.cwd(), 'node_modules', '.cache');
  mkdirSync(cacheRoot, { recursive: true });
  const root = mkdtempSync(join(cacheRoot, prefix));
  for (const build of builds) {
    const result = await build(join(root, 'dist'));
    if (!result.success) throw new Error(result.logs.map((log) => log.message).join('\n'));
  }
  return root;
}

export async function withWorkspace<T>(
  run: (context: { cwd: string; home: string }) => T | Promise<T>,
) {
  const root = mkdtempSync(join(tmpdir(), 'cc-safety-net-e2e-'));
  const cwd = join(root, 'workspace');
  const home = join(root, 'home');
  mkdirSync(cwd);
  mkdirSync(home);
  try {
    return await run({ cwd, home });
  } catch (error) {
    try {
      preserveFailureEvidence(root, home, error);
    } catch (artifactError) {
      console.error(`Failed to preserve E2E evidence: ${redactSecrets(String(artifactError))}`);
    }
    throw error;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function preserveFailureEvidence(root: string, home: string, error: unknown) {
  const artifactRoot = process.env.CC_SAFETY_NET_E2E_ARTIFACTS?.trim();
  if (!artifactRoot) return;
  const destination = join(artifactRoot, basename(root));
  mkdirSync(destination, { recursive: true });
  writeFileSync(
    join(destination, 'failure.txt'),
    redactSecrets(error instanceof Error ? (error.stack ?? error.message) : String(error)),
  );
  const auditLogs = join(home, '.cc-safety-net', 'logs');
  if (existsSync(auditLogs)) {
    cpSync(auditLogs, join(destination, 'audit-logs'), { recursive: true });
  }
}

export async function expectAllowedAction(
  cwd: string,
  home: string,
  sessionId: string,
  run: (action: () => void) => Promise<GateResult>,
  recordsAllowDecision = true,
) {
  const action = join(cwd, `${sessionId}-ran`);
  expect(await run(() => writeFileSync(action, 'ran'))).toEqual({ allowed: true });
  expect(readFileSync(action, 'utf8')).toBe('ran');
  expect(readAuditLogEntriesForSession(home, sessionId)).toMatchObject(
    recordsAllowDecision ? [{ decision: 'allow', reason: 'allowed', sessionId }] : [],
  );
}

export function expectSingleAudit(
  home: string,
  sessionId: string,
  expected: { agent: string; command?: string; ruleId?: string },
) {
  const entries = readAuditLogEntriesForSession(home, sessionId);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    sessionId,
    decision: 'deny',
    ...expected,
  });
}

/**
 * Run a host process under an isolated home. Any output on stderr, or a non-zero exit, is a
 * contract violation: the integrations must stay silent on the channels their hosts surface.
 */
export async function runCommand(
  argv: string[],
  input: unknown,
  cwd: string,
  home: string,
  options: { level?: SafetyLevel; env?: Record<string, string> } = {},
) {
  const proc = Bun.spawn(argv, {
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'pipe',
    cwd,
    env: isolatedEnv(home, options.level, options.env),
  });
  proc.stdin.write(typeof input === 'string' ? input : JSON.stringify(input));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const result = { command: argv, cwd, input, stdout, stderr, exitCode };
  if (exitCode === 0 && stderr.trim() === '') return result;
  throw new Error(
    `Host subprocess violated the E2E contract:\n${redactSecrets(JSON.stringify(result, null, 2))}`,
  );
}

export function runNode(
  args: string[],
  input: unknown,
  cwd: string,
  home: string,
  level?: SafetyLevel,
) {
  return runCommand([NODE_EXECUTABLE, ...args], input, cwd, home, { level });
}

export async function runBuiltHost(
  bundlePath: string,
  hostScript: string,
  input: unknown,
  cwd: string,
  home: string,
) {
  const { stdout } = await runNode(
    ['--input-type=module', '--eval', hostScript, bundlePath],
    input,
    cwd,
    home,
  );
  return parseJsonOutput('integration host', stdout);
}

export function parseJsonOutput(label: string, output: string) {
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON:\n${redactSecrets(output)}`, { cause: error });
  }
}

/**
 * Every session id in the packaged Hermes Agent and OpenClaw host suites starts with it, so a
 * leaked audit entry is identifiable by filename alone in the developer's real log tree.
 */
export const SESSION_PREFIX = 'hostpkg';

const REAL_HOME = homedir();

/** Real host state the packaged host suites must never touch. */
const WATCHED_REAL_PATHS = [
  join(REAL_HOME, '.hermes', 'config.yaml'),
  join(REAL_HOME, '.hermes', 'plugins'),
  join(REAL_HOME, '.hermes', 'shell-hooks-allowlist.json'),
  join(REAL_HOME, '.openclaw'),
];

/**
 * Run a case in an isolated workspace and prove it left the developer's real host state alone.
 * The realistic mistake this catches is an env key that fails to reach a spawned host — the
 * `hermes` binary, the installer, or the plugin's own analyzer subprocess — which would send
 * writes to the real `~/.hermes` or the real audit log instead of the temporary home.
 */
export function withHostWorkspace<T>(run: (context: { cwd: string; home: string }) => Promise<T>) {
  return withWorkspace(async (context) => {
    const before = snapshotRealHostState();
    const beforeAudits = snapshotRealAuditState();
    // The checks run in finally so a test that dirties real host state and
    // then throws still reports the real-machine write, not just its own
    // failure. They are nested for the same reason: a snapshot mismatch must
    // not hide a leaked audit file behind it.
    try {
      try {
        return await run(context);
      } finally {
        expect(snapshotRealHostState()).toBe(before);
      }
    } finally {
      expect(snapshotRealAuditState()).toEqual(beforeAudits);
    }
  });
}

function snapshotRealAuditState() {
  return listAuditLogFiles(join(REAL_HOME, '.cc-safety-net', 'logs'))
    .filter((file) => basename(file).includes(SESSION_PREFIX))
    .map((file) => `${file}:${statSync(file).size}`)
    .sort();
}

export function snapshotRealHostState() {
  return WATCHED_REAL_PATHS.map((path) => `${path}=${describeRealPath(path)}`).join('\n');
}

function describeRealPath(path: string) {
  if (!existsSync(path)) return 'absent';
  const stats = statSync(path);
  if (!stats.isDirectory()) return `file:${stats.size}:${stats.mtimeMs}`;
  return `dir:${readdirSync(path).sort().join(',')}`;
}

export type HermesGate = {
  agent: string;
  run: (
    command: string,
    cwd: string,
    home: string,
    sessionId: string,
    action: () => void,
  ) => Promise<GateResult>;
};

export function readHermesDirective(
  directive: Record<string, unknown> | null,
  action: () => void,
): GateResult {
  if (!directive) {
    action();
    return { allowed: true };
  }
  expect(Object.keys(directive).sort()).toEqual(['action', 'message']);
  expect(directive.action).toBe('block');
  return { allowed: false, reason: String(directive.message) };
}

/**
 * The Hermes Agent protection contract, run against every way a payload can reach our analyzer.
 * The gates differ only in who serialises the payload and who reads the directive back, so the
 * assertions are shared and the gate list says which hosts a suite can drive.
 */
export function describeHermesGates(
  gates: readonly { name: string; gate: HermesGate; skip: boolean }[],
) {
  for (const { name, gate, skip } of gates) {
    describe.skipIf(skip)(`packaged Hermes Agent protection through ${name}`, () => {
      test('allows git status and records the allowed decision', async () => {
        await withHostWorkspace(async ({ cwd, home }) => {
          const sessionId = `${SESSION_PREFIX}-hermes-${name.replaceAll(' ', '-')}-safe`;
          await expectAllowedAction(cwd, home, sessionId, (action) =>
            gate.run('git status', cwd, home, sessionId, action),
          );
        });
      });

      test('blocks git reset --hard before it can run and preserves the target', async () => {
        await withHostWorkspace(async ({ cwd, home }) => {
          const sessionId = `${SESSION_PREFIX}-hermes-${name.replaceAll(' ', '-')}-reset`;
          const sentinel = join(cwd, 'hermes-sentinel');
          writeFileSync(sentinel, 'preserve');

          const result = await gate.run('git reset --hard', cwd, home, sessionId, () =>
            rmSync(sentinel),
          );

          expect(result.allowed).toBe(false);
          if (result.allowed) throw new Error('Expected the Hermes host to block the command');
          expect(result.reason).toContain('git.reset-hard');
          expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
          expectSingleAudit(home, sessionId, {
            agent: gate.agent,
            command: 'git reset --hard',
            ruleId: 'git.reset-hard',
          });
        });
      });
    });
  }
}

export function isolatedEnv(home: string, level?: SafetyLevel, env: Record<string, string> = {}) {
  return createSpawnEnv({
    HOME: home,
    USERPROFILE: home,
    // Hermes reads HERMES_HOME before the platform default, so a developer who exports it would
    // otherwise point `hermes` at their real profile while every other path is isolated.
    HERMES_HOME: join(home, '.hermes'),
    // `install` clears the npx cache under npm_config_cache when it is set; blanking it keeps the
    // deletion inside the temporary home instead of the developer's real npm cache.
    npm_config_cache: '',
    CC_SAFETY_NET_HOME: join(home, '.cc-safety-net'),
    CC_SAFETY_NET_AUDIT_HOME: home,
    CC_SAFETY_NET_LEVEL: level ?? '',
    CC_SAFETY_NET_STRICT: '',
    CC_SAFETY_NET_PARANOID: '',
    CC_SAFETY_NET_PARANOID_RM: '',
    CC_SAFETY_NET_PARANOID_INTERPRETERS: '',
    CC_SAFETY_NET_WORKTREE: '',
    ...env,
  });
}
