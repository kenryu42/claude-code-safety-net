import type { Command } from './commands';
import { findCommand, getVisibleCommands } from './commands';

declare const __PKG_VERSION__: string | undefined;

const version = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';

const INDENT = '  ';
const PROGRAM_NAME = 'cc-safety-net';

<<<<<<< HEAD
Blocks destructive git and filesystem commands before execution.

USAGE:
  cc-safety-net doctor                   Run diagnostic checks
  cc-safety-net doctor --json            Output diagnostics as JSON
  cc-safety-net doctor --skip-update-check  Skip npm registry check
  cc-safety-net -cc, --claude-code       Run as Claude Code PreToolUse hook (reads JSON from stdin)
  cc-safety-net -cp, --copilot-cli       Run as Copilot CLI preToolUse hook (reads JSON from stdin)
  cc-safety-net -gc, --gemini-cli        Run as Gemini CLI BeforeTool hook (reads JSON from stdin)
  cc-safety-net -vc, --verify-config     Validate config files
  cc-safety-net --custom-rules-doc       Print custom rules documentation
  cc-safety-net --statusline             Print status line with mode indicators
  cc-safety-net -h,  --help              Show this help
  cc-safety-net -V,  --version           Show version

ENVIRONMENT VARIABLES:
  SAFETY_NET_STRICT=1             Fail-closed on unparseable commands
  SAFETY_NET_PARANOID=1           Enable all paranoid checks
  SAFETY_NET_PARANOID_RM=1        Block non-temp rm -rf within cwd
  SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners

CONFIG FILES:
  ~/.cc-safety-net/config.json    User-scope config
  .safety-net.json                Project-scope config`);
||||||| parent of b7eeb63 (feat: add explain command and structured CLI help)
Blocks destructive git and filesystem commands before execution.

USAGE:
  cc-safety-net doctor                   Run diagnostic checks
  cc-safety-net doctor --json            Output diagnostics as JSON
  cc-safety-net doctor --skip-update-check  Skip npm registry check
  cc-safety-net -cc, --claude-code       Run as Claude Code PreToolUse hook (reads JSON from stdin)
  cc-safety-net -gc, --gemini-cli        Run as Gemini CLI BeforeTool hook (reads JSON from stdin)
  cc-safety-net -vc, --verify-config     Validate config files
  cc-safety-net --custom-rules-doc       Print custom rules documentation
  cc-safety-net --statusline             Print status line with mode indicators
  cc-safety-net -h,  --help              Show this help
  cc-safety-net -V,  --version           Show version

ENVIRONMENT VARIABLES:
  SAFETY_NET_STRICT=1             Fail-closed on unparseable commands
  SAFETY_NET_PARANOID=1           Enable all paranoid checks
  SAFETY_NET_PARANOID_RM=1        Block non-temp rm -rf within cwd
  SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners

CONFIG FILES:
  ~/.cc-safety-net/config.json    User-scope config
  .safety-net.json                Project-scope config`);
=======
/**
 * Format option flags with optional argument.
 * e.g., "--cwd <path>" or "--json"
 */
function formatOptionFlags(option: { flags: string; argument?: string }): string {
  return option.argument ? `${option.flags} ${option.argument}` : option.flags;
>>>>>>> b7eeb63 (feat: add explain command and structured CLI help)
}

/**
 * Calculate the maximum width of option flags for alignment.
 */
function getOptionsColumnWidth(options: readonly { flags: string; argument?: string }[]): number {
  return Math.max(...options.map((opt) => formatOptionFlags(opt).length));
}

/**
 * Format a single command for the main help listing.
 */
function formatCommandSummary(cmd: Command, maxUsageWidth: number): string {
  const usage = `${PROGRAM_NAME} ${cmd.usage}`;
  return `${INDENT}${usage.padEnd(maxUsageWidth + PROGRAM_NAME.length + 3)}${cmd.description}`;
}

/**
 * Print help for a specific command.
 * @internal Exported for testing
 */
export function printCommandHelp(command: Command): void {
  const lines: string[] = [];

  // Header
  lines.push(`${PROGRAM_NAME} ${command.name}`);
  lines.push('');
  lines.push(`${INDENT}${command.description}`);
  lines.push('');

  // Usage
  lines.push('USAGE:');
  lines.push(`${INDENT}${PROGRAM_NAME} ${command.usage}`);
  lines.push('');

  // Options
  if (command.options.length > 0) {
    lines.push('OPTIONS:');
    const optWidth = getOptionsColumnWidth(command.options);
    for (const opt of command.options) {
      const flags = formatOptionFlags(opt);
      lines.push(`${INDENT}${flags.padEnd(optWidth + 2)}${opt.description}`);
    }
    lines.push('');
  }

  // Examples
  if (command.examples && command.examples.length > 0) {
    lines.push('EXAMPLES:');
    for (const example of command.examples) {
      lines.push(`${INDENT}${example}`);
    }
  }

  console.log(lines.join('\n'));
}

/**
 * Print the main help with all commands.
 */
export function printHelp(): void {
  const visibleCommands = getVisibleCommands();

  // Calculate max usage width for alignment
  const maxUsageWidth = Math.max(...visibleCommands.map((cmd) => cmd.usage.length));

  const lines: string[] = [];

  // Header
  lines.push(`${PROGRAM_NAME} v${version}`);
  lines.push('');
  lines.push('Blocks destructive git and filesystem commands before execution.');
  lines.push('');

  // Commands
  lines.push('COMMANDS:');
  for (const cmd of visibleCommands) {
    lines.push(formatCommandSummary(cmd, maxUsageWidth));
  }
  lines.push('');

  // Global options
  lines.push('GLOBAL OPTIONS:');
  lines.push(`${INDENT}-h, --help       Show help (use with command for command-specific help)`);
  lines.push(`${INDENT}-V, --version    Show version`);
  lines.push('');

  // Help command hint
  lines.push('HELP:');
  lines.push(`${INDENT}${PROGRAM_NAME} help <command>     Show help for a specific command`);
  lines.push(`${INDENT}${PROGRAM_NAME} <command> --help   Show help for a specific command`);
  lines.push('');

  // Environment variables
  lines.push('ENVIRONMENT VARIABLES:');
  lines.push(`${INDENT}SAFETY_NET_STRICT=1               Fail-closed on unparseable commands`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID=1             Enable all paranoid checks`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID_RM=1          Block non-temp rm -rf within cwd`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners`);
  lines.push('');

  // Config files
  lines.push('CONFIG FILES:');
  lines.push(`${INDENT}~/.cc-safety-net/config.json      User-scope config`);
  lines.push(`${INDENT}.safety-net.json                  Project-scope config`);

  console.log(lines.join('\n'));
}

/**
 * Print version number.
 */
export function printVersion(): void {
  console.log(version);
}

/**
 * Handle help for a specific command name.
 * Returns true if help was printed, false if command not found.
 */
export function showCommandHelp(commandName: string): boolean {
  const command = findCommand(commandName);
  if (!command) {
    return false;
  }
  printCommandHelp(command);
  return true;
}
