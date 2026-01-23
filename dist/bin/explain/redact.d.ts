/**
 * Redaction utilities for the explain command.
 * Prevents leaking sensitive environment variable values in trace output.
 */
/**
 * Redact values from an environment variable map.
 * Returns a new object with all values replaced with '<redacted>'.
 */
export declare function redactEnvVars(envMap: Map<string, string>): Record<string, '<redacted>'>;
/**
 * Redact env assignments in a raw command string (KEY=value → KEY=<redacted>).
 * Handles both quoted and unquoted values.
 * Prevents leaking secrets in shell wrapper and interpreter trace output.
 */
export declare function redactEnvAssignmentsInString(str: string): string;
/**
 * Redact values in tokens that look like env assignments (KEY=value → KEY=<redacted>).
 * Prevents leaking secrets when wrappers like `env TOKEN=secret` are stripped.
 */
export declare function redactEnvAssignmentTokens(tokens: readonly string[]): string[];
