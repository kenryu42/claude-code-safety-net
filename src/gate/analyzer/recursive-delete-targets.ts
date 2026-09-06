import { isAbsolute, normalize, parse, posix, resolve, sep } from 'node:path';
import { type Budget, createBudget } from '@/core/budget';
import {
  isUnsupportedWindowsNamespacePath,
  resolveExistingPath,
} from '@/core/paths/canonicalization';
import { isTrustedTempPath, isTrustedTempRootPath } from '@/core/paths/tmpdir';
import { expandAllowPathHome, getAllowPathHomeConflictError } from '@/core/policy/allow-paths';
import type { CommandWord } from '@/core/shell/model';
import { expandPosixLiteralBraceWord } from '@/core/shell/posix';
import type { EnvironmentContext, PathResolver, ProtectedGitMetadata } from '@/gate/analysis';
import { isProtectedGitDeleteTarget } from '@/gate/guards/git-metadata-protection';

const IS_WINDOWS = process.platform === 'win32';
const BRACE_EXPANSION_LIMIT = 64;
const BRACE_EXPANDED_LENGTH_LIMIT = 16_384;

export interface RecursiveDeleteTargetTrustOptions {
  /** Process state the trust checks read instead of touching env or home. */
  environment: EnvironmentContext;
  cwd?: string;
  originalCwd?: string;
  strict?: boolean;
  allowTmpdirVar?: boolean;
  allowPaths?: readonly string[];
  tmpdirWordSplittingUnsafe?: boolean;
  trustedTmpdirValue?: boolean;
  protectedGitMetadata: ProtectedGitMetadata | null;
}

export interface RecursiveDeleteTargetOptions extends RecursiveDeleteTargetTrustOptions {
  paranoid?: boolean;
  posixShell?: boolean;
  budget?: Budget;
}

export interface RecursiveDeleteTargetContext {
  readonly anchoredCwd: string | null;
  readonly resolvedCwd: string | null;
  readonly strict: boolean;
  readonly paranoid: boolean;
  readonly trustTmpdirVar: boolean;
  readonly posixShell: boolean;
  readonly tmpdirWordSplittingUnsafe: boolean;
  readonly trustedTmpdirValue: boolean;
  readonly environment: EnvironmentContext;
  readonly allowRoots: readonly string[];
  readonly protectedGitMetadata: ProtectedGitMetadata | null;
  readonly budget: Budget;
}

export interface RecursiveDeleteTargetClassificationOptions {
  targetIsLiteral?: boolean;
  tmpdirWordSplittingProtected?: boolean;
  skipHomeCwd?: boolean;
  skipCwdSelf?: boolean;
}

export interface TrustedTempDescendantTargetOptions
  extends RecursiveDeleteTargetClassificationOptions {
  containmentTarget?: string;
}

export type RecursiveDeleteTargetClassification =
  | { kind: 'root_or_home_target' }
  | { kind: 'git_metadata_target' }
  | { kind: 'temp_target' }
  | { kind: 'dynamic_target' }
  | { kind: 'home_cwd_target' }
  | { kind: 'cwd_self_target' }
  | { kind: 'within_anchored_cwd' }
  | { kind: 'outside_anchored_cwd' };

export interface DeleteTargetWordFacts {
  /** Literal brace alternatives to classify instead of the word itself. */
  readonly expandedTargets: readonly string[] | undefined;
  /** Brace expansion hit a limit, so the deleted set is unknown. */
  readonly unsafeBraceExpansion: boolean;
  readonly targetIsLiteral: boolean;
  readonly tmpdirWordSplittingProtected: boolean;
}

export function deleteTargetWordFacts(word: CommandWord): DeleteTargetWordFacts {
  const expansion = expandPosixLiteralBraceWord(
    word,
    BRACE_EXPANSION_LIMIT,
    BRACE_EXPANSION_LIMIT,
    BRACE_EXPANDED_LENGTH_LIMIT,
  );
  return {
    expandedTargets: expansion && 'words' in expansion ? expansion.words : undefined,
    unsafeBraceExpansion: expansion !== undefined && 'limited' in expansion,
    targetIsLiteral:
      expansion === undefined &&
      word.provenance === 'literal' &&
      (word.quoted || word.raw !== word.text),
    tmpdirWordSplittingProtected: isTmpdirExpansionWordSplittingProtected(word),
  };
}

