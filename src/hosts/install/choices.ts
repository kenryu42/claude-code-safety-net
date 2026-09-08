/**
 * The rows the install prompt offers: one per integration, probed for a usable
 * CLI and marked available or not for the action being run.
 */

import { spawn } from 'node:child_process';
import { getSpawnCommand } from '@/hosts/system-info';
import type { NativeCommand } from './native';
import { INSTALL_TARGETS, type InstallAction, type InstallTarget } from './targets';

export type InstallTargetChoice = {
  target: InstallTarget;
  flag: string;
  label: string;
  available: boolean;
  unavailableReason?: string;
};

export type InstallTargetProbe = (command: NativeCommand) => boolean | Promise<boolean>;

export type BuildInstallTargetChoicesOptions = {
  action?: InstallAction;
  configuredTargets?: readonly InstallTarget[];
};

// All targets probe in parallel, so a slow CLI (Electron-backed Cursor, or a Node CLI under
// contention) must not be misreported as missing. Absent binaries still fail fast on spawn error.
const PROBE_TIMEOUT_MS = 5000;

export function probeInstallTarget(command: NativeCommand): Promise<boolean> {
  return new Promise((resolve) => {
    const spawnCommand = getSpawnCommand([...command], process.env);
    const proc = spawn(spawnCommand.cmd, spawnCommand.args, {
      env: process.env,
      stdio: 'ignore',
    });
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(available);
    };

    const timeoutId = setTimeout(() => {
      proc.kill();
      finish(false);
    }, PROBE_TIMEOUT_MS);

    proc.on('error', () => finish(false));
    proc.on('close', (code) => finish(code === 0));
  });
}

export function buildInstallTargetChoicesAsync(
  probe: InstallTargetProbe = probeInstallTarget,
  options: BuildInstallTargetChoicesOptions = {},
): Promise<InstallTargetChoice[]> {
  const configuredTargets = new Set(options.configuredTargets ?? []);
  return Promise.all(
    INSTALL_TARGETS.map(async (target) => ({
      target: target.target,
      flag: target.flag,
      label: target.label,
      ...getChoiceAvailability(
        options.action,
        await probe(target.probeCommand),
        configuredTargets.has(target.target),
      ),
    })),
  );
}

export function applyInstallTargetState(
  choices: readonly InstallTargetChoice[],
  options: BuildInstallTargetChoicesOptions,
): InstallTargetChoice[] {
  const configuredTargets = new Set(options.configuredTargets ?? []);
  return choices.map((choice) => ({
    ...choice,
    ...getChoiceAvailability(
      options.action,
      choice.available,
      configuredTargets.has(choice.target),
    ),
  }));
}

function getChoiceAvailability(
  action: InstallAction | undefined,
  cliAvailable: boolean,
  configured: boolean,
): Pick<InstallTargetChoice, 'available' | 'unavailableReason'> {
  // `configured` decides uninstall on its own so a stale config-based integration stays
  // removable: its detection is filesystem-only, and removing it needs no binary.
  if (action === 'uninstall')
    return configured
      ? { available: true }
      : { available: false, unavailableReason: 'not installed' };
  if (action === 'install' && configured)
    return { available: false, unavailableReason: 'already installed' };
  if (!cliAvailable) return { available: false, unavailableReason: 'CLI not installed' };
  return { available: true };
}
