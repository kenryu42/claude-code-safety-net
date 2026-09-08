import { statSync } from 'node:fs';
import { join } from 'node:path';
import { type Budget, createBudget } from '../budget';
import type { Environment } from '../environment';
import { normalizeProtectedPathCandidate } from '../paths/canonicalization';
import { findDotGitInAncestors, resolveDotGitFileTargets } from './worktree';

/**
 * Git control-plane paths that must not be mutated, resolved once per directory. The gate
 * unions the results for the execution and configuration directories when they differ.
 */
export type ProtectedGitMetadata = Readonly<{
  entries: readonly string[];
  markerFiles: readonly string[];
  directories: readonly string[];
  hooksDirectories: readonly string[];
}>;

export function resolveProtectedGitMetadata(
  cwd: string,
  environment: Environment,
): ProtectedGitMetadata | null {
  if (cwd === '') return null;
  const budget = createBudget();
  const dotGitPath = findDotGitInAncestors(
    normalizeProtectedPathCandidate(cwd, cwd, environment, budget),
  );
  const anchor = dotGitPath ? resolveGitMetadataAnchor(dotGitPath, cwd, environment, budget) : null;
  if (!anchor) return null;
  return Object.freeze({
    entries: Object.freeze([anchor.entry]),
    markerFiles: Object.freeze(anchor.markerFile ? [anchor.markerFile] : []),
    directories: Object.freeze(anchor.directories),
    hooksDirectories: Object.freeze(anchor.hooksDirectories),
  });
}

type GitMetadataAnchor = Readonly<{
  entry: string;
  markerFile: string | null;
  directories: readonly string[];
  hooksDirectories: readonly string[];
}>;

function resolveGitMetadataAnchor(
  dotGitPath: string,
  cwd: string,
  environment: Environment,
  budget: Budget,
): GitMetadataAnchor | null {
  try {
    const entry = normalizeProtectedPathCandidate(dotGitPath, cwd, environment, budget);
    const stat = statSync(dotGitPath);
    const markerFile = stat.isFile() ? entry : null;
    const fileTargets = stat.isFile() ? resolveDotGitFileTargets(dotGitPath) : null;
    const canonicalDirectories = (
      stat.isDirectory() ? [entry] : [fileTargets?.gitDir, fileTargets?.commonDir]
    ).flatMap((path) =>
      path ? [comparePath(normalizeProtectedPathCandidate(path, cwd, environment, budget))] : [],
    );
    // A symlinked .git directory canonicalizes to its external target, so keep
    // the lexical entry too — deleting the repository unlinks the control plane.
    const directories = [
      ...new Set(
        stat.isDirectory()
          ? [comparePath(dotGitPath.replace(/\\/g, '/')), ...canonicalDirectories]
          : canonicalDirectories,
      ),
    ];
    return {
      entry: comparePath(entry),
      markerFile: markerFile ? comparePath(markerFile) : null,
      directories,
      // Keep both the lexical hooks path and its canonical target so a
      // symlinked hooks directory stays protected on either alias.
      hooksDirectories: [
        ...new Set(
          directories.flatMap((directory) => {
            // `join` spells the Windows separator, which the canonical entry beside it does not.
            const lexical = comparePath(join(directory, 'hooks').replace(/\\/g, '/'));
            return [
              lexical,
              comparePath(normalizeProtectedPathCandidate(lexical, cwd, environment, budget)),
            ];
          }),
        ),
      ],
    };
  } catch {
    return null;
  }
}

function comparePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}
