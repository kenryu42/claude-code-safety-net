import type { Command } from './types';

export const explainCommand: Command = {
  name: 'explain',
  description: 'Show step-by-step analysis trace of how a command would be analyzed',
  usage: 'explain [options] <command>',
  argument: '<command>',
  options: [
    {
      flags: '--json',
      description: 'Output analysis as JSON',
    },
    {
      flags: '--cwd',
      argument: '<path>',
      description: 'Use custom working directory',
    },
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: [
    'cc-safety-net explain "git reset --hard"',
    'cc-safety-net explain --json "rm -rf /"',
    'cc-safety-net explain --cwd /tmp "git status"',
  ],
};
