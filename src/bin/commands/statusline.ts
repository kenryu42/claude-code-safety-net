import type { Command } from './types';

export const statuslineCommand: Command = {
  name: 'statusline',
  aliases: ['--statusline'],
  description: 'Print status line with mode indicators for shell integration',
  usage: '--statusline',
  options: [
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: ['cc-safety-net --statusline'],
};
