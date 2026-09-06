import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAuditLogHomeDir, writeAuditLog } from '@next/audit/writer';
import type { AuditLogEntry } from '@next/core/audit';
import { createTestEnvironment } from '@next/core/environment';
import { writeAuditLog as shippedWriteAuditLog } from '@/engine/audit';
import { createSpawnEnv } from '../../helpers';
import { snapshotTree } from '../helpers/fixture-tree';

const NOW = '2026-05-17T12:34:56.789Z';
const LOGS = '.cc-safety-net/logs';
const MARKER = `${LOGS}/.last-prune`;
const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

const logPath = (project: string, session: string) =>
  `${LOGS}/${project}/2026-05/2026-05-17-${session}.jsonl`;

// Token-shaped values are assembled here rather than committed whole: a literal
// trips GitHub push protection, and what matters is what redaction does to them.
const providerToken = `${'gh'}p_A1b2C3d4E5f6G7h8I9j0K1`;
const jwt = `${'ey'}JhbGciOiJIUzI1NiJ9.${'ey'}JzdWIiOiJhZ2VudCJ9.c2lnbmF0dXJlLXZhbHVl`;
const bearer = `${'sk'}-live-Z9y8X7w6V5u4T3s2R1q0P9o8`;

const LONG_COMMAND = `echo ${'a'.repeat(10_100)}`;
const LONG_SEGMENT = `printf ${'b'.repeat(2_100)}`;
const LONG_TOOL_NAME = `Read${'X'.repeat(300)}`;
const LONG_CWD = `/work/${'p'.repeat(33_000)}`;
const SECRET_CWD = '/work/API_KEY=hunter2hunter2/project';

type WriteOptions = Omit<NonNullable<Parameters<typeof writeAuditLog>[6]>, 'now' | 'createId'>;

type Case = {
  name: string;
  sessionId: string;
  command: string;
  segment: string;
  reason: string;
  cwd: string | null;
  /** The layout W6 pins for this input, relative to the audit home; null when nothing is written. */
  file: string | null;
  options: WriteOptions;
};

const CASES: readonly Case[] = [
  {
    name: 'plain deny',
    sessionId: 'session-plain',
    command: 'rm -rf /',
    segment: 'rm -rf /',
    reason: 'Blocked: targeting root or home',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-plain'),
    options: {},
  },
  {
    name: 'allow',
    sessionId: 'session-allow',
    command: 'git status',
    segment: 'git status',
    reason: 'Allowed',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-allow'),
    options: { decision: 'allow' },
  },
  {
    name: 'rule id and intent',
    sessionId: 'session-rule',
    command: 'git reset --hard',
    segment: 'git reset --hard',
    reason: 'Destroys all uncommitted changes',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-rule'),
    options: { ruleId: 'git.reset-hard', intent: 'use_alternative' },
  },
  {
    name: 'failure stage keeps an over-long command whole',
    sessionId: 'session-failure',
    command: LONG_COMMAND,
    segment: 'echo',
    reason: 'CC Safety Net failed closed',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-failure'),
    options: { failureStage: 'command-analysis', errorCode: 'structural-shell-syntax-limit' },
  },
  {
    name: 'the same over-long command without a failure stage is capped',
    sessionId: 'session-capped',
    command: LONG_COMMAND,
    segment: 'echo',
    reason: 'Blocked: dangerous pattern',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-capped'),
    options: {},
  },
  {
    name: 'agent, shape, level and configFallback',
    sessionId: 'session-meta',
    command: 'rm -rf ~',
    segment: 'rm -rf ~',
    reason: 'Blocked: targeting root or home',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-meta'),
    options: {
      agent: 'codex',
      shape: 'claude-code',
      level: 'strict',
      configFallback: true,
      toolName: 'Bash',
    },
  },
  {
    name: 'tool name over its cap',
    sessionId: 'session-toolname',
    command: 'cat .env',
    segment: 'cat .env',
    reason: 'Access to a sensitive path is not allowed.',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-toolname'),
    options: { toolName: LONG_TOOL_NAME },
  },
  {
    name: 'null cwd',
    sessionId: 'session-nocwd',
    command: 'rm -rf build',
    segment: 'rm -rf build',
    reason: 'Blocked: outside cwd',
    cwd: null,
    file: logPath('no-cwd', 'session-nocwd'),
    options: {},
  },
  {
    name: 'redaction decides the project directory name',
    sessionId: 'session-secret-cwd',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: SECRET_CWD,
    file: logPath('-work-API-KEY--redacted-', 'session-secret-cwd'),
    options: {},
  },
  {
    // The record holds the cwd capped at 32,768; the directory name it is encoded
    // into stops at 180, so this row pins both numbers at once.
    name: 'cwd over both caps',
    sessionId: 'session-longcwd',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: LONG_CWD,
    file: logPath(`-work-${'p'.repeat(174)}`, 'session-longcwd'),
    options: {},
  },
  {
    name: 'session id that walks out of the tree',
    sessionId: '../../etc/passwd',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: '/work/project',
    file: logPath('-work-project', 'etc_passwd'),
    options: {},
  },
  {
    name: 'absolute session id',
    sessionId: '/abs/path',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: '/work/project',
    file: logPath('-work-project', 'abs_path'),
    options: {},
  },
  {
    name: 'session id with a space',
    sessionId: 'a b',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: '/work/project',
    file: logPath('-work-project', 'a_b'),
    options: {},
  },
  {
    name: 'session id over its cap',
    sessionId: `s${'x'.repeat(140)}`,
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: '/work/project',
    file: logPath('-work-project', `s${'x'.repeat(127)}`),
    options: {},
  },
  {
    name: 'session id that sanitizes to nothing',
    sessionId: '..',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: '/work/project',
    file: null,
    options: {},
  },
  {
    name: 'blank session id',
    sessionId: '   ',
    command: 'ls',
    segment: 'ls',
    reason: 'Blocked: sensitive path',
    cwd: '/work/project',
    file: null,
    options: {},
  },
  {
    name: 'segment over its cap',
    sessionId: 'session-segment',
    command: LONG_SEGMENT,
    segment: LONG_SEGMENT,
    reason: 'Blocked: dangerous pattern',
    cwd: '/work/project',
    file: logPath('-work-project', 'session-segment'),
    options: {},
  },
  {
    name: 'provider token, JWT and Authorization header',
    sessionId: 'session-tokens',
    command: `GITHUB_TOKEN=${providerToken} curl -H 'Authorization: Bearer ${jwt}' https://api.example.test`,
    segment: `curl -u deploy:${bearer} https://ci.example.test`,
    reason: 'Blocked: credential exfiltration',
    cwd: `/work/${providerToken}`,
    file: logPath('-work--redacted-', 'session-tokens'),
    options: { toolName: `Bash-${bearer}` },
  },
];

