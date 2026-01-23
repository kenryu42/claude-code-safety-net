import { claudeCodeCommand } from './claude-code';
import { customRulesDocCommand } from './custom-rules-doc';
import { doctorCommand } from './doctor';
import { explainCommand } from './explain';
import { geminiCliCommand } from './gemini-cli';
import { statuslineCommand } from './statusline';
import type { Command } from './types';
import { verifyConfigCommand } from './verify-config';

/** @internal Exported for testing */
export type { Command, CommandOption } from './types';

/**
 * All registered commands.
 * Order determines display order in main help.
 * @internal Exported for testing
 */
export const commands: readonly Command[] = [
  doctorCommand,
  explainCommand,
  claudeCodeCommand,
  geminiCliCommand,
  verifyConfigCommand,
  customRulesDocCommand,
  statuslineCommand,
];

/**
 * Lookup a command by name or alias.
 * Returns undefined if not found.
 */
export function findCommand(nameOrAlias: string): Command | undefined {
  const normalized = nameOrAlias.toLowerCase();
  return commands.find(
    (cmd) =>
      cmd.name.toLowerCase() === normalized ||
      cmd.aliases?.some((alias) => alias.toLowerCase() === normalized),
  );
}

/**
 * Get all visible commands (non-hidden) for main help display.
 */
export function getVisibleCommands(): readonly Command[] {
  return commands.filter((cmd) => !cmd.hidden);
}
