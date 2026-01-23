/**
 * Hook detection with integrated self-test for the doctor command.
 */
import type { HookStatus } from '@/bin/doctor/types';
import type { LoadConfigOptions } from '@/core/config';
interface HookDetectOptions extends LoadConfigOptions {
    homeDir?: string;
}
/**
 * Strip JSONC-style comments and trailing commas from a string.
 * Handles // comments, /* comments, and trailing commas before ] or }.
 * Trailing comma removal is string-aware to avoid corrupting values like ",]".
 * @internal Exported for testing
 */
export declare function stripJsonComments(content: string): string;
/**
 * Detect all hooks and run self-tests for configured ones.
 */
export declare function detectAllHooks(cwd: string, options?: HookDetectOptions): HookStatus[];
export {};
