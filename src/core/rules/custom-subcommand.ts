import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/rules/constants';

const DOCKER_OPTIONS_WITH_VALUES = new Set([
  '-c',
  '-H',
  '-l',
  '--config',
  '--context',
  '--host',
  '--log-level',
  '--tlscacert',
  '--tlscert',
  '--tlskey',
]);

const EMPTY_OPTIONS_WITH_VALUES = new Set<string>();

export function getCustomRuleOptionsWithValues(command: string): ReadonlySet<string> {
  if (command === 'git') return GIT_GLOBAL_OPTS_WITH_VALUE;
  if (command === 'docker') return DOCKER_OPTIONS_WITH_VALUES;
  return EMPTY_OPTIONS_WITH_VALUES;
}
