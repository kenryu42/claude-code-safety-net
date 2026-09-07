import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBuiltinCommands } from '@/hosts/opencode/builtin-commands/commands';
import {
  createCCSafetyNetPlugin as portedCreate,
  normalizeOpenCodeWindowsWorkdir as portedNormalizeWorkdir,
  resolveOpenCodeShellRoute as portedShellRoute,
} from '@/hosts/opencode/plugin';
import { withEnv } from '../../helpers';
import { readAuditEntries } from '../../helpers/hook-capture';
import { createHookFixture, type HookFixture } from '../../helpers/hook-hosts';
import { auditHomeFor, captureInProcessCall, describeDifferential } from '../../helpers/in-process';

/**
 * The OpenCode plugin driven through a fake plugin input: one project directory, one OpenCode
 * config and one `tool.execute.before` call. OpenCode's deny form is a thrown error, so a row
 * records the thrown message, the stderr lines and the audit tree. The `homeDir` input is the
 * Environment home, which names the user policy file, expands `~` and steers the audit tree; the
 * last two tests pin both halves of that.
 */

const SESSION = 'opencode-1';
const POLICY_FAILURE = 'boom';
const ANALYZER_FAILURE = 'injected analyzer failure';

type Row = {
  name: string;
  tool?: string;
  args: (fixture: HookFixture) => unknown;
  directory?: (fixture: HookFixture) => string;
  /** The shell OpenCode reports through its own config hook before the tool call. */
  shell?: string;
  breaks?: 'analyzer' | 'policy';
  env?: Record<string, string | undefined>;
  /** Text the thrown message must carry, so a row cannot pass by throwing anything at all. */
  contains?: string;
  blocked: boolean;
  lines: number;
};

const failingAnalyzer = (): never => {
  throw new Error(ANALYZER_FAILURE);
};

const failingPolicyLoad = (): never => {
  throw new Error(POLICY_FAILURE);
};

