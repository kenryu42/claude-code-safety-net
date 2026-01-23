import { type AnalyzeOptions, type Config } from '@/types';
export declare const REASON_INTERPRETER_DANGEROUS = "Detected potentially dangerous command in interpreter code.";
export declare const REASON_INTERPRETER_BLOCKED = "Interpreter one-liners are blocked in paranoid mode.";
export type InternalOptions = AnalyzeOptions & {
    config: Config;
    effectiveCwd: string | null | undefined;
    analyzeNested: (command: string) => string | null;
};
export declare function analyzeSegment(tokens: string[], depth: number, options: InternalOptions): string | null;
export declare function segmentChangesCwd(segment: readonly string[]): boolean;
