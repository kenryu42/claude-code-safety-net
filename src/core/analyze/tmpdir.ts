import { tmpdir } from 'node:os';
import { normalize, sep } from 'node:path';

export function isTmpdirOverriddenToNonTemp(envAssignments: Map<string, string>): boolean {
  if (!envAssignments.has('TMPDIR')) {
    return false;
  }
  const tmpdirValue = envAssignments.get('TMPDIR') ?? '';

  // Empty TMPDIR is dangerous: $TMPDIR/foo expands to /foo
  if (tmpdirValue === '') {
    return true;
  }

  const normalizedTmpdirValue = normalize(tmpdirValue);

  // Check if it's a known temp path (exact match or subpath)
  const sysTmpdir = normalize(tmpdir());
  if (
    isPathOrSubpath(normalizedTmpdirValue, normalize('/tmp')) ||
    isPathOrSubpath(normalizedTmpdirValue, normalize('/var/tmp')) ||
    isPathOrSubpath(normalizedTmpdirValue, sysTmpdir)
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
  // Ensure basePath ends with the platform separator for proper prefix matching.
  const baseWithSlash = basePath.endsWith(sep) ? basePath : `${basePath}${sep}`;
  return path.startsWith(baseWithSlash);
}
