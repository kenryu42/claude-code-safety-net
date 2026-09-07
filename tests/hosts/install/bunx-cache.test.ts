import { afterEach, describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { clearBunxSafetyNetCache } from '@/hosts/install/bunx-cache';
import { writeTree } from '../../helpers/fixture-tree';
import { createTempRoot, removeTempRoots, snapshotHome } from '../../helpers/temp-home';

/**
 * bunx keeps one directory per package under the OS temp dir, named `bunx-<uid>-<pkg>@<version>`.
 * Only this user's `cc-safety-net` entries may go: another uid's entry is not ours to delete on a
 * shared /tmp, `cc-safety-net-extra` is a different package, and the entry the running process
 * was launched from has to survive.
 */

const uid = process.getuid?.() ?? 0;
const OURS_LATEST = `bunx-${uid}-cc-safety-net@latest`;
const OURS_PINNED = `bunx-${uid}-cc-safety-net@1.0.0`;
const LOOKALIKE = `bunx-${uid}-cc-safety-net-extra@1`;
const OTHER_USER = `bunx-${uid + 1}-cc-safety-net@1`;

const FIXTURE = {
  [`${OURS_LATEST}/package.json`]: '{}',
  [`${OURS_PINNED}/package.json`]: '{}',
  [`${LOOKALIKE}/package.json`]: '{}',
  [`${OTHER_USER}/package.json`]: '{}',
  other: null,
};

afterEach(removeTempRoots);

function sweep(
  fixture: boolean,
  platform: NodeJS.Platform | undefined,
  runningEntry: string | undefined,
) {
  const root = createTempRoot('next-bunx-cache-');
  return [clearBunxSafetyNetCache].map((clear, index) => {
    const tempDir = join(root, `temp-${index}`);
    if (fixture) writeTree(tempDir, FIXTURE);
    clear(tempDir, platform, runningEntry);
    return {
      tree: fixture ? snapshotHome(tempDir) : [],
      entries: fixture ? readdirSync(tempDir).sort() : [],
    };
  });
}

describe('clearing the bunx cache', () => {
  test('removes only the entries this uid installed for this package', () => {
    const [ported] = sweep(true, 'linux', undefined);
    expect(ported?.entries).toEqual([LOOKALIKE, OTHER_USER, 'other']);
  });

  test('keeps the entry the running process was launched from', () => {
    const [ported] = sweep(true, 'linux', OURS_LATEST);
    expect(ported?.entries).toEqual([OURS_LATEST, LOOKALIKE, OTHER_USER, 'other'].sort());
  });

  test('takes every numeric id on Windows, where the temp dir is per user', () => {
    const [ported] = sweep(true, 'win32', undefined);
    expect(ported?.entries).toEqual([LOOKALIKE, 'other']);
  });

  test('does nothing when the temp dir does not exist', () => {
    const [ported] = sweep(false, undefined, undefined);
    expect(ported?.entries).toEqual([]);
  });
});
