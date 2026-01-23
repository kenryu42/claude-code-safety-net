/**
 * CLI flag parsing for the doctor command.
 */

import type { DoctorOptions } from '@/bin/doctor/types';

export function parseDoctorFlags(args: string[]): DoctorOptions {
  return {
    json: args.includes('--json'),
    skipUpdateCheck: args.includes('--skip-update-check'),
  };
}
