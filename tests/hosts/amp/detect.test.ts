import { afterEach, describe, expect, test } from 'bun:test';
import { detect } from '@/hosts/amp/detect';
import type { HookDetection } from '@/hosts/detect/context';
import { differential } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Amp is the one host doctor cannot read off disk: the managed plugin lives in the account's
 * hosted repository, so `amp plugins list` output is the whole input. Only the personal-scope line
 * for our exact plugin name counts — a system-scope path line or a lookalike name is not our
 * plugin, and reporting one as configured would tell the user a hook is live when none is.
 */

const LISTING = 'amp plugins list';

const listed = (status: string): HookDetection => ({
  platform: 'amp',
  status: 'disabled',
  method: LISTING,
  configPath: LISTING,
  errors: [
    `Amp personal plugin cc-safety-net is ${status}; run "plugins: reload" in Amp or reinstall with install --amp`,
  ],
});

const OUTPUTS: readonly (readonly [string, string | null, HookDetection])[] = [
  ['no listing was taken at all', null, { platform: 'amp', status: 'n/a' }],
  ['an empty listing', '', { platform: 'amp', status: 'n/a' }],
  [
    'the personal plugin loaded',
    '✓ cc-safety-net (User Plugins) active\n',
    { platform: 'amp', status: 'configured', method: LISTING, configPath: LISTING },
  ],
  [
    'the legacy root file failing to load',
    '✗ cc-safety-net.ts (User Plugins) error',
    listed('error'),
  ],
  [
    'a colored terminal listing',
    '[32m✓[39m cc-safety-net (User Plugins) [2mactive[22m\n',
    { platform: 'amp', status: 'configured', method: LISTING, configPath: LISTING },
  ],
  [
    'only the system-scope path line',
    '✓ /home/someone/.config/amp/plugins/cc-safety-net.ts active\n',
    { platform: 'amp', status: 'n/a' },
  ],
  [
    'a personal plugin whose name only starts like ours',
    '✓ cc-safety-net-extra (User Plugins) active\n',
    { platform: 'amp', status: 'n/a' },
  ],
];

afterEach(removeTempRoots);

describe('reading the Amp plugin listing', () => {
  test.each(OUTPUTS)('reports %s', async (_case, ampPluginListOutput, expected) => {
    expect(
      (
        await differential({
          seed: {},
          ported: (environment) =>
            detect({ environment, cwd: environment.home, ampPluginListOutput }),
        })
      ).outcome,
    ).toEqual({ kind: 'returned', value: expected });
  });
});
