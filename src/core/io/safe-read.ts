import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, normalize, parse, relative, resolve, sep } from 'node:path';

/**
 * Policy files are reached only through a bound scope. Every path component under the root must
 * be a regular directory or file that canonicalizes inside the root (never a symlink); a read
 * goes through a descriptor opened `O_NOFOLLOW` and is compared with the path's identity after
 * the bytes are in, so a file swapped between open and read is refused; a write goes through an
 * exclusive sibling temp file, fsync and rename. Every failure, Node's own errors included,
 * surfaces as one fixed diagnostic per scope so the caller learns nothing about the filesystem.
 */

const POLICY_FILESYSTEM_SCOPE = Symbol('PolicyFilesystemScope');
const POLICY_FILESYSTEM_TARGET = Symbol('PolicyFilesystemTarget');
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;

export type PolicyFilesystemLabel = 'user policy' | 'project policy' | 'rules policy';

export interface PolicyFilesystemScope {
  readonly [POLICY_FILESYSTEM_SCOPE]: true;
  readonly root: string;
  readonly label: PolicyFilesystemLabel;
}

export interface PolicyFilesystemTarget {
  readonly [POLICY_FILESYSTEM_TARGET]: true;
  readonly scope: PolicyFilesystemScope;
  readonly relativePath: string;
  readonly path: string;
}

export class PolicyFilesystemError extends Error {
  override readonly name = 'PolicyFilesystemError';

  constructor(label: PolicyFilesystemLabel) {
    super(`Unable to access ${label} filesystem safely.`);
  }
}

export function bindPolicyFilesystemScope(
  root: string,
  label: PolicyFilesystemLabel,
): PolicyFilesystemScope {
  return { [POLICY_FILESYSTEM_SCOPE]: true, root: resolve(root), label };
}

/** @internal */
export function getPolicyFilesystemTarget(
  scope: PolicyFilesystemScope,
  relativePath: string,
): PolicyFilesystemTarget {
  const normalized = normalize(relativePath);
  if (
    relativePath === '' ||
    isAbsolute(relativePath) ||
    normalized === '..' ||
    normalized.startsWith(`..${sep}`)
  ) {
    throw new PolicyFilesystemError(scope.label);
  }
  return {
    [POLICY_FILESYSTEM_TARGET]: true,
    scope,
    relativePath: normalized,
    path: join(scope.root, normalized),
  };
}

/** Binds an already-derived absolute path to an existing capability. */
export function getPolicyFilesystemTargetForPath(
  scope: PolicyFilesystemScope,
  path: string,
): PolicyFilesystemTarget {
  return getPolicyFilesystemTarget(scope, relative(scope.root, resolve(path)));
}

export function bindDelegatedPolicyFilesystemTarget(
  path: string,
  label: PolicyFilesystemLabel = 'rules policy',
): PolicyFilesystemTarget {
  const absolutePath = resolve(path);
  const root = parse(absolutePath).dir;
  return getPolicyFilesystemTarget(
    bindPolicyFilesystemScope(root, label),
    relative(root, absolutePath),
  );
}

export function readPolicyFile(target: PolicyFilesystemTarget): string | null {
  return guarded(target.scope.label, () => {
    if (!validateTarget(target)) return null;
    const descriptor = openSync(target.path, constants.O_RDONLY | NO_FOLLOW);
    return withDescriptor(descriptor, () => {
      const before = fstatSync(descriptor);
      if (!before.isFile()) throw new PolicyFilesystemError(target.scope.label);
      const content = readFileSync(descriptor, 'utf-8');
      const after = lstatSync(target.path);
      if (
        !after.isFile() ||
        after.isSymbolicLink() ||
        before.dev !== after.dev ||
        before.ino !== after.ino
      ) {
        throw new PolicyFilesystemError(target.scope.label);
      }
      validateTarget(target);
      return content;
    });
  });
}

