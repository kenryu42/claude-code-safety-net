import { afterEach, expect, test } from 'bun:test';
import { detect as detectGeminiCli } from '@/hosts/gemini-cli/detect';
import type { TreeSpec } from '../../helpers/fixture-tree';
import { detectionRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Gemini records an installed extension as a directory and a switched-off one as a `!`-prefixed
 * override beside it, so the two facts are read from two places and neither implies the other:
 * an extension directory with no enablement file at all is on.
 */

const EXTENSIONS = '.gemini/extensions';
const EXTENSION_DIR = `${EXTENSIONS}/gemini-safety-net`;
const ENABLEMENT = `${EXTENSIONS}/extension-enablement.json`;
const overrides = (...entries: readonly string[]) =>
  JSON.stringify({ 'gemini-safety-net': { overrides: entries } });

const detection = detectionRunner({
  ported: (environment) => detectGeminiCli({ environment, cwd: environment.home }),
});

const installed = (enablement?: string): TreeSpec => ({
  [EXTENSION_DIR]: null,
  ...(enablement === undefined ? {} : { [ENABLEMENT]: enablement }),
});

afterEach(removeTempRoots);

test.each([
  ['nothing is installed', {} as TreeSpec],
  ['only the enablement file exists', { [ENABLEMENT]: overrides('user') } as TreeSpec],
])('reports Gemini absent when %s', async (_case, seed) => {
  expect(await detection(seed)).toEqual({
    kind: 'returned',
    value: { platform: 'gemini-cli', status: 'n/a' },
  });
});

test.each([
  ['no enablement file was written', installed()],
  ['the override enables the extension for a scope', installed(overrides('user'))],
  ['the override list is empty', installed(overrides())],
  ['the enablement file names another extension', installed('{"other":{"overrides":["!user"]}}')],
])('reports the extension configured when %s', async (_case, seed) => {
  expect(await detection(seed)).toEqual({
    kind: 'returned',
    value: {
      platform: 'gemini-cli',
      status: 'configured',
      method: 'extension config',
      configPath: `<home>/${EXTENSION_DIR}`,
    },
  });
});

test('reports a `!`-prefixed override as disabled, naming the enablement file', async () => {
  expect(await detection(installed(overrides('!user')))).toEqual({
    kind: 'returned',
    value: {
      platform: 'gemini-cli',
      status: 'disabled',
      method: 'extension config',
      configPath: `<home>/${ENABLEMENT}`,
      errors: ['gemini-safety-net is disabled in Gemini CLI'],
    },
  });
});

test.each([
  ['a directory sits where the enablement file belongs', null],
  ['the enablement file is not JSON', '{ "gemini-safety-net"'],
])('refuses to guess when %s', async (_case, entry) => {
  expect(await detection({ [EXTENSION_DIR]: null, [ENABLEMENT]: entry })).toEqual({
    kind: 'returned',
    value: { platform: 'gemini-cli', status: 'not-inspected' },
  });
});
