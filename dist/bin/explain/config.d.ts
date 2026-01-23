/**
 * Configuration utilities for the explain command.
 * Handles config source detection and analysis options building.
 */
import type { AnalyzeOptions, ExplainOptions } from '@/types';
export interface GetConfigSourceOptions {
    cwd?: string;
    /** Override user config path for testing */
    userConfigPath?: string;
}
/**
 * Get the config source path and validity status.
 * Checks project config first, falls back to user config.
 */
export declare function getConfigSource(options?: GetConfigSourceOptions): {
    configSource: string | null;
    configValid: boolean;
};
/**
 * Build AnalyzeOptions from ExplainOptions.
 * Merges user options with environment variable defaults.
 */
export declare function buildAnalyzeOptions(explainOptions?: ExplainOptions): AnalyzeOptions;
