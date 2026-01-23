import type { Command } from './types';

export const geminiCliCommand: Command = {
  name: 'gemini-cli',
  aliases: ['-gc', '--gemini-cli'],
  description: 'Run as Gemini CLI BeforeTool hook (reads JSON from stdin)',
  usage: '-gc, --gemini-cli',
  options: [
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: ['cc-safety-net -gc', 'cc-safety-net --gemini-cli'],
};
