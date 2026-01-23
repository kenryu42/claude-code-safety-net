import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { colorizeToken, colors, generateDistinctColor, shouldUseColor } from '@/bin/utils/colors';

/**
 * Test the colors module.
 * Tests are grouped by whether colors are enabled (simulated TTY) or disabled.
 */
describe('colors', () => {
  describe('shouldUseColor', () => {
    let originalIsTTY: boolean | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      originalNoColor = process.env.NO_COLOR;
    });

    afterEach(() => {
      // Restore original values
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    });

    test('returns true when TTY and NO_COLOR not set', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
      expect(shouldUseColor()).toBe(true);
    });

    test('returns false when not a TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
      expect(shouldUseColor()).toBe(false);
    });

    test('returns false when NO_COLOR is set', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      process.env.NO_COLOR = '1';
      expect(shouldUseColor()).toBe(false);
    });

    test('returns false when isTTY is undefined', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
      expect(shouldUseColor()).toBe(false);
    });
  });

  describe('generateDistinctColor (with colors enabled)', () => {
    let originalIsTTY: boolean | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      originalNoColor = process.env.NO_COLOR;
      // Enable colors for these tests
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    });

    test('returns ANSI escape sequence for index 0', () => {
      const color = generateDistinctColor(0);
      // Check it starts with ANSI 256-color escape and ends with 'm'
      expect(color.startsWith('\x1b[38;5;')).toBe(true);
      expect(color.endsWith('m')).toBe(true);
    });

    test('returns different colors for different indices', () => {
      const color0 = generateDistinctColor(0);
      const color1 = generateDistinctColor(1);
      const color2 = generateDistinctColor(2);
      expect(color0).not.toBe(color1);
      expect(color1).not.toBe(color2);
      expect(color0).not.toBe(color2);
    });

    test('produces consistent colors for same index and default seed', () => {
      const color1 = generateDistinctColor(5);
      const color2 = generateDistinctColor(5);
      expect(color1).toBe(color2);
    });

    test('produces consistent colors for same index and specific seed', () => {
      const seed = 0.5;
      const color1 = generateDistinctColor(5, seed);
      const color2 = generateDistinctColor(5, seed);
      expect(color1).toBe(color2);
    });

    test('produces different colors for same index with different seeds', () => {
      // With our shuffle logic, different seeds should produce different permutations
      // It's possible for index 0 to map to the same color by chance, but unlikely for all indices
      // Check a few indices to be sure
      const seed1 = 0.1;
      const seed2 = 0.9;

      let different = false;
      for (let i = 0; i < 5; i++) {
        if (generateDistinctColor(i, seed1) !== generateDistinctColor(i, seed2)) {
          different = true;
          break;
        }
      }
      expect(different).toBe(true);
    });

    test('handles large indices', () => {
      const color = generateDistinctColor(1000);
      expect(color.startsWith('\x1b[38;5;')).toBe(true);
      expect(color.endsWith('m')).toBe(true);
    });
  });

  describe('generateDistinctColor (with colors disabled)', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    test('returns empty string when colors disabled', () => {
      const color = generateDistinctColor(0);
      expect(color).toBe('');
    });
  });

  describe('colorizeToken (with colors enabled)', () => {
    let originalIsTTY: boolean | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      originalNoColor = process.env.NO_COLOR;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    });

    test('wraps token in color codes and quotes', () => {
      const result = colorizeToken('test', 0);
      // Check format: ANSI color + quoted token + reset
      expect(result.startsWith('\x1b[38;5;')).toBe(true);
      expect(result).toContain('"test"');
      expect(result.endsWith('\x1b[0m')).toBe(true);
    });

    test('uses different colors for different indices', () => {
      const result0 = colorizeToken('a', 0);
      const result1 = colorizeToken('a', 1);
      // Should have different color codes
      expect(result0).not.toBe(result1);
    });

    test('handles special characters in token', () => {
      const result = colorizeToken('hello world', 0);
      expect(result).toContain('hello world');
    });

    test('handles empty token', () => {
      const result = colorizeToken('', 0);
      expect(result).toContain('""');
    });
  });

  describe('colorizeToken (with colors disabled)', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    test('returns quoted token without color codes', () => {
      const result = colorizeToken('test', 0);
      expect(result).toBe('"test"');
    });

    test('returns same result for any index when disabled', () => {
      const result0 = colorizeToken('test', 0);
      const result1 = colorizeToken('test', 1);
      expect(result0).toBe('"test"');
      expect(result1).toBe('"test"');
    });
  });

  describe('colors object (with colors enabled)', () => {
    let originalIsTTY: boolean | undefined;
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      originalNoColor = process.env.NO_COLOR;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      delete process.env.NO_COLOR;
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
      if (originalNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = originalNoColor;
      }
    });

    test('green applies green color code', () => {
      const result = colors.green('text');
      expect(result).toBe('\x1b[32mtext\x1b[0m');
    });

    test('yellow applies yellow color code', () => {
      const result = colors.yellow('text');
      expect(result).toBe('\x1b[33mtext\x1b[0m');
    });

    test('blue applies blue color code', () => {
      const result = colors.blue('text');
      expect(result).toBe('\x1b[34mtext\x1b[0m');
    });

    test('magenta applies magenta color code', () => {
      const result = colors.magenta('text');
      expect(result).toBe('\x1b[35mtext\x1b[0m');
    });

    test('cyan applies cyan color code', () => {
      const result = colors.cyan('text');
      expect(result).toBe('\x1b[36mtext\x1b[0m');
    });

    test('red applies red color code', () => {
      const result = colors.red('text');
      expect(result).toBe('\x1b[31mtext\x1b[0m');
    });

    test('dim applies dim code', () => {
      const result = colors.dim('text');
      expect(result).toBe('\x1b[2mtext\x1b[0m');
    });

    test('bold applies bold code', () => {
      const result = colors.bold('text');
      expect(result).toBe('\x1b[1mtext\x1b[0m');
    });
  });

  describe('colors object (with colors disabled)', () => {
    let originalIsTTY: boolean | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    test('green returns plain text', () => {
      expect(colors.green('text')).toBe('text');
    });

    test('yellow returns plain text', () => {
      expect(colors.yellow('text')).toBe('text');
    });

    test('blue returns plain text', () => {
      expect(colors.blue('text')).toBe('text');
    });

    test('magenta returns plain text', () => {
      expect(colors.magenta('text')).toBe('text');
    });

    test('cyan returns plain text', () => {
      expect(colors.cyan('text')).toBe('text');
    });

    test('red returns plain text', () => {
      expect(colors.red('text')).toBe('text');
    });

    test('dim returns plain text', () => {
      expect(colors.dim('text')).toBe('text');
    });

    test('bold returns plain text', () => {
      expect(colors.bold('text')).toBe('text');
    });
  });
});
