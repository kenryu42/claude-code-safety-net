export declare function analyzeGit(tokens: readonly string[], reasons?: Record<string, string>): string | null;
declare function extractGitSubcommandAndRest(tokens: readonly string[]): {
    subcommand: string | null;
    rest: string[];
};
declare function getCheckoutPositionalArgs(tokens: readonly string[]): string[];
/** @internal Exported for testing */
export { extractGitSubcommandAndRest as _extractGitSubcommandAndRest, getCheckoutPositionalArgs as _getCheckoutPositionalArgs, };
