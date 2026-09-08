import { isAbsolute, relative } from 'node:path';
import type { Budget } from '@/core/budget';
import { normalizeProtectedPathCandidate } from '@/core/paths/canonicalization';
import { getBasename } from '@/core/shell/tokens';
import { isReadOnlyTool } from '@/core/tool-input';
import type { EnvironmentContext, ProtectedGitMetadata } from '@/gate/analysis';
import { stripWrappersForPathScan } from '@/gate/analyzer/wrapper-prelude';
import type { SemanticFacts } from '@/gate/facts';
import {
  expandTrackedShellVariables,
  extractMvOperandPaths,
  findProtectedPathMutationInCommand,
  isAssignmentOnlySegment,
  type ProtectedPathShellState,
} from './protected-path-scanner';
import { getCommandSyntaxFact } from './semantic-facts';

export const REASON_GIT_METADATA_PROTECTION =
  'Git metadata and hooks are protected. Ask the user before modifying them.';

type GitMetadataTarget = Readonly<{ target: string }>;

export function findGitMetadataMutationTargetInSemanticFacts(
  facts: SemanticFacts,
  metadata: ProtectedGitMetadata | null,
  environment: EnvironmentContext,
  budget: Budget,
): GitMetadataTarget | null {
  const cwd = facts.invocation.context.executionCwd;
  if (!metadata) return null;

  if (
    facts.invocation.route.kind === 'patch' ||
    facts.invocation.route.kind === 'path' ||
    facts.invocation.route.kind === 'unknown'
  ) {
    if (isReadOnlyTool(facts.invocation.toolName)) return null;
    const target = facts.paths.find((path) =>
      isProtectedGitWriteLikeTarget(path, cwd, metadata, environment, budget, metadata.entries),
    );
    return target ? { target } : null;
  }
  if (facts.invocation.route.kind !== 'command') return null;

  const command = getCommandSyntaxFact(facts, 'input-candidate');
  if (!command) return null;
  const target = findProtectedPathMutationInCommand(command.shell, cwd, environment, budget, {
    findSegmentTarget: (segment, state) =>
      findGitMetadataMoveTarget(segment, state, metadata, environment, budget),
    isRedirectionTarget: (target, state) =>
      isProtectedGitWriteLikeTarget(
        target,
        state.cwd,
        metadata,
        environment,
        budget,
        metadata.markerFiles,
      ),
    findMalformedTarget: () => null,
    normalizeCwd: normalizeProtectedPathCandidate,
  });
  return target ? { target } : null;
}

export function isProtectedGitDeleteTarget(
  target: string,
  cwd: string,
  metadata: ProtectedGitMetadata | null,
  recursive: boolean,
  environment: EnvironmentContext,
  budget: Budget,
  dotEntryGlobs = false,
): boolean {
  if (!metadata) return false;
  const candidate = comparePath(normalizeProtectedPathCandidate(target, cwd, environment, budget));
  const globBase = candidate.replace(/(\/\.?\*+)+$/, '');
  if (globBase !== candidate && globBase !== '') {
    if (isProtectedExactOrHookTarget(globBase, metadata)) return true;
    // POSIX `*` skips dot entries; `.*` globs and PowerShell wildcards do not.
    const matchesHidden = dotEntryGlobs || candidate.slice(globBase.length).includes('/.');
    const covers = (path: string) =>
      matchesHidden ? isEqualOrWithin(path, globBase) : isGlobVisibleDescendant(path, globBase);
    if (metadata.markerFiles.some(covers)) return true;
    return recursive && protectedRoots(metadata).some(covers);
  }
  if (isProtectedExactOrHookTarget(candidate, metadata)) return true;
  return recursive && protectedRoots(metadata).some((path) => isEqualOrWithin(path, candidate));
}

