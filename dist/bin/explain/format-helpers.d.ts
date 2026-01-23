/**
 * Low-level formatting utilities for explain command output.
 */
import type { TraceStep } from '@/types';
/**
 * Box drawing characters for formatting
 */
export interface BoxChars {
    dh: string;
    dv: string;
    dtl: string;
    dtr: string;
    dbl: string;
    dbr: string;
    h: string;
    v: string;
    tl: string;
    tr: string;
    bl: string;
    br: string;
    sh: string;
}
export declare function getBoxChars(asciiOnly: boolean): BoxChars;
export declare function formatHeader(box: BoxChars, width: number): string[];
/**
 * Format a token array with each token in a unique distinct color.
 * Uses a curated palette for maximum visual distinction.
 */
/**
 * Format a token array with each token in a unique distinct color.
 * Uses a curated palette for maximum visual distinction.
 */
export declare function formatColoredTokenArray(tokens: readonly string[], seed?: number): string;
export declare function wrapReason(reason: string, indent: string, maxWidth?: number): string[];
export interface FormattedStep {
    lines: string[];
    incrementStep: boolean;
}
export declare function formatStepStyleD(step: TraceStep, stepNum: number, box: BoxChars): FormattedStep | null;
