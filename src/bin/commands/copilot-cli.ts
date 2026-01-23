import type { Command } from './types';

export const copilotCliCommand: Command = {
  name: 'copilot-cli',
  aliases: ['-cp', '--copilot-cli'],
  description: 'Run as Copilot CLI PreToolUse hook (reads JSON from stdin)',
  usage: '-cp, --copilot-cli',
  options: [
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: ['cc-safety-net -cp', 'cc-safety-net --copilot-cli'],
};
