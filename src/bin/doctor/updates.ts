/**
 * Update checking for the doctor command.
 */

import { getPackageVersion } from '@/bin/doctor/system-info';
import type { UpdateInfo } from '@/bin/doctor/types';

function isNewerVersion(latest: string, current: string): boolean {
  if (current === 'dev') return false;

  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  const [latestMajor = 0, latestMinor = 0, latestPatch = 0] = latestParts;
  const [currentMajor = 0, currentMinor = 0, currentPatch = 0] = currentParts;

  if (latestMajor !== currentMajor) return latestMajor > currentMajor;
  if (latestMinor !== currentMinor) return latestMinor > currentMinor;
  return latestPatch > currentPatch;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  const currentVersion = getPackageVersion();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const res = await fetch('https://registry.npmjs.org/cc-safety-net/latest', {
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        error: `npm registry returned ${res.status}`,
      };
    }

    const data = (await res.json()) as { version: string };
    const updateAvailable = isNewerVersion(data.version, currentVersion);

    return {
      currentVersion,
      latestVersion: data.version,
      updateAvailable,
    };
  } catch (e) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      error: e instanceof Error ? e.message : 'Network error',
    };
  } finally {
    clearTimeout(timeout);
  }
}
