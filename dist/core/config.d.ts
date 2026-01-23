import { type Config, type ValidationResult } from '@/types';
export interface LoadConfigOptions {
    /** Override user config directory (for testing) */
    userConfigDir?: string;
}
export declare function loadConfig(cwd?: string, options?: LoadConfigOptions): Config;
/** @internal Exported for testing */
export declare function validateConfig(config: unknown): ValidationResult;
export declare function validateConfigFile(path: string): ValidationResult;
export declare function getUserConfigPath(): string;
export declare function getProjectConfigPath(cwd?: string): string;
export type { ValidationResult };
