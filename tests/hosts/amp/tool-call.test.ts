import { afterEach, beforeEach, expect, test } from 'bun:test';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createFailedClosedDenial, formatDenial } from '@/core/denial';
import { createAmpToolCallHandler as portedHandler } from '@/hosts/amp/tool-call';
import { createHookFixture, type HookFixture } from '../../helpers/hook-hosts';
import {
  captureInProcessCall,
  describeDifferential,
  expectFallbackDeny,
} from '../../helpers/in-process';

/**
 * The Amp `tool.call` event driven through a fake plugin API: the workspace root arrives as a URI
 * the fake resolves to the fixture project, and the shell command through Amp's own extractor. The
 * returned action, the stderr lines and the audit tree are recorded per row; the last case is the
 * port's own contract — an API that throws rejects in Amp's form instead of escaping the handler.
 */

const THREAD = 'amp-1';
const ANALYZER_FAILURE = 'injected analyzer failure';
const SECRET_SCAN_FAILURE = 'injected secret scan failure';
const URI_FAILURE = 'injected workspace uri failure';
const EXTRACTOR_FAILURE = 'injected shell extractor failure';
const API_FAILURE = 'injected api failure';
const WORKSPACE_URI = { toString: () => 'file:///workspace' };

type ShellEvent = { tool?: unknown; input?: unknown; thread?: { id?: unknown } };

type Row = {
  name: string;
  event: (fixture: HookFixture) => unknown;
  /** The fake API's answers: no workspace root, or a helper that throws. */
  api?: 'no-root' | 'uri-throws' | 'extractor-throws';
  breaks?: 'analyzer' | 'secret-scan';
  env?: Record<string, string | undefined>;
  /** Text the rejection must carry, so a row cannot pass by rejecting with a bare frame. */
  contains?: string;
  rejected: boolean;
  lines: number;
};

const failingAnalyzer = (): never => {
  throw new Error(ANALYZER_FAILURE);
};

const failingSecretScan = (): never => {
  throw new Error(SECRET_SCAN_FAILURE);
};

const shell = (cmd: string, dir?: string) => ({
  tool: 'Bash',
  input: { cmd, dir },
  thread: { id: THREAD },
});

function createFakeAmp(fixture: HookFixture, api: Row['api']) {
  return {
    system: { workspaceRoot: api === 'no-root' ? null : WORKSPACE_URI },
    helpers: {
      filePathFromURI: () => {
        if (api === 'uri-throws') throw new Error(URI_FAILURE);
        return fixture.project;
      },
      // Amp's own extractor: only its shell tools carry a command, everything else is a plain tool.
      shellCommandFromToolCall: (event: ShellEvent) => {
        if (api === 'extractor-throws') throw new Error(EXTRACTOR_FAILURE);
        if (event.tool !== 'Bash') return null;
        const input = event.input as { cmd: string; dir?: string };
        return { command: input.cmd, dir: input.dir };
      },
    },
  };
}

