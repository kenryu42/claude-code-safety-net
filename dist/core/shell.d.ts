export declare function splitShellCommands(command: string): string[][];
export declare function parseEnvAssignment(token: string): {
    name: string;
    value: string;
} | null;
export interface EnvStrippingResult {
    tokens: string[];
    envAssignments: Map<string, string>;
    cwd?: string | null;
}
export declare function stripEnvAssignmentsWithInfo(tokens: string[]): EnvStrippingResult;
export interface WrapperStrippingResult {
    tokens: string[];
    envAssignments: Map<string, string>;
    cwd?: string | null;
}
export declare function stripWrappers(tokens: string[], cwd?: string | null): string[];
export declare function stripWrappersWithInfo(tokens: string[], cwd?: string | null): WrapperStrippingResult;
export declare function extractShortOpts(tokens: readonly string[], options?: {
    readonly shortOptsWithValue?: ReadonlySet<string>;
}): Set<string>;
export declare function normalizeCommandToken(token: string): string;
export declare function getBasename(token: string): string;
