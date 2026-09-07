import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as nodeFs from 'node:fs';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { encodeCwdForLogDirname, getAuditLogsDir } from '@/audit/writer';
import { runLogsCommand as portedRunLogsCommand } from '@/cli/audit-log';
import type { AuditLogEntry } from '@/core/audit';
import {
  type CliOutcome,
  type CliRow,
  type CliSide,
  expectSameCli,
  runCliDifferential,
  seedFiles,
} from '../helpers/cli-differential';
import { json, USER_POLICY } from '../helpers/cli-fixtures';
import { captureConsole } from '../helpers/console-capture';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  recordPorted,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * `logs` reads the audit tree the guard writes, so each row seeds that tree once and asks the
 * two bins the same question about it. What a row pins is the selection: which entries a flag
 * admits, in what order, and what the command says when it admits none.
 *
 * Two fixture details are deliberate. The entries the legacy file carries name a fixed working
 * directory, because `--prune-legacy` prints that file's size and the two sides' temp roots are
 * not the same length. The nested entries name the side's own project directory instead, which
 * is what `--project` has to resolve against.
 */

afterEach(() => {
  removeTempRoots();
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const RESET_HARD_ID = 'a1c2e3f405162738';
const REPEATED_ID = 'b1c2e3f405162740';
const ABSENT_ID = 'ffffffffffffffff';

/** Never opened: only the value the legacy entries record and `logs` prints back. */
const LEGACY_CWD = '/home/agent/legacy';
const LEGACY_FILE = 'legacy-sess.jsonl';
const UNLINK_REFUSAL = 'EPERM: operation not permitted, unlink';

type Fixture = Record<string, unknown>;

const denial = (ts: string, id: string, fields: Fixture): Fixture => ({
  ts,
  id,
  v: 'dev',
  decision: 'deny',
  agent: 'claude-code',
  level: 'standard',
  toolName: 'Bash',
  ...fields,
});

/** The tree every seeded row reads: one nested session file, one legacy root file. */
function auditFixture(clock: number, project: string) {
  const at = (ago: number) => new Date(clock - ago).toISOString();
  return {
    nested: [
      denial(at(2 * HOUR), RESET_HARD_ID, {
        sessionId: 'sess1',
        cwd: project,
        ruleId: 'git.reset-hard',
        command: 'git reset --hard && echo done',
        segment: 'git reset --hard',
        reason: 'Discards uncommitted work irreversibly.',
      }),
      denial(at(3 * HOUR), 'a1c2e3f405162739', {
        sessionId: 'sess1',
        cwd: '/home/agent/other',
        agent: 'cursor',
        ruleId: 'git.clean-force',
        command: 'git clean -fd',
        segment: 'git clean -fd',
        reason: 'Removes untracked files.',
      }),
      denial(at(HOUR), 'a1c2e3f40516273a', {
        sessionId: 'sess1',
        cwd: project,
        decision: 'allow',
        command: 'git status',
        segment: 'git status',
        reason: '',
      }),
      denial(at(40 * DAY), 'a1c2e3f40516273b', {
        sessionId: 'sess1',
        cwd: project,
        ruleId: 'rm.recursive-force',
        command: 'rm -rf archive',
        segment: 'rm -rf archive',
        reason: 'Recursive force delete.',
      }),
    ],
    legacy: [
      denial(at(4 * HOUR), REPEATED_ID, {
        sessionId: 'sess2',
        cwd: LEGACY_CWD,
        ruleId: 'rm.recursive-force',
        command: 'rm -rf build',
        segment: 'rm -rf build',
        reason: 'Recursive force delete.',
      }),
      denial(at(5 * HOUR), 'b1c2e3f405162741', {
        sessionId: 'sess2',
        cwd: LEGACY_CWD,
        ruleId: 'rm.recursive-force',
        command: 'rm -rf build',
        segment: 'rm -rf build',
        reason: 'Recursive force delete.',
      }),
      denial(at(2 * DAY), 'b1c2e3f405162742', {
        sessionId: 'sess2',
        cwd: LEGACY_CWD,
        failureStage: 'command-analysis',
        errorCode: 'analysis-failed',
        command: 'tar xf payload.tar',
        segment: 'tar xf payload.tar',
        reason: 'Command analysis failed; denying to stay safe.',
      }),
      denial(at(6 * HOUR), REPEATED_ID, {
        sessionId: 'sess2',
        cwd: LEGACY_CWD,
        ruleId: 'git.reset-hard',
        command: 'git reset --hard origin/main',
        segment: 'git reset --hard origin/main',
        reason: 'Discards uncommitted work irreversibly.',
      }),
    ],
  };
}

const asJsonl = (entries: readonly Fixture[]) =>
  entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');

/** Where the side's own audit tree lives; the writer derives every path below it from this. */
function logsDirOf(side: CliSide): string {
  const logsDir = getAuditLogsDir(environmentFor(side.home, side.env));
  if (!logsDir) throw new Error('the isolated environment resolved no audit logs directory');
  return logsDir;
}

/** Writes the fixture under the side's own audit root, with one unparseable line. */
function seedLogs(clock: number) {
  return (side: CliSide) => {
    const logsDir = logsDirOf(side);
    const entries = auditFixture(clock, side.project);
    const stamp = new Date(clock).toISOString();
    // `logs --project .` resolves the cwd the child runs in, which is the canonical path.
    const nested = join(
      logsDir,
      encodeCwdForLogDirname(realpathSync(side.project)),
      stamp.slice(0, 7),
      `${stamp.slice(0, 10)}-sess1.jsonl`,
    );
    mkdirSync(dirname(nested), { recursive: true });
    writeFileSync(nested, asJsonl(entries.nested));
    writeFileSync(join(logsDir, LEGACY_FILE), `${asJsonl(entries.legacy)}not json\n`);
    writeFileSync(join(logsDir, 'README.md'), 'audit logs live here\n');
  };
}

/**
 * The directory the writer names after the project path encodes each side's own temp root, which
 * the harness cannot spell as `<root>`. Nothing reads that name — the reader walks every
 * directory it finds — so the record folds it to one token.
 */
const foldProjectDir = (outcome: CliOutcome): CliOutcome => ({
  ...outcome,
  tree: outcome.tree.map((entry) => ({
    ...entry,
    path: entry.path.replace(/(\/logs\/)[^/]+-project/, '$1<project-dir>'),
  })),
});

async function runLogs(args: readonly string[], row: Omit<CliRow, 'args'> = {}) {
  return expectSameCli(
    foldProjectDir(await runCliDifferential({ args: ['logs', ...args], ...row })),
  );
}

/** The same rows against the seeded tree; the clock is read once so the fixture is fixed. */
const runSeededLogs = (args: readonly string[]) => runLogs(args, { seed: seedLogs(Date.now()) });

const rows = (stdout: string) => stdout.split('\n').filter(Boolean);

const SKIP_WARNING =
  'warning: 1 audit log source could not be read; these results are incomplete\n';

describe('logs selection', () => {
  test('the default window lists the denials newest first and warns once', async () => {
    const outcome = await runSeededLogs([]);
    expect(outcome.exitCode).toBe(0);
    expect(rows(outcome.stdout)).toHaveLength(6);
    expect(rows(outcome.stdout)[0]).toContain(RESET_HARD_ID);
    // The recorded segment is narrower than the command, so the entry is marked as one part of it.
    expect(rows(outcome.stdout)[0]).toContain('↳ git reset --hard');
    expect(rows(outcome.stdout)[1]).toContain('git clean -fd');
    expect(outcome.stderr).toBe(SKIP_WARNING);
  }, 60_000);

  test('two unreadable sources pluralize the warning', async () => {
    const clock = Date.now();
    const outcome = await runLogs([], {
      seed: (side) => {
        seedLogs(clock)(side);
        writeFileSync(join(logsDirOf(side), 'second-sess.jsonl'), 'not json\n');
      },
    });
    expect(outcome.exitCode).toBe(0);
    expect(rows(outcome.stdout)).toHaveLength(6);
    expect(outcome.stderr).toBe(
      'warning: 2 audit log sources could not be read; these results are incomplete\n',
    );
  }, 60_000);

  test('a regular file where the logs directory is expected is one unreadable source, not an empty history', async () => {
    const outcome = await runLogs([], {
      seed: (side) => {
        const logsDir = logsDirOf(side);
        mkdirSync(dirname(logsDir), { recursive: true });
        // A directory that is not there is an empty history; one that cannot be listed is a
        // source the answer is missing, which is what the warning is for.
        writeFileSync(logsDir, '');
      },
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('No audit log entries found.\n');
    expect(outcome.stderr).toBe(SKIP_WARNING);
  }, 60_000);

  test('--all admits the allowed entry the default window hides', async () => {
    const outcome = await runSeededLogs(['--all']);
    expect(rows(outcome.stdout)).toHaveLength(7);
    expect(outcome.stdout).toContain('git status');
  }, 60_000);

  test('--limit truncates after the sort, keeping the newest', async () => {
    const outcome = await runSeededLogs(['--limit', '1']);
    expect(rows(outcome.stdout)).toHaveLength(1);
    expect(outcome.stdout).toContain(RESET_HARD_ID);
  }, 60_000);

  test('--since drops the denial recorded two days ago', async () => {
    const outcome = await runSeededLogs(['--since', '1']);
    expect(rows(outcome.stdout)).toHaveLength(5);
    expect(outcome.stdout).not.toContain('tar xf payload.tar');
  }, 60_000);

  test('--agent and --rule each select one entry', async () => {
    const byAgent = await runSeededLogs(['--agent', 'cursor']);
    expect(rows(byAgent.stdout)).toHaveLength(1);
    expect(byAgent.stdout).toContain('git clean -fd');
    const byRule = await runSeededLogs(['--rule', 'git.reset-hard']);
    expect(rows(byRule.stdout)).toHaveLength(2);
  }, 60_000);

  test('--session matches the recorded id, then the legacy file name', async () => {
    const byId = await runSeededLogs(['--session', 'sess1']);
    expect(rows(byId.stdout)).toHaveLength(2);
    // No entry carries this session id; the legacy file's own name is what matches.
    const byFilename = await runSeededLogs(['--session', 'legacy-sess']);
    expect(rows(byFilename.stdout)).toHaveLength(4);
    expect(byFilename.stdout).toContain(LEGACY_CWD);
  }, 60_000);

  test('--project admits the directory it names and nothing beside it', async () => {
    const here = await runSeededLogs(['--project', '.']);
    expect(rows(here.stdout)).toHaveLength(1);
    expect(here.stdout).toContain(join('<root>', 'project'));
    const elsewhere = await runSeededLogs(['--project', LEGACY_CWD]);
    expect(rows(elsewhere.stdout)).toHaveLength(4);
  }, 60_000);

  test('--suspect keeps the repeated signature and the fail-closed denial', async () => {
    const outcome = await runSeededLogs(['--suspect']);
    expect(rows(outcome.stdout)).toHaveLength(3);
    expect(outcome.stdout).toContain('tar xf payload.tar');
    expect(outcome.stdout).not.toContain('git clean -fd');
  }, 60_000);

  test('an unknown option is refused before the tree is read', async () => {
    const outcome = await runSeededLogs(['--nope']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('Unknown option for logs: --nope\n');
  }, 60_000);

  test('a stray positional is refused the same way', async () => {
    const outcome = await runSeededLogs(['extra']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('Unexpected argument for logs: extra\n');
  }, 60_000);

  test('--json prints the selected entries as read', async () => {
    const outcome = await runSeededLogs(['--json']);
    const entries = JSON.parse(outcome.stdout) as AuditLogEntry[];
    expect(entries).toHaveLength(6);
    expect(entries[0]?.id).toBe(RESET_HARD_ID);
    expect(entries[0]?.segment).toBe('git reset --hard');
  }, 60_000);
});

describe('logs --id', () => {
  test('a single match renders the detail block', async () => {
    const outcome = await runSeededLogs(['--id', RESET_HARD_ID]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain(`id:        ${RESET_HARD_ID}`);
    expect(outcome.stdout).toContain('rule:      git.reset-hard');
    expect(outcome.stdout).toContain('command:   git reset --hard && echo done');
    expect(outcome.stdout).toContain(`cwd:       ${join('<root>', 'project')}`);
  }, 60_000);

  test('an id nothing recorded is reported as retained history having none', async () => {
    const outcome = await runSeededLogs(['--id', ABSENT_ID]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(`No retained audit log entry found for id ${ABSENT_ID}.\n`);
  }, 60_000);

  test('an id two entries share is an error rather than a choice', async () => {
    const outcome = await runSeededLogs(['--id', REPEATED_ID]);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toContain(`Multiple audit log entries found for id ${REPEATED_ID}.`);
  }, 60_000);

  test('a malformed id is refused before the tree is read', async () => {
    const outcome = await runSeededLogs(['--id', 'abc']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('--id must be 16 hexadecimal characters\n');
  }, 60_000);

  test('--id refuses to be narrowed further', async () => {
    const outcome = await runSeededLogs(['--id', RESET_HARD_ID, '--agent', 'cursor']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      '--id cannot be combined with --agent, --rule, --session, --project, --suspect, --since, or --limit\n',
    );
  }, 60_000);
});

describe('logs --prune-legacy', () => {
  test('--dry-run names the root files and deletes nothing', async () => {
    const outcome = await runSeededLogs(['--prune-legacy', '--dry-run']);
    expect(outcome.exitCode).toBe(0);
    expect(rows(outcome.stdout)[0]).toMatch(/^Would remove 1 legacy audit log file \(.+\)\.$/);
    expect(rows(outcome.stdout).slice(1)).toEqual([
      'Nested v2 audit logs are not included.',
      'Run the same command without --dry-run to delete them.',
    ]);
    expect(outcome.tree.map((entry) => entry.path)).toContain(
      'home/.cc-safety-net/audit/.cc-safety-net/logs/legacy-sess.jsonl',
    );
  }, 60_000);

  test('--dry-run --json reports the same set as counts', async () => {
    const outcome = await runSeededLogs(['--prune-legacy', '--dry-run', '--json']);
    expect(JSON.parse(outcome.stdout)).toMatchObject({ dryRun: true, files: 1 });
  }, 60_000);

  test('the deletion removes the root file and leaves the nested tree', async () => {
    const outcome = await runSeededLogs(['--prune-legacy']);
    expect(outcome.exitCode).toBe(0);
    expect(rows(outcome.stdout)[0]).toMatch(/^Removed 1 legacy audit log file \(.+\)\.$/);
    expect(rows(outcome.stdout).slice(1)).toEqual([
      'Nested v2 audit logs were not changed.',
      'This deletion cannot be undone.',
    ]);
    const paths = outcome.tree.map((entry) => entry.path);
    expect(paths).not.toContain('home/.cc-safety-net/audit/.cc-safety-net/logs/legacy-sess.jsonl');
    expect(paths).toContain('home/.cc-safety-net/audit/.cc-safety-net/logs/README.md');
    expect(paths.filter((path) => path.includes('<project-dir>'))).toHaveLength(3);
  }, 60_000);

  test('--json reports the deletion as counts and bytes', async () => {
    const outcome = await runSeededLogs(['--prune-legacy', '--json']);
    expect(JSON.parse(outcome.stdout)).toMatchObject({ removedFiles: 1, failedFiles: 0 });
  }, 60_000);

  test('--dry-run alone has nothing to preview', async () => {
    const outcome = await runSeededLogs(['--dry-run']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('--dry-run requires --prune-legacy\n');
  }, 60_000);
});

/**
 * The one failure `--prune-legacy` reports is an unlink the filesystem refuses. This suite runs
 * as root, which ignores the directory permissions that would produce one, so the refusal is
 * spied at the `unlinkSync` both implementations call — a model that holds for a normal user too.
 * Both are driven in process, because the spy cannot reach a child.
 */
describe('logs --prune-legacy failure', () => {
  afterEach(() => {
    mock.restore();
  });

  const seedLegacy = (label: string) => {
    const home = join(createTempRoot(`logs-prune-${label}-`), 'home');
    const logsDir = join(home, 'logs');
    mkdirSync(logsDir, { recursive: true });
    writeFileSync(
      join(logsDir, LEGACY_FILE),
      asJsonl(auditFixture(Date.now(), LEGACY_CWD).legacy.slice(0, 2)),
    );
    return { home, logsDir };
  };

  async function pruneLegacy(args: string[]) {
    spyOn(nodeFs, 'unlinkSync').mockImplementation(() => {
      throw new Error(UNLINK_REFUSAL);
    });
    const portedSide = seedLegacy('ported');
    const ported = await captureConsole(() =>
      portedRunLogsCommand(environmentFor(portedSide.home, isolationEnv(portedSide.home)), args, {
        logsDir: portedSide.logsDir,
      }),
    );
    recordPorted(ported);
    return { ...ported, file: join(portedSide.logsDir, LEGACY_FILE) };
  }

  test('a legacy file the filesystem refuses to unlink is reported and kept', async () => {
    const outcome = await pruneLegacy(['--prune-legacy']);
    expect(outcome.returned).toBe(1);
    expect(outcome.error).toEqual([`Could not remove ${LEGACY_FILE}: ${UNLINK_REFUSAL}`]);
    expect(outcome.log[0]).toStartWith('Removed 0 legacy audit log files');
    expect(existsSync(outcome.file)).toBeTrue();
  });

  test('--json reports the refusal as a failed file rather than a removed one', async () => {
    const outcome = await pruneLegacy(['--prune-legacy', '--json']);
    expect(outcome.returned).toBe(1);
    expect(JSON.parse(outcome.log[0] ?? '')).toMatchObject({ removedFiles: 0, failedFiles: 1 });
  });
});

describe('logs window', () => {
  test('the configured retention is the ceiling --since cannot pass', async () => {
    const clock = Date.now();
    const withRetention = (args: readonly string[]) =>
      runLogs(args, {
        seed: (side) => {
          seedLogs(clock)(side);
          seedFiles(side, { [USER_POLICY]: json({ version: 1, audit: { retention_days: 5 } }) });
        },
      });
    const refused = await withRetention(['--since', '7']);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toBe('--since must be a positive number of days no greater than 5\n');
    const accepted = await withRetention(['--since', '3']);
    expect(accepted.exitCode).toBe(0);
    expect(rows(accepted.stdout)).toHaveLength(6);
  }, 60_000);

  test('the implicit window is the retention when the retention is below thirty days', () => {
    const clock = Date.now();
    const seedWindow = (retentionDays: number) => (side: CliSide) => {
      seedFiles(side, {
        [USER_POLICY]: json({ version: 1, audit: { retention_days: retentionDays } }),
      });
      const logsDir = logsDirOf(side);
      mkdirSync(logsDir, { recursive: true });
      writeFileSync(
        join(logsDir, 'window-sess.jsonl'),
        asJsonl([
          denial(new Date(clock - DAY).toISOString(), 'c1c2e3f405162741', {
            command: 'recent blocked',
            segment: 'recent blocked',
            reason: 'blocked',
          }),
          denial(new Date(clock - 10 * DAY).toISOString(), 'c1c2e3f405162742', {
            command: 'older blocked',
            segment: 'older blocked',
            reason: 'blocked',
          }),
        ]),
      );
    };
    const clamped = runCliDifferential({ args: ['logs'], seed: seedWindow(5) });
    expect(clamped.exitCode).toBe(0);
    expect(clamped.stdout).toContain('recent blocked');
    expect(clamped.stdout).not.toContain('older blocked');
    const wide = runCliDifferential({ args: ['logs'], seed: seedWindow(365) });
    expect(wide.exitCode).toBe(0);
    expect(wide.stdout).toContain('recent blocked');
    expect(wide.stdout).toContain('older blocked');
  }, 60_000);

  test('the default ceiling is thirty days, and a window has to be positive', async () => {
    const refused = await runSeededLogs(['--since', '31']);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toBe('--since must be a positive number of days no greater than 30\n');
    const notANumber = await runSeededLogs(['--limit', '0']);
    expect(notANumber.exitCode).toBe(1);
    expect(notANumber.stderr).toBe('--limit must be a positive number\n');
  }, 60_000);

  test('a home with no audit tree reports an empty history', async () => {
    const outcome = await runLogs([]);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('No audit log entries found.\n');
    expect(outcome.stderr).toBe('');
  }, 60_000);
});
