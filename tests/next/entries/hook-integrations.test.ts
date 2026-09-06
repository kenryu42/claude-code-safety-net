import { describe, expect, test } from 'bun:test';
import {
  type HookIntegration,
  findHookIntegrationByFlag as portedFindByFlag,
  findLegacyTopLevelHookIntegration as portedFindLegacy,
  hookIntegrations as portedIntegrations,
} from '@next/entries/hook-integrations';
import {
  getIntegrationDisplayName as portedDisplayName,
  integrationDisplayNames as portedDisplayNames,
  doctorIntegrationOrder as portedDoctorOrder,
  installIntegrationMetadata as portedInstallMetadata,
  runtimeHookIntegrationMetadata as portedRuntimeMetadata,
} from '@next/hosts/catalog';
import {
  findHookIntegrationByFlag as shippedFindByFlag,
  findLegacyTopLevelHookIntegration as shippedFindLegacy,
  hookIntegrations as shippedIntegrations,
} from '@/cli/hook-integrations';
import {
  type IntegrationId,
  getIntegrationDisplayName as shippedDisplayName,
  integrationDisplayNames as shippedDisplayNames,
  doctorIntegrationOrder as shippedDoctorOrder,
  installIntegrationMetadata as shippedInstallMetadata,
  runtimeHookIntegrationMetadata as shippedRuntimeMetadata,
} from '@/integrations/catalog';

/**
 * The hook table is what the bin resolves a flag through, so the port has to name the same
 * integrations under the same spellings and reject the same argument lists. Comparing ids rather
 * than the objects is deliberate: the two `run` functions are different closures over the two
 * implementations, and every other field is data the catalog owns.
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
      const resolved = portedFindByFlag(args)?.id;
      expect([args, resolved]).toStrictEqual([args, shippedFindByFlag(args)?.id]);
      expect(resolved).toMatchSnapshot();
    }
  });

  test('resolves the same integration for every legacy top-level flag', () => {
    for (const flag of LEGACY_FLAGS) {
      const resolved = portedFindLegacy(flag)?.id;
      expect([flag, resolved]).toStrictEqual([flag, shippedFindLegacy(flag)?.id]);
      expect(resolved).toMatchSnapshot();
    }
  });

  test('carries the same metadata for the same integrations in the same order', () => {
    const metadata = withoutRun(portedIntegrations);
    expect(metadata).toStrictEqual(withoutRun(shippedIntegrations));
    expect(metadata).toMatchSnapshot();
  });
});

describe('the ported catalog', () => {
  test('projects the same four tables', () => {
    expect(portedRuntimeMetadata).toStrictEqual(shippedRuntimeMetadata);
    expect(portedRuntimeMetadata).toMatchSnapshot();
    expect(portedInstallMetadata).toStrictEqual(shippedInstallMetadata);
    expect(portedInstallMetadata).toMatchSnapshot();
    expect(portedDoctorOrder).toStrictEqual(shippedDoctorOrder);
    expect(portedDoctorOrder).toMatchSnapshot();
    expect(portedDisplayNames).toStrictEqual(shippedDisplayNames);
    expect(portedDisplayNames).toMatchSnapshot();
  });

  test('names every integration the way the shipped catalog names it', () => {
    for (const id of Object.keys(shippedDisplayNames) as IntegrationId[]) {
      const name = portedDisplayName(id);
      expect([id, name]).toStrictEqual([id, shippedDisplayName(id)]);
      expect(name).toMatchSnapshot();
    }
  });
});
