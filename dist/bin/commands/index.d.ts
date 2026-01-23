import type { Command } from './types';
/** @internal Exported for testing */
export type { Command, CommandOption } from './types';
/**
 * All registered commands.
 * Order determines display order in main help.
 * @internal Exported for testing
 */
export declare const commands: readonly Command[];
/**
 * Lookup a command by name or alias.
 * Returns undefined if not found.
 */
export declare function findCommand(nameOrAlias: string): Command | undefined;
/**
 * Get all visible commands (non-hidden) for main help display.
 */
export declare function getVisibleCommands(): readonly Command[];
