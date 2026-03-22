export interface XargsAnalyzeContext {
    cwd: string | undefined;
    originalCwd: string | undefined;
    paranoidRm: boolean | undefined;
    allowTmpdirVar: boolean;
    reasons?: Record<string, string>;
}
export declare function analyzeXargs(tokens: readonly string[], context: XargsAnalyzeContext): string | null;
interface XargsParseResult {
    childTokens: string[];
    replacementToken: string | null;
}
export declare function extractXargsChildCommandWithInfo(tokens: readonly string[]): XargsParseResult;
export declare function extractXargsChildCommand(tokens: readonly string[]): string[];
export {};
