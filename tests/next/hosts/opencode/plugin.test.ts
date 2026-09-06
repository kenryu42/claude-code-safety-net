import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createCCSafetyNetPlugin as portedCreate,
  normalizeOpenCodeWindowsWorkdir as portedNormalizeWorkdir,
  resolveOpenCodeShellRoute as portedShellRoute,
} from '@next/hosts/opencode/plugin';
import {
  createCCSafetyNetPlugin as shippedCreate,
  normalizeOpenCodeWindowsWorkdir as shippedNormalizeWorkdir,
  resolveOpenCodeShellRoute as shippedShellRoute,
} from '@/integrations/opencode/plugin';
import { withEnv } from '../../../helpers';
import { readAuditEntries } from '../../helpers/hook-capture';
import { createHookFixture, type HookFixture } from '../../helpers/hook-hosts';
import {
  auditHomeFor,
  captureInProcessCall,
  describeDifferential,
  type Side,
} from '../../helpers/in-process';
import { recordPorted, rootFolds } from '../../helpers/temp-home';

/**
 * The OpenCode plugin driven through a fake plugin input: the same project directory, the same
 * OpenCode config and the same `tool.execute.before` call reach the shipped and the ported plugin.
 * OpenCode's deny form is a thrown error, so a row compares the thrown message, the stderr lines
 * and the audit tree. The one pinned divergence is the `homeDir` input: `src` hands it to the
 * audit writer alone, while the port makes it the Environment home, which also names the user
 * policy file and expands `~`. The last two tests pin both halves of that.
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
    args: () => ({ command: 'rm -rf /' }),
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

function createPlugin(side: Side, row: Row, homeDir?: string) {
  return (side === 'shipped' ? shippedCreate : portedCreate)(dependenciesFor(row))({
    directory: (row.directory ?? ((current: HookFixture) => current.project))(fixture),
    homeDir,
    worktree: fixture.project,
    client: {},
    $: () => {},
  } as never);
}

async function callToolExecuteBefore(side: Side, row: Row, homeDir?: string) {
  const plugin = await createPlugin(side, row, homeDir);
  if (row.shell !== undefined) await plugin.config({ shell: row.shell } as never);
  return plugin['tool.execute.before'](
    { tool: row.tool ?? 'bash', sessionID: SESSION, callID: 'c1' } as never,
    { args: row.args(fixture) } as never,
  );
}

function runSide(row: Row, side: Side) {
  return captureInProcessCall(fixture, side, row.env ?? {}, () => callToolExecuteBefore(side, row));
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
  () => fixture.root,
);

test('the config hook adds the builtin command without dropping the host own', async () => {
  const configured = async (side: Side) => {
    const config: Record<string, unknown> = { command: { own: { template: 'x' } } };
    const plugin = await createPlugin(side, ROWS[0] as Row);
    await plugin.config(config as never);
    return config.command;
  };

  const ported = await configured('ported');
  expect(ported).toStrictEqual((await configured('shipped')) as Record<string, unknown>);
  expect(ported).toMatchSnapshot();
  expect(Object.keys(ported as Record<string, unknown>)).toStrictEqual(['cc-safety-net', 'own']);
});

test('the shell route and the Windows workdir resolve the same way on both sides', () => {
  withEnv({ SHELL: undefined }, () => {
    for (const [shell, platform, environmentShell, route] of SHELL_ROUTES) {
      const ported = portedShellRoute(shell, platform, environmentShell);
      expect(ported).toBe(shippedShellRoute(shell, platform, environmentShell));
      expect(ported).toBe(route);
    }
  });

  for (const [workdir, resolved] of WINDOWS_WORKDIRS) {
    expect(portedNormalizeWorkdir(workdir)).toBe(shippedNormalizeWorkdir(workdir));
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
  const run = (side: Side) =>
    captureInProcessCall(fixture, side, { CC_SAFETY_NET_HOME: undefined }, () =>
      callToolExecuteBefore(side, row, homeDir),
    );

  // The shipped plugin never reads the policy from `homeDir`, so the rule still denies there.
  expect((await run('shipped')).thrown).toContain('Rule: git.reset-hard');
  const ported = await run('ported');
  expect(ported.thrown).toBeUndefined();
  // The allow comes from the valid policy, not from a salvaged invalid one.
  expect(ported.entries[0]?.entry).toMatchObject({ decision: 'allow' });
  expect(ported.entries[0]?.entry).not.toHaveProperty('configFallback');
});

test('a homeDir input steers the shipped audit tree and the environment steers the ported one', async () => {
  const row = ROWS[0] as Row;
  const homeDir = join(fixture.root, 'opencode-home');
  const run = (side: Side) =>
    captureInProcessCall(fixture, side, {}, () => callToolExecuteBefore(side, row, homeDir));

  const shipped = await run('shipped');
  const shippedEntries = readAuditEntries(homeDir);
  const ported = await run('ported');

  const portedEntries = ported.entries.map((line) => line.entry);
  expect(portedEntries).toStrictEqual(shippedEntries.map((line) => line.entry));
  recordPorted(portedEntries, rootFolds(fixture.root));
  expect(shippedEntries).toHaveLength(1);
  // The shipped plugin wrote nowhere else, and the ported one wrote nowhere but the audit home.
  expect(shipped.entries).toStrictEqual([]);
  expect(readAuditEntries(auditHomeFor(fixture, 'ported'))).toHaveLength(1);
  expect(readAuditEntries(homeDir)).toStrictEqual(shippedEntries);
});
