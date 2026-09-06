import { describe, expect, test } from 'bun:test';
import { printInstallBanner as portedPrintInstallBanner } from '@next/cli/install/banner';
import { printInstallBanner as shippedPrintInstallBanner } from '@/cli/install/banner';
import { createFakeInput, createFakeOutput } from '../../helpers/fake-tty';

/**
 * The banner owns the terminal for the length of one animation: it takes raw mode only when the
 * keyboard is a TTY, gives it back exactly as it found it, and turns Ctrl-C into the caller's
 * interrupt rather than a stray signal. The keypress is delivered from inside the first sleep, so
 * both implementations are interrupted at the same frame.
 */

type KeyPress = { name: string; value?: string; ctrl?: boolean };

async function runBanner(
  printInstallBanner: typeof shippedPrintInstallBanner,
  options: { inputTTY: boolean; outputTTY: boolean; keypress?: KeyPress },
) {
  const input = createFakeInput({ isTTY: options.inputTTY });
  const output = createFakeOutput({ isTTY: options.outputTTY });
  const interrupts: string[] = [];
  let sleeps = 0;

  await printInstallBanner({
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

const ENTER: KeyPress = { name: 'return', value: '\r' };
const CTRL_C: KeyPress = { name: 'c', value: '\x03', ctrl: true };

describe('cli/install/banner', () => {
  test('a non-TTY keyboard runs the animation to the end on both implementations', async () => {
    const ported = await runBanner(portedPrintInstallBanner, { inputTTY: false, outputTTY: true });
    expect(ported).toEqual(
      await runBanner(shippedPrintInstallBanner, { inputTTY: false, outputTTY: true }),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.rawModeCalls).toEqual([]);
    expect(ported.streamCalls).toEqual([]);
    expect(ported.chunks[0]?.startsWith('\x1b[?25l')).toBe(true);
    expect(ported.chunks.at(-1)).toBe('\n\x1b[0m\x1b[?25h');
  });

  test('Enter cuts the animation short and restores the keyboard on both implementations', async () => {
    const ported = await runBanner(portedPrintInstallBanner, {
      inputTTY: true,
      keypress: ENTER,
      outputTTY: true,
    });
    expect(ported).toEqual(
      await runBanner(shippedPrintInstallBanner, {
        inputTTY: true,
        keypress: ENTER,
        outputTTY: true,
      }),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.rawModeCalls).toEqual([true, false]);
    expect(ported.streamCalls).toEqual(['resume', 'pause']);
    expect(ported.interrupts).toEqual([]);
    const full = await runBanner(portedPrintInstallBanner, { inputTTY: false, outputTTY: true });
    expect(ported.chunks.length).toBeLessThan(full.chunks.length);
  });

  test('Ctrl-C reaches the caller once on both implementations', async () => {
    const ported = await runBanner(portedPrintInstallBanner, {
      inputTTY: true,
      keypress: CTRL_C,
      outputTTY: true,
    });
    expect(ported).toEqual(
      await runBanner(shippedPrintInstallBanner, {
        inputTTY: true,
        keypress: CTRL_C,
        outputTTY: true,
      }),
    );
    expect(ported).toMatchSnapshot();
    expect(ported.interrupts).toEqual(['interrupt']);
    expect(ported.rawModeCalls).toEqual([true, false]);
  });

  test('a non-TTY sink prints nothing on either implementation', async () => {
    const ported = await runBanner(portedPrintInstallBanner, { inputTTY: true, outputTTY: false });
    expect(ported).toEqual(
      await runBanner(shippedPrintInstallBanner, { inputTTY: true, outputTTY: false }),
    );
    expect(ported).toEqual({
      chunks: [],
      interrupts: [],
      rawModeCalls: [],
      streamCalls: [],
    });
  });
});
