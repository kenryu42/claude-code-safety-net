import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createFailedClosedDenial, formatDenial } from '@/core/denial';
import {
  createOpenClawBeforeToolCallHandler as portedHandler,
  registerOpenClawPlugin as portedRegister,
} from '@/hosts/openclaw/plugin';
import { createHookFixture, type HookFixture } from '../../helpers/hook-hosts';
import {
  captureInProcessCall,
  describeDifferential,
  expectFallbackDeny,
} from '../../helpers/in-process';

/**
 * The OpenClaw `before_tool_call` hook driven through a fake plugin API: the returned decision,
 * the stderr lines and the audit tree are recorded per row. The last case is the port's own
 * contract — a host context that throws denies in OpenClaw's own form instead of escaping the
 * handler.
 */

const AGENT = 'agent-1';
const SESSION = 'openclaw-1';
const WORKSPACE_FAILURE = 'injected workspace failure';
const ANALYZER_FAILURE = 'injected analyzer failure';
const CONTEXT_FAILURE = 'injected context failure';

type Ctx = {
  toolName: string;
  agentId?: string;
  sessionId?: string;
  abortSignal?: AbortSignal;
};

type Row = {
  name: string;
  event: (fixture: HookFixture) => unknown;
  ctx?: (fixture: HookFixture) => Ctx;
  /** How the fake API answers `resolveAgentWorkspaceDir`; the project directory by default. */
  workspace?: 'throws';
  breaks?: boolean;
  env?: Record<string, string | undefined>;
  /** Text the block reason must carry, so a row cannot pass by blocking with a bare frame. */
  contains?: string;
  blocked: boolean;
  lines: number;
};

const failingAnalyzer = (): never => {
  throw new Error(ANALYZER_FAILURE);
};

const exec = (params: unknown) => ({ toolName: 'exec', params });

function createFakeApi(fixture: HookFixture, workspace: Row['workspace']) {
  const calls: unknown[][] = [];
  const workspaceByAgent: Record<string, string> = { [AGENT]: fixture.project };
  return {
    calls,
    api: {
      config: {},
      runtime: {
        agent: {
          resolveAgentWorkspaceDir: (_config: unknown, agentId: string) => {
            if (workspace === 'throws') throw new Error(WORKSPACE_FAILURE);
            return workspaceByAgent[agentId];
          },
        },
      },
      on: (...args: unknown[]) => {
        calls.push(args);
      },
    },
  };
}