const roots: string[] = [];

function makeRoot(label: string): string {
  const root = mkdtempSync(
    join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), `cc-safety-net-next-audit-${label}-`),
  );
  roots.push(root);
  return root;
}

const fixedNow = () => new Date(NOW);

function fixedIds() {
  let next = 0;
  return () => `id${(next++).toString(16).padStart(15, '0')}`;
}

function writeNext(home: string, fixture: Case): void {
  writeAuditLog(
    createTestEnvironment({ home }),
    fixture.sessionId,
    fixture.command,
    fixture.segment,
    fixture.reason,
    fixture.cwd,
    { now: fixedNow, createId: fixedIds(), ...fixture.options },
  );
}

function onlyRecord(home: string): AuditLogEntry {
  const file = snapshotTree(home).find((node) => node.path.endsWith('.jsonl'));
  return JSON.parse((file?.content ?? '').trim()) as AuditLogEntry;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('audit writer parity', () => {
  for (const fixture of CASES) {
    test(fixture.name, () => {
      const srcHome = makeRoot('src');
      const nextHome = makeRoot('next');

      shippedWriteAuditLog(
        fixture.sessionId,
        fixture.command,
        fixture.segment,
        fixture.reason,
        fixture.cwd,
        { homeDir: srcHome, now: fixedNow, createId: fixedIds(), ...fixture.options },
      );
      writeNext(nextHome, fixture);

      const produced = snapshotTree(nextHome);
      expect(produced).toStrictEqual(snapshotTree(srcHome));
      expect(produced).toMatchSnapshot();
      expect(
        produced
          .filter((node) => node.kind === 'file')
          .map((node) => node.path)
          .sort(),
      ).toStrictEqual(fixture.file === null ? [] : [MARKER, fixture.file].sort());
      expect([...new Set(produced.map((node) => `${node.kind} ${node.mode.toString(8)}`))]).toEqual(
        fixture.file === null ? [] : ['directory 700', 'file 600'],
      );
    });
  }
});

describe('audit writer record shape', () => {
  test('a failure record keeps the whole command, an ordinary one caps it', () => {
    const kept = makeRoot('kept');
    writeNext(kept, {
      name: 'kept',
      sessionId: 'session-failure',
      command: LONG_COMMAND,
      segment: 'echo',
      reason: 'CC Safety Net failed closed',
      cwd: '/work/project',
      file: null,
      options: { failureStage: 'command-analysis', errorCode: 'unexpected-error' },
    });
    expect(onlyRecord(kept).command).toHaveLength(LONG_COMMAND.length);
    expect(onlyRecord(kept).truncated).toBeUndefined();

    const capped = makeRoot('capped');
    writeNext(capped, {
      name: 'capped',
      sessionId: 'session-capped',
      command: LONG_COMMAND,
      segment: LONG_SEGMENT,
      reason: 'Blocked: dangerous pattern',
      cwd: '/work/project',
      file: null,
      options: { toolName: LONG_TOOL_NAME },
    });
    expect(onlyRecord(capped).command).toHaveLength(10_000);
    expect(onlyRecord(capped).segment).toHaveLength(2_000);
    expect(onlyRecord(capped).toolName).toHaveLength(256);
    expect(onlyRecord(capped).truncated).toBeTrue();

    const longCwd = makeRoot('longcwd');
    writeNext(longCwd, {
      name: 'long cwd',
      sessionId: 'session-longcwd',
      command: 'ls',
      segment: 'ls',
      reason: 'Blocked: sensitive path',
      cwd: LONG_CWD,
      file: null,
      options: {},
    });
    expect(onlyRecord(longCwd).cwd).toHaveLength(32_768);
    expect(onlyRecord(longCwd).truncated).toBeTrue();
  });

  test('no recognized credential form reaches any byte the writer leaves behind', () => {
    const home = makeRoot('secrets');
    for (const fixture of CASES) writeNext(home, fixture);
    const written = snapshotTree(home)
      .map((node) => `${node.path}\n${node.content ?? ''}`)
      .join('\n');
    for (const secret of [providerToken, jwt, bearer, 'hunter2hunter2']) {
      expect(written).not.toInclude(secret);
    }
  });
});

describe('audit writer contract', () => {
  test('a regular file where the config directory belongs writes nothing and never throws', () => {
    const home = makeRoot('blocked');
    writeFileSync(join(home, '.cc-safety-net'), 'not a directory\n');
    const before = snapshotTree(home);

    expect(() =>
      writeNext(home, {
        name: 'blocked',
        sessionId: 'session-blocked',
        command: 'rm -rf /',
        segment: 'rm -rf /',
        reason: 'Blocked: targeting root or home',
        cwd: '/work/project',
        file: null,
        options: {},
      }),
    ).not.toThrow();
    expect(snapshotTree(home)).toStrictEqual(before);
  });

  test('a relative audit home resolves to null and writes nothing', () => {
    const home = makeRoot('relative');
    const environment = createTestEnvironment({
      home,
      env: new Map([['CC_SAFETY_NET_AUDIT_HOME', 'relative/audit-home']]),
    });

    expect(getAuditLogHomeDir(environment)).toBeNull();
    writeAuditLog(environment, 'session-relative', 'ls', 'ls', 'reason', '/work/project', {
      now: fixedNow,
      createId: fixedIds(),
    });
    expect(snapshotTree(home)).toStrictEqual([]);
  });

  test('under NODE_ENV=test the audit home is the explicit one or nothing', () => {
    expect(
      getAuditLogHomeDir(
        createTestEnvironment({ home: '/home/tester', env: new Map([['NODE_ENV', 'test']]) }),
      ),
    ).toBeNull();
    expect(
      getAuditLogHomeDir(
        createTestEnvironment({
          home: '/home/tester',
          env: new Map([
            ['NODE_ENV', 'test'],
            ['CC_SAFETY_NET_AUDIT_HOME', '/srv/audit'],
          ]),
        }),
      ),
    ).toBe('/srv/audit');
    expect(getAuditLogHomeDir(createTestEnvironment({ home: '/home/tester' }))).toBe(
      '/home/tester',
    );
  });

  test('four processes appending to one session file leave every line intact', async () => {
    const home = makeRoot('concurrent');
    // Spawned without waiting, so the four runs overlap: a read-modify-write
    // writer loses records here where a single O_APPEND write does not.
    const workers = Array.from({ length: 4 }, (_, worker) =>
      Bun.spawn({
        cmd: [
          process.execPath,
          join(import.meta.dir, 'concurrent-append-worker.ts'),
          home,
          'session-concurrent',
          String(worker),
        ],
        cwd: REPO_ROOT,
        env: createSpawnEnv({}),
      }),
    );
    expect(await Promise.all(workers.map((worker) => worker.exited))).toStrictEqual([0, 0, 0, 0]);

    const content = readFileSync(
      join(home, LOGS, '-work-concurrent', '2026-05', '2026-05-17-session-concurrent.jsonl'),
      'utf-8',
    );
    expect(content.endsWith('\n')).toBeTrue();
    const ids = content
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => (JSON.parse(line) as { id: string }).id);
    expect(ids).toHaveLength(200);
    expect(new Set(ids).size).toBe(200);
  });
});
