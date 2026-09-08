import { runtimeHookIntegrationMetadata } from '@/hosts/catalog';
import type { Command } from './types';

const platformOptions = runtimeHookIntegrationMetadata.map((integration) => ({
  flags: integration.flags.join(', '),
  description: integration.description,
}));

const platformExamples = runtimeHookIntegrationMetadata.flatMap((integration) =>
  integration.flags.map((flag) => `cc-safety-net hook ${flag}`),
);

export const hookCommand = {
  name: 'hook' as const,
  description: 'Run as an agent CLI hook (reads JSON from stdin)',
  usage: 'hook INTEGRATION_FLAG',
  options: [
    ...platformOptions,
    {
      flags: '-h, --help',
      description: 'Show this help',
    },
  ],
  examples: platformExamples,
} satisfies Command;
