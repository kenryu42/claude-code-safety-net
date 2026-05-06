import type { Command } from './commands';
import { findCommand, getVisibleCommands } from './commands';

declare const __PKG_VERSION__: string | undefined;

const version = typeof __PKG_VERSION__ !== 'undefined' ? __PKG_VERSION__ : 'dev';

const INDENT = '  ';
const PROGRAM_NAME = 'cc-safety-net';

/**
 * Format option flags with optional argument.
 * e.g., "--cwd <path>" or "--json"
 */
function formatOptionFlags(option: { flags: string; argument?: string }): string {
  return option.argument ? `${option.flags} ${option.argument}` : option.flags;
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
  lines.push(`${INDENT}SAFETY_NET_ASK=1                  Prompt user instead of blocking`);
  lines.push(`${INDENT}SAFETY_NET_STRICT=1               Fail-closed on unparseable commands`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID=1             Enable all paranoid checks`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID_RM=1          Block non-temp rm -rf within cwd`);
  lines.push(`${INDENT}SAFETY_NET_PARANOID_INTERPRETERS=1  Block interpreter one-liners`);
  lines.push(
    `${INDENT}SAFETY_NET_WORKTREE=1             Allow local git discards in linked worktrees`,
  );
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
