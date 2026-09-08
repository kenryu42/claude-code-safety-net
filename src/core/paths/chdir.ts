import { dirname, isAbsolute, parse as parsePath, sep } from 'node:path';
import type { PathResolver } from '../environment';
import { isUnsupportedWindowsNamespacePath } from './canonicalization';

/**
 * The directory a `cd`-like operand lands in, resolving each component through the filesystem
 * the way the shell would. Throws when a component is missing or cannot be resolved, so the
 * caller treats the cwd as unknown.
 */
export function resolveChdirTarget(baseCwd: string, target: string, paths: PathResolver): string {
  if (isUnsupportedWindowsNamespacePath(target)) {
    throw new Error('Unsupported Windows namespace path');
  }
  const root = isAbsolute(target) ? parsePath(target).root : '';
  let current = root || baseCwd;
  for (const component of getPathComponents(root ? target.slice(root.length) : target)) {
    if (component === '' || component === '.') {
      continue;
    }
    if (component === '..') {
      current = dirname(current);
      continue;
    }

    const candidate = appendPathWithoutNormalizing(current, component);
    const kind = paths.entryKind(candidate);
    const resolved = kind === 'symlink' ? paths.realpath(candidate) : candidate;
    if (kind === 'missing' || resolved === null) {
      throw new Error(`Cannot resolve path component: ${candidate}`);
    }
    current = resolved;
  }
  return current;
}

function appendPathWithoutNormalizing(base: string, target: string): string {
  return base.endsWith('/') || base.endsWith('\\') ? `${base}${target}` : `${base}${sep}${target}`;
}

function getPathComponents(target: string): string[] {
  const separator = process.platform === 'win32' ? /[\\/]+/ : /\/+/;
  return target.split(separator);
}
