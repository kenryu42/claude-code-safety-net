import { commandSignature } from '@/audit/display';
import { listAuditLogFiles, readAuditLogEntries } from '@/audit/reader';
import { pruneExpiredAuditLogs } from '@/audit/retention';
import { getAuditLogsDir } from '@/audit/writer';
import type { AuditLogEntry } from '@/core/audit';
import type { Environment } from '@/core/environment';

const ENTRY_CAP = 500;

/**
 * Fill the cap from both decision classes, newest first within each. Either
 * filter renders from the same capped list the tiles count in full, so a class
 * crowded out entirely reads as "no entries" while its chip promises thousands.
 * A denial storm did exactly that to Allowed. Each class is guaranteed half the
 * cap and lends whatever it does not use to the other.
 */
function capEntries(windowEntries: readonly AuditLogEntry[]): AuditLogEntry[] {
  const denied = windowEntries.filter((entry) => entry.decision !== 'allow');
  const allowed = windowEntries.filter((entry) => entry.decision === 'allow');
  const deniedShare = Math.min(
    denied.length,
    Math.max(ENTRY_CAP - allowed.length, Math.ceil(ENTRY_CAP / 2)),
  );
  return [...denied.slice(0, deniedShare), ...allowed.slice(0, ENTRY_CAP - deniedShare)];
}

/**
 * Collect audit log entries for the GUI activity feed.
 * Returns entries in the requested window (newest first, capped at ENTRY_CAP)
 * plus window aggregates so the client can render tiles and filter chips even
 * when the entry list is truncated.
 */
export function getActivityFeed(
  environment: Environment,
  days: number,
  logsDir: string | null = getAuditLogsDir(environment),
) {
  if (logsDir) pruneExpiredAuditLogs(environment, logsDir);
  const dayStart = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const todayStart = dayStart(new Date());
  // Window by whole local calendar days (today plus the prior days-1) so the
  // per-day sparkline buckets sum exactly to the blocked total. A rolling
  // now-minus-N*24h cutoff would span a partial extra day with no bucket.
  const windowStart = new Date(todayStart);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  const cutoff = windowStart.getTime();
  const windowEntries: AuditLogEntry[] = [];
  // Counted rather than printed: this runs on a request path, so the client
  // captions the shortfall instead of the server logging one line per fetch.
  const skips = { count: 0 };
  for (const file of logsDir ? listAuditLogFiles(logsDir, skips) : []) {
    for (const entry of readAuditLogEntries(file, skips)) {
      if (!entry || typeof entry.ts !== 'string' || typeof entry.command !== 'string') continue;
      const ts = new Date(entry.ts).getTime();
      if (!Number.isFinite(ts)) continue;
      if (ts >= cutoff) windowEntries.push(entry);
    }
  }
  windowEntries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const blockedByDay = Array.from({ length: days }, () => 0);
  const analyzedByDay = Array.from({ length: days }, () => 0);
  const agents: Record<string, number> = {};
  const rules: Record<string, number> = {};
  const commands: Record<string, number> = {};
  let blocked = 0;
  let errors = 0;
  for (const entry of windowEntries) {
    const agent = entry.agent || 'unknown';
    agents[agent] = (agents[agent] ?? 0) + 1;
    const daysAgo = Math.round((todayStart - dayStart(new Date(entry.ts))) / 86400000);
    const bucket = days - 1 - daysAgo;
    const bucketed = daysAgo >= 0 && daysAgo < days;
    if (bucketed) analyzedByDay[bucket] = (analyzedByDay[bucket] ?? 0) + 1;
    if (entry.decision !== 'allow') {
      blocked++;
      if (entry.ruleId) rules[entry.ruleId] = (rules[entry.ruleId] ?? 0) + 1;
      const signature = commandSignature(entry.segment || entry.command);
      if (signature) commands[signature] = (commands[signature] ?? 0) + 1;
      if (entry.failureStage) errors++;
      if (bucketed) blockedByDay[bucket] = (blockedByDay[bucket] ?? 0) + 1;
    }
  }

  return {
    days,
    logsDir,
    // Entries carry unredacted paths; the client scrubs this prefix out of
    // false-positive reports before they reach the public issue tracker.
    homeDir: environment.home,
    totalInWindow: windowEntries.length,
    truncated: windowEntries.length > ENTRY_CAP,
    unreadable: skips.count,
    counts: {
      blocked,
      allowed: windowEntries.length - blocked,
      agents,
      blockedByDay,
      analyzedByDay,
      rules,
      commands,
      errors,
    },
    entries: capEntries(windowEntries).sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
    ),
  };
}
