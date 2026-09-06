import { describe, expect, test } from 'bun:test';
import {
  colorizeToken as portedColorizeToken,
  colors as portedColors,
  generateDistinctColor as portedGenerateDistinctColor,
  shouldUseColor as portedShouldUseColor,
} from '@/cli/utils/colors';
import { withStdoutTTY } from '../../helpers/fake-tty';
import { withProcessEnv } from '../../helpers/temp-home';

/**
 * `shouldUseColor()` is read per call, so the whole surface is sampled under one fixed
 * terminal: the escapes are contract (a doctor line that loses its color code is a visible change),
 * and the seeded palette is what keeps two runs of `explain` coloring the same token the same way.
 */

const NAMES = ['red', 'green', 'dim', 'bold', 'yellow'] as const;

const portedSample = () => ({
  named: NAMES.map((name) => portedColors[name]('x')),
  distinct: Array.from({ length: 8 }, (_value, index) => portedGenerateDistinctColor(index, 3)),
  token: portedColorizeToken('tok', 2, 3),
});

const PLAIN = {
  named: ['x', 'x', 'x', 'x', 'x'],
  distinct: ['', '', '', '', '', '', '', ''],
  token: '"tok"',
};

describe('cli/utils/colors', () => {
  test('a TTY without NO_COLOR colors both implementations identically', () => {
    withStdoutTTY(true, () =>
      withProcessEnv({ NO_COLOR: undefined }, () => {
        expect(portedShouldUseColor()).toBe(true);
        expect(portedSample()).toEqual({
          named: [
            '\x1b[31mx\x1b[0m',
            '\x1b[32mx\x1b[0m',
            '\x1b[2mx\x1b[0m',
            '\x1b[1mx\x1b[0m',
            '\x1b[33mx\x1b[0m',
          ],
          distinct: [
            '\x1b[38;5;202m',
            '\x1b[38;5;63m',
            '\x1b[38;5;51m',
            '\x1b[38;5;208m',
            '\x1b[38;5;200m',
            '\x1b[38;5;49m',
            '\x1b[38;5;123m',
            '\x1b[38;5;190m',
          ],
          token: '\x1b[38;5;51m"tok"\x1b[0m',
        });
      }),
    );
  });

  for (const terminal of [
    { label: 'NO_COLOR wins over the TTY', isTTY: true, noColor: '1' },
    { label: 'a pipe stays plain', isTTY: false, noColor: undefined },
  ]) {
    test(`${terminal.label} on both implementations`, () => {
      withStdoutTTY(terminal.isTTY, () =>
        withProcessEnv({ NO_COLOR: terminal.noColor }, () => {
          expect(portedShouldUseColor()).toBe(false);
          expect(portedSample()).toEqual(PLAIN);
        }),
      );
    });
  }
});
