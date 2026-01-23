/**
 * System information for the doctor command.
 */
import type { SystemInfo } from '@/bin/doctor/types';
/**
 * Get the package version synchronously.
 * This is useful for callers that only need the version without fetching tool versions.
 */
export declare function getPackageVersion(): string;
/**
 * Version fetcher function type.
 * Takes command args and returns the version string or null.
 */
export type VersionFetcher = (args: string[]) => Promise<string | null>;
/**
 * Default version fetcher that runs shell commands.
 * Uses Node.js child_process.spawn for compatibility with both Node and Bun runtimes.
 * @internal Exported for testing
 */
export declare const defaultVersionFetcher: VersionFetcher;
/**
 * Fetch system info with tool versions.
 * Runs all version checks in parallel for performance.
 */
export declare function getSystemInfo(fetcher?: VersionFetcher): Promise<SystemInfo>;
