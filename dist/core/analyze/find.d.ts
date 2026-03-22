export declare function analyzeFind(tokens: readonly string[], reasons?: Record<string, string>): string | null;
/**
 * Check if find command has -delete action (not as argument to another option).
 * Handles cases like "find -name -delete" where -delete is a filename pattern.
 */
export declare function findHasDelete(tokens: readonly string[]): boolean;
