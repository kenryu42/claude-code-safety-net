import { afterAll, expect, test } from 'bun:test';
import { join } from 'node:path';
import { REASON_COMMAND_ANALYSIS_LIMIT } from '@/core/budget';
import { captureHookRun, clearAuditLogs, readAuditEntries } from '../../helpers/hook-capture';
import {
  createHookFixture,
  HOOK_HOSTS,
  type HookHost,
  type HookRow,
  hostEnv,
} from '../../helpers/hook-hosts';

/**
 * Every stdin host, driven over its own payload: each row answers with the verdict the shared table
 * declares for it, whichever of the nine protocols carried it there. The shape checks below are the
 * port's own contract: each host has to deny in its own document shape, because a Claude-shaped
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

/** The whole allow document of the two hosts whose protocol answers every call. */
const ALLOW_DOCUMENTS: Record<string, object> = {
  cursor: { permission: 'allow' },
  'grok-build': { decision: 'allow' },
};

const fixture = createHookFixture('next-hook-adapters-');

afterAll(() => {
  fixture.remove();
});

async function runSide(host: HookHost, row: HookRow) {
  const auditHome = join(fixture.home, 'audit-ported');
  const captured = await captureHookRun(
    row.stdin,
    { ...hostEnv(fixture, auditHome), ...row.env },
    host.ported,
  );
  const audit = readAuditEntries(auditHome);
  clearAuditLogs(auditHome);
  return { ...captured, audit };
}

function rowNamed(host: HookHost, name: string): HookRow {
  return host.rows(fixture).find((candidate) => candidate.name === name) as HookRow;
}

/**
 * The debug detail is the gate's own exception message; the stage label in front of it is what the
 * line reports, so a recorded row keeps the label and the test below spells out the message.
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
    // The oversized row moves 8 MiB through the adapter; the rest finish far sooner.
    test(`${host.id}: ${row.name}`, async () => {
      const ported = await runSide(host, row);
      // A host that prints nothing has allowed the call by saying nothing; one that prints says it
      // exactly once, because a second document would be a second answer to one call.
      expect(ported.stdout).toHaveLength(row.expected.document === 'none' ? 0 : 1);
      expect(ported.stderr.map(debugStage)).toHaveLength(row.expected.stderr ?? 0);
      expect(ported.audit.map((line) => line.entry.decision)).toEqual(
        row.expected.audit === 'none' ? [] : [row.expected.audit],
      );
      if (row.expected.ruleId !== undefined) {
        expect(ported.audit[0]?.entry.ruleId).toBe(row.expected.ruleId);
      }
      if (row.expected.document === 'none') return;
      // An allow carries no reason at all: the whole document is the permission it grants.
      if (row.expected.document === 'allow') {
        expect(JSON.parse(ported.stdout[0] as string)).toEqual(ALLOW_DOCUMENTS[host.id] as object);
        return;
      }
      // A denial is a reason the reader can act on, in the host's own shape.
      expect(keyPaths(JSON.parse(ported.stdout[0] as string))).toStrictEqual(
        DENY_DOCUMENT_KEYS[host.id] as string[],
      );
      expect(ported.stdout[0]).toContain('BLOCKED by CC Safety Net');
    }, 30_000);
  }

  test(`${host.id}: denies in its own document shape`, async () => {
    const ported = await runSide(host, rowNamed(host, CWD_IS_A_FILE));
    expect(ported.stdout).toHaveLength(1);
    expect(keyPaths(JSON.parse(ported.stdout[0] as string))).toStrictEqual(
      DENY_DOCUMENT_KEYS[host.id] as string[],
    );
    expect(ported.stdout[0]).toContain('CC Safety Net');
  });

  // A payload built with a field this host does not read reaches the gate as nothing at all, and
  // every row above would still record — an empty run. These two anchor the table to the gate:
  // the denied row has to print a document, the allowed row has to be audited.
  test(`${host.id}: the table reaches the gate`, async () => {
    expect((await runSide(host, rowNamed(host, DENIED))).stdout).toHaveLength(1);
    expect((await runSide(host, rowNamed(host, ALLOWED))).audit).toHaveLength(1);
  });
}

test("the debug detail is each implementation's own limit message", async () => {
  const host = HOOK_HOSTS[0] as HookHost;
  const row = rowNamed(host, BREACHED_WITH_DEBUG);

  expect((await runSide(host, row)).stderr).toStrictEqual([
    `${DEBUG_STAGE}${REASON_COMMAND_ANALYSIS_LIMIT}`,
  ]);
});
