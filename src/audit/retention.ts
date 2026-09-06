import {
  lstatSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { AuditLogEntry } from '@/core/audit';
import type { Environment } from '@/core/environment';
import { readRetentionDays } from '@/core/policy/retention';

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Zero-content throttle marker. Deliberately not named `*.jsonl` so neither the
 * audit readers nor legacy cleanup can mistake it for an audit log.
 */
const PRUNE_MARKER_NAME = '.last-prune';
const MONTH_DIR = /^\d{4}-\d{2}$/;
const DATED_LOG_FILE = /^((\d{4}-\d{2})-\d{2})-.+\.jsonl$/;

const utcDay = (ms: number) => Math.floor(ms / DAY_MS);

/**
 * Delete audit logs whose configured retention window has passed, from the
 * writer's dated layout and from wholly expired legacy root-level files, then reclaim the
 * month and project directories the sweep emptied. Ephemeral working directories
 * — git worktrees, sandboxes — each earn a project directory that outlives the
 * path it was named for, so without this they accumulate for good.
 *
 * Retention is opportunistic: callers invoke it after audit writes and before
 * audit reads, and it traverses at most once per UTC day per audit root. It
 * never throws, never creates the audit root, never follows symlinks, and
 * leaves every unrecognized shape untouched.
 */
export function pruneExpiredAuditLogs(
  environment: Environment,
  logsDir: string,
  now: () => Date = () => new Date(),
): void {
  try {
    const nowMs = now().getTime();
    if (!statSync(logsDir, { throwIfNoEntry: false })?.isDirectory()) return;

    const markerPath = join(logsDir, PRUNE_MARKER_NAME);
    const lastAttempt = statSync(markerPath, { throwIfNoEntry: false })?.mtimeMs;
    if (lastAttempt !== undefined && utcDay(lastAttempt) === utcDay(nowMs)) return;

    const cutoff = nowMs - readRetentionDays(environment) * DAY_MS;
    const currentMonth = new Date(nowMs).toISOString().slice(0, 7);
    for (const entry of readDirEntries(logsDir)) {
      if (entry.isDirectory()) {
        pruneProjectDir(join(logsDir, entry.name), cutoff, currentMonth);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        pruneLegacyFile(join(logsDir, entry.name), cutoff);
      }
    }

    // Mark the attempt even when deletions failed, so a permission problem does
    // not add a full traversal to every command. Failures retry the next day.
    writeFileSync(markerPath, '', { mode: 0o600 });
    // Stamp the marker from the same clock the throttle reads it back with, so
    // the once-per-UTC-day window is decided by one source of truth.
    utimesSync(markerPath, nowMs / 1000, nowMs / 1000);
  } catch {
    // Retention failures must never change or block an audit decision.
  }
}

function pruneProjectDir(projectDir: string, cutoff: number, currentMonth: string): void {
  for (const month of readDirEntries(projectDir)) {
    if (!month.isDirectory() || !MONTH_DIR.test(month.name)) continue;
    const monthDir = join(projectDir, month.name);
    for (const file of readDirEntries(monthDir)) {
      if (!file.isFile()) continue;
      const dated = DATED_LOG_FILE.exec(file.name);
      // A dated name that disagrees with its month directory is ambiguously
      // placed, so it is not a file this writer layout accounts for.
      if (!dated || dated[2] !== month.name) continue;
      // The name encodes a whole UTC day, so only the end of that day proves
      // every entry inside is outside the retention window.
      const endOfDay = Date.parse(`${dated[1]}T00:00:00.000Z`) + DAY_MS;
      if (!Number.isFinite(endOfDay) || endOfDay >= cutoff) continue;
      unlinkQuietly(join(monthDir, file.name));
    }
    // Writers only ever create the current month, so removing any other emptied
    // month cannot land between the mkdir and the append in writeAuditLog. A
    // current month left behind is reclaimed once the calendar moves on.
    if (month.name !== currentMonth) rmdirQuietly(monthDir);
  }
  rmdirQuietly(projectDir);
}

/**
 * A legacy root-level file carries no date in its name, so it is deleted only
 * when its contents and its modification time both prove it wholly expired.
 * Mixed-age files are never rewritten or split; they become eligible once their
 * newest entry expires.
 */
function pruneLegacyFile(filePath: string, cutoff: number): void {
  try {
    const before = lstatSync(filePath);
    if (before.mtimeMs >= cutoff) return;

    const timestamps = readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter((line) => line.trim())
      .map(parseEntryTimestamp);
    if (timestamps.length === 0) return;
    if (timestamps.some((ts) => ts === undefined || ts >= cutoff)) return;

    // A writer touched the file while it was being inspected, so what was read
    // no longer describes what is on disk. An unchanged time is still expired.
    if (lstatSync(filePath).mtimeMs !== before.mtimeMs) return;

    unlinkQuietly(filePath);
  } catch {
    // Unreadable or vanished: retain.
  }
}

function parseEntryTimestamp(line: string): number | undefined {
  try {
    const ts = (JSON.parse(line) as AuditLogEntry).ts;
    const parsed = typeof ts === 'string' ? Date.parse(ts) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readDirEntries(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return [];
  }
}

function unlinkQuietly(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Concurrent pruning may have removed it already, or the directory may be
    // read-only; either way the next UTC day retries.
  }
}

/**
 * Remove a directory the retention sweep has emptied. `rmdir` refuses a
 * non-empty directory, so every unrecognized file, symlink, and off-layout month
 * keeps its parent alive without this needing to inspect any of them.
 */
function rmdirQuietly(dir: string): void {
  try {
    rmdirSync(dir);
  } catch {
    // Still populated, already gone, or read-only: nothing to reclaim today.
  }
}
