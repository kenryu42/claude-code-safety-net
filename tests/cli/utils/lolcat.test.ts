import { describe, expect, test } from 'bun:test';
import {
  createLolcatAnimationFrames as portedCreateFrames,
  renderLolcat as portedRender,
  writeAnimatedLolcat as portedWriteAnimated,
} from '@/cli/utils/lolcat';
import { createFakeOutput } from '../../helpers/fake-tty';

/**
 * The renderer is a pure function of (text, seed, frequency, spread) and the animation is a pure
 * function of that plus the frame index, so every byte it writes is comparable without a clock:
 * the sleep is a no-op and the seed is fixed.
 */

const TEXT = 'ab\ncd';
const RENDER_OPTIONS = { seed: 5, frequency: 0.2, spread: 2 };
const BEGIN_SYNC = '\x1b[?2026h';
const END_SYNC = '\x1b[?2026l';

// The escape is built rather than written into the pattern: a literal control character in a
// regular expression is what `noControlCharactersInRegex` refuses.
const ANSI_STYLE = new RegExp(`${'\x1b'}\\[[\\d;]*m`, 'g');

/** What a frame says once its colours are taken off: the text it painted. */
const plain = (frame: string) => frame.replace(ANSI_STYLE, '');

function captureAnimation(isTTY: boolean, signal?: AbortSignal) {
  const output = createFakeOutput({ isTTY });
  return portedWriteAnimated(TEXT, {
    duration: 2,
    output,
    seed: 5,
    signal,
    sleep: async () => {},
  }).then(() => output.chunks);
}

describe('cli/utils/lolcat', () => {
  test('renderLolcat paints one colour per character and resets at the end', () => {
    // Four characters, four colours off the seeded gradient, and a reset closing the whole run.
    expect(portedRender(TEXT, RENDER_OPTIONS)).toBe(
      '\x1b[38;2;233;137;54ma\x1b[38;2;229;141;42mb\x1b[22m\x1b[39m\n' +
        '\x1b[38;2;224;144;29mc\x1b[38;2;219;148;13md\x1b[22m\x1b[39m\x1b[0m',
    );
    // Nothing to paint is painted as nothing, not as a bare reset.
    expect(portedRender('', RENDER_OPTIONS)).toBe('');
  });

  test('createLolcatAnimationFrames walks the seed the same way on both implementations', () => {
    const options = { duration: 3, seed: 5, speed: 2 };
    const frames = portedCreateFrames(TEXT, options);
    expect(frames).toHaveLength(3);
    // Each frame paints the same text in its own colours, so the seed moves and nothing else.
    expect(new Set(frames).size).toBe(3);
    expect(new Set(frames.map(plain))).toEqual(new Set([TEXT]));
    // The seed advances by the default spread of 3 per frame, starting one spread past the seed.
    expect(frames).toEqual(
      [1, 2, 3].map((step) => portedRender(TEXT, { seed: 5 + step * 3, spread: 3 })),
    );
  });

  test('writeAnimatedLolcat writes the same frames to a TTY on both implementations', async () => {
    const ported = await captureAnimation(true);
    // The cursor is hidden and the sink parked above the text, one frame is written per tick
    // inside a synchronized-update pair so a half-painted frame never reaches the terminal, and
    // the cursor is put back at the end.
    expect(ported[0]).toBe('\x1b[?25l\n\x1b[1A\x1b7');
    expect(ported.slice(-3)).toEqual(['\x1b8', '\x1b[1B', '\n\x1b[0m\x1b[?25h']);
    expect(ported).toHaveLength(11);
    for (const frame of ported.slice(1, -3)) {
      expect(frame, frame).toStartWith(BEGIN_SYNC);
      expect(frame, frame).toEndWith(END_SYNC);
    }
  });

  test('an aborted signal stops both implementations before the first frame', async () => {
    const ported = await captureAnimation(true, AbortSignal.abort());
    // Only the last frame is written — the finished text — and the cursor is still restored.
    expect(ported).toHaveLength(5);
    expect(plain(ported[1] ?? '')).toBe(`${BEGIN_SYNC}\x1b8ab\x1b8\x1b[1Bcd${END_SYNC}`);
    expect(ported.at(-1)).toBe('\n\x1b[0m\x1b[?25h');
  });

  test('a non-TTY sink receives the same bytes as a TTY on both implementations', async () => {
    const ported = await captureAnimation(false);
    // The animation itself never consults `isTTY`; the install banner is what gates on it.
    expect(ported).toEqual(await captureAnimation(true));
  });
});
