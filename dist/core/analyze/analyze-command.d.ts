import { type AnalyzeOptions, type AnalyzeResult, type Config } from '@/types';
export declare const REASON_RECURSION_LIMIT = "Command exceeds maximum recursion depth and cannot be safely analyzed.";
export type InternalOptions = AnalyzeOptions & {
    config: Config;
};
export declare function analyzeCommandInternal(command: string, depth: number, options: InternalOptions): AnalyzeResult | null;
export interface ShellGitContextEnvState {
    effectiveEnvAssignments?: ReadonlyMap<string, string>;
    shellAssignments: Map<string, string>;
    exportedNames: Set<string>;
    allexport: boolean;
    keywordExport: boolean;
}
export declare function createShellGitContextEnvState(effectiveEnvAssignments?: ReadonlyMap<string, string>): ShellGitContextEnvState;
export declare function applyShellGitContextEnvSegment(tokens: readonly string[], state: ShellGitContextEnvState): void;
export declare function getSegmentGitContextEnvAssignments(tokens: readonly string[], state: ShellGitContextEnvState): ReadonlyMap<string, string> | undefined;
