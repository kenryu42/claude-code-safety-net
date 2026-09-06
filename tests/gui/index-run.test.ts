import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runGuiCommand as portedRun } from '@/gui/index';
import {
  createTempRoot,
  isolationEnv,
  removeTempRoots,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * What `cc-safety-net gui` itself reports: the URL it prints, what it does when the platform
 * opener fails, what an unknown flag costs, and that a signal ends a run that was told to stay up.
 * The run takes the process signal handlers and reads the process environment, so it runs alone
 * under a temp home of its own.
 */

// The port the listener was given and the token it minted differ per run, so the line is pinned
// with both folded away.
const URL_LINE = /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/;

type Options = Parameters<typeof portedRun>[1];

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const bothSides = async (run: (start: typeof portedRun) => Promise<unknown>) => {
  const home = join(createTempRoot('gui-run-ported-'), 'home');
  return withProcessEnv(isolationEnv(home), () => run(portedRun));
};

/** One run with both channels captured and every URL folded to the same string. */
const capturedRun = (start: typeof portedRun, args: readonly string[], options: Options = {}) => {
  const log: string[] = [];
  const error: string[] = [];
  const fold = (message: string) => message.replace(URL_LINE, '<url>');
  return {
    log,
    error,
    exitCode: start(args, {
      keepAlive: false,
      log: (message) => log.push(fold(message)),
      error: (message) => error.push(fold(message)),
      ...options,
    }),
  };
};

const settled = async (run: ReturnType<typeof capturedRun>) => ({
  exitCode: await run.exitCode,
  log: run.log,
  error: run.error,
});

describe('the gui command', () => {
  afterEach(removeTempRoots);

  test('prints the URL it is serving and opens nothing when told not to', async () => {
    const result = await bothSides((start) => settled(capturedRun(start, ['--no-open'])));

    expect(result).toStrictEqual({
      exitCode: 0,
      log: ['CC Safety Net policy GUI: <url>'],
      error: [],
    });
  });

  test('hands the URL it printed to the browser opener', async () => {
    const result = await bothSides(async (start) => {
      const opened: string[] = [];
      const run = capturedRun(start, [], {
        openBrowser: (url) => {
          opened.push(url.replace(URL_LINE, '<url>'));
        },
      });
      return { ...(await settled(run)), opened };
    });

    expect(result).toStrictEqual({
      exitCode: 0,
      log: ['CC Safety Net policy GUI: <url>'],
      error: [],
      opened: ['<url>'],
    });
  });

  test('keeps the URL visible when the platform opener fails', async () => {
    const result = await bothSides((start) =>
      settled(
        capturedRun(start, [], {
          openBrowser: () => {
            throw new Error('no opener');
          },
        }),
      ),
    );

    // The failure is not fatal: the server is up, so the URL is repeated for a manual open.
    expect(result).toStrictEqual({
      exitCode: 0,
      log: ['CC Safety Net policy GUI: <url>'],
      error: ['Failed to open browser: no opener', 'Open this URL manually: <url>'],
    });
  });

  test('refuses an unknown flag before starting a listener', async () => {
    const result = await bothSides((start) => settled(capturedRun(start, ['--bad'])));

    expect(result).toStrictEqual({
      exitCode: 1,
      log: [],
      error: ['Unknown option for gui: --bad', 'Usage: cc-safety-net gui [--no-open]'],
    });
  });

  test('stays up until a signal ends it', async () => {
    const result = await bothSides(async (start) => {
      const run = capturedRun(start, ['--no-open'], { keepAlive: undefined });
      // The run only registers its signal handler once the listener is up, which is the same
      // moment the URL reaches the log.
      while (run.log.length === 0) await pause(5);
      const beforeSignal = await Promise.race([
        run.exitCode.then(() => 'exited'),
        pause(50).then(() => 'serving'),
      ]);
      process.emit('SIGINT', 'SIGINT');
      return { ...(await settled(run)), beforeSignal };
    });

    expect(result).toStrictEqual({
      exitCode: 0,
      log: ['CC Safety Net policy GUI: <url>'],
      error: [],
      // Without the signal the command is still serving, which is what `gui` does at a terminal.
      beforeSignal: 'serving',
    });
  });
});