export function writePolicyFileAtomic(
  target: PolicyFilesystemTarget,
  content: string,
  mode = 0o600,
  afterRename?: (path: string) => void,
): void {
  const tempPath = `${target.path}.${randomBytes(8).toString('hex')}.tmp`;
  guarded(
    target.scope.label,
    () => {
      ensureTargetParents(target);
      validateTarget(target);
      const descriptor = openSync(
        tempPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | NO_FOLLOW,
        mode,
      );
      const temp = withDescriptor(descriptor, () => {
        const before = fstatSync(descriptor);
        if (!before.isFile()) throw new PolicyFilesystemError(target.scope.label);
        writeFileSync(descriptor, content, 'utf-8');
        fsyncSync(descriptor);
        const after = fstatSync(descriptor);
        if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) {
          throw new PolicyFilesystemError(target.scope.label);
        }
        return after;
      });
      validateTarget(target);
      validateAdjacentTemp(target, tempPath, temp.dev, temp.ino);
      renameSync(tempPath, target.path);
      afterRename?.(target.path);
      validateTarget(target);
    },
    () => unlinkSafely(tempPath),
  );
}

export function isSamePolicyFilesystemTarget(
  first: PolicyFilesystemTarget,
  second: PolicyFilesystemTarget,
): boolean {
  if (first.path === second.path) return true;
  return guarded(first.scope.label, () => {
    if (!validateTarget(first) || !validateTarget(second)) return false;
    return realpathSync(first.path) === realpathSync(second.path);
  });
}

export function readPolicyDirectoryEntries(
  target: PolicyFilesystemTarget,
): Array<{ name: string; kind: 'file' | 'directory' }> | null {
  const names = guarded(target.scope.label, () => {
    if (!validateTarget(target, 'directory')) return null;
    const entries = readdirSync(target.path);
    validateTarget(target, 'directory');
    return entries;
  });
  if (!names) return null;
  return guarded(target.scope.label, () => {
    const entries = names.map((name) => {
      const child = getPolicyFilesystemTarget(target.scope, join(target.relativePath, name));
      const stat = lstatSync(child.path);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new PolicyFilesystemError(target.scope.label);
      }
      assertCanonicalContainment(
        getCanonicalRootOrThrow(target.scope),
        realpathSync(child.path),
        target.scope.label,
      );
      return { name, kind: stat.isDirectory() ? ('directory' as const) : ('file' as const) };
    });
    validateTarget(target, 'directory');
    return entries;
  });
}

export function removePolicyFile(target: PolicyFilesystemTarget): void {
  guarded(target.scope.label, () => {
    if (!validateTarget(target)) return;
    unlinkSync(target.path);
    validateTarget(target);
  });
}

/** Removes a validated directory tree; the migration command prunes the v2 cache with it. */
export function removePolicyDirectory(target: PolicyFilesystemTarget): void {
  guarded(target.scope.label, () => {
    if (!validatePolicyDirectoryRemoval(target)) return;
    removeValidatedTree(target);
    validateTarget(target, 'directory');
  });
}

// rmdirSync refuses a non-empty directory, so contents another process adds
// concurrently survive instead of being swept into a recursive delete.
export function removeEmptyPolicyDirectory(target: PolicyFilesystemTarget): void {
  guarded(target.scope.label, () => {
    if (!validateTarget(target, 'directory')) return;
    rmdirSync(target.path);
    validateTarget(target, 'directory');
  });
}

/** @internal Retained for the v2 cache cleanup the migration command performs. */
export function validatePolicyDirectoryRemoval(target: PolicyFilesystemTarget): boolean {
  return guarded(target.scope.label, () => {
    if (!validateTarget(target, 'directory')) return false;
    validateRemovalTree(target);
    return true;
  });
}

/** Runs one filesystem step; any failure, Node's own errors included, becomes the fixed diagnostic. */
function guarded<T>(label: PolicyFilesystemLabel, run: () => T, onFailure?: () => void): T {
  try {
    return run();
  } catch (error) {
    onFailure?.();
    if (error instanceof PolicyFilesystemError) throw error;
    throw new PolicyFilesystemError(label);
  }
}

function withDescriptor<T>(descriptor: number, run: () => T): T {
  try {
    return run();
  } finally {
    closeSync(descriptor);
  }
}

/** Whether every component under the root exists as the expected regular entry inside the root. */
function validateTarget(
  target: PolicyFilesystemTarget,
  leafType: 'file' | 'directory' = 'file',
): boolean {
  const canonicalRoot = getCanonicalRoot(target.scope);
  if (!canonicalRoot) return false;
  const parts = target.relativePath.split(sep);
  for (const index of parts.keys()) {
    const path = join(target.scope.root, ...parts.slice(0, index + 1));
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (!stat) return false;
    if (stat.isSymbolicLink()) throw new PolicyFilesystemError(target.scope.label);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    if (
      index === parts.length - 1 &&
      (leafType === 'file' ? !stat.isFile() : !stat.isDirectory())
    ) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    assertCanonicalContainment(canonicalRoot, realpathSync(path), target.scope.label);
  }
  return true;
}

