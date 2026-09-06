import { afterAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { REASON_COMMAND_ANALYSIS_LIMIT } from '@next/core/budget';
import { captureHookRun, clearAuditLogs, readAuditEntries } from '../../helpers/hook-capture';
import {
  createHookFixture,
  HOOK_HOSTS,
  type HookHost,
  type HookRow,
  hostEnv,
} from '../../helpers/hook-hosts';
import { recordPorted, rootFolds } from '../../helpers/temp-home';

/**
 * Every stdin host, driven twice over the same bytes: the shipped adapter and the ported one read
 * the same payload under the same home, and the documents they print, the stderr they leave and
 * the audit lines they write must agree exactly. The last check is the port's own contract rather
 * than a differential: each host has to deny in its own protocol shape, because a Claude-shaped
 * document is an allow on Cursor and on Grok Build.
 */

const DENIED = 'a denied command';
const ALLOWED = 'an allowed command';
const CWD_IS_A_FILE = 'a cwd that is a regular file';
const BREACHED_WITH_DEBUG = 'a command that breaches an analysis limit with debug output on';
const DEBUG_STAGE = 'CC Safety Net debug: hook policy protection failed: ';

/** The keys of each host's deny document, per contract 6.2. */
const DENY_DOCUMENT_KEYS: Record<string, readonly string[]> = {
  'claude-code': [
    'hookSpecificOutput.hookEventName',
    'hookSpecificOutput.permissionDecision',
    'hookSpecificOutput.permissionDecisionReason',
  ],
  codex: [
    'hookSpecificOutput.hookEventName',
    'hookSpecificOutput.permissionDecision',
    'hookSpecificOutput.permissionDecisionReason',
  ],
  'kimi-code': [
    'hookSpecificOutput.hookEventName',
    'hookSpecificOutput.permissionDecision',
    'hookSpecificOutput.permissionDecisionReason',
  ],
  'gemini-cli': ['decision', 'reason', 'systemMessage'],
  'copilot-cli': ['permissionDecision', 'permissionDecisionReason'],
  cursor: ['permission', 'user_message', 'agent_message'],
  'antigravity-cli': ['decision', 'reason'],
  'grok-build': ['decision', 'reason'],
  'hermes-agent': ['action', 'message'],
};

const fixture = createHookFixture('next-hook-adapters-');

/**
 * Every machine path a recorded row can spell: the fixture, and the checkout the suite runs in,
 * which a payload without a cwd of its own falls back to. Both are also spelled with `-` for every
 * separator, the way the audit writer names the log directory after the directory the call ran in.
 */
const FOLDS = [
  ...rootFolds(fixture.root),
  [fixture.root.replaceAll('/', '-'), '<root>'],
  [process.cwd(), '<cwd>'],
  [process.cwd().replaceAll('/', '-'), '<cwd>'],
] as const;

afterAll(() => {
  fixture.remove();
});

async function runSide(host: HookHost, row: HookRow, side: 'shipped' | 'ported') {
  const auditHome = join(fixture.home, `audit-${side}`);
  const captured = await captureHookRun(
    row.stdin,
    { ...hostEnv(fixture, auditHome), ...row.env },
    side === 'shipped' ? host.shipped : host.ported,
  );
  const audit = readAuditEntries(auditHome);
  clearAuditLogs(auditHome);
  return { ...captured, audit };
}

function rowNamed(host: HookHost, name: string): HookRow {
  return host.rows(fixture).find((candidate) => candidate.name === name) as HookRow;
}

/**
 * The one line the two implementations word differently. The optional debug detail is each
 * implementation's own exception message, and Phase 1 replaced the shipped analyzer's internal
 * `PathCanonicalizationLimitError` text with the single `AnalysisLimit` reason; the stage label in
 * front of it is what the line reports, so the differential compares that and the test below
 * spells out both messages.
 */
const debugStage = (line: string) => line.replace(/^(CC Safety Net debug: [^:]+: ).*$/s, '$1');

/** Every leaf of a document as a dotted path, so a document of the wrong shape cannot match. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) =>
    keyPaths(nested, prefix === '' ? key : `${prefix}.${key}`),
  );
}

for (const host of HOOK_HOSTS) {
  for (const row of host.rows(fixture)) {
    // The oversized row moves 8 MiB through both implementations; the rest finish far sooner.
    test(`${host.id}: ${row.name}`, async () => {
      const shipped = await runSide(host, row, 'shipped');
      const ported = await runSide(host, row, 'ported');
      const compared = { ...ported, stderr: ported.stderr.map(debugStage) };
      expect(compared).toStrictEqual({
        ...shipped,
        stderr: shipped.stderr.map(debugStage),
      });
      recordPorted(compared, FOLDS);
    }, 30_000);
  }

  test(`${host.id}: denies in its own document shape`, async () => {
    const ported = await runSide(host, rowNamed(host, CWD_IS_A_FILE), 'ported');
    expect(ported.stdout).toHaveLength(1);
    expect(keyPaths(JSON.parse(ported.stdout[0] as string))).toStrictEqual(
      DENY_DOCUMENT_KEYS[host.id] as string[],
    );
    expect(ported.stdout[0]).toContain('CC Safety Net');
  });

  // A payload built with a field this host does not read reaches the gate as nothing at all, and
  // every differential row above would still agree — on two empty runs. These two anchor the
  // table to the gate: the denied row has to print a document, the allowed row has to be audited.
  test(`${host.id}: the table reaches the gate`, async () => {
    expect((await runSide(host, rowNamed(host, DENIED), 'ported')).stdout).toHaveLength(1);
    expect((await runSide(host, rowNamed(host, ALLOWED), 'ported')).audit).toHaveLength(1);
  });
}

test("the debug detail is each implementation's own limit message", async () => {
  const host = HOOK_HOSTS[0] as HookHost;
  const row = rowNamed(host, BREACHED_WITH_DEBUG);

  expect((await runSide(host, row, 'shipped')).stderr).toStrictEqual([
    `${DEBUG_STAGE}Path canonicalization work limit exceeded.`,
  ]);
  expect((await runSide(host, row, 'ported')).stderr).toStrictEqual([
    `${DEBUG_STAGE}${REASON_COMMAND_ANALYSIS_LIMIT}`,
  ]);
});
