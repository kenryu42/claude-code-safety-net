import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { installIntegrationMetadata } from '@/hosts/catalog';
import {
  defaultVersionFetcher,
  getPackageVersion,
  getSpawnCommand,
  getSystemInfo,
} from '@/hosts/system-info';
import { createFakeBin, type FakeScriptEntry } from '../helpers/fake-bin';
import { writeTree } from '../helpers/fixture-tree';
import {
  createTempRoot,
  recordPorted,
  removeTempRoots,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * The version probes doctor and the install picker run. Two things are contract here: a
 * `.cmd` shim has to be handed to COMSPEC rather than spawned directly (npm-distributed CLIs
 * exist as nothing else on Windows), and a probe that fails, stalls or prints nothing reports the
 * version as unavailable instead of guessing one.
 */

const ANSI_VERSION = `\u001b[32mv2.0.0\u001b[0m\n`;

const SCRIPT: readonly FakeScriptEntry[] = [
  { command: 'ver', args: ['--version'], stdout: 'v1.2.3\n' },
  { command: 'painted', args: ['--version'], stdout: ANSI_VERSION },
  { command: 'noisy', args: ['--version'], stderr: 'v3.0.0\n' },
  { command: 'broken', args: ['--version'], stdout: 'v9.9.9\n', exit: 1 },
  { command: 'stalled', args: ['--version'], delayMs: 2000 },
];

const FETCHED_OUTPUTS = ['Claude Code 1.2.3', 'v2.0.0-beta.1', 'no digits\nsecond', null];

afterEach(removeTempRoots);

describe('the Windows-safe argv', () => {
  test('hands a shim to COMSPEC and spawns everything else directly', () => {
    // The fixture names carry PATHEXT's own spelling: on a case-sensitive filesystem
    // `tool.cmd` would not answer a lookup for `tool.CMD`.
    const dir = createTempRoot('next-spawn-');
    writeTree(dir, { 'tool.CMD': '', 'other.EXE': '' });
    const windows = {
      _CC_SAFETY_NET_TEST_SPAWN_PLATFORM: 'win32',
      PATH: dir,
      PATHEXT: '.EXE;.CMD',
    };
    const cases: readonly { args: string[]; env: NodeJS.ProcessEnv }[] = [
      { args: ['tool', 'a b', 'c'], env: {} },
      { args: [], env: {} },
      { args: ['tool', 'a b', 'c'], env: windows },
      { args: ['tool'], env: { ...windows, COMSPEC: 'D:\\Windows\\System32\\cmd.exe' } },
      { args: ['other', 'x'], env: windows },
      { args: [join(dir, 'tool'), 'x'], env: windows },
      { args: ['tool.CMD', 'x'], env: windows },
      { args: ['ghost', 'x'], env: windows },
    ];
    const resolved = (spawnCommand: typeof getSpawnCommand) =>
      cases.map((testCase) => spawnCommand(testCase.args, testCase.env));

    expect(resolved(getSpawnCommand)).toEqual([
      { cmd: 'tool', args: ['a b', 'c'] },
      { cmd: '', args: [] },
      { cmd: 'cmd.exe', args: ['/d', '/c', `call ${join(dir, 'tool.CMD')} "a b" c`] },
      {
        cmd: 'D:\\Windows\\System32\\cmd.exe',
        args: ['/d', '/c', `call ${join(dir, 'tool.CMD')}`],
      },
      { cmd: join(dir, 'other.EXE'), args: ['x'] },
      { cmd: 'cmd.exe', args: ['/d', '/c', `call ${join(dir, 'tool.CMD')} x`] },
      { cmd: 'cmd.exe', args: ['/d', '/c', `call ${join(dir, 'tool.CMD')} x`] },
      { cmd: 'ghost', args: ['x'] },
    ]);
  });
});

describe('the default version probe', () => {
  test('reads a clean exit only, and strips whatever painted it', async () => {
    const bin = createFakeBin(join(createTempRoot('next-version-'), 'fake'), SCRIPT);
    const probe = async (fetcher: typeof defaultVersionFetcher) => [
      await fetcher(['ver', '--version']),
      await fetcher(['painted', '--version']),
      await fetcher(['noisy', '--version']),
      await fetcher(['broken', '--version']),
      await fetcher([]),
      await fetcher(['stalled', '--version'], 200),
    ];
    const ported = await withProcessEnv(bin.env, () => probe(defaultVersionFetcher));
    expect(ported).toEqual(['v1.2.3', 'v2.0.0', 'v3.0.0', null, null, null]);
  });
});

describe('the system report', () => {
  test('probes every host once and parses whatever each one printed', async () => {
    const record = async (report: typeof getSystemInfo) => {
      const calls: { args: string[]; timeoutMs: number | undefined }[] = [];
      const info = await report(async (args, timeoutMs) => {
        calls.push({ args, timeoutMs });
        return FETCHED_OUTPUTS[calls.length % FETCHED_OUTPUTS.length] ?? null;
      });
      return { calls, info };
    };
    const ported = await record(getSystemInfo);
    // The report names the machine it ran on.
    recordPorted(ported, [[`${process.platform} ${process.arch}`, '<platform>']]);

    expect(Object.keys(ported.info.versions)).toEqual(
      installIntegrationMetadata.map((integration) => integration.id),
    );
    // Only the two plugin listings get the long timeout; a cold one fetches over the network.
    expect(ported.calls.filter((call) => call.timeoutMs !== undefined)).toEqual([
      { args: ['codex', 'plugin', 'list'], timeoutMs: 30_000 },
      { args: ['amp', 'plugins', 'list'], timeoutMs: 30_000 },
    ]);
    expect(new Set(Object.values(ported.info.versions))).toEqual(
      new Set(['1.2.3', '2.0.0-beta.1', 'no digits', null]),
    );
    expect(ported.info.version).toBe('dev');
    expect(ported.info.platform).toBe(`${process.platform} ${process.arch}`);
  });

  test('reports the build-time package version', () => {
    expect(getPackageVersion()).toBe('dev');
  });
});
