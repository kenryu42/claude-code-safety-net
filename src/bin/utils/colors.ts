/**
 * Shared ANSI color utilities with TTY detection.
 * Automatically disables colors when not writing to a TTY or when NO_COLOR is set.
 */

/**
 * Determines if color output should be used.
 * Evaluated lazily to allow tests to control via environment variables.
 * @internal Exported for testing
 */
export function shouldUseColor(): boolean {
  return Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
}

/**
 * Basic color functions.
 */
const green = (s: string) => (shouldUseColor() ? `\x1b[32m${s}\x1b[0m` : s);
const yellow = (s: string) => (shouldUseColor() ? `\x1b[33m${s}\x1b[0m` : s);
const blue = (s: string) => (shouldUseColor() ? `\x1b[34m${s}\x1b[0m` : s);
const magenta = (s: string) => (shouldUseColor() ? `\x1b[35m${s}\x1b[0m` : s);
const cyan = (s: string) => (shouldUseColor() ? `\x1b[36m${s}\x1b[0m` : s);
const red = (s: string) => (shouldUseColor() ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s: string) => (shouldUseColor() ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (s: string) => (shouldUseColor() ? `\x1b[1m${s}\x1b[0m` : s);

/**
 * Color object for convenient grouped access.
 */
export const colors = {
  green,
  yellow,
  blue,
  magenta,
  cyan,
  red,
  dim,
  bold,
};

/**
 * ANSI reset escape sequence.
 */
const ANSI_RESET = '\x1b[0m';

/**
 * A curated list of distinct, vibrant 256-color ANSI codes.
 * Selected to be readable on dark backgrounds and visually distinct.
 */
const DISTINCT_COLORS = [
  39, // DeepSkyBlue1
  82, // Chartreuse2
  198, // DeepPink1
  226, // Yellow1
  208, // DarkOrange
  51, // Cyan1
  196, // Red1
  46, // Green1
  201, // Magenta1
  214, // Orange1
  93, // Purple
  154, // GreenYellow
  220, // Gold1
  27, // Blue3
  49, // MediumSpringGreen
  190, // YellowGreen
  200, // HotPink
  33, // DodgerBlue1
  129, // Purple1
  227, // LightGoldenrod1
  45, // Turquoise2
  160, // Red3
  63, // RoyalBlue1
  118, // Chartreuse1
  123, // DarkSlateGray1
  202, // OrangeRed1
];

/**
 * Simple Linear Congruential Generator (LCG) for deterministic pseudo-random numbers.
 */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Shuffle an array creation deterministically based on a seed.
 */
function getShuffledPalette(seed: number): number[] {
  // If seed is 0 (default), return original order to preserve stability if needed,
  // or we can just treat 0 as a valid seed. Let's treat it as valid.
  const palette = [...DISTINCT_COLORS];
  const random = createRandom(seed);

  // Fisher-Yates shuffle
  for (let i = palette.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = palette[i] as number;
    palette[i] = palette[j] as number;
    palette[j] = temp;
  }
  return palette;
}

/**
 * Generate a distinct color for a given index using a curated palette.
 * @param index - The index of the token (0-based)
 * @param seed - Seed for randomization (defaults to 0 for consistent order)
 * @returns ANSI escape sequence for the color
 * @internal Exported for testing
 */
export function generateDistinctColor(index: number, seed = 0): string {
  if (!shouldUseColor()) return '';

  const palette = getShuffledPalette(seed);
  const colorCode = palette[index % palette.length];
  return `\x1b[38;5;${colorCode}m`;
}

/**
 * Apply a distinct color to a string based on its index.
 * Wraps the token in quotes and applies a unique color.
 */
export function colorizeToken(token: string, index: number, seed = 0): string {
  if (!shouldUseColor()) return `"${token}"`;
  const colorCode = generateDistinctColor(index, seed);
  return `${colorCode}"${token}"${ANSI_RESET}`;
}
