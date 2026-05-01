import { lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, parse as parsePath, sep } from 'node:path';

export function resolveChdirTarget(baseCwd: string, target: string): string {
  const root = isAbsolute(target) ? getPathRoot(target) : '';
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
    current = lstatSync(candidate).isSymbolicLink() ? realpathSync(candidate) : candidate;
  }
  return current;
}

function appendPathWithoutNormalizing(base: string, target: string): string {
  return base.endsWith('/') || base.endsWith('\\') ? `${base}${target}` : `${base}${sep}${target}`;
}

function getPathRoot(target: string): string {
  return parsePath(target).root;
}

function getPathComponents(target: string): string[] {
  const separator = process.platform === 'win32' ? /[\\/]+/ : /\/+/;
  return target.split(separator);
}