// A $TMPDIR reference inside double quotes cannot word-split, so a hostile TMPDIR value
// cannot turn one target into several.
function isTmpdirExpansionWordSplittingProtected(word: CommandWord): boolean {
  const tmpdirParts = word.parts.filter(
    (part) =>
      part.provenance === 'variable' && /\$(?:TMPDIR(?![A-Za-z0-9_])|\{TMPDIR\})/.test(part.raw),
  );
  return (
    tmpdirParts.length > 0 &&
    tmpdirParts.every((part) =>
      isRawOffsetDoubleQuoted(word.raw, part.span.start - word.span.start),
    )
  );
}

function isRawOffsetDoubleQuoted(raw: string, offset: number): boolean {
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < offset; index++) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote === char) {
      quote = null;
      continue;
    }
    if (quote === null && (char === "'" || char === '"')) quote = char;
  }
  return quote === '"';
}

export function createRecursiveDeleteTargetContext(
  options: RecursiveDeleteTargetOptions,
): RecursiveDeleteTargetContext {
  const homeDir = options.environment.home;
  const paths = options.environment.paths;
  const budget = options.budget ?? createBudget();
  return {
    anchoredCwd: options.originalCwd ?? options.cwd ?? null,
    resolvedCwd: options.cwd ?? null,
    strict: options.strict ?? false,
    paranoid: options.paranoid ?? false,
    trustTmpdirVar: options.allowTmpdirVar ?? true,
    posixShell: options.posixShell ?? false,
    tmpdirWordSplittingUnsafe: options.tmpdirWordSplittingUnsafe ?? false,
    trustedTmpdirValue: options.trustedTmpdirValue ?? options.allowTmpdirVar ?? true,
    environment: options.environment,
    allowRoots: resolveAllowRoots(options.allowPaths, homeDir, paths, budget),
    protectedGitMetadata: options.protectedGitMetadata,
    budget,
  };
}

export function classifyRecursiveDeleteTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  options: RecursiveDeleteTargetClassificationOptions = {},
): RecursiveDeleteTargetClassification {
  const targetIsLiteral = options.targetIsLiteral ?? false;
  if (
    !targetIsLiteral &&
    ctx.tmpdirWordSplittingUnsafe &&
    !options.tmpdirWordSplittingProtected &&
    containsTmpdirVariable(target)
  ) {
    return { kind: 'outside_anchored_cwd' };
  }
  const dynamic = !targetIsLiteral && isDynamicTarget(target, ctx.posixShell);

  if (isUnsupportedWindowsNamespacePath(target)) {
    return { kind: 'outside_anchored_cwd' };
  }

  if (isDangerousRootOrHomeTarget(target, targetIsLiteral)) {
    return { kind: 'root_or_home_target' };
  }

  if (isCanonicalHomeTarget(target, ctx, targetIsLiteral)) {
    return { kind: 'root_or_home_target' };
  }

  if (
    ctx.resolvedCwd &&
    isProtectedGitDeleteTarget(
      target,
      ctx.resolvedCwd,
      ctx.protectedGitMetadata,
      true,
      ctx.environment,
      ctx.budget,
      !ctx.posixShell,
    )
  ) {
    return { kind: 'git_metadata_target' };
  }

  if (
    isTempTarget(
      target,
      ctx.trustTmpdirVar,
      ctx.posixShell,
      dynamic,
      targetIsLiteral,
      options.tmpdirWordSplittingProtected ?? false,
      ctx.trustedTmpdirValue,
      ctx.environment,
    )
  ) {
    return { kind: 'temp_target' };
  }

  if (dynamic) {
    return { kind: 'dynamic_target' };
  }

  // User-configured allow paths behave like trusted temp roots for verified literal targets.
  if (isAllowedPathTarget(target, ctx, targetIsLiteral)) {
    return { kind: 'temp_target' };
  }

  const anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (
      !options.skipHomeCwd &&
      isCwdHomeForRmPolicy(anchoredCwd, ctx.environment.home, ctx.environment.paths, ctx.budget)
    ) {
      return { kind: 'home_cwd_target' };
    }

    if (
      !options.skipCwdSelf &&
      isCwdSelfTarget(target, ctx.resolvedCwd ?? anchoredCwd, ctx.environment.paths, ctx.budget)
    ) {
      return { kind: 'cwd_self_target' };
    }

    if (
      isTargetWithinCwd(
        target,
        anchoredCwd,
        ctx.resolvedCwd ?? anchoredCwd,
        dynamic,
        targetIsLiteral,
        ctx.environment.paths,
        ctx.budget,
      )
    ) {
      return { kind: 'within_anchored_cwd' };
    }
  }

  return { kind: 'outside_anchored_cwd' };
}

