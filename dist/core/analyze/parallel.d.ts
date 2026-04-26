export interface ParallelAnalyzeContext {
    cwd: string | undefined;
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    allowTmpdirVar: boolean;
    envAssignments?: ReadonlyMap<string, string>;
    worktreeMode?: boolean;
    analyzeNested: (command: string) => string | null;
}
export declare function analyzeParallel(tokens: readonly string[], context: ParallelAnalyzeContext): string | null;
export declare function extractParallelChildCommand(tokens: readonly string[]): string[];