function validateRemovalTree(target: PolicyFilesystemTarget): void {
  for (const name of readdirSync(target.path)) {
    const child = getPolicyFilesystemTarget(target.scope, join(target.relativePath, name));
    const stat = lstatSync(child.path);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    if (stat.isDirectory()) validateRemovalTree(child);
  }
  validateTarget(target, 'directory');
}

function removeValidatedTree(target: PolicyFilesystemTarget): void {
  for (const name of readdirSync(target.path)) {
    const child = getPolicyFilesystemTarget(target.scope, join(target.relativePath, name));
    const stat = lstatSync(child.path);
    if (stat.isSymbolicLink()) throw new PolicyFilesystemError(target.scope.label);
    if (stat.isDirectory()) {
      removeValidatedTree(child);
      continue;
    }
    if (!stat.isFile()) throw new PolicyFilesystemError(target.scope.label);
    unlinkSync(child.path);
  }
  rmdirSync(target.path);
}

function ensureTargetParents(target: PolicyFilesystemTarget): void {
  ensureRoot(target.scope);
  const canonicalRoot = getCanonicalRootOrThrow(target.scope);
  const parts = target.relativePath.split(sep).slice(0, -1);
  for (const index of parts.keys()) {
    const path = join(target.scope.root, ...parts.slice(0, index + 1));
    if (!lstatSync(path, { throwIfNoEntry: false })) mkdirSync(path, { mode: 0o700 });
    const after = lstatSync(path);
    if (!after.isDirectory() || after.isSymbolicLink()) {
      throw new PolicyFilesystemError(target.scope.label);
    }
    assertCanonicalContainment(canonicalRoot, realpathSync(path), target.scope.label);
  }
}

function ensureRoot(scope: PolicyFilesystemScope): void {
  if (lstatSync(scope.root, { throwIfNoEntry: false })) {
    if (!statSync(scope.root).isDirectory()) throw new PolicyFilesystemError(scope.label);
    return;
  }
  const missing: string[] = [];
  let current = scope.root;
  while (!lstatSync(current, { throwIfNoEntry: false })) {
    missing.unshift(current);
    const parent = parse(current).dir;
    if (parent === current) throw new PolicyFilesystemError(scope.label);
    current = parent;
  }
  if (!statSync(current).isDirectory()) throw new PolicyFilesystemError(scope.label);
  for (const path of missing) {
    mkdirSync(path, { mode: 0o700 });
    const stat = lstatSync(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new PolicyFilesystemError(scope.label);
    }
  }
}

function getCanonicalRoot(scope: PolicyFilesystemScope): string | null {
  if (!lstatSync(scope.root, { throwIfNoEntry: false })) return null;
  if (!statSync(scope.root).isDirectory()) throw new PolicyFilesystemError(scope.label);
  return realpathSync(scope.root);
}

function getCanonicalRootOrThrow(scope: PolicyFilesystemScope): string {
  const root = getCanonicalRoot(scope);
  if (!root) throw new PolicyFilesystemError(scope.label);
  return root;
}

function validateAdjacentTemp(
  target: PolicyFilesystemTarget,
  tempPath: string,
  device: number,
  inode: number,
): void {
  const stat = lstatSync(tempPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.dev !== device || stat.ino !== inode) {
    throw new PolicyFilesystemError(target.scope.label);
  }
  assertCanonicalContainment(
    getCanonicalRootOrThrow(target.scope),
    realpathSync(tempPath),
    target.scope.label,
  );
}

function assertCanonicalContainment(
  canonicalRoot: string,
  canonicalPath: string,
  label: PolicyFilesystemLabel,
): void {
  const remainder = relative(canonicalRoot, canonicalPath);
  if (remainder === '..' || remainder.startsWith(`..${sep}`) || isAbsolute(remainder)) {
    throw new PolicyFilesystemError(label);
  }
}

function unlinkSafely(path: string): void {
  try {
    unlinkSync(path);
  } catch {}
}
