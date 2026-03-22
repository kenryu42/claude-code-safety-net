export interface ParallelAnalyzeContext {
    cwd: string | undefined;
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    allowTmpdirVar: boolean;
    analyzeNested: (command: string) => string | null;
    reasons?: Record<string, string>;
}
export declare function analyzeParallel(tokens: readonly string[], context: ParallelAnalyzeContext): string | null;
export declare function extractParallelChildCommand(tokens: readonly string[]): string[];
