import { getIntegrationDisplayName, installIntegrationMetadata } from '@/hosts/catalog';
import type { Command } from './types';

export const installCommand = {
  name: 'install' as const,
  description: 'Install CC Safety Net into a coding agent CLI',
  usage: 'install [TARGET_FLAG]',
  options: [
    ...installIntegrationMetadata.map((integration) => ({
      flags: integration.flag,
      description: `Install ${getIntegrationDisplayName(integration.id)} ${integration.artifactKind}`,
    })),
    { flags: '-h, --help', description: 'Show this help' },
  ],
  examples: [
    'cc-safety-net install',
    ...installIntegrationMetadata.map((integration) => `cc-safety-net install ${integration.flag}`),
  ],
} satisfies Command;

export const uninstallCommand = {
  name: 'uninstall' as const,
  description: 'Uninstall CC Safety Net from a coding agent CLI',
  usage: 'uninstall [TARGET_FLAG]',
  options: [
    ...installIntegrationMetadata.map((integration) => ({
      flags: integration.flag,
      description: `Uninstall ${getIntegrationDisplayName(integration.id)} ${integration.artifactKind}`,
    })),
    { flags: '-h, --help', description: 'Show this help' },
  ],
  examples: [
    'cc-safety-net uninstall',
    ...installIntegrationMetadata.map(
      (integration) => `cc-safety-net uninstall ${integration.flag}`,
    ),
  ],
} satisfies Command;

export const updateCommand = {
  name: 'update' as const,
  description: 'Update every installed CC Safety Net integration to the latest version',
  usage: 'update',
  options: [{ flags: '-h, --help', description: 'Show this help' }],
  examples: ['cc-safety-net update'],
} satisfies Command;
