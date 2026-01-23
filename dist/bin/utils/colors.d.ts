/**
 * Shared ANSI color utilities with TTY detection.
 * Automatically disables colors when not writing to a TTY or when NO_COLOR is set.
 */
/**
 * Determines if color output should be used.
 * Evaluated lazily to allow tests to control via environment variables.
 * @internal Exported for testing
 */
export declare function shouldUseColor(): boolean;
/**
 * Color object for convenient grouped access.
 */
export declare const colors: {
    green: (s: string) => string;
    yellow: (s: string) => string;
    blue: (s: string) => string;
    magenta: (s: string) => string;
    cyan: (s: string) => string;
    red: (s: string) => string;
    dim: (s: string) => string;
    bold: (s: string) => string;
};
/**
 * Generate a distinct color for a given index using a curated palette.
 * @param index - The index of the token (0-based)
 * @param seed - Seed for randomization (defaults to 0 for consistent order)
 * @returns ANSI escape sequence for the color
 * @internal Exported for testing
 */
export declare function generateDistinctColor(index: number, seed?: number): string;
/**
 * Apply a distinct color to a string based on its index.
 * Wraps the token in quotes and applies a unique color.
 */
export declare function colorizeToken(token: string, index: number, seed?: number): string;
