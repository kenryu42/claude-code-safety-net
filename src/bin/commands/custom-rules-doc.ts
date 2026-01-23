import type { Command } from './types';

export const customRulesDocCommand: Command = {
  name: 'custom-rules-doc',
  aliases: ['--custom-rules-doc'],
  description: 'Print custom rules documentation',
  usage: '--custom-rules-doc',
  options: [
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: ['cc-safety-net --custom-rules-doc'],
};
