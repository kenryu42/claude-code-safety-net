import { CC_SAFETY_NET_TEMPLATE } from '@/hosts/templates/cc-safety-net';
import type { BuiltinCommands } from './types';

export function loadBuiltinCommands(): BuiltinCommands {
  return {
    'cc-safety-net': {
      description: 'Operate CC Safety Net: explain blocks, rules, integrations, diagnostics',
      template: CC_SAFETY_NET_TEMPLATE.slice(CC_SAFETY_NET_TEMPLATE.indexOf('# CC Safety Net')),
    },
  };
}
