import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFailedClosedDenial, formatDenial } from '@/core/denial';
import { createProcessEnvironment } from '@/core/environment';
import { getUserPolicyPath } from '@/core/policy/paths';
import {
  createPiToolCallHandler as portedHandler,
  registerToolCallEvent as portedRegister,
  handlePiToolCall as portedToolCall,
} from '@/hosts/pi/tool-call';
import { createHookFixture, type HookFixture } from '../../helpers/hook-hosts';
import {
  captureInProcessCall,
  describeDifferential,
  expectFallbackDeny,
} from '../../helpers/in-process';

/**
 * The Pi `tool_call` event driven through a fake extension context: the returned decision, the
 * stderr lines and the audit tree are recorded per row. The last case is the port's own contract —
 * a context that throws blocks in Pi's form instead of escaping the handler.
 */

const SESSION = 'pi-1';
const ANALYZER_FAILURE = 'injected analyzer failure';
const SECRET_SCAN_FAILURE = 'injected secret scan failure';
const CONTEXT_FAILURE = 'injected context failure';

type Row = {
  name: string;
  event: (fixture: HookFixture) => unknown;
  cwd?: (fixture: HookFixture) => string;
  breaks?: 'analyzer' | 'secret-scan';
  /** Loads the user policy from the malformed file this test writes beside the fixture. */
  brokenPolicy?: true;
  env?: Record<string, string | undefined>;
  /** Text the block reason must carry, so a row cannot pass by blocking with a bare frame. */
  contains?: string;
  blocked: boolean;
  lines: number;
};

const failingAnalyzer = (): never => {
  throw new Error(ANALYZER_FAILURE);
};

const failingSecretScan = (): never => {
  throw new Error(SECRET_SCAN_FAILURE);
};

const bash = (command: string) => ({ type: 'tool_call', toolName: 'bash', input: { command } });
const read = (path: string) => ({ type: 'tool_call', toolName: 'read', input: { path } });

