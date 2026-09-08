import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AuditLogEntry } from '@/core/audit';
import { commandSignature } from './display';

/**
 * `skips` counts what the scan had to drop — an unreadable directory or file, a
 * malformed record — so a caller can say its answer is incomplete instead of
 * presenting the survivors as the whole log. A directory that does not exist is
 * an empty history, not a dropped one, so it is not counted.
 */
export function listAuditLogFiles(logsDir: string, skips?: { count: number }): string[] {
  try {
    return readdirSync(logsDir, { withFileTypes: true, encoding: 'utf8' }).flatMap((entry) => {
      const filePath = join(logsDir, entry.name);
      if (entry.isDirectory()) return listAuditLogFiles(filePath, skips);
      if (entry.name.endsWith('.jsonl')) return [filePath];
      return [];
    });
  } catch {
    if (skips && existsSync(logsDir)) skips.count++;
    return [];
  }
}

/**
 * Denials that read as false positives rather than catches: a fail-closed
 * denial reports that analysis failed, not that the command was dangerous, and
 * a signature one session was blocked on twice is a workload that kept wanting
 * the command. Repeats are counted over exactly the entries passed in, so the
 * caller owns the window.
 */
export function findSuspectEntries(entries: readonly AuditLogEntry[]): Set<AuditLogEntry> {
  const signatureKey = (entry: AuditLogEntry) =>
    `${entry.sessionId}\n${commandSignature(entry.segment || entry.command)}`;
  const denials = entries.filter((entry) => entry.decision !== 'allow');
  const repeats = denials
    .filter((entry) => entry.sessionId)
    .reduce(
      (counts, entry) =>
        counts.set(signatureKey(entry), (counts.get(signatureKey(entry)) ?? 0) + 1),
      new Map<string, number>(),
    );
  return new Set(
    denials.filter((entry) => entry.failureStage || (repeats.get(signatureKey(entry)) ?? 0) >= 2),
  );
}

/** Fields readers dereference with string methods or use as record keys.
 *  Legacy entries may omit them, so they are only type-checked when present. */
const OPTIONAL_STRING_FIELDS = [
  'segment',
  'reason',
  'sessionId',
  'decision',
  'agent',
  'ruleId',
  'failureStage',
] as const;

function isReadableAuditLogEntry(value: unknown): value is AuditLogEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.ts !== 'string' || typeof record.command !== 'string') return false;
  return OPTIONAL_STRING_FIELDS.every(
    (field) => record[field] === undefined || typeof record[field] === 'string',
  );
}

/** See `listAuditLogFiles` for `skips`. */
export function readAuditLogEntries(filePath: string, skips?: { count: number }): AuditLogEntry[] {
  try {
    return readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed: unknown = JSON.parse(line);
          if (!isReadableAuditLogEntry(parsed)) {
            if (skips) skips.count++;
            return [];
          }
          return [parsed];
        } catch {
          if (skips) skips.count++;
          return [];
        }
      });
  } catch {
    if (skips) skips.count++;
    return [];
  }
}
