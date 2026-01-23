import { type AnalyzeOptions, type AnalyzeResult, type Config } from '@/types';
export declare const REASON_RECURSION_LIMIT = "Command exceeds maximum recursion depth and cannot be safely analyzed.";
export type InternalOptions = AnalyzeOptions & {
    config: Config;
};
export declare function analyzeCommandInternal(command: string, depth: number, options: InternalOptions): AnalyzeResult | null;
