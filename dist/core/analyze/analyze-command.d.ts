import { type AnalyzeOptions, type AnalyzeResult, type Config } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    config: Config;
};
export declare function analyzeCommandInternal(command: string, depth: number, options: InternalOptions): AnalyzeResult | null;
