/**
 * Audit log activity summary for the doctor command.
 */
import type { ActivitySummary } from '@/bin/doctor/types';
export declare function getActivitySummary(days?: number, logsDir?: string): ActivitySummary;
