import { lstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { getAuditLogsDir } from '@/audit/writer';
import type { Environment } from '@/core/environment';
import type {
  DoctorPosture,
  ProtectedDirectoryKind,
  ProtectedDirectoryPosture,
} from '@/hosts/doctor-types';

function inspectDirectory(kind: ProtectedDirectoryKind, path: string): ProtectedDirectoryPosture {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return { kind, path, status: 'unsafe', issues: ['symlink'] };
    if (!stat.isDirectory()) return { kind, path, status: 'unsafe', issues: ['not-directory'] };
    if (process.platform === 'win32' || typeof process.getuid !== 'function') {
      return { kind, path, status: 'unknown', issues: [] };
    }

    const issues = [
      ...(stat.uid !== process.getuid() ? (['ownership'] as const) : []),
      ...((stat.mode & 0o022) !== 0 ? (['permissions'] as const) : []),
    ];
    return { kind, path, status: issues.length > 0 ? 'unsafe' : 'safe', issues };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return { kind, path, status: 'not-applicable', issues: [] };
    }
    return { kind, path, status: 'unknown', issues: [] };
  }
}

export function getDoctorPosture(environment: Environment, userConfigPath: string): DoctorPosture {
  const auditPath = getAuditLogsDir(environment);
  return {
    directories: [
      inspectDirectory('policy', dirname(dirname(userConfigPath))),
      inspectDirectory('config', dirname(userConfigPath)),
      ...(auditPath
        ? [inspectDirectory('audit', auditPath)]
        : [{ kind: 'audit' as const, status: 'unknown' as const, issues: [] }]),
    ],
  };
}