const ROWS: readonly Row[] = [
  {
    name: 'a destructive command',
    event: () => exec({ command: 'git push --force origin main' }),
    contains: 'BLOCKED by CC Safety Net',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a safe command recorded as an allow',
    event: () => exec({ command: 'git status' }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'a safe command under the blocked-only audit scope',
    event: () => exec({ command: 'git status' }),
    env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' },
    blocked: false,
    lines: 0,
  },
  {
    name: 'the gateway exec host',
    event: () => exec({ command: 'git status', host: 'gateway' }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'the auto exec host',
    event: () => exec({ command: 'git status', host: 'auto' }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'the sandbox exec host',
    event: () => exec({ command: 'git status', host: 'sandbox' }),
    contains: 'Command: git status',
    blocked: true,
    lines: 1,
  },
  {
    name: 'the node exec host',
    event: () => exec({ command: 'git status', host: 'node' }),
    contains: 'Command: git status',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a workdir inside the workspace',
    event: () => exec({ command: 'git status', workdir: 'sub' }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'a workdir outside the workspace',
    event: (fixture) => exec({ command: 'git status', workdir: fixture.outside }),
    contains: 'Segment:',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a blank workdir',
    event: () => exec({ command: 'git status', workdir: '' }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a workdir key holding undefined',
    event: () => exec({ command: 'git status', workdir: undefined }),
    blocked: false,
    lines: 1,
  },
  {
    name: 'a tagged exec tool',
    event: () => ({ toolName: 'exec', toolKind: 'code', params: { command: 'rm -rf /' } }),
    blocked: false,
    lines: 0,
  },
  {
    name: 'a tool other than exec',
    event: () => ({ toolName: 'read', params: { path: 'README.md' } }),
    blocked: false,
    lines: 0,
  },
  { name: 'an event that is null', event: () => null, blocked: true, lines: 1 },
  {
    name: 'an event without a tool name',
    event: () => ({ toolName: '', params: { command: 'git status' } }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'params that are an array',
    event: () => ({ toolName: 'exec', params: ['git status'] }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a context without an agent id',
    event: () => exec({ command: 'git status' }),
    ctx: () => ({ toolName: 'exec', sessionId: SESSION }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a workspace lookup that throws',
    event: () => exec({ command: 'git status' }),
    workspace: 'throws',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a tool call that was already cancelled',
    event: () => exec({ command: 'rm -rf /' }),
    ctx: () => ({
      toolName: 'exec',
      agentId: AGENT,
      sessionId: SESSION,
      abortSignal: AbortSignal.abort(),
    }),
    blocked: true,
    lines: 0,
  },
  {
    name: 'an analyzer that fails',
    event: () => exec({ command: 'echo analyzed' }),
    breaks: true,
    contains: 'Command: echo analyzed',
    blocked: true,
    lines: 1,
  },
  {
    name: 'an analyzer that fails with debug output on',
    event: () => exec({ command: 'echo analyzed' }),
    breaks: true,
    env: { CC_SAFETY_NET_DEBUG: '1' },
    blocked: true,
    lines: 1,
  },
];

let fixture: HookFixture;

beforeEach(() => {
  fixture = createHookFixture('next-openclaw-');
});

afterEach(() => {
  fixture.remove();
});

function defaultCtx(): Ctx {
  return { toolName: 'exec', agentId: AGENT, sessionId: SESSION };
}

function runSide(row: Row) {
  const handler = portedHandler(createFakeApi(fixture, row.workspace).api, {
    guardDependencies: row.breaks ? { analyzeCommand: failingAnalyzer } : undefined,
  });
  return captureInProcessCall(fixture, row.env ?? {}, () =>
    handler(row.event(fixture), (row.ctx ?? defaultCtx)(fixture)),
  );
}

describeDifferential(
  'one OpenClaw tool call through both handlers',
  ROWS,
  runSide,
  (row, agreed) => {
    expect(agreed.entries).toHaveLength(row.lines);
    expect(agreed.returned?.blockReason ?? '').toContain(row.contains ?? '');
    expect(agreed.returned === undefined).toBe(!row.blocked);
  },
  () => fixture.root,
);

test('the debug line names the failing OpenClaw hook', async () => {
  const row = ROWS.find((candidate) => candidate.env?.CC_SAFETY_NET_DEBUG === '1');
  const debugged = await runSide(row as Row);

  expect(debugged.stderr).toStrictEqual([
    `CC Safety Net debug: openclaw before_tool_call analysis failed: ${ANALYZER_FAILURE}`,
  ]);
});

test('registering the plugin claims the same hook on both sides', () => {
  const ported = createFakeApi(fixture, undefined);
  portedRegister(ported.api);

  const recorded = (calls: unknown[][]) =>
    calls.map(([hook, handler, options]) => [hook, typeof handler, options]);
  expect(recorded(ported.calls)).toStrictEqual([
    ['before_tool_call', 'function', { matcher: ['exec'], priority: 50 }],
  ]);
});

test('a host context that throws blocks in OpenClaw form instead of escaping the handler', async () => {
  const hostile = {
    toolName: 'exec',
    agentId: AGENT,
    sessionId: SESSION,
    get abortSignal(): undefined {
      throw new Error(CONTEXT_FAILURE);
    },
  };
  expectFallbackDeny(
    await captureInProcessCall(fixture, {}, () =>
      portedHandler(createFakeApi(fixture, undefined).api)(
        exec({ command: 'git status' }),
        hostile,
      ),
    ),
    {
      denial: { block: true, blockReason: formatDenial(createFailedClosedDenial()) },
      failure: CONTEXT_FAILURE,
    },
  );
});

test('the allow row records the command OpenClaw was about to run', async () => {
  const allowed = await runSide(ROWS[1] as Row);

  expect(allowed.entries[0]?.entry).toMatchObject({
    decision: 'allow',
    agent: 'openclaw',
    command: 'git status',
  });
});
