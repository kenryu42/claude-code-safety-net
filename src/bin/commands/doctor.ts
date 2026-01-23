import type { Command } from './types';

export const doctorCommand: Command = {
  name: 'doctor',
  aliases: ['--doctor'],
  description: 'Run diagnostic checks to verify installation and configuration',
  usage: 'doctor [options]',
  options: [
    {
      flags: '--json',
      description: 'Output diagnostics as JSON',
    },
    {
      flags: '--skip-update-check',
      description: 'Skip npm registry version check',
    },
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: [
    'cc-safety-net doctor',
    'cc-safety-net doctor --json',
    'cc-safety-net doctor --skip-update-check',
  ],
};
