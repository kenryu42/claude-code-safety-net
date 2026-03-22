import { type AnalyzeOptions, type Config } from '@/types';
export type InternalOptions = AnalyzeOptions & {
    config: Config;
    effectiveCwd: string | null | undefined;
    analyzeNested: (command: string) => string | null;
};
export declare function analyzeSegment(tokens: string[], depth: number, options: InternalOptions): string | null;
export declare function segmentChangesCwd(segment: readonly string[]): boolean;