export function isTrustedTempDescendantTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  options: TrustedTempDescendantTargetOptions = {},
): boolean {
  const { containmentTarget, ...classificationOptions } = options;
  if (classifyRecursiveDeleteTarget(target, ctx, classificationOptions).kind !== 'temp_target') {
    return false;
  }
  const normalized = target.trim();
  if (isTrustedTmpdirVariableRootTarget(normalized)) return false;
  if (isTrustedTempRootPath(normalized, ctx.environment)) return false;
  return ![ctx.anchoredCwd, ctx.resolvedCwd].some((workspace) =>
    isWorkspaceWithinTarget(
      containmentTarget ?? normalized,
      workspace,
      ctx.environment.paths,
      ctx.budget,
    ),
  );
}

export function isDangerousRootOrHomeTarget(path: string, targetIsLiteral = false): boolean {
  const trimmed = path.trim();
  const normalized = posix.normalize(trimmed);
  const windowsNormalized = trimmed.replace(/\\/g, '/');

  const rootGlobTarget = normalized === '/' ? normalized : normalized.replace(/\/+$/, '');
  if (
    rootGlobTarget === '/' ||
    (rootGlobTarget.startsWith('/') &&
      rootGlobTarget
        .slice(1)
        .split('/')
        .every((segment) => /^\*+$/.test(segment)))
  ) {
    return true;
  }

  if (
    /^[A-Za-z]:\/+\*?$/.test(windowsNormalized) ||
    /^\/\/[^/]+\/+[^/]+(?:\/+\*?)?$/.test(windowsNormalized)
  ) {
    return true;
  }

  if (!targetIsLiteral && (normalized === '~' || normalized === '~/' || normalized === '~/*')) {
    return true;
  }

  if (
    !targetIsLiteral &&
    (normalized === '$HOME' || normalized === '$HOME/' || normalized === '$HOME/*')
  ) {
    return true;
  }

  if (
    !targetIsLiteral &&
    (normalized === '${HOME}' || normalized === '${HOME}/' || normalized === '${HOME}/*')
  ) {
    return true;
  }

  return false;
}

function isCanonicalHomeTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  targetIsLiteral: boolean,
): boolean {
  const trimmed = target.trim();
  // A quoted literal `*` names a single file, not a glob over the directory contents.
  const candidate = targetIsLiteral
    ? trimmed
    : trimmed === '*'
      ? '.'
      : trimmed.endsWith('/*')
        ? trimmed.slice(0, -2)
        : trimmed;
  if (!candidate) return false;
  try {
    const base = isAbsolute(candidate)
      ? candidate
      : ctx.resolvedCwd
        ? resolve(ctx.resolvedCwd, candidate)
        : null;
    if (!base) return false;
    const resolved = normalizePathForComparison(
      resolveExistingPath(base, ctx.environment.paths, ctx.budget),
    );
    if (resolved === parse(resolved).root) return true;
    return (
      resolved ===
      normalizePathForComparison(
        resolveExistingPath(ctx.environment.home, ctx.environment.paths, ctx.budget),
      )
    );
  } catch {
    return false;
  }
}

