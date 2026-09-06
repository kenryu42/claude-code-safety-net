export const DEFAULT_AUDIT_RETENTION_DAYS = 30;
export const MIN_AUDIT_RETENTION_DAYS = 1;
/** Bounds the sweep, the `--since` ceiling, and the per-day arrays the GUI
 *  allocates from a window, so a typo in the policy file cannot size any of
 *  them beyond a year. */
export const MAX_AUDIT_RETENTION_DAYS = 365;

/**
 * Reduce any policy value to a usable number of days. Anything absent,
 * non-integer, or out of range falls back to the default rather than
 * disabling retention or widening it without bound.
 */
export function clampAuditRetentionDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_AUDIT_RETENTION_DAYS;
  if (value < MIN_AUDIT_RETENTION_DAYS) return MIN_AUDIT_RETENTION_DAYS;
  return value > MAX_AUDIT_RETENTION_DAYS ? MAX_AUDIT_RETENTION_DAYS : value;
}