const ROWS: readonly Row[] = [
  {
    name: 'a destructive command',
    event: () => bash('rm -rf /'),
    contains: 'BLOCKED by CC Safety Net',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a safe command recorded as an allow',
    event: () => bash('git status'),
    blocked: false,
    lines: 1,
  },
  {
    name: 'a safe command under the blocked-only audit scope',
    event: () => bash('git status'),
    env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' },
    blocked: false,
    lines: 0,
  },
  {
    name: 'a bash call without a tool input',
    event: () => ({ type: 'tool_call', toolName: 'bash' }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a bash call with a blank command',
    event: () => bash('   '),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a read of a file in the project',
    event: () => read('README.md'),
    blocked: false,
    lines: 0,
  },
  {
    name: 'a read of a private key',
    event: (fixture) => read(join(fixture.home, '.ssh', 'id_rsa')),
    contains: 'Rule: secret.home.ssh',
    blocked: true,
    lines: 1,
  },
  {
    name: 'a read call without a tool input',
    event: () => ({ type: 'tool_call', toolName: 'read' }),
    blocked: false,
    lines: 0,
  },
  { name: 'an event that is null', event: () => null, blocked: false, lines: 0 },
  {
    name: 'an event of another type',
    event: () => ({ type: 'other', toolName: 'bash', input: { command: 'rm -rf /' } }),
    blocked: false,
    lines: 0,
  },
  {
    name: 'an event without a tool name',
    event: () => ({ type: 'tool_call', toolName: '', input: { command: 'git status' } }),
    blocked: true,
    lines: 1,
  },
  {
    name: 'a context directory that is a regular file',
    event: () => bash('git status'),
    cwd: (fixture) => fixture.file,
    blocked: true,
    lines: 1,
  },
  {
    name: 'a context without a directory',
    event: () => bash('git status'),
    cwd: () => '',
    blocked: true,
    lines: 1,
  },
  {
    name: 'an analyzer that fails on a command',
    event: () => bash('echo analyzed'),
    breaks: 'analyzer',
    contains: 'Command: echo analyzed',
    blocked: true,
    lines: 1,
  },
  {
    name: 'an analyzer that fails with debug output on',
    event: () => bash('echo analyzed'),
    breaks: 'analyzer',
    env: { CC_SAFETY_NET_DEBUG: '1' },
    blocked: true,
    lines: 1,
  },
  {
    // The one route where the evidence is dropped. The tool input carries a command anyway, so
    // the block would name it if the route flag were wrong.
    name: 'a secret scan that fails on a read',
    event: () => ({
      type: 'tool_call',
      toolName: 'read',
      input: { path: 'README.md', command: 'cat README.md' },
    }),
    breaks: 'secret-scan',
    blocked: true,
    lines: 1,
  },
  {
    // Denied after the config load, unlike `rm -rf /`, so the degraded policy reaches the block
    // reason as a `Config warning:` paragraph and the audit line as `configFallback`.
    name: 'a user policy file that is not valid JSON',
    event: () => bash('git reset --hard HEAD~1'),
    brokenPolicy: true,
    contains: 'Config warning:',
    blocked: true,
    lines: 1,
  },
];

let fixture: HookFixture;
let rulesDir: string;

beforeEach(() => {
  fixture = createHookFixture('next-pi-');
  rulesDir = join(fixture.root, 'pi-config', 'rules');
  mkdirSync(rulesDir, { recursive: true });
  writeFileSync(getUserPolicyPath(createProcessEnvironment(), { userConfigDir: rulesDir }), '{');
});

afterEach(() => {
  fixture.remove();
});

function contextFor(row: Row) {
  return {
    cwd: (row.cwd ?? ((current: HookFixture) => current.project))(fixture),
    sessionManager: { getSessionId: () => SESSION },
  };
}

function runSide(row: Row) {
  const handler = portedHandler({
    guardDependencies:
      row.breaks === 'analyzer'
        ? { analyzeCommand: failingAnalyzer }
        : row.breaks === 'secret-scan'
          ? { findSensitiveTarget: failingSecretScan }
          : undefined,
    policyOptions: row.brokenPolicy ? { userConfigDir: rulesDir } : undefined,
  });
  return captureInProcessCall(fixture, row.env ?? {}, () =>
    handler(row.event(fixture), contextFor(row)),
  );
}

describeDifferential(
  'one Pi tool call through both handlers',
  ROWS,
  runSide,
  (row, agreed) => {
    expect(agreed.entries).toHaveLength(row.lines);
    expect(agreed.returned?.reason ?? '').toContain(row.contains ?? '');
    expect(agreed.returned === undefined).toBe(!row.blocked);
  },
  () => fixture.root,
);

test('the block for a failing secret scan names no command', async () => {
  const row = ROWS.find((candidate) => candidate.breaks === 'secret-scan') as Row;
  const blocked = await runSide(row);

  expect(blocked.returned?.reason).not.toContain('Command:');
  expect(blocked.returned?.reason).toContain('failed closed');
});

test('the debug line names the failing Pi event', async () => {
  const row = ROWS.find((candidate) => candidate.env?.CC_SAFETY_NET_DEBUG === '1') as Row;
  const debugged = await runSide(row);

  expect(debugged.stderr).toStrictEqual([
    `CC Safety Net debug: pi tool_call analysis failed: ${ANALYZER_FAILURE}`,
  ]);
});

test('an unusable context directory is the one the audit records', async () => {
  const row = ROWS.find((candidate) => candidate.cwd?.(fixture) === fixture.file) as Row;

  expect((await runSide(row)).entries[0]?.entry).toMatchObject({
    decision: 'deny',
    agent: 'pi',
    cwd: fixture.file,
  });
});

test('registering the event claims tool_call on both sides', () => {
  const record = (register: (pi: { on: (...args: unknown[]) => void }) => void) => {
    const recorded: unknown[][] = [];
    register({ on: (...args) => recorded.push(args) });
    return recorded;
  };
  const named = (recorded: unknown[][]) =>
    recorded.map(([event, handler]) => [event, typeof handler]);

  expect(named(record(portedRegister))).toStrictEqual([['tool_call', 'function']]);
  expect(record(portedRegister)[0]?.[1]).toBe(portedToolCall);
});

test('a context that throws blocks in Pi form instead of escaping the handler', async () => {
  const hostile = {
    get cwd(): string {
      throw new Error(CONTEXT_FAILURE);
    },
    sessionManager: { getSessionId: () => SESSION },
  };
  expectFallbackDeny(
    await captureInProcessCall(fixture, {}, () => portedHandler({})(bash('git status'), hostile)),
    {
      denial: { block: true, reason: formatDenial(createFailedClosedDenial()) },
      failure: CONTEXT_FAILURE,
    },
  );
});
