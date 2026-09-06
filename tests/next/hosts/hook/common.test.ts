import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFailedClosedDenial, formatDenial } from '@next/core/denial';
import {
  getToolRoute as portedGetToolRoute,
  resolveStandardHookContext as portedResolveStandardHookContext,
} from '@next/gate/intake';
import { runConfiguredHookAdapter as portedRunAdapter } from '@next/hosts/hook/common';
import {
  getToolRoute as shippedGetToolRoute,
  resolveStandardHookContext as shippedResolveStandardHookContext,
  runConfiguredHookAdapter as shippedRunAdapter,
} from '@/integrations/hook/common';
import { captureHookRun, readAuditEntries } from '../../helpers/hook-capture';
import { recordPorted, rootFolds } from '../../helpers/temp-home';

/**
 * The hook runner itself, driven through one fake host whose documents are `{deny}` and `{allow}`
 * so every row shows the runner's own decisions rather than a host's formatting. The two
 * implementations run the same payload under the same home, and the stdout lines, the stderr
 * lines and the audit tree must agree; the last case is the port's own contract, an adapter
 * failure that the shipped runner lets escape.
 */

type FakeInput = {
  event?: string;
  tool?: unknown;
  session?: string;
  cwd?: unknown;
  tool_input?: unknown;
};

const COMMAND_TOOLS = new Map<string, 'posix'>([['sh', 'posix']]);
const SESSION = 'hook-common-1';
const CONTEXT_FAILURE = 'injected context failure';
const ANALYZER_FAILURE = 'injected analyzer failure';

const SHARED = {
  agent: 'fake',
  createDenyOutput: (message: string) => ({ deny: message }),
  createAllowOutput: () => ({ allow: true }),
  isSupported: (input: FakeInput) => input.event === 'pre',
  getToolName: (input: FakeInput) => input.tool,
  getSessionId: (input: FakeInput) => input.session,
};

const failingAnalyzer = (): never => {
  throw new Error(ANALYZER_FAILURE);
};

const failingContext = (): never => {
  throw new Error(CONTEXT_FAILURE);
};

type Fixture = { home: string; project: string };

type Row = {
  name: string;
  input: (fixture: Fixture) => string | Uint8Array;
  env?: Record<string, string | undefined>;
  breaks?: 'analyzer' | 'context';
  /** Text the deny or allow document must carry, so a row cannot pass by printing nothing. */
  contains?: string;
  lines: number;
};

function runShipped(row: Row) {
  return shippedRunAdapter<FakeInput>({
    ...SHARED,
    guardDependencies: row.breaks === 'analyzer' ? { analyzeCommand: failingAnalyzer } : undefined,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: shippedGetToolRoute(toolName, COMMAND_TOOLS),
    }),
    getContext: (input, toolInput, toolName, outputDeny) =>
      row.breaks === 'context'
        ? failingContext()
        : shippedResolveStandardHookContext(input.cwd, toolInput, toolName, outputDeny),
  });
}

function runPorted(row: Row) {
  return portedRunAdapter<FakeInput>({
    ...SHARED,
    guardDependencies: row.breaks === 'analyzer' ? { analyzeCommand: failingAnalyzer } : undefined,
    getToolInput: (input, toolName) => ({
      ok: true,
      input: input.tool_input,
      route: portedGetToolRoute(toolName, COMMAND_TOOLS),
    }),
    getContext: (input, toolInput, toolName, outputDeny, environment) =>
      row.breaks === 'context'
        ? failingContext()
        : portedResolveStandardHookContext(
            input.cwd,
            toolInput,
            toolName,
            outputDeny,
            environment.paths,
            process.cwd(),
          ),
  });
}

const shellPayload = (fixture: Fixture, command: string) =>
  JSON.stringify({
    event: 'pre',
    session: SESSION,
    cwd: fixture.project,
    tool: 'sh',
    tool_input: { command },
  });

