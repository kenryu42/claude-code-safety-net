declare const TRUSTED_GIT_BINARIES: readonly ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git", "C:\\Program Files\\Git\\cmd\\git.exe", "C:\\Program Files\\Git\\bin\\git.exe"];
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
declare function effectiveGitConfigEnablesRecursiveSubmodules(cwd: string, gitBinary?: string | null): boolean;
/** @internal Exported for testing */
export { effectiveGitConfigEnablesRecursiveSubmodules as _effectiveGitConfigEnablesRecursiveSubmodules, extractGitSubcommandAndRest as _extractGitSubcommandAndRest, getCheckoutPositionalArgs as _getCheckoutPositionalArgs, TRUSTED_GIT_BINARIES as _TRUSTED_GIT_BINARIES, };
