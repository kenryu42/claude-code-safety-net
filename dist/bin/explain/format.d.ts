/**
 * Formatting functions for explain command output.
 */
import type { ExplainResult } from '@/types';
export declare function formatTraceHuman(result: ExplainResult, options?: {
    asciiOnly?: boolean;
}): string;
export declare function formatTraceJson(result: ExplainResult): string;
