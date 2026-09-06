import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodeCwdForLogDirname, getAuditLogsDir } from '@/audit/writer';
import { installCursor } from '@/hosts/cursor/install';
import type { DoctorReport } from '@/hosts/doctor-types';
import {
  type CliRow,
  type CliSide,
  expectSameCli,
  runCliDifferential,
  seedFiles,
} from '../../helpers/cli-differential';
import { json } from '../../helpers/cli-fixtures';
import { normalizeDoctorJson } from '../../helpers/doctor-json';
import { environmentFor, removeTempRoots } from '../../helpers/temp-home';

/**
 * `doctor` is the widest projection of one policy resolution, so each row seeds the single fact
 * a finding rule reads and pins the finding it produces. The JSON form is also written to a
 * literal golden, which guards the document shape on its own.
 *
 * The run is recorded raw: every byte a doctor document carries, down to which entry it calls the
 * oldest and which version it reports, is pinned. Only the golden is normalized, because what the
 * normalizer folds is exactly what the literal file cannot pin across machines: the rendered
 * relative times, the package version (`dev` in a checkout, a real number in a tarball) and the
 * platform.
 */

afterEach(() => {
  removeTempRoots();
});

/** `.golden` rather than `.json`: seven renderings of one document share most of their lines, and
 *  the duplication scan the repository runs over `tests/` tokenizes every `.json` and `.txt` file
 *  it finds. The suffix keeps the goldens out of that scan without an ignore rule. */
const goldenPath = (slug: string) =>
  join(import.meta.dir, '..', '..', 'fixtures', 'cli', 'doctor', `${slug}.json.golden`);

function pinGolden(slug: string, document: string): void {
  if (process.env.CC_SAFETY_NET_UPDATE_GOLDENS === '1') {
    mkdirSync(dirname(goldenPath(slug)), { recursive: true });
    writeFileSync(goldenPath(slug), document);
    return;
  }
  expect(document).toBe(readFileSync(goldenPath(slug), 'utf-8'));
}

async function runDoctorJson(slug: string, row: Omit<CliRow, 'args'>) {
  const result = await runCliDifferential({
    args: ['doctor', '--json', '--skip-update-check'],
    ...row,
  });
  const outcome = expectSameCli(result);
  pinGolden(slug, normalizeDoctorJson(outcome.stdout));
  return { outcome, report: JSON.parse(outcome.stdout) as DoctorReport };
}

/** A directory the posture check reads has to be created 0700, or the runner's umask makes it
 *  a `permissions` finding and the row stops describing what it seeds. */
const mkdirPrivate = (path: string) => mkdirSync(path, { recursive: true, mode: 0o700 });

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type AuditFixtureEntry = Record<string, unknown>;

/** The working directory the entries record. A temp root would encode into a directory name the
 *  harness cannot spell as `<root>`, so the two sides would disagree on the tree; nothing opens
 *  this path, it is only the key the writer's layout is derived from. */
const RECORDED_CWD = '/home/agent/project';

function seedAuditLog(side: CliSide, session: string, entries: readonly AuditFixtureEntry[]): void {
  const logsDir = getAuditLogsDir(environmentFor(side.home, side.env));
  if (!logsDir) throw new Error('the isolated environment resolved no audit logs directory');
  const newest = String(entries[0]?.ts);
  const file = join(
    logsDir,
    encodeCwdForLogDirname(RECORDED_CWD),
    newest.slice(0, 7),
    `${newest.slice(0, 10)}-${session}.jsonl`,
  );
  mkdirPrivate(dirname(file));
  writeFileSync(file, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''));
}

/** Three denials and one allow, each far enough from an hour or day boundary that the relative
 *  time both bins render is the same string. */
function auditFixture(session: string) {
  const now = Date.now();
  const at = (ago: number) => new Date(now - ago).toISOString();
  const entry = (ago: number, id: string, fields: AuditFixtureEntry) => ({
    ts: at(ago),
    id,
    v: 'dev',
    sessionId: session,
    decision: 'deny',
    agent: 'claude-code',
    cwd: RECORDED_CWD,
    ...fields,
  });
  return [
    entry(HOUR, 'a1b2c3d4e5f60001', {
      decision: 'allow',
      command: 'git status',
      segment: 'git status',
      reason: '',
    }),
    entry(3 * HOUR + 30 * 60 * 1000, 'a1b2c3d4e5f60002', {
      ruleId: 'git.reset-hard',
      command: 'git reset --hard',
      segment: 'git reset --hard',
      reason: 'Discards uncommitted work irreversibly.',
    }),
    entry(DAY + 12 * HOUR, 'a1b2c3d4e5f60003', {
      ruleId: 'rm.recursive-force',
      command: 'rm -rf build',
      segment: 'rm -rf build',
      reason: 'Recursive force delete.',
    }),
    entry(2 * DAY + 12 * HOUR, 'a1b2c3d4e5f60004', {
      ruleId: 'git.clean-force',
      command: 'git clean -fd',
      segment: 'git clean -fd',
      reason: 'Removes untracked files.',
    }),
  ];
}

