export interface GitAnalyzeOptions {
    cwd?: string;
    envAssignments?: ReadonlyMap<string, string>;
    worktreeMode?: boolean;
}
export interface GitWorktreeRelaxation {
    originalReason: string;
    gitCwd: string;
}
export declare function analyzeGit(tokens: readonly string[], options?: GitAnalyzeOptions): string | null;
export declare function getGitWorktreeRelaxation(tokens: readonly string[], options?: GitAnalyzeOptions): GitWorktreeRelaxation | null;
declare function extractGitSubcommandAndRest(tokens: readonly string[]): {
    subcommand: string | null;
    rest: string[];
};
declare function getCheckoutPositionalArgs(tokens: readonly string[]): string[];
/** @internal Exported for testing */
export { extractGitSubcommandAndRest as _extractGitSubcommandAndRest, getCheckoutPositionalArgs as _getCheckoutPositionalArgs, };