const ROWS: readonly Row[] = [
  {
    name: 'a denied command',
    input: (fixture) => shellPayload(fixture, 'rm -rf /'),
    contains: 'BLOCKED by CC Safety Net',
    lines: 1,
  },
  {
    name: 'an allowed command recorded under the default audit scope',
    input: (fixture) => shellPayload(fixture, 'git status'),
    contains: '"allow":true',
    lines: 1,
  },
  {
    name: 'an allowed command under the blocked-only audit scope',
    input: (fixture) => shellPayload(fixture, 'git status'),
    env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' },
    contains: '"allow":true',
    lines: 0,
  },
  {
    name: 'an event the host does not handle',
    input: (fixture) =>
      JSON.stringify({ event: 'post', session: SESSION, cwd: fixture.project, tool: 'sh' }),
    lines: 0,
  },
  {
    name: 'a payload that is not JSON',
    input: () => '{',
    contains: 'Failed to parse hook input JSON.',
    lines: 0,
  },
  { name: 'an empty payload', input: () => '', contains: 'Missing hook input JSON.', lines: 0 },
  {
    name: 'a payload that is an array',
    input: () => '[]',
    contains: 'failed closed',
    lines: 0,
  },
  {
    name: 'a payload past the input byte limit',
    input: () => new Uint8Array(8 * 1024 * 1024 + 1).fill(0x20),
    contains: 'Failed to parse hook input JSON.',
    lines: 0,
  },
  {
    name: 'a payload without a tool name',
    input: (fixture) =>
      JSON.stringify({
        event: 'pre',
        session: SESSION,
        cwd: fixture.project,
        tool_input: { command: 'git status' },
      }),
    contains: 'failed closed',
    lines: 1,
  },
  {
    name: 'a read tool over a relative path',
    input: (fixture) =>
      JSON.stringify({
        event: 'pre',
        session: SESSION,
        cwd: fixture.project,
        tool: 'Read',
        tool_input: { file_path: 'README.md' },
      }),
    contains: '"allow":true',
    lines: 0,
  },
  {
    name: 'a read tool over a private key',
    input: (fixture) =>
      JSON.stringify({
        event: 'pre',
        session: SESSION,
        cwd: fixture.project,
        tool: 'Read',
        tool_input: { file_path: join(fixture.home, '.ssh', 'id_rsa') },
      }),
    contains: 'Tool:',
    lines: 1,
  },
  {
    name: 'a payload without a cwd',
    input: () =>
      JSON.stringify({
        event: 'pre',
        session: SESSION,
        tool: 'sh',
        tool_input: { command: 'echo ok' },
      }),
    contains: '"allow":true',
    lines: 1,
  },
  {
    name: 'a cwd that is a regular file',
    input: (fixture) =>
      JSON.stringify({
        event: 'pre',
        session: SESSION,
        cwd: join(fixture.home, 'not-a-directory'),
        tool: 'sh',
        tool_input: { command: 'git status' },
      }),
    contains: 'Segment:',
    lines: 1,
  },
  {
    name: 'an analyzer that fails',
    input: (fixture) => shellPayload(fixture, 'echo analyzed'),
    breaks: 'analyzer',
    contains: 'failed closed',
    lines: 1,
  },
  {
    name: 'an analyzer that fails with debug output on',
    input: (fixture) => shellPayload(fixture, 'echo analyzed'),
    env: { CC_SAFETY_NET_DEBUG: '1' },
    breaks: 'analyzer',
    contains: 'failed closed',
    lines: 1,
  },
];

let fixture: Fixture;

beforeEach(() => {
  const home = mkdtempSync(
    join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'next-hook-common-'),
  );
  mkdirSync(join(home, 'project'));
  mkdirSync(join(home, '.ssh'));
  writeFileSync(join(home, '.ssh', 'id_rsa'), 'not a real key\n');
  writeFileSync(join(home, 'not-a-directory'), 'a file where a directory is expected\n');
  fixture = { home, project: join(home, 'project') };
});

afterEach(() => {
  rmSync(fixture.home, { recursive: true, force: true });
});

function environmentFor(row: Row, side: string) {
  return {
    HOME: fixture.home,
    CC_SAFETY_NET_HOME: join(fixture.home, '.cc-safety-net'),
    CC_SAFETY_NET_AUDIT_HOME: join(fixture.home, `audit-${side}`),
    CC_SAFETY_NET_AUDIT_SCOPE: undefined,
    CC_SAFETY_NET_DEBUG: undefined,
    ...row.env,
  };
}

async function runSide(row: Row, side: 'shipped' | 'ported') {
  const captured = await captureHookRun(row.input(fixture), environmentFor(row, side), () =>
    side === 'shipped' ? runShipped(row) : runPorted(row),
  );
  return { ...captured, entries: readAuditEntries(join(fixture.home, `audit-${side}`)) };
}

describe('one payload through both runners', () => {
  for (const row of ROWS) {
    test(row.name, async () => {
      const shipped = await runSide(row, 'shipped');
      const ported = await runSide(row, 'ported');

      expect(ported).toStrictEqual(shipped);
      // The audit writer names a project's log directory after the directory the call ran in,
      // with every separator spelled `-`, which neither path fold reaches; the row without a cwd
      // of its own falls back to the checkout the suite runs in.
      recordPorted(ported, [
        ...rootFolds(fixture.home),
        [fixture.home.replaceAll('/', '-'), '<home>'],
        [process.cwd(), '<cwd>'],
        [process.cwd().replaceAll('/', '-'), '<cwd>'],
      ]);
      expect(shipped.entries).toHaveLength(row.lines);
      expect(shipped.stdout.join('\n')).toContain(row.contains ?? '');
      expect(shipped.stdout).toHaveLength(row.contains === undefined ? 0 : 1);
    });
  }
});

test('an adapter that throws denies in the host format instead of escaping the runner', async () => {
  const row: Row = {
    name: 'context',
    input: (current) => shellPayload(current, 'git status'),
    breaks: 'context',
    lines: 0,
  };

  const ported = await runSide(row, 'ported');
  expect(ported.stdout).toStrictEqual([
    JSON.stringify({ deny: formatDenial(createFailedClosedDenial()) }),
  ]);
  expect(ported.stderr[0]).toStartWith('CC Safety Net error:');
  expect(ported.stderr[0]).toContain(CONTEXT_FAILURE);
  expect(ported.entries).toStrictEqual([]);

  await expect(runSide(row, 'shipped')).rejects.toThrow(CONTEXT_FAILURE);
});
