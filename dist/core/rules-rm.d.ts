export interface AnalyzeRmOptions {
    cwd?: string;
    originalCwd?: string;
    paranoid?: boolean;
    allowTmpdirVar?: boolean;
    tmpdirOverridden?: boolean;
}
export declare function analyzeRm(tokens: string[], options?: AnalyzeRmOptions): string | null;
/** @internal Exported for testing */
export declare function isHomeDirectory(cwd: string): boolean;
