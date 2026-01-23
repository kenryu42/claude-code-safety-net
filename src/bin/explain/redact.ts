/**
 * Redaction utilities for the explain command.
 * Prevents leaking sensitive environment variable values in trace output.
 */

/** Regex to match environment variable assignments (KEY=value) */
const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Redact values from an environment variable map.
 * Returns a new object with all values replaced with '<redacted>'.
 */
export function redactEnvVars(envMap: Map<string, string>): Record<string, '<redacted>'> {
  const result: Record<string, '<redacted>'> = {};
  for (const key of envMap.keys()) {
    result[key] = '<redacted>';
  }
  return result;
}

/**
 * Redact env assignments in a raw command string (KEY=value → KEY=<redacted>).
 * Handles both quoted and unquoted values.
 * Prevents leaking secrets in shell wrapper and interpreter trace output.
 */
export function redactEnvAssignmentsInString(str: string): string {
  return str.replace(/\b([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g, '$1=<redacted>');
}

/**
 * Redact values in tokens that look like env assignments (KEY=value → KEY=<redacted>).
 * Prevents leaking secrets when wrappers like `env TOKEN=secret` are stripped.
 */
export function redactEnvAssignmentTokens(tokens: readonly string[]): string[] {
  return tokens.map((token) => {
    if (ENV_ASSIGNMENT_RE.test(token)) {
      const eqIdx = token.indexOf('=');
      return `${token.slice(0, eqIdx)}=<redacted>`;
    }
    return token;
  });
}