// A trailing all-star glob deletes the base's children, but `*` does not match
// dot-entries, so a protected root is only covered when its first path segment
// below the base is not hidden (e.g. `.git/worktrees/*` covers a linked gitdir
// while `./*` at the repository root does not cover `.git`).
function isGlobVisibleDescendant(target: string, base: string): boolean {
  const path = relative(base, target);
  if (path === '' || path.startsWith('..') || isAbsolute(path)) return false;
  return !path.split(/[\\/]/)[0]?.startsWith('.');
}

function isProtectedGitMoveSource(
  target: string,
  cwd: string,
  metadata: ProtectedGitMetadata | null,
  environment: EnvironmentContext,
  budget: Budget,
): boolean {
  return isProtectedGitDeleteTarget(target, cwd, metadata, true, environment, budget);
}

function isProtectedGitMoveDestination(
  target: string,
  cwd: string,
  metadata: ProtectedGitMetadata | null,
  environment: EnvironmentContext,
  budget: Budget,
): boolean {
  if (!metadata) return false;
  return isProtectedExactOrHookTarget(
    comparePath(normalizeProtectedPathCandidate(target, cwd, environment, budget)),
    metadata,
  );
}

function isProtectedGitWriteLikeTarget(
  target: string,
  cwd: string,
  metadata: ProtectedGitMetadata,
  environment: EnvironmentContext,
  budget: Budget,
  exactTargets: readonly string[],
): boolean {
  const candidate = comparePath(normalizeProtectedPathCandidate(target, cwd, environment, budget));
  return exactTargets.includes(candidate) || isProtectedHookTarget(candidate, metadata);
}

export function isProtectedGitHookNameSelection(
  startingPoints: readonly string[],
  cwd: string,
  metadata: ProtectedGitMetadata | null,
  environment: EnvironmentContext,
  budget: Budget,
): boolean {
  if (!metadata) return false;
  return metadata.hooksDirectories.some((hooks) =>
    startingPoints.some((target) =>
      isEqualOrWithin(
        hooks,
        comparePath(normalizeProtectedPathCandidate(target, cwd, environment, budget)),
      ),
    ),
  );
}

function isProtectedExactOrHookTarget(candidate: string, metadata: ProtectedGitMetadata): boolean {
  return (
    metadata.entries.includes(candidate) ||
    metadata.directories.includes(candidate) ||
    isProtectedHookTarget(candidate, metadata)
  );
}

function isProtectedHookTarget(candidate: string, metadata: ProtectedGitMetadata): boolean {
  return metadata.hooksDirectories.some((hooks) => isEqualOrWithin(candidate, hooks));
}

function protectedRoots(metadata: ProtectedGitMetadata): readonly string[] {
  // Hooks directories can be symlinked outside the Git directory, so ancestor
  // deletion must also cover their canonical targets.
  return [...metadata.entries, ...metadata.directories, ...metadata.hooksDirectories];
}

function isEqualOrWithin(target: string, root: string): boolean {
  const path = relative(root, target);
  return path === '' || (!/^\.\.(?:[\\/]|$)/.test(path) && !isAbsolute(path));
}

function comparePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function findGitMetadataMoveTarget(
  segment: readonly string[],
  state: ProtectedPathShellState,
  metadata: ProtectedGitMetadata,
  environment: EnvironmentContext,
  budget: Budget,
): string | null {
  if (isAssignmentOnlySegment(segment)) return null;
  const stripped = stripWrappersForPathScan([...segment], environment);
  if (getBasename(stripped[0] ?? '').toLowerCase() !== 'mv') return null;
  const operands = extractMvOperandPaths(stripped.slice(1));
  const source = operands.sources.find((target) =>
    isProtectedGitMoveSource(
      expandTrackedShellVariables(target, state.variables),
      state.cwd,
      metadata,
      environment,
      budget,
    ),
  );
  if (source) return source;
  return operands.destination &&
    isProtectedGitMoveDestination(
      expandTrackedShellVariables(operands.destination, state.variables),
      state.cwd,
      metadata,
      environment,
      budget,
    )
    ? operands.destination
    : null;
}
