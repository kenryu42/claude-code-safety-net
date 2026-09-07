import { describe, expect, test } from 'bun:test';
import { printInstallBanner as portedPrintInstallBanner } from '@/cli/install/banner';
import { createFakeInput, createFakeOutput } from '../../helpers/fake-tty';

/**
 * The banner owns the terminal for the length of one animation: it takes raw mode only when the
 * keyboard is a TTY, gives it back exactly as it found it, and turns Ctrl-C into the caller's
 * interrupt rather than a stray signal. The keypress is delivered from inside the first sleep, so
 * the interrupt always lands on the same frame.
 */

type KeyPress = { name: string; value?: string; ctrl?: boolean };

async function runBanner(options: { inputTTY: boolean; outputTTY: boolean; keypress?: KeyPress }) {
  const input = createFakeInput({ isTTY: options.inputTTY });
  const output = createFakeOutput({ isTTY: options.outputTTY });
  const interrupts: string[] = [];
  let sleeps = 0;

  await portedPrintInstallBanner({
    input: input as unknown as NodeJS.ReadStream,
    onInterrupt: () => interrupts.push('interrupt'),
    output,
    seed: 7,
    sleep: async () => {
      sleeps += 1;
      const keypress = options.keypress;
      if (sleeps === 1 && keypress) input.press(keypress.name, keypress.value, keypress.ctrl);
    },
  });

  return {
    chunks: output.chunks,
    interrupts,
    rawModeCalls: input.rawModeCalls,
    streamCalls: input.streamCalls,
  };
}

const BEGIN_SYNC = '\x1b[?2026h';
const END_SYNC = '\x1b[?2026l';
/** The cursor hidden, two lines opened for the banner, and the cursor parked above them. */
const OPENING = '\x1b[?25l\n\n\x1b[2A\x1b7';
/** Back to the saved position, down past the banner, and the cursor handed back. */
const CLOSING = ['\x1b8', '\x1b[2B', '\n\x1b[0m\x1b[?25h'];

/** Every frame is one write, wrapped so a half-painted banner never reaches the terminal. */
const framesOf = (chunks: readonly string[]) => {
  const frames = chunks.slice(1, -3);
  for (const frame of frames) {
    expect(frame, frame).toStartWith(BEGIN_SYNC);
    expect(frame, frame).toEndWith(END_SYNC);
  }
  return frames;
};

const ENTER: KeyPress = { name: 'return', value: '\r' };
const CTRL_C: KeyPress = { name: 'c', value: '\x03', ctrl: true };

describe('cli/install/banner', () => {
  test('a non-TTY keyboard runs the animation to the end on both implementations', async () => {
    const ported = await runBanner({ inputTTY: false, outputTTY: true });
    // No raw mode to take and no stream to resume: a keyboard that is not a TTY is left alone.
    expect(ported.rawModeCalls).toEqual([]);
    expect(ported.streamCalls).toEqual([]);
    expect(ported.chunks[0]).toBe(OPENING);
    expect(ported.chunks.slice(-3)).toEqual(CLOSING);
    expect(framesOf(ported.chunks)).toHaveLength(55);
  });

  test('Enter cuts the animation short and restores the keyboard on both implementations', async () => {
    const ported = await runBanner({ inputTTY: true, keypress: ENTER, outputTTY: true });
    expect(ported.rawModeCalls).toEqual([true, false]);
    expect(ported.streamCalls).toEqual(['resume', 'pause']);
    expect(ported.interrupts).toEqual([]);
    // The frame the key landed on and the finished banner, instead of the whole animation.
    expect(framesOf(ported.chunks)).toHaveLength(2);
    expect(ported.chunks[0]).toBe(OPENING);
    expect(ported.chunks.slice(-3)).toEqual(CLOSING);
  });

  test('Ctrl-C reaches the caller once on both implementations', async () => {
    const ported = await runBanner({ inputTTY: true, keypress: CTRL_C, outputTTY: true });
    // Ctrl-C ends the animation like any key, and reaches the caller once — never as a signal.
    expect(ported.interrupts).toEqual(['interrupt']);
    expect(ported.rawModeCalls).toEqual([true, false]);
    expect(ported.streamCalls).toEqual(['resume', 'pause']);
    expect(framesOf(ported.chunks)).toHaveLength(2);
    expect(ported.chunks.slice(-3)).toEqual(CLOSING);
  });

  test('a non-TTY sink prints nothing on either implementation', async () => {
    const ported = await runBanner({ inputTTY: true, outputTTY: false });
    expect(ported).toEqual({
      chunks: [],
      interrupts: [],
      rawModeCalls: [],
      streamCalls: [],
    });
  });
});
