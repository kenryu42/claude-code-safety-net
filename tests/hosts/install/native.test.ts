import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import * as nextNative from '@/hosts/install/native';
import { createFakeBin, type FakeScriptEntry } from '../../helpers/fake-bin';
import {
  createTempRoot,
  describeAsyncOutcome,
  removeTempRoots,
  withProcessEnv,
} from '../../helpers/temp-home';

/**
 * Every host CLI an installer runs goes through this one spawn. What a caller sees of it is the
 * merged output on success and, on failure, a single message naming the command, the exit status
 * and both streams — the text the install report prints, so it is contract.
 */

const SCRIPT: readonly FakeScriptEntry[] = [
  { command: 'tool', args: ['go'], stdout: 'out\n', stderr: 'err\n' },
  { command: 'tool', args: ['fail'], stdout: 'out', stderr: 'err', exit: 2 },
  { command: 'tool', args: ['slow'], delayMs: 2000 },
  { command: 'tool', args: ['gone'], stderr: 'nothing to remove', exit: 3 },
  { command: 'other', args: ['ok'], stdout: 'second\n' },
];

type NativeModule = {
  runNativeCommand: typeof nextNative.runNativeCommand;
  runNativeCommands: typeof nextNative.runNativeCommands;
  runNativeCleanupCommands: typeof nextNative.runNativeCleanupCommands;
};

/** Run one call with its own fake bin and call log. */
async function forBoth<T>(run: (native: NativeModule) => Promise<T>) {
  const root = createTempRoot('next-native-');
  const runOne = async (name: string, native: NativeModule) => {
    const bin = createFakeBin(join(root, name), SCRIPT);
    const value = await withProcessEnv(bin.env, () => run(native));
    return { value, calls: bin.readLog().map((line) => line.split('\t')[0]) };
  };
  return runOne('ported', nextNative);
}

afterEach(removeTempRoots);

describe('running a host CLI', () => {
  test('merges both streams, or narrows the success value to stdout on request', async () => {
    const ported = await forBoth(async (native) => ({
      merged: await native.runNativeCommand(['tool', 'go']),
      stdoutOnly: await native.runNativeCommand(['tool', 'go'], { stdoutOnly: true }),
    }));
    expect(ported).toMatchSnapshot();
    expect(ported.value).toEqual({ merged: 'out\n\nerr\n', stdoutOnly: 'out\n' });
  });

  test('reports the exit status and everything the command printed', async () => {
    const ported = await forBoth((native) =>
      describeAsyncOutcome(() => native.runNativeCommand(['tool', 'fail'])),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.value).toEqual({
      kind: 'threw',
      message: 'Failed to run tool fail (exit 2).\nout\nerr',
    });
  });

  test('reports a command that is not on PATH as a spawn failure', async () => {
    const ported = await forBoth((native) =>
      describeAsyncOutcome(() => native.runNativeCommand(['nope', '--x'])),
    );
    // The runtime words the spawn failure ("ENOENT" under node, "not found in $PATH" under bun);
    // what the runner owes is that wording plus the command that could not run.
    expect(ported.value.kind === 'threw' && ported.value.message).toStartWith(
      'Failed to run nope --x.\n',
    );
  });

  test('gives up on a stalled command after the timeout it was given', async () => {
    const ported = await forBoth((native) =>
      describeAsyncOutcome(() => native.runNativeCommand(['tool', 'slow'], { timeoutMs: 200 })),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.value).toEqual({
      kind: 'threw',
      message: 'Failed to run tool slow.\nTimed out after 200ms.',
    });
  });

  test('runs a list of commands one after the other', async () => {
    const ported = await forBoth((native) =>
      native.runNativeCommands([
        ['tool', 'go'],
        ['other', 'ok'],
      ]),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.calls).toEqual(['tool go', 'other ok']);
  });

  test('warns about a failed cleanup command and keeps going', async () => {
    const ported = await forBoth(async (native) => {
      const warnings: string[] = [];
      const warn = spyOn(console, 'warn').mockImplementation((message: unknown) => {
        warnings.push(String(message));
      });
      await native.runNativeCleanupCommands([
        ['tool', 'gone'],
        ['tool', 'go'],
      ]);
      warn.mockRestore();
      return warnings;
    });
    expect(ported).toMatchSnapshot();
    expect(ported.value).toEqual(['Failed to run tool gone (exit 3).\nnothing to remove']);
    expect(ported.calls).toEqual(['tool gone', 'tool go']);
  });
});