describe('doctor --json', () => {
  test('a fresh home reports no configured integration and exits 1', async () => {
    const { outcome, report } = await runDoctorJson('fresh', {});
    expect(outcome.exitCode).toBe(1);
    expect(report.findings.map((finding) => finding.checkId)).toEqual([
      'integration.none-configured',
    ]);
    expect(report.engineSelfTest.passed).toBe(3);
  }, 120_000);

  test('an installed Cursor hook clears the none-configured finding', async () => {
    const { outcome, report } = await runDoctorJson('cursor', {
      seed: (side) => {
        installCursor(environmentFor(side.home, side.env));
      },
    });
    expect(outcome.exitCode).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.hooks.filter((hook) => hook.configured).map((hook) => hook.platform)).toEqual([
      'cursor',
    ]);
  }, 120_000);

  test('both scopes report their own invalid rule config', async () => {
    const { report } = await runDoctorJson('invalid-configs', {
      seed: (side) => {
        mkdirPrivate(join(side.home, '.cc-safety-net', 'rules'));
        writeFileSync(
          join(side.home, '.cc-safety-net', 'rules', 'rule.json'),
          json({ version: 2 }),
        );
        seedFiles(side, { 'project/.cc-safety-net/rules/rule.json': 'not json' });
      },
    });
    expect(report.findings.map((finding) => finding.checkId)).toEqual([
      'integration.none-configured',
      'config.user-invalid',
      'config.project-invalid',
      'config.runtime-degraded',
    ]);
    expect(report.userConfig.valid).toBe(false);
    expect(report.projectConfig.valid).toBe(false);
  }, 120_000);

  test('a v2 lock and cache are reported once, naming both scopes', async () => {
    const { report } = await runDoctorJson('v2-leftovers', {
      seed: (side) => {
        mkdirPrivate(join(side.home, '.cc-safety-net', 'cache'));
        seedFiles(side, { 'project/.cc-safety-net/rules/rule.lock': '{}\n' });
      },
    });
    expect(report.v2Leftovers).toEqual([
      join('<root>', 'project/.cc-safety-net/rules/rule.lock'),
      join('<root>', 'home/.cc-safety-net/cache'),
    ]);
    const leftovers = report.findings.filter(
      (finding) => finding.checkId === 'config.v2-leftovers',
    );
    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]?.severity).toBe('info');
    expect(leftovers[0]?.detail).toContain(
      join('<root>', 'project/.cc-safety-net/rules/rule.lock'),
    );
    expect(leftovers[0]?.detail).toContain(join('<root>', 'home/.cc-safety-net/cache'));
  }, 120_000);

  test('a regular file where the config directory belongs is an unsafe posture', async () => {
    const { report } = await runDoctorJson('unsafe-posture', {
      seed: (side) => {
        mkdirPrivate(join(side.home, '.cc-safety-net'));
        writeFileSync(join(side.home, '.cc-safety-net', 'rules'), 'not a directory\n');
      },
    });
    expect(report.posture.directories.filter((directory) => directory.status === 'unsafe')).toEqual(
      [
        {
          kind: 'config',
          path: join('<root>', 'home/.cc-safety-net/rules'),
          status: 'unsafe',
          issues: ['not-directory'],
        },
      ],
    );
    expect(report.findings.map((finding) => finding.checkId)).toContain(
      'posture.config-directory-unsafe',
    );
  }, 120_000);

  test('a seeded audit tree is summarised over the denials alone', async () => {
    const entries = auditFixture('sess1');
    const { report } = await runDoctorJson('audit-entries', {
      seed: (side) => seedAuditLog(side, 'sess1', entries),
    });
    expect(report.activity.totalBlocked).toBe(3);
    expect(report.activity.sessionCount).toBe(1);
    expect(report.activity.unreadable).toBe(0);
    expect(report.activity.recentEntries.map((recent) => recent.command)).toEqual([
      'git reset --hard',
      'rm -rf build',
      'git clean -fd',
    ]);
  }, 120_000);

  test('an invalid audit scope and a legacy flag are both reported', async () => {
    const { report } = await runDoctorJson('env-flags', {
      env: { CC_SAFETY_NET_AUDIT_SCOPE: 'bogus', SAFETY_NET_STRICT: '1' },
    });
    expect(report.findings.map((finding) => finding.checkId)).toContain(
      'environment.audit-scope-invalid',
    );
    expect(
      report.environment.find((variable) => variable.name === 'CC_SAFETY_NET_STRICT'),
    ).toMatchObject({ isSet: true, legacyName: 'SAFETY_NET_STRICT', legacyIsSet: true });
  }, 120_000);
});

describe('doctor rendered', () => {
  test('a fresh home renders the self-test and the single error finding', async () => {
    const outcome = expectSameCli(
      await runCliDifferential({ args: ['doctor', '--skip-update-check'] }),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toContain('Guard Engine Verification');
    expect(outcome.stdout).toContain('3/3 passed');
    expect(outcome.stdout).toContain('1 finding: 1 error.');
  }, 120_000);

  test('a seeded audit tree renders its activity header', async () => {
    const entries = auditFixture('sess1');
    const outcome = expectSameCli(
      await runCliDifferential({
        args: ['doctor', '--skip-update-check'],
        seed: (side) => seedAuditLog(side, 'sess1', entries),
      }),
    );
    expect(outcome.stdout).toContain('Recent Activity · last 7 days (3 blocked / 1 sessions)');
    expect(outcome.stdout).toContain('git reset --hard');
  }, 120_000);

  test('the legacy --doctor spelling reaches the same report', async () => {
    const outcome = expectSameCli(
      await runCliDifferential({ args: ['--doctor', '--skip-update-check'] }),
    );
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toContain('Guard Engine Verification');
  }, 120_000);

  test('an unknown option is refused before anything is inspected', async () => {
    const outcome = expectSameCli(await runCliDifferential({ args: ['doctor', '--nope'] }));
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('Unknown option for doctor: --nope\n');
  }, 60_000);
});
