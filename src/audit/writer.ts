import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { AuditErrorCode, AuditFailureStage, AuditLogEntry } from '@/core/audit';
import type { BlockIntent } from '@/core/decision';
import type { Environment } from '@/core/environment';
import type { EffectiveSafetyLevel } from '@/core/policy/types';
import { redactSecrets } from '@/core/redaction';
import { pruneExpiredAuditLogs } from './retention';

type AuditLogDecision = 'allow' | 'deny';

declare const __PKG_VERSION__: string | undefined;

const AUDIT_LOG_VERSION = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';
const COMMAND_MAX_LENGTH = 10_000;
const SEGMENT_MAX_LENGTH = 2_000;
const TOOL_NAME_MAX_LENGTH = 256;
const CWD_MAX_LENGTH = 32_768;

/**
 * Sanitize session ID to prevent path traversal attacks.
 * Returns null if the session ID is invalid.
 * @internal Exported for testing
 */
export function sanitizeSessionIdForFilename(sessionId: string): string | null {
  const raw = sessionId.trim();
  if (!raw) {
    return null;
  }

  // Replace any non-safe characters with underscores
  let safe = raw.replace(/[^A-Za-z0-9_.-]+/g, '_');

  // Strip leading/trailing special chars and limit length
  safe = safe.replace(/^[._-]+|[._-]+$/g, '').slice(0, 128);

  if (!safe || safe === '.' || safe === '..') {
    return null;
  }

  return safe;
}

/** @internal Exported for testing */
export function encodeCwdForLogDirname(cwd: string | null): string {
  const encoded = (cwd ?? '').replace(/[^A-Za-z0-9]/g, '-').slice(0, 180);
  return encoded || 'no-cwd';
}

/**
 * Write an audit log entry for a denied command.
 * Logs are written to ~/.cc-safety-net/logs/<encoded_cwd>/<YYYY-MM>/<YYYY-MM-DD>-<session_id>.jsonl
 */
export function writeAuditLog(
  environment: Environment,
  sessionId: string,
  command: string,
  segment: string,
  reason: string,
  cwd: string | null,
  options: {
    decision?: AuditLogDecision;
    agent?: string;
    shape?: string;
    level?: EffectiveSafetyLevel;
    configFallback?: true;
    toolName?: string;
    ruleId?: string;
    intent?: BlockIntent;
    failureStage?: AuditFailureStage;
    errorCode?: AuditErrorCode;
    now?: () => Date;
    createId?: () => string;
  } = {},
): void {
  const safeSessionId = sanitizeSessionIdForFilename(sessionId);
  if (!safeSessionId) {
    return;
  }

  const logsDir = getAuditLogsDir(environment);
  if (!logsDir) {
    return;
  }

  try {
    const ts = (options.now ?? (() => new Date()))().toISOString();
    // Failure entries are the diagnostic of record for fail-closed events, so they
    // keep the whole command (already bounded upstream by the tool input caps).
    const cappedCommand = capField(
      redactSecrets(command),
      options.failureStage ? Number.POSITIVE_INFINITY : COMMAND_MAX_LENGTH,
    );
    const cappedSegment = capField(redactSecrets(segment), SEGMENT_MAX_LENGTH);
    const cappedToolName = options.toolName
      ? capField(redactSecrets(options.toolName), TOOL_NAME_MAX_LENGTH)
      : undefined;
    const cappedCwd = cwd === null ? undefined : capField(redactSecrets(cwd), CWD_MAX_LENGTH);
    const sessionDir = join(
      logsDir,
      encodeCwdForLogDirname(cappedCwd?.value ?? null),
      ts.slice(0, 7),
    );
    mkdirSync(sessionDir, { recursive: true, mode: 0o700 });

    const logFile = join(sessionDir, `${ts.slice(0, 10)}-${safeSessionId}.jsonl`);
    const entry: AuditLogEntry = {
      ts,
      id: (options.createId ?? (() => randomBytes(8).toString('hex')))(),
      v: AUDIT_LOG_VERSION,
      sessionId: safeSessionId,
      decision: options.decision ?? 'deny',
      agent: options.agent,
      shape: options.shape,
      level: options.level,
      configFallback: options.configFallback,
      toolName: cappedToolName?.value,
      command: cappedCommand.value,
      segment: cappedSegment.value,
      ...(cappedCommand.truncated ||
      cappedSegment.truncated ||
      cappedToolName?.truncated ||
      cappedCwd?.truncated
        ? { truncated: true }
        : {}),
      reason,
      ruleId: options.ruleId,
      intent: options.intent,
      failureStage: options.failureStage,
      errorCode: options.errorCode,
      cwd: cappedCwd?.value ?? null,
    };

    appendFileSync(logFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf-8', mode: 0o600 });
    // Retention runs after the append so a pruning failure can never cost the
    // entry this call was made to persist.
    pruneExpiredAuditLogs(environment, logsDir, options.now);
  } catch {
    // Silently ignore errors (matches Python behavior)
  }
}

function capField(value: string, maxLength: number) {
  return { value: value.slice(0, maxLength), truncated: value.length > maxLength };
}

export function getAuditLogHomeDir(environment: Environment): string | null {
  // The redirect that keeps test writes out of a developer's real home is set by
  // tests/setup.ts, which only runs via the `preload` in bunfig.toml — and Bun
  // reads bunfig.toml from the current working directory. Running `bun test`
  // from anywhere but the repository root silently skipped it and appended
  // hundreds of fixture entries to ~/.cc-safety-net/logs. Bun sets NODE_ENV
  // itself from every cwd, so refusing the fallback here makes the leak
  // impossible to reach, and tests that assert on audit output fail loudly
  // instead of writing somewhere nobody looks.
  const homeFromEnv = environment.env.get('CC_SAFETY_NET_AUDIT_HOME');
  if (environment.env.get('NODE_ENV') === 'test' && !homeFromEnv) {
    return null;
  }
  const home = homeFromEnv || environment.home;
  return home && isAbsolute(home) ? home : null;
}

export function getAuditLogsDir(environment: Environment): string | null {
  const homeDir = getAuditLogHomeDir(environment);
  return homeDir ? join(homeDir, '.cc-safety-net', 'logs') : null;
}
