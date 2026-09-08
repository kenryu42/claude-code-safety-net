import { afterEach, expect, test } from 'bun:test';
import { detect as detectCodex } from '@/hosts/codex/detect';
import { detectionRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Codex keeps no state file we may read, so the caller hands the detector the `codex plugin list`
 * output and the whole decision is how that text is read. The rows below are the four shapes the
 * host prints; "not installed" containing the word "installed" is the one that has to be told
 * apart from a real install by more than a substring.
 */

const LISTING = 'codex plugin list';
const SOURCE = 'https://github.com/kenryu42/cc-safety-net.git';
const row = (state: string) => `cc-safety-net  ${SOURCE}  ${state}\n`;

const detection = (codexPluginListOutput: string | null) =>
  detectionRunner({
    ported: (environment) =>
      detectCodex({ environment, cwd: environment.home, codexPluginListOutput }),
  })({});

afterEach(removeTempRoots);

test.each([
  ['the caller could not run the host command', null],
  ['the listing is empty', ''],
  [
    'every row belongs to another plugin',
    'other  https://github.com/kenryu42/other.git  installed, enabled\n',
  ],
  ['our row is registered but never installed', row('not installed')],
])('reports Codex absent when %s', async (_case, output) => {
  expect(await detection(output)).toEqual({
    kind: 'returned',
    value: { platform: 'codex', status: 'n/a' },
  });
});

test('reports an installed row the user switched off, and says what it must say', async () => {
  expect(await detection(row('installed, disabled'))).toEqual({
    kind: 'returned',
    value: {
      platform: 'codex',
      status: 'disabled',
      method: LISTING,
      configPath: LISTING,
      errors: [`Codex plugin line for ${SOURCE} must contain installed, enabled.`],
    },
  });
});

test('reports an installed and enabled row as configured', async () => {
  expect(await detection(row('installed, enabled'))).toEqual({
    kind: 'returned',
    value: { platform: 'codex', status: 'configured', method: LISTING, configPath: LISTING },
  });
});
