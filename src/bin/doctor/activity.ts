/**
 * Audit log activity summary for the doctor command.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ActivitySummary } from '@/bin/doctor/types';
import type { AuditLogEntry } from '@/types';

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function getActivitySummary(
  days: number = 7,
  logsDir: string = join(homedir(), '.cc-safety-net', 'logs'),
): ActivitySummary {
  if (!existsSync(logsDir)) {
    return { totalBlocked: 0, sessionCount: 0, recentEntries: [] };
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const entries: AuditLogEntry[] = [];
  let sessionCount = 0;

  let files: string[];
  try {
    files = readdirSync(logsDir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return { totalBlocked: 0, sessionCount: 0, recentEntries: [] };
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(logsDir, file), 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);

      let hasRecentEntry = false;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditLogEntry;
          const ts = new Date(entry.ts).getTime();
          if (ts >= cutoff) {
            entries.push(entry);
            hasRecentEntry = true;
          }
        } catch {
          // Skip malformed lines
        }
      }

      if (hasRecentEntry) {
        sessionCount++;
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Sort by timestamp descending
  entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Take latest 3 for display
  const recentEntries = entries.slice(0, 3).map((e) => ({
    timestamp: e.ts,
    command: e.command,
    reason: e.reason,
    relativeTime: formatRelativeTime(new Date(e.ts)),
  }));

  return {
    totalBlocked: entries.length,
    sessionCount,
    recentEntries,
    oldestEntry: entries.at(-1)?.ts,
    newestEntry: entries.at(0)?.ts,
  };
}
