import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getAuditLogHomeDir } from '@/audit/writer';
import { checkForUpdates, isNewerVersion } from '@/cli/doctor/updates';
import type { Environment } from '@/core/environment';
import { getPackageVersion } from '@/hosts/system-info';

type UpdateCache = {
  lastCheck?: number;
  latestVersion?: string;
  notifiedVersion?: string;
  notifiedAt?: number;
};

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RENOTIFY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export async function getUpdateNotice(
  environment: Environment,
  now = Date.now(),
): Promise<string | null> {
  if (environment.env.get('CC_SAFETY_NET_NO_UPDATE_CHECK')) return null;

  const home = getAuditLogHomeDir(environment);
  if (!home) return null;

  const cachePath = join(home, '.cc-safety-net', 'update-check.json');
  const cache = await readUpdateCache(cachePath, now);

  if (!cache.lastCheck || now - cache.lastCheck > CHECK_INTERVAL_MS) {
    const update = await checkForUpdates();
    cache.lastCheck = now;
    if (update.latestVersion) cache.latestVersion = update.latestVersion;
    if (!(await writeUpdateCache(cachePath, cache))) return null;
    if (update.error) return null;
  }

  const latest = cache.latestVersion;
  const current = getPackageVersion();
  if (!latest || !isNewerVersion(latest, current)) return null;
  if (
    cache.notifiedVersion === latest &&
    cache.notifiedAt !== undefined &&
    now - cache.notifiedAt < RENOTIFY_INTERVAL_MS
  ) {
    return null;
  }

  cache.notifiedVersion = latest;
  cache.notifiedAt = now;
  if (!(await writeUpdateCache(cachePath, cache))) return null;

  return `UPDATE_AVAILABLE: cc-safety-net v${latest} is available (running v${current}). Ask the user once whether to run \`npx -y cc-safety-net@latest update\`; continue the current task either way and do not raise this again.`;
}

// Any unreadable or malformed cache counts as empty so the check self-heals on
// the next successful write instead of going silent forever. That includes
// non-finite or future timestamps (JSON's 1e999 parses to Infinity), which
// would otherwise suppress the poll or the notice indefinitely.
async function readUpdateCache(path: string, now: number): Promise<UpdateCache> {
  const value = await readFile(path, 'utf8')
    .then((json) => JSON.parse(json) as unknown)
    .catch(() => undefined);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const record = value as Record<string, unknown>;
  const timestamp = (candidate: unknown) =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate <= now
      ? candidate
      : undefined;
  return {
    lastCheck: timestamp(record.lastCheck),
    latestVersion: typeof record.latestVersion === 'string' ? record.latestVersion : undefined,
    notifiedVersion:
      typeof record.notifiedVersion === 'string' ? record.notifiedVersion : undefined,
    notifiedAt: timestamp(record.notifiedAt),
  };
}

async function writeUpdateCache(path: string, cache: UpdateCache): Promise<boolean> {
  return mkdir(dirname(path), { recursive: true, mode: 0o700 })
    .then(() => writeFile(path, JSON.stringify(cache), { mode: 0o600 }))
    .then(() => true)
    .catch(() => false);
}