const ROWS: readonly Row[] = [
  {
    name: 'a destructive command',
    event: () => shell('git push --force origin main'),
    contains: 'BLOCKED by CC Safety Net',
    rejected: true,
    lines: 1,
  },
  {
    name: 'a safe command recorded as an allow',
    event: () => shell('git status'),
    rejected: false,
    lines: 1,
  },
  {
    name: 'a safe command under the blocked-only audit scope',
    event: () => shell('git status'),
    env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' },
    rejected: false,
    lines: 0,
  },
  {
    name: 'a directory inside the workspace',
    event: () => shell('git status', 'sub'),
    rejected: false,
    lines: 1,
  },
  {
    // Amp canonicalizes without containing, so a command outside the workspace is analyzed there.
    name: 'a directory outside the workspace',
    event: (fixture) => shell('git status', fixture.outside),
    rejected: false,
    lines: 1,
  },
  {
    name: 'a directory that does not exist',
    event: () => shell('git status', 'missing'),
    contains: 'Segment: missing',
    rejected: true,
    lines: 1,
  },
  {
    name: 'a shell command without a directory',
    event: () => shell('git status', undefined),
    rejected: false,
    lines: 1,
  },
  {
    name: 'a workspace without a root',
    event: () => shell('git status'),
    api: 'no-root',
    rejected: true,
    lines: 1,
  },
  {
    name: 'a workspace uri that cannot be resolved',
    event: () => shell('git status'),
    api: 'uri-throws',
    rejected: true,
    lines: 1,
  },
  {
    name: 'a shell extractor that throws',
    event: () => shell('git status'),
    api: 'extractor-throws',
    rejected: true,
    lines: 1,
  },
  { name: 'a blank command', event: () => shell(''), rejected: true, lines: 1 },
  {
    name: 'a read of a file in the project',
    event: () => ({ tool: 'Read', input: { path: 'README.md' }, thread: { id: THREAD } }),
    rejected: false,
    lines: 0,
  },
  {
    name: 'a read of a private key',
    event: (fixture) => ({
      tool: 'Read',
      input: { path: join(fixture.home, '.ssh', 'id_rsa') },
      thread: { id: THREAD },
    }),
    contains: 'Rule: secret.home.ssh',
    rejected: true,
    lines: 1,
  },
  { name: 'an event that is null', event: () => null, rejected: true, lines: 0 },
  {
    name: 'an event without a tool name',
    event: () => ({ tool: '', input: { cmd: 'git status' }, thread: { id: THREAD } }),
    rejected: true,
    lines: 1,
  },
  {
    name: 'an event whose input is null',
    event: () => ({ tool: 'Bash', input: null, thread: { id: THREAD } }),
    rejected: true,
    lines: 1,
  },
  {
    name: 'an event without a thread id',
    event: () => ({ tool: 'Bash', input: { cmd: 'rm -rf /' } }),
    rejected: true,
    lines: 0,
  },
  {
    name: 'an analyzer that fails',
    event: () => shell('echo analyzed'),
    breaks: 'analyzer',
    contains: 'Command: echo analyzed',
    rejected: true,
    lines: 1,
  },
  {
    name: 'an analyzer that fails with debug output on',
    event: () => shell('echo analyzed'),
    breaks: 'analyzer',
    env: { CC_SAFETY_NET_DEBUG: '1' },
    rejected: true,
    lines: 1,
  },
  {
    // The one route where the evidence is dropped. The tool input carries a command anyway, so
    // the rejection would name it if the route flag were wrong.
    name: 'a secret scan that fails on a read',
    event: () => ({
      tool: 'Read',
      input: { path: 'README.md', command: 'cat README.md' },
      thread: { id: THREAD },
    }),
    breaks: 'secret-scan',
    rejected: true,
    lines: 1,
  },
];

let fixture: HookFixture;

beforeEach(() => {
  fixture = createHookFixture('next-amp-');
});

afterEach(() => {
  fixture.remove();
});

function runSide(row: Row) {
  const handler = portedHandler({
    guardDependencies:
      row.breaks === 'secret-scan'
        ? { findSensitiveTarget: failingSecretScan }
        : row.breaks && { analyzeCommand: failingAnalyzer },
  });
  return captureInProcessCall(fixture, row.env ?? {}, () =>
    handler(row.event(fixture), createFakeAmp(fixture, row.api)),
  );
}

describeDifferential(
  'one Amp tool call through both handlers',
  ROWS,
  runSide,
  (row, agreed) => {
    expect(agreed.entries).toHaveLength(row.lines);
    expect(agreed.returned?.action).toBe(row.rejected ? 'reject-and-continue' : 'allow');
    expect(JSON.stringify(agreed.returned)).toContain(row.contains ?? '');
  },
  () => fixture.root,
);

test('the debug line names the failing Amp event', async () => {
  const row = ROWS.find((candidate) => candidate.env?.CC_SAFETY_NET_DEBUG === '1') as Row;
  const debugged = await runSide(row);

  expect(debugged.stderr).toStrictEqual([
    `CC Safety Net debug: amp tool.call analysis failed: ${ANALYZER_FAILURE}`,
  ]);
});

test('the rejection for a failing secret scan names no command', async () => {
  const row = ROWS.find((candidate) => candidate.breaks === 'secret-scan') as Row;
  const rejected = JSON.stringify((await runSide(row)).returned);

  expect(rejected).not.toContain('Command:');
  expect(rejected).toContain('failed closed');
});

test('the directory a command runs in is the one the audit records', async () => {
  const row = ROWS.find((candidate) => candidate.name.endsWith('outside the workspace')) as Row;

  expect((await runSide(row)).entries[0]?.entry).toMatchObject({
    decision: 'allow',
    agent: 'amp',
    command: 'git status',
    cwd: realpathSync(fixture.outside),
  });
});

test('an API that throws rejects in Amp form instead of escaping the handler', async () => {
  const hostile = {
    get system(): { workspaceRoot: null } {
      throw new Error(API_FAILURE);
    },
    helpers: createFakeAmp(fixture, undefined).helpers,
  };
  expectFallbackDeny(
    await captureInProcessCall(fixture, {}, () => portedHandler({})(shell('git status'), hostile)),
    {
      denial: { action: 'reject-and-continue', message: formatDenial(createFailedClosedDenial()) },
      failure: API_FAILURE,
    },
  );
});
