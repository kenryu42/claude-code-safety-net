import { describe, expect, test } from 'bun:test';
import {
  type HookIntegration,
  findHookIntegrationByFlag as portedFindByFlag,
  findLegacyTopLevelHookIntegration as portedFindLegacy,
  hookIntegrations as portedIntegrations,
} from '@/entries/hook-integrations';
import {
  type IntegrationId,
  getIntegrationDisplayName as portedDisplayName,
  integrationDisplayNames as portedDisplayNames,
  doctorIntegrationOrder as portedDoctorOrder,
  installIntegrationMetadata as portedInstallMetadata,
  runtimeHookIntegrationMetadata as portedRuntimeMetadata,
} from '@/hosts/catalog';

/**
 * The hook table is what the bin resolves a flag through, so it has to name the recorded
 * integrations under the recorded spellings and reject the same argument lists. Recording ids
 * rather than the objects is deliberate: a `run` field is a closure, and every other field is data
 * the catalog owns.
 */

const HOOK_ARGS: readonly (readonly string[])[] = [
  [],
  ['--kimi-code'],
  ['-kc'],
  ['--coding-cli'],
  ['--claude-code'],
  ['-cc'],
  ['--agy-cli'],
  ['-ac'],
  ['--codex'],
  ['-cx'],
  ['--cursor'],
  ['--gemini-cli'],
  ['--copilot-cli'],
  ['--grok-build'],
  ['--hermes-agent'],
  ['--cursor', '--kimi-code'],
  ['--kimi-code', 'extra'],
  ['--kimi-code', '--unknown'],
  ['--help'],
];

const LEGACY_FLAGS: readonly (string | undefined)[] = [
  '-cc',
  '--claude-code',
  '-cp',
  '--copilot-cli',
  '-gc',
  '--gemini-cli',
  '--cursor',
  '--statusline',
  undefined,
];

const withoutRun = (integrations: readonly HookIntegration[]) =>
  integrations.map(({ run: _run, ...integration }) => integration);

describe('the ported hook table', () => {
  test('resolves the same integration for every hook argument list', () => {
    for (const args of HOOK_ARGS) {
      expect(portedFindByFlag(args)?.id).toMatchSnapshot();
    }
  });

  test('resolves the same integration for every legacy top-level flag', () => {
    for (const flag of LEGACY_FLAGS) {
      expect(portedFindLegacy(flag)?.id).toMatchSnapshot();
    }
  });

  test('carries the same metadata for the same integrations in the same order', () => {
    expect(withoutRun(portedIntegrations)).toMatchSnapshot();
  });
});

describe('the ported catalog', () => {
  test('projects the same four tables', () => {
    expect(portedRuntimeMetadata).toMatchSnapshot();
    expect(portedInstallMetadata).toMatchSnapshot();
    expect(portedDoctorOrder).toMatchSnapshot();
    expect(portedDisplayNames).toMatchSnapshot();
  });

  test('names every integration the way the shipped catalog names it', () => {
    for (const id of Object.keys(portedDisplayNames) as IntegrationId[]) {
      expect(portedDisplayName(id)).toMatchSnapshot();
    }
  });
});
