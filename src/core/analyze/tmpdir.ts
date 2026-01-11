import { tmpdir } from 'node:os';

export function isTmpdirOverriddenToNonTemp(envAssignments: Map<string, string>): boolean {
  if (!envAssignments.has('TMPDIR')) {
    return false;
  }
  const tmpdirValue = envAssignments.get('TMPDIR') ?? '';

  // Empty TMPDIR is dangerous: $TMPDIR/foo expands to /foo
  if (tmpdirValue === '') {
    return true;
  }

  // Check if it's a known temp path (exact match or subpath)
  const sysTmpdir = tmpdir();
  if (
    isPathOrSubpath(tmpdirValue, '/tmp') ||
    isPathOrSubpath(tmpdirValue, '/var/tmp') ||
    isPathOrSubpath(tmpdirValue, sysTmpdir)
  ) {
    return false;
  }
  return true;
}

/**
 * Check if a path equals or is a subpath of basePath.
 * E.g., isPathOrSubpath("/tmp/foo", "/tmp") → true
 *       isPathOrSubpath("/tmp-malicious", "/tmp") → false
 */
function isPathOrSubpath(path: string, basePath: string): boolean {
  if (path === basePath) {
    return true;
  }
  // Ensure basePath ends with / for proper prefix matching
  const baseWithSlash = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return path.startsWith(baseWithSlash);
}
