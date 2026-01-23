import type { Command } from './commands';
/**
 * Print help for a specific command.
 * @internal Exported for testing
 */
export declare function printCommandHelp(command: Command): void;
/**
 * Print the main help with all commands.
 */
export declare function printHelp(): void;
/**
 * Print version number.
 */
export declare function printVersion(): void;
/**
 * Handle help for a specific command name.
 * Returns true if help was printed, false if command not found.
 */
export declare function showCommandHelp(commandName: string): boolean;
