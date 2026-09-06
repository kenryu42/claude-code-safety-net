import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  applyInstallTargetState,
  type BuildInstallTargetChoicesOptions,
  buildInstallTargetChoicesAsync,
  type InstallTargetChoice,
  probeInstallTarget,
} from '@next/hosts/install/choices';
import type { NativeCommand } from '@next/hosts/install/native';
import type { InstallTarget } from '@next/hosts/install/targets';
import {
  applyInstallTargetState as shippedApplyInstallTargetState,
  buildInstallTargetChoicesAsync as shippedBuildInstallTargetChoicesAsync,
  probeInstallTarget as shippedProbeInstallTarget,
} from '@/integrations/install/choices';
import { createFakeBin, type FakeScriptEntry } from '../../helpers/fake-bin';
import { createTempRoot, removeTempRoots, withProcessEnv } from '../../helpers/temp-home';

/**
 * The rows the install picker offers. A host counts as present only when its CLI answers
 * `--version` with a clean exit inside five seconds, and what the picker says about a row that
 * cannot be chosen ("CLI not installed", "already installed", "not installed") is what the user
 * reads, so both the probe result and the reason are compared.
 */

const SCRIPT: readonly FakeScriptEntry[] = [
  { command: 'present', stdout: '1.0.0\n' },
  { command: 'broken', exit: 1 },
  { command: 'stalled', delayMs: 10_000 },
];

const CONFIGURED: readonly InstallTarget[] = ['cursor', 'pi'];
const ANSWERING = ['cursor --version', 'pi --version'];

const scriptedProbe = (command: NativeCommand) => ANSWERING.includes(command.join(' '));

const OPTIONS: readonly BuildInstallTargetChoicesOptions[] = [
  { configuredTargets: CONFIGURED },
  { action: 'install', configuredTargets: CONFIGURED },
  { action: 'uninstall', configuredTargets: CONFIGURED },
];

/** The distinct row shapes per group, so the table stays readable as hosts are added. */
const groupedReasons = (choices: readonly InstallTargetChoice[]) => {
  const distinct = (rows: readonly InstallTargetChoice[]) => [
    ...new Set(rows.map((row) => `${row.available} ${row.unavailableReason ?? ''}`.trim())),
  ];
  return {
    configured: distinct(choices.filter((choice) => CONFIGURED.includes(choice.target))),
    rest: distinct(choices.filter((choice) => !CONFIGURED.includes(choice.target))),
  };
};

afterEach(removeTempRoots);

describe('probing a host CLI', () => {
  test('a clean exit means present; a failure and a missing binary do not', async () => {
    const bin = createFakeBin(join(createTempRoot('next-probe-'), 'fake'), SCRIPT);
    const commands: NativeCommand[] = [
      ['present', '--version'],
      ['broken', '--version'],
      ['absent', '--version'],
    ];
    const [ported, shipped] = await withProcessEnv(bin.env, () =>
      Promise.all([
        Promise.all(commands.map(probeInstallTarget)),
        Promise.all(commands.map(shippedProbeInstallTarget)),
      ]),
    );
    expect(ported).toEqual(shipped);
    expect(ported).toEqual([true, false, false]);
  });

  test('a CLI that never answers is unavailable once the five-second probe expires', async () => {
    const bin = createFakeBin(join(createTempRoot('next-probe-'), 'fake'), SCRIPT);
    const stalled: NativeCommand = ['stalled', '--version'];
    const started = Date.now();
    const results = await withProcessEnv(bin.env, () =>
      Promise.all([probeInstallTarget(stalled), shippedProbeInstallTarget(stalled)]),
    );
    const elapsed = Date.now() - started;
    expect(results).toEqual([false, false]);
    expect(elapsed).toBeGreaterThanOrEqual(4900);
    expect(elapsed).toBeLessThan(8000);
  }, 20_000);
});

describe('the install picker rows', () => {
  test('mark availability the same way for every action', async () => {
    for (const options of OPTIONS) {
      const rows = await buildInstallTargetChoicesAsync(scriptedProbe, options);
      expect(rows).toEqual(await shippedBuildInstallTargetChoicesAsync(scriptedProbe, options));
      expect(rows).toMatchSnapshot();
    }
  });

  test('read a configured host as installed, and an unprobed one as missing', async () => {
    const rows = [];
    for (const options of OPTIONS) {
      rows.push(groupedReasons(await buildInstallTargetChoicesAsync(scriptedProbe, options)));
    }
    expect(rows).toEqual([
      { configured: ['true'], rest: ['false CLI not installed'] },
      { configured: ['false already installed'], rest: ['false CLI not installed'] },
      { configured: ['true'], rest: ['false not installed'] },
    ]);
  });

  test('re-decide an existing row from the state it already carries', async () => {
    const base = await buildInstallTargetChoicesAsync(scriptedProbe);
    for (const options of OPTIONS) {
      const redecided = applyInstallTargetState(base, options);
      expect(redecided).toEqual(shippedApplyInstallTargetState(base, options));
      expect(redecided).toMatchSnapshot();
      expect(applyInstallTargetState(base, options)).toEqual(
        await buildInstallTargetChoicesAsync(scriptedProbe, options),
      );
    }
  });
});
