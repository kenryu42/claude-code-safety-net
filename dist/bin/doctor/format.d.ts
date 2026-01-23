/**
 * Output formatting utilities for the doctor command.
 */
import type { ActivitySummary, DoctorReport, EffectiveRule, EnvVarInfo, HookStatus, SystemInfo, UpdateInfo } from '@/bin/doctor/types';
/**
 * Format the hooks section as a table with failure details below.
 */
export declare function formatHooksSection(hooks: HookStatus[]): string;
/**
 * @internal Exported for testing
 * Format effective rules as an ASCII table.
 */
export declare function formatRulesTable(rules: EffectiveRule[]): string;
/**
 * Format the config section with tables.
 */
export declare function formatConfigSection(report: DoctorReport): string;
/**
 * Format the environment section as a table with status icons.
 */
export declare function formatEnvironmentSection(envVars: EnvVarInfo[]): string;
/**
 * Format the activity section as a table.
 */
export declare function formatActivitySection(activity: ActivitySummary): string;
/**
 * Format the update section as a table.
 */
export declare function formatUpdateSection(update: UpdateInfo): string;
/**
 * Format the system info section as a table.
 */
export declare function formatSystemInfoSection(system: SystemInfo): string;
/**
 * Format the summary line.
 */
export declare function formatSummary(report: DoctorReport): string;