function normalizePathForComparison(p: string): string {
  let normalized = normalize(p);
  if (IS_WINDOWS) {
    normalized = normalized.replace(/\//g, '\\').toLowerCase();
    if (normalized.length > 3 && normalized.endsWith('\\')) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isTempTarget(
  path: string,
  allowTmpdirVar: boolean,
  posixShell: boolean,
  dynamic: boolean,
  targetIsLiteral: boolean,
  tmpdirWordSplittingProtected: boolean,
  trustedTmpdirValue: boolean,
  environment: EnvironmentContext,
): boolean {
  const normalized = path.trim();

  if (hasParentDirectoryComponent(normalized)) {
    return false;
  }

  if (!dynamic && isTrustedTempPath(normalized, environment)) {
    return true;
  }

  return (
    (allowTmpdirVar || (tmpdirWordSplittingProtected && trustedTmpdirValue)) &&
    posixShell &&
    !targetIsLiteral &&
    isTrustedTmpdirVariableTarget(normalized, posixShell)
  );
}

function isTrustedTmpdirVariableTarget(path: string, posixShell: boolean): boolean {
  return ['$TMPDIR', '${TMPDIR}'].some((prefix) => {
    if (path === prefix) return true;
    if (!path.startsWith(`${prefix}/`)) return false;
    return !isDynamicTarget(path.slice(prefix.length + 1), posixShell);
  });
}

function isTrustedTmpdirVariableRootTarget(path: string): boolean {
  const match = /^(?:\$TMPDIR|\$\{TMPDIR\})(?:\/(.*))?$/.exec(path);
  if (!match) return false;
  return posix.normalize(`/${match[1] ?? ''}`) === '/';
}

function hasParentDirectoryComponent(path: string): boolean {
  return path.split(/[\\/]+/).includes('..');
}

function resolveAllowRoots(
  allowPaths: readonly string[] | undefined,
  homeDir: string,
  paths: PathResolver,
  budget: Budget,
): readonly string[] {
  if (!allowPaths?.length) return [];
  return allowPaths.flatMap((path) => {
    const expanded = expandAllowPathHome(path.trim(), homeDir);
    if (!isAbsolute(expanded)) return [];
    try {
      const canonical = resolveExistingPath(expanded, paths, budget);
      // Re-check against home after symlink resolution so a link into or above
      // home cannot widen the allowed root.
      if (getAllowPathHomeConflictError(canonical, resolveExistingPath(homeDir, paths, budget))) {
        return [];
      }
      return [normalizePathForComparison(canonical)];
    } catch {
      return [];
    }
  });
}

function isAllowedPathTarget(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  targetIsLiteral: boolean,
): boolean {
  if (ctx.allowRoots.length === 0) return false;
  const trimmed = target.trim();
  if (hasParentDirectoryComponent(trimmed)) return false;
  const expanded = targetIsLiteral ? trimmed : expandAllowPathHome(trimmed, ctx.environment.home);
  const base = ctx.resolvedCwd ?? ctx.anchoredCwd;
  const resolved = isAbsolute(expanded) ? expanded : base ? resolve(base, expanded) : null;
  if (!resolved) return false;
  try {
    const canonical = normalizePathForComparison(
      resolveExistingPath(resolved, ctx.environment.paths, ctx.budget),
    );
    return ctx.allowRoots.some(
      (root) =>
        canonical === root || canonical.startsWith(root.endsWith(sep) ? root : `${root}${sep}`),
    );
  } catch {
    return false;
  }
}

function containsTmpdirVariable(target: string): boolean {
  return /\$(?:TMPDIR(?![A-Za-z0-9_])|\{TMPDIR\})/.test(target);
}

function isDynamicTarget(target: string, posixShell = false): boolean {
  return (
    target.includes('$') ||
    target.includes('`') ||
    hasShellGlobMetachar(target) ||
    (posixShell && hasPosixShellExpansionMetachar(target))
  );
}

function hasShellGlobMetachar(target: string): boolean {
  let escaped = false;
  for (const char of target) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '*' || char === '?' || char === '[') {
      return true;
    }
  }
  return false;
}

function hasPosixShellExpansionMetachar(target: string): boolean {
  let escaped = false;
  for (let index = 0; index < target.length; index++) {
    const char = target[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (
      (char === '{' && hasBraceExpansion(target, index)) ||
      ((char === '+' || char === '@' || char === '!') && target[index + 1] === '(')
    ) {
      return true;
    }
  }
  return false;
}

function hasBraceExpansion(target: string, openIndex: number): boolean {
  const closeIndex = target.indexOf('}', openIndex + 1);
  if (closeIndex === -1) return false;
  const body = target.slice(openIndex + 1, closeIndex);
  return body.includes(',') || body.includes('..');
}

function isCwdHomeForRmPolicy(
  cwd: string,
  homeDir: string,
  paths: PathResolver,
  budget: Budget,
): boolean {
  try {
    return (
      normalizePathForComparison(resolveExistingPath(cwd, paths, budget)) ===
      normalizePathForComparison(resolveExistingPath(homeDir, paths, budget))
    );
  } catch {
    try {
      return normalizePathForComparison(cwd) === normalizePathForComparison(homeDir);
    } catch {
      return false;
    }
  }
}

function isCwdSelfTarget(
  target: string,
  cwd: string,
  paths: PathResolver,
  budget: Budget,
): boolean {
  if (target === '.' || target === './' || target === '.\\') {
    return true;
  }

  try {
    return (
      normalizePathForComparison(resolveExistingPath(resolve(cwd, target), paths, budget)) ===
      normalizePathForComparison(resolveExistingPath(cwd, paths, budget))
    );
  } catch {
    try {
      return normalizePathForComparison(resolve(cwd, target)) === normalizePathForComparison(cwd);
    } catch {
      return false;
    }
  }
}

function isTargetWithinCwd(
  target: string,
  originalCwd: string,
  effectiveCwd: string | undefined,
  dynamic: boolean,
  targetIsLiteral: boolean,
  paths: PathResolver,
  budget: Budget,
): boolean {
  const resolveCwd = effectiveCwd ?? originalCwd;
  if (
    !targetIsLiteral &&
    (target.startsWith('~') || target.startsWith('$HOME') || target.startsWith('${HOME}'))
  ) {
    return false;
  }

  if (dynamic) {
    return false;
  }

  if (target.startsWith('/') || /^[A-Za-z]:[\\/]/.test(target)) {
    try {
      return isResolvedPathWithinCwd(target, originalCwd, paths, budget);
    } catch {
      return false;
    }
  }

  if (
    target.startsWith('./') ||
    target.startsWith('.\\') ||
    (!target.includes('/') && !target.includes('\\'))
  ) {
    try {
      return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd, paths, budget);
    } catch {
      return false;
    }
  }

  if (target.startsWith('../')) {
    return false;
  }

  try {
    return isResolvedPathWithinCwd(resolve(resolveCwd, target), originalCwd, paths, budget);
  } catch {
    return false;
  }
}

function isResolvedPathWithinCwd(
  resolvedTarget: string,
  cwd: string,
  paths: PathResolver,
  budget: Budget,
): boolean {
  try {
    return isNormalizedPathWithin(
      resolveExistingPath(resolvedTarget, paths, budget),
      resolveExistingPath(cwd, paths, budget),
    );
  } catch {
    return false;
  }
}

function isWorkspaceWithinTarget(
  target: string,
  workspace: string | null,
  paths: PathResolver,
  budget: Budget,
): boolean {
  if (!workspace) return false;
  try {
    return isNormalizedPathWithin(
      resolveExistingPath(workspace, paths, budget),
      resolveExistingPath(target, paths, budget),
    );
  } catch {
    return true;
  }
}

function isNormalizedPathWithin(target: string, cwd: string): boolean {
  const normalizedTarget = normalizePathForComparison(target);
  const normalizedCwd = normalizePathForComparison(cwd);
  return (
    normalizedTarget.startsWith(`${normalizedCwd}${sep}`) || normalizedTarget === normalizedCwd
  );
}
