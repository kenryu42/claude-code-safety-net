/**
 * Segment analysis logic for the explain command.
 * Handles recursive analysis of shell command segments.
 */
import type { AnalyzeOptions, TraceStep } from '@/types';
export declare const REASON_STRICT_UNPARSEABLE = "Command could not be safely analyzed (strict mode). Verify manually.";
export interface SegmentResult {
    reason: string;
}
export declare function isUnparseableCommand(command: string, segments: string[][]): boolean;
export declare function explainSegment(tokens: string[], depth: number, options: AnalyzeOptions, steps: TraceStep[]): SegmentResult | null;
