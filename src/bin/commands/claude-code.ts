import type { Command } from './types';

export const claudeCodeCommand: Command = {
  name: 'claude-code',
  aliases: ['-cc', '--claude-code'],
  description: 'Run as Claude Code PreToolUse hook (reads JSON from stdin)',
  usage: '-cc, --claude-code',
  options: [
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: ['cc-safety-net -cc', 'cc-safety-net --claude-code'],
};
