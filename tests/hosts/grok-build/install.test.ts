import { afterEach, describe, expect, test } from 'bun:test';
import { detect as detectGrok } from '@/hosts/grok-build/detect';
import { installGrokBuild, uninstallGrokBuild } from '@/hosts/grok-build/install';
import { describeOutcome } from '../../helpers/fixture-tree';
import { differential, expectRow, fileAt, hostRunner } from '../../helpers/host-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * Grok Build reads a file cc-safety-net names but the user may extend, and skips the file whole
 * when it does not parse. So install repairs unusable content, both directions touch only entries
 * carrying the managed command, and the file disappears only when nothing but ours was left.
 */

const HOOKS = '.grok/hooks/cc-safety-net.json';
const HOOKS_PATH = `<home>/${HOOKS}`;
const MANAGED = 'npx -y cc-safety-net hook --grok-build';
const CANONICAL_ENTRY = { hooks: [{ type: 'command', command: MANAGED, timeout: 30 }] };
const FOREIGN_ENTRY = { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] };
const DRIFTED_ENTRY = { hooks: [{ type: 'command', command: MANAGED, timeout: 5 }] };

const grokConfig = (preToolUse: readonly unknown[], rest: Record<string, unknown> = {}) =>
  `${JSON.stringify({ hooks: { PreToolUse: preToolUse }, ...rest }, null, 2)}\n`;

const CONFIGURED = {
  platform: 'grok-build',
  status: 'configured',
  method: 'hook config',
  configPath: HOOKS_PATH,
} as const;

const { row, detection } = hostRunner({
  ported: (environment) => ({
    install: () => installGrokBuild(environment),
    detect: () => detectGrok({ environment, cwd: environment.home }),
    uninstall: () => uninstallGrokBuild(environment),
  }),
});

afterEach(removeTempRoots);

describe('the Grok Build hook config differential', () => {
  test('writes the canonical entry when the host has no hook file', async () => {
    expectRow((await row({})).steps, {
      file: HOOKS,
      alreadyInstalled: false,
      wrote: grokConfig([CANONICAL_ENTRY]),
      detected: CONFIGURED,
      left: undefined,
    });
  });

  test('repairs content the host would skip anyway', async () => {
    expectRow((await row({ [HOOKS]: 'not json' })).steps, {
      file: HOOKS,
      alreadyInstalled: false,
      wrote: grokConfig([CANONICAL_ENTRY]),
      detected: CONFIGURED,
      left: undefined,
    });
  });

  test('appends beside a foreign entry and keeps the rest of the document', async () => {
    const seed = grokConfig([FOREIGN_ENTRY, DRIFTED_ENTRY], { note: 1 });

    expectRow((await row({ [HOOKS]: seed })).steps, {
      file: HOOKS,
      alreadyInstalled: false,
      wrote: grokConfig([FOREIGN_ENTRY, CANONICAL_ENTRY], { note: 1 }),
      detected: CONFIGURED,
      left: grokConfig([FOREIGN_ENTRY], { note: 1 }),
    });
  });

  test('reports a canonical file without touching it, then deletes what was only ours', async () => {
    const seed = grokConfig([CANONICAL_ENTRY]);
    const { steps, tree } = await row({ [HOOKS]: seed });

    expect(steps?.uninstall.result).toEqual({
      ok: true,
      value: { path: HOOKS_PATH, alreadyInstalled: true },
    });
    expect(fileAt(tree, HOOKS)).toBeUndefined();
    expectRow(steps, {
      file: HOOKS,
      alreadyInstalled: true,
      wrote: seed,
      detected: CONFIGURED,
      left: undefined,
    });
  });

  test('follows GROK_HOME out of the home directory', async () => {
    const relocated = 'grok-home/hooks/cc-safety-net.json';
    const { steps } = await row({}, { GROK_HOME: '<home>/grok-home' });

    expect(fileAt(steps?.install.tree, HOOKS)).toBeUndefined();
    expectRow(steps, {
      file: relocated,
      alreadyInstalled: false,
      wrote: grokConfig([CANONICAL_ENTRY]),
      detected: { ...CONFIGURED, configPath: `<home>/${relocated}` },
      left: undefined,
    });
  });

  test('leaves content it cannot parse in place instead of deleting it', async () => {
    const seed = 'not json';
    const removal = await differential({
      seed: { [HOOKS]: seed },
      ported: (environment) => describeOutcome(() => uninstallGrokBuild(environment)),
    });

    expect(removal.outcome).toEqual({
      kind: 'returned',
      value: { ok: true, value: { path: HOOKS_PATH, alreadyInstalled: false } },
    });
    expect(fileAt(removal.tree, HOOKS)).toBe(seed);
  });
});

describe('the Grok Build detector differential', () => {
  test('finds the managed entry', async () => {
    expect(await detection({ [HOOKS]: grokConfig([CANONICAL_ENTRY]) })).toEqual({
      kind: 'returned',
      value: CONFIGURED,
    });
  });

  test.each([
    [
      { matcher: 'Bash', hooks: CANONICAL_ENTRY.hooks },
      'Managed hook has a "matcher" that narrows coverage; reinstall to repair',
    ],
    [
      { hooks: [{ type: 'inline', command: MANAGED, timeout: 30 }] },
      'Managed hook "type" is not "command"; reinstall to repair',
    ],
    [DRIFTED_ENTRY, 'Managed hook "timeout" is not 30; reinstall to repair'],
  ])('names the drift a reinstall would repair: %o', async (entry, error) => {
    expect(await detection({ [HOOKS]: grokConfig([entry]) })).toEqual({
      kind: 'returned',
      value: { ...CONFIGURED, errors: [error] },
    });
  });

  test('says nothing is installed for a foreign or absent file', async () => {
    const absent = {
      kind: 'returned',
      value: { platform: 'grok-build', status: 'n/a', configPath: HOOKS_PATH },
    } as const;

    expect(await detection({ [HOOKS]: grokConfig([FOREIGN_ENTRY]) })).toEqual(absent);
    expect(await detection({})).toEqual(absent);
  });

  test('reports a file it cannot parse instead of guessing', async () => {
    expect(await detection({ [HOOKS]: 'not json' })).toMatchObject({
      kind: 'returned',
      value: {
        platform: 'grok-build',
        status: 'n/a',
        configPath: HOOKS_PATH,
        errors: [
          expect.stringContaining(`Failed to parse Grok Build hooks config ${HOOKS_PATH}: `),
        ],
      },
    });
  });
});
