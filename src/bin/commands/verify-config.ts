import type { Command } from './types';

export const verifyConfigCommand: Command = {
  name: 'verify-config',
  aliases: ['-vc', '--verify-config'],
  description: 'Validate custom rules configuration files',
  usage: '-vc, --verify-config',
  options: [
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: ['cc-safety-net -vc', 'cc-safety-net --verify-config'],
};
