import { describe, expect, test } from 'bun:test';
import {
  createLolcatAnimationFrames as portedCreateFrames,
  renderLolcat as portedRender,
  writeAnimatedLolcat as portedWriteAnimated,
} from '@next/cli/utils/lolcat';
import {
  createLolcatAnimationFrames as shippedCreateFrames,
  renderLolcat as shippedRender,
  writeAnimatedLolcat as shippedWriteAnimated,
} from '@/cli/utils/lolcat';
import { createFakeOutput } from '../../helpers/fake-tty';

/**
 * The renderer is a pure function of (text, seed, frequency, spread) and the animation is a pure
 * function of that plus the frame index, so every byte either implementation writes is comparable
 * without a clock: the sleep is a no-op and the seed is fixed.
 */

const TEXT = 'ab\ncd';
const RENDER_OPTIONS = { seed: 5, frequency: 0.2, spread: 2 };

function captureAnimation(
  writeAnimated: typeof shippedWriteAnimated,
  isTTY: boolean,
  signal?: AbortSignal,
) {
  const output = createFakeOutput({ isTTY });
  return writeAnimated(TEXT, {
    duration: 2,
    output,
    seed: 5,
    signal,
    sleep: async () => {},
  }).then(() => output.chunks);
}

describe('cli/utils/lolcat', () => {
  test('renderLolcat paints the same bytes on both implementations', () => {
    const rendered = portedRender(TEXT, RENDER_OPTIONS);
    expect(rendered).toBe(shippedRender(TEXT, RENDER_OPTIONS));
    expect(rendered).toMatchSnapshot();
    expect(rendered.split('\n')).toHaveLength(2);
    expect(rendered.endsWith('\x1b[0m')).toBe(true);
    const empty = portedRender('', RENDER_OPTIONS);
    expect(empty).toBe(shippedRender('', RENDER_OPTIONS));
    expect(empty).toMatchSnapshot();
  });

  test('createLolcatAnimationFrames walks the seed the same way on both implementations', () => {
    const options = { duration: 3, seed: 5, speed: 2 };
    const frames = portedCreateFrames(TEXT, options);
    expect(frames).toEqual(shippedCreateFrames(TEXT, options));
    expect(frames).toMatchSnapshot();
    expect(frames).toHaveLength(3);
    expect(new Set(frames).size).toBe(3);
  });

  test('writeAnimatedLolcat writes the same frames to a TTY on both implementations', async () => {
    const ported = await captureAnimation(portedWriteAnimated, true);
    expect(ported).toEqual(await captureAnimation(shippedWriteAnimated, true));
    expect(ported).toMatchSnapshot();
    expect(ported[0]?.startsWith('\x1b[?25l')).toBe(true);
    expect(ported.at(-1)).toBe('\n\x1b[0m\x1b[?25h');
  });

  test('an aborted signal stops both implementations before the first frame', async () => {
    const ported = await captureAnimation(portedWriteAnimated, true, AbortSignal.abort());
    expect(ported).toEqual(await captureAnimation(shippedWriteAnimated, true, AbortSignal.abort()));
    expect(ported).toMatchSnapshot();
    expect(ported.length).toBeLessThan((await captureAnimation(portedWriteAnimated, true)).length);
    expect(ported.at(-1)).toBe('\n\x1b[0m\x1b[?25h');
  });

  test('a non-TTY sink receives the same bytes as a TTY on both implementations', async () => {
    const ported = await captureAnimation(portedWriteAnimated, false);
    expect(ported).toEqual(await captureAnimation(shippedWriteAnimated, false));
    expect(ported).toMatchSnapshot();
    // The animation itself never consults `isTTY`; the install banner is what gates on it.
    expect(ported).toEqual(await captureAnimation(portedWriteAnimated, true));
  });
});
