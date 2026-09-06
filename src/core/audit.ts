import type { AnalysisErrorCode } from './budget';
import type { BlockIntent } from './decision';
import type { EffectiveSafetyLevel } from './policy/types';

/** Guard stages recorded for an unexpected evaluation failure. */
export type AuditFailureStage =
  | 'policy-protection'
  | 'config-load'
  | 'secret-protection'
  | 'non-command'
  | 'command-validation'
  | 'command-analysis';

/** Sanitized categories recorded for an unexpected evaluation failure: the limit
 *  classes the budget already names, plus everything the catch boundary sees. */
export type AuditErrorCode = AnalysisErrorCode | 'unexpected-error';

type AuditLogDecision = 'allow' | 'deny';

/** Audit log entry */
export interface AuditLogEntry {
  ts: string;
  id?: string;
  v?: string;
  sessionId?: string;
  decision?: AuditLogDecision;
  agent?: string;
  shape?: string;
  /** Effective safety level in force when the decision was made. */
  level?: EffectiveSafetyLevel;
  /** Set when the decision was made against a fallback policy instead of the configured one. */
  configFallback?: true;
  toolName?: string;
  command: string;
  segment: string;
  truncated?: boolean;
  reason: string;
  ruleId?: string;
  intent?: BlockIntent;
  failureStage?: AuditFailureStage;
  errorCode?: AuditErrorCode;
  cwd?: string | null;
}