const ROWS: readonly Row[] = [
  {
    name: 'a destructive command',
    args: () => ({ command: 'git push --force origin main' }),
    contains: 'BLOCKED by CC Safety Net',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a safe command recorded as an allow',
    args: () => ({ command: 'git status' }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'a safe command under the blocked-only audit scope',
    args: () => ({ command: 'git status' }),
    env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' },
    blocked: false,
    lines: 0,
  },
  {
    name: 'a workdir inside the project',
    args: () => ({ command: 'git status', workdir: 'sub' }),
    blocked: false,
    lines: 1,
  },
  {
    // OpenCode checks that the workdir is usable, not that it stays inside the project.
    name: 'a workdir outside the project',
    args: (fixture) => ({ command: 'git status', workdir: fixture.outside }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'a workdir that does not exist',
    args: () => ({ command: 'git status', workdir: 'missing' }),
    contains: 'failed closed',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a blank workdir',
    args: () => ({ command: 'git status', workdir: '' }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a call without a tool name',
    tool: '',
    args: () => ({ command: 'git status' }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a project directory that is a regular file',
    args: () => ({ command: 'git status' }),
    directory: (fixture) => fixture.file,
    blocked: true,
    lines: 1,
  },
  {
    name: 'a read of a file in the project',
    tool: 'read',
    args: () => ({ filePath: 'README.md' }),
    blocked: false,
    lines: 0,
  },
  {
    name: 'a read of a private key',
    tool: 'read',
    args: (fixture) => ({ filePath: join(fixture.home, '.ssh', 'id_rsa') }),
    contains: 'Rule: secret.home.ssh',
    blocked: true,
    lines: 1,
  },
  {
    name: 'an analyzer that fails',
    args: () => ({ command: 'echo analyzed' }),
    breaks: 'analyzer',
    contains: 'Command: echo analyzed',
    blocked: true,
    lines: 1,
  },
  {
    // Config load is one of the three stages OpenCode rethrows the cause from, so the host sees
    // the loader's own error rather than a denial document.
    name: 'a policy load that fails',
    args: () => ({ command: 'git status' }),
    breaks: 'policy',
    contains: POLICY_FAILURE,
    blocked: true,
    lines: 1,
  },
  {
    name: 'a PowerShell command under a pwsh shell',
    args: () => ({ command: 'Remove-Item -Recurse -Force C:\\' }),
    shell: 'pwsh',
    contains: 'BLOCKED by CC Safety Net',
    blocked: true,
    lines: 1,
  },
];

/** The workdir spellings OpenCode hands a Windows host, and what each one resolves to. */
const WINDOWS_WORKDIRS = [
  ['/c:/x', 'C:/x'],
  ['/c/x', 'C:/x'],
  ['/cygdrive/d/y', 'D:/y'],
  ['/mnt/e/z', 'E:/z'],
  ['/tmp', '/tmp'],
  ['rel', 'rel'],
] as const;

/** Configured shell, platform, `SHELL` value, and the route the pair resolves to. */
const SHELL_ROUTES = [
  [undefined, 'linux', undefined, 'auto'],
  [undefined, 'win32', undefined, 'powershell'],
  ['/bin/zsh', 'linux', undefined, 'posix'],
  ['C:\\x\\pwsh.exe', 'win32', undefined, 'powershell'],
  ['fish', 'linux', undefined, 'auto'],
  ['', 'linux', '/bin/bash', 'auto'],
] as const;

let fixture: HookFixture;

beforeEach(() => {
  fixture = createHookFixture('next-opencode-');
});

afterEach(() => {
  fixture.remove();
});

function dependenciesFor(row: Row) {
  if (row.breaks === 'analyzer') return { analyzeCommand: failingAnalyzer };
  return row.breaks === 'policy' ? { loadPolicySnapshot: failingPolicyLoad } : {};
}

function createPlugin(row: Row, homeDir?: string) {
  return portedCreate(dependenciesFor(row))({
    directory: (row.directory ?? ((current: HookFixture) => current.project))(fixture),
    homeDir,
    worktree: fixture.project,
    client: {},
    $: () => {},
  } as never);
}

async function callToolExecuteBefore(row: Row, homeDir?: string) {
  const plugin = await createPlugin(row, homeDir);
  if (row.shell !== undefined) await plugin.config({ shell: row.shell } as never);
  return plugin['tool.execute.before'](
    { tool: row.tool ?? 'bash', sessionID: SESSION, callID: 'c1' } as never,
    { args: row.args(fixture) } as never,
  );
}

function runSide(row: Row) {
  return captureInProcessCall(fixture, row.env ?? {}, () => callToolExecuteBefore(row));
}

describeDifferential(
  'one OpenCode tool call through both plugins',
  ROWS,
  runSide,
  (row, agreed) => {
    expect(agreed.entries).toHaveLength(row.lines);
    expect(agreed.thrown ?? '').toContain(row.contains ?? '');
    expect(agreed.thrown === undefined).toBe(!row.blocked);
  },
);

test('the config hook adds the builtin command without dropping the host own', async () => {
  const config: Record<string, unknown> = { command: { own: { template: 'x' } } };
  const plugin = await createPlugin(ROWS[0] as Row);
  await plugin.config(config as never);
  const ported = config.command;

  // Ours is added whole, exactly as the loader supplies it, and the host's own is left alone.
  expect(Object.keys(ported as Record<string, unknown>)).toStrictEqual(['cc-safety-net', 'own']);
  expect(ported).toEqual({ ...loadBuiltinCommands(), own: { template: 'x' } });
});

test('the shell route and the Windows workdir resolve the same way on both sides', () => {
  withEnv({ SHELL: undefined }, () => {
    for (const [shell, platform, environmentShell, route] of SHELL_ROUTES) {
      expect(portedShellRoute(shell, platform, environmentShell)).toBe(route);
    }
  });

  for (const [workdir, resolved] of WINDOWS_WORKDIRS) {
    expect(portedNormalizeWorkdir(workdir)).toBe(resolved);
  }
});

test('a homeDir input is the ported policy home, so a policy under it decides', async () => {
  const homeDir = join(fixture.root, 'opencode-policy-home');
  mkdirSync(join(homeDir, '.cc-safety-net'), { recursive: true });
  writeFileSync(
    join(homeDir, '.cc-safety-net', 'policy.json'),
    JSON.stringify({
      version: 1,
      destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } },
    }),
  );
  const row = {
    name: 'a rule the policy turns off',
    args: () => ({ command: 'git reset --hard HEAD~1' }),
    blocked: true,
    lines: 1,
  } satisfies Row;
  const ported = await captureInProcessCall(fixture, { CC_SAFETY_NET_HOME: undefined }, () =>
    callToolExecuteBefore(row, homeDir),
  );
  expect(ported.thrown).toBeUndefined();
  // The allow comes from the valid policy, not from a salvaged invalid one.
  expect(ported.entries[0]?.entry).toMatchObject({ decision: 'allow' });
  expect(ported.entries[0]?.entry).not.toHaveProperty('configFallback');
});

test('a homeDir input steers the shipped audit tree and the environment steers the ported one', async () => {
  const row = ROWS[0] as Row;
  const homeDir = join(fixture.root, 'opencode-home');
  const ported = await captureInProcessCall(fixture, {}, () => callToolExecuteBefore(row, homeDir));

  // The plugin wrote nowhere but the audit home the environment names, and what it wrote there is
  // the row's own verdict rather than a second call's.
  expect(ported.entries.map((line) => line.entry.ruleId)).toEqual(['git.push-force']);
  expect(readAuditEntries(auditHomeFor(fixture))).toHaveLength(1);
  expect(readAuditEntries(homeDir)).toStrictEqual([]);
});
