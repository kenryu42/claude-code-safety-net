export interface AnalyzeRmOptions {
    cwd?: string;
    originalCwd?: string;
    paranoid?: boolean;
    allowTmpdirVar?: boolean;
    tmpdirOverridden?: boolean;
    reasons?: Record<string, string>;
}
export declare function analyzeRm(tokens: string[], options?: AnalyzeRmOptions): string | null;
export declare function isHomeDirectory(cwd: string): boolean;
