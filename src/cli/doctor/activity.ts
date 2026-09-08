/**
 * Audit log activity summary for the doctor command.
 */

import { basename } from 'node:path';
import { formatRelativeTime } from '@/audit/display';
import { listAuditLogFiles, readAuditLogEntries } from '@/audit/reader';
import { pruneExpiredAuditLogs } from '@/audit/retention';
import { getAuditLogsDir } from '@/audit/writer';
import type { AuditLogEntry } from '@/core/audit';
import type { Environment } from '@/core/environment';
import type { ActivitySummary } from '@/hosts/doctor-types';

export function getActivitySummary(
  environment: Environment,
  days: number = 7,
  logsDir: string | null = getAuditLogsDir(environment),
): ActivitySummary {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentEntries: AuditLogEntry[] = [];
  const recentSessions = new Set<string>();
  let totalBlocked = 0;
  let oldestEntry: string | undefined;
  let oldestEntryTs: number | undefined;
  let newestEntry: string | undefined;
  let newestEntryTs: number | undefined;
  if (logsDir) pruneExpiredAuditLogs(environment, logsDir);
  // Counted so the report can say the summary is partial; silence here reads as
  // "nothing was ever blocked" when the truth is "the trail could not be read".
  const skips = { count: 0 };
  const files = logsDir ? listAuditLogFiles(logsDir, skips) : [];

  for (const file of files) {
    // The shared reader validates each record's shape, so every field used
    // below - and by the formatter downstream - is a string when present.
    for (const entry of readAuditLogEntries(file, skips)) {
      if (entry.decision === 'allow') {
        continue;
      }
      const ts = new Date(entry.ts).getTime();
      if (ts >= cutoff) {
        totalBlocked++;
        recentSessions.add(entry.sessionId ?? basename(file, '.jsonl'));
        if (oldestEntryTs === undefined || ts <= oldestEntryTs) {
          oldestEntry = entry.ts;
          oldestEntryTs = ts;
        }
        if (newestEntryTs === undefined || ts > newestEntryTs) {
          newestEntry = entry.ts;
          newestEntryTs = ts;
        }
        insertRecentEntry(recentEntries, entry, ts);
      }
    }
  }

  const displayEntries = recentEntries.map((e) => ({
    timestamp: e.ts,
    command: e.command,
    reason: e.reason,
    relativeTime: formatRelativeTime(new Date(e.ts)),
  }));

  return {
    totalBlocked,
    sessionCount: recentSessions.size,
    recentEntries: displayEntries,
    oldestEntry,
    newestEntry,
    unreadable: skips.count,
  };
}

function insertRecentEntry(entries: AuditLogEntry[], entry: AuditLogEntry, ts: number): void {
  const index = entries.findIndex((existing) => ts > new Date(existing.ts).getTime());
  if (index === -1) {
    if (entries.length < 3) {
      entries.push(entry);
    }
    return;
  }

  entries.splice(index, 0, entry);
  if (entries.length > 3) {
    entries.pop();
  }
}
