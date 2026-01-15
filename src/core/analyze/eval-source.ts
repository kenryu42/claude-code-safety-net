import { EVAL_COMMANDS } from '../../types.ts';

const REASON_SOURCE_PROCESS_SUB_RAW =
  'source/. with process substitution can execute arbitrary code. Review the command first.';

const REASON_EVAL_DYNAMIC =
  'eval with dynamic input can execute arbitrary code. Use explicit commands instead.';
const REASON_EVAL_SUBSHELL =
  'eval with command substitution can execute arbitrary code. Use explicit commands instead.';
const REASON_SOURCE_DYNAMIC =
  'source/. with dynamic path can execute arbitrary code. Use explicit paths instead.';
const REASON_SOURCE_NETWORK =
  'source/. from network location is dangerous. Download and review the script first.';
const REASON_SOURCE_TEMP =
  'source/. from temp directory is risky. Verify the script contents first.';
const REASON_SOURCE_PROCESS_SUB =
  'source/. from process substitution can execute arbitrary code. Review the command first.';

/** Patterns indicating dynamic/untrusted content */
const DYNAMIC_PATTERNS = [
  /^\$/, // Variable reference: $VAR, ${VAR}
  /^\$\(/, // Command substitution: $(...)
  /^`/, // Backtick substitution: `...`
];

/** Network URL patterns */
const NETWORK_PATTERNS = [/^https?:\/\//i, /^ftp:\/\//i];

/** Process substitution patterns - dangerous because they execute arbitrary commands */
const PROCESS_SUBSTITUTION_PATTERN = /^<\(/;

/** Temp directory patterns */
const TEMP_PATH_PATTERNS = [/^\/tmp\b/, /^\/var\/tmp\b/, /^\$TMPDIR\b/];

/**
 * Pattern to detect source/. with process substitution in raw command string.
 * This is needed because shell-quote strips the <(...) operators during parsing.
 * Matches: source <(...), . <(...)
 */
const SOURCE_PROCESS_SUB_RAW_PATTERN = /(?:^|\s)(?:source|\.)\s+<\(/;

function isDynamicContent(arg: string): boolean {
  return DYNAMIC_PATTERNS.some((pattern) => pattern.test(arg));
}

/**
 * Detect source/. with process substitution in the raw command string.
 * This must be called before shell parsing since <(...) is stripped during parsing.
 */
export function detectSourceProcessSubstitution(command: string): string | null {
  if (SOURCE_PROCESS_SUB_RAW_PATTERN.test(command)) {
    return REASON_SOURCE_PROCESS_SUB_RAW;
  }
  return null;
}

function isNetworkSource(arg: string): boolean {
  return NETWORK_PATTERNS.some((pattern) => pattern.test(arg));
}

function isTempPath(arg: string): boolean {
  return TEMP_PATH_PATTERNS.some((pattern) => pattern.test(arg));
}

/**
 * Analyze eval/source commands for dangerous patterns.
 *
 * Blocks:
 * - eval with any dynamic content (variables, command substitution)
 * - source/. with dynamic paths, network URLs, or temp directories
 *
 * Allows:
 * - source with static paths to known config files (e.g., source ~/.bashrc)
 */
export function analyzeEvalSource(tokens: readonly string[]): string | null {
  if (tokens.length === 0) {
    return null;
  }

  const head = tokens[0]?.toLowerCase();
  if (!head || !EVAL_COMMANDS.has(head)) {
    return null;
  }

  const isEval = head === 'eval';
  const isSource = head === 'source' || head === '.';

  // Get the argument(s) after eval/source
  const args = tokens.slice(1);

  if (args.length === 0) {
    // No arguments - not dangerous by itself
    return null;
  }

  // For eval, check all arguments for dynamic content
  if (isEval) {
    for (const arg of args) {
      if (!arg) continue;

      // Check for command substitution patterns
      if (arg.includes('$(') || arg.includes('`')) {
        return REASON_EVAL_SUBSHELL;
      }

      // Check for variable references
      if (isDynamicContent(arg)) {
        return REASON_EVAL_DYNAMIC;
      }
    }

    // Even "static" eval is risky - the content could be obfuscated
    // We allow it for now since the actual danger patterns will be caught
    // when the shell processes eval's output. But block obvious dynamic cases.
  }

  // For source/., check the path argument
  if (isSource) {
    const pathArg = args[0];
    if (!pathArg) {
      return null;
    }

    // Process substitution is dangerous (executes arbitrary commands)
    if (PROCESS_SUBSTITUTION_PATTERN.test(pathArg)) {
      return REASON_SOURCE_PROCESS_SUB;
    }

    // Network sources are always dangerous
    if (isNetworkSource(pathArg)) {
      return REASON_SOURCE_NETWORK;
    }

    // Temp directories are risky (could be attacker-controlled)
    if (isTempPath(pathArg)) {
      return REASON_SOURCE_TEMP;
    }

    // Dynamic paths are dangerous
    if (isDynamicContent(pathArg)) {
      return REASON_SOURCE_DYNAMIC;
    }

    // Static paths like ~/.bashrc, /etc/profile are allowed
  }

  return null;
}
