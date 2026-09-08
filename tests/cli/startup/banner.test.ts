import { describe, expect, test } from 'bun:test';
import {
  awaitWithSpinner as portedAwaitWithSpinner,
  resolveAfterOptionalBanner as portedResolveAfterOptionalBanner,
} from '@/cli/startup/banner';
import { rainbowColorEscape } from '@/cli/utils/lolcat';
import { createFakeOutput } from '../../helpers/fake-tty';
import { describeAsyncOutcome } from '../../helpers/temp-home';

/**
 * The spinner's schedule is the whole behavior: nothing is drawn while the work beats the delay,
 * and once drawn the line is always cleared and the cursor restored, success or failure. A queue
 * of pending sleeps stands in for the clock, so each frame is released by the test rather than
 * by a timer.
 */

const CLEAR_LINE = '\r\x1b[2K';
const HIDE_CURSOR = '\x1b[?25l';
const RESET_FOREGROUND = '\x1b[39m';
const SHOW_CURSOR = '\x1b[?25h';
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const LOADING_MESSAGE = 'Working…';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function spinnerFrame(index: number) {
  return `${CLEAR_LINE}${rainbowColorEscape(index * 0.55)}${SPINNER_FRAMES[index]}${RESET_FOREGROUND} ${LOADING_MESSAGE}`;
}

async function driveSpinner(options: { frames: number; isTTY?: boolean; fail?: boolean }) {
  const output = createFakeOutput({ isTTY: options.isTTY !== false });
  const pending: (() => void)[] = [];
  let settle: (value: string) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const ready = new Promise<string>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  const outcome = describeAsyncOutcome(() =>
    portedAwaitWithSpinner(ready, {
      loadingMessage: LOADING_MESSAGE,
      output,
      sleep: () => new Promise<void>((resolve) => pending.push(resolve)),
    }),
  );

  await flush();
  for (let release = 0; release < options.frames; release += 1) {
    pending.shift()?.();
    await flush();
  }
  if (options.fail) fail(new Error('startup failed'));
  else settle('ready-value');

  return { chunks: output.chunks, outcome: await outcome };
}

async function driveBanner(showBanner: boolean) {
  const calls: string[] = [];
  const value = await portedResolveAfterOptionalBanner(
    showBanner,
    () => {
      calls.push('start');
      return {
        ready: Promise.resolve('ready'),
        finish: async () => {
          calls.push('finish');
          return 'done';
        },
      };
    },
    async () => {
      calls.push('banner');
    },
    { output: createFakeOutput({ isTTY: false }) },
  );
  return { calls, value };
}

describe('cli/startup/banner', () => {
  test('work that beats the delay draws nothing on either implementation', async () => {
    const ported = await driveSpinner({ frames: 0 });
    expect(ported).toEqual({
      chunks: [],
      outcome: { kind: 'returned', value: 'ready-value' },
    });
  });

  test('three ticks draw the same three frames on both implementations', async () => {
    const ported = await driveSpinner({ frames: 3 });
    expect(ported).toEqual({
      chunks: [
        HIDE_CURSOR,
        spinnerFrame(0),
        spinnerFrame(1),
        spinnerFrame(2),
        `${CLEAR_LINE}${SHOW_CURSOR}`,
      ],
      outcome: { kind: 'returned', value: 'ready-value' },
    });
  });

  test('a rejection propagates and still restores the cursor on both implementations', async () => {
    const ported = await driveSpinner({ frames: 2, fail: true });
    // The two frames drawn before the rejection stay drawn, and the clear-and-restore still runs.
    expect(ported).toEqual({
      chunks: [HIDE_CURSOR, spinnerFrame(0), spinnerFrame(1), `${CLEAR_LINE}${SHOW_CURSOR}`],
      outcome: { kind: 'threw', message: 'startup failed' },
    });
  });

  test('a non-TTY sink passes the value through on both implementations', async () => {
    const ported = await driveSpinner({ frames: 0, isTTY: false });
    expect(ported).toEqual({
      chunks: [],
      outcome: { kind: 'returned', value: 'ready-value' },
    });
  });

  test('the banner runs between starting and finishing the work on both implementations', async () => {
    const withBanner = await driveBanner(true);
    expect(withBanner).toEqual({ calls: ['start', 'banner', 'finish'], value: 'done' });

    const withoutBanner = await driveBanner(false);
    expect(withoutBanner).toEqual({ calls: ['start', 'finish'], value: 'done' });
  });
});
