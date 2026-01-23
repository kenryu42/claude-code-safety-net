import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { normalize, resolve } from 'node:path';

import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';

const REASON_RM_RF =
  'rm -rf outside cwd is blocked. Use explicit paths within the current directory, or delete manually.';
const REASON_RM_RF_ROOT_HOME =
  'rm -rf targeting root or home directory is extremely dangerous and always blocked.';

export interface AnalyzeRmOptions {
  cwd?: string;
  originalCwd?: string;
  paranoid?: boolean;
  allowTmpdirVar?: boolean;
  tmpdirOverridden?: boolean;
}

interface RmContext {
  readonly anchoredCwd: string | null;
  readonly resolvedCwd: string | null;
  readonly paranoid: boolean;
  readonly trustTmpdirVar: boolean;
  readonly homeDir: string;
}

type TargetClassification =
  | { kind: 'root_or_home_target' }
  | { kind: 'cwd_self_target' }
  | { kind: 'temp_target' }
  | { kind: 'within_anchored_cwd' }
  | { kind: 'outside_anchored_cwd' };

export function analyzeRm(tokens: string[], options: AnalyzeRmOptions = {}): string | null {
  const {
    cwd,
    originalCwd,
    paranoid = false,
    allowTmpdirVar = true,
    tmpdirOverridden = false,
  } = options;
  const anchoredCwd = originalCwd ?? cwd ?? null;
  const resolvedCwd = cwd ?? null;
  const trustTmpdirVar = allowTmpdirVar && !tmpdirOverridden;
  const ctx: RmContext = {
    anchoredCwd,
    resolvedCwd,
    paranoid,
    trustTmpdirVar,
    homeDir: getHomeDirForRmPolicy(),
  };

  if (!hasRecursiveForceFlags(tokens)) {
    return null;
  }

  const targets = extractTargets(tokens);

  for (const target of targets) {
    const classification = classifyTarget(target, ctx);
    const reason = reasonForClassification(classification, ctx);
    if (reason) {
      return reason;
    }
  }

  return null;
}

function extractTargets(tokens: readonly string[]): string[] {
  const targets: string[] = [];
  let pastDoubleDash = false;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token === '--') {
      pastDoubleDash = true;
      continue;
    }

    if (pastDoubleDash) {
      targets.push(token);
      continue;
    }

    if (!token.startsWith('-')) {
      targets.push(token);
    }
  }

  return targets;
}

function classifyTarget(target: string, ctx: RmContext): TargetClassification {
  if (isDangerousRootOrHomeTarget(target)) {
    return { kind: 'root_or_home_target' };
  }

  const anchoredCwd = ctx.anchoredCwd;
  if (anchoredCwd) {
    if (isCwdSelfTarget(target, anchoredCwd)) {
      return { kind: 'cwd_self_target' };
    }
  }

  if (isTempTarget(target, ctx.trustTmpdirVar)) {
    return { kind: 'temp_target' };
  }

  if (anchoredCwd) {
    if (isCwdHomeForRmPolicy(anchoredCwd, ctx.homeDir)) {
      return { kind: 'root_or_home_target' };
    }

    if (isTargetWithinCwd(target, anchoredCwd, ctx.resolvedCwd ?? anchoredCwd)) {
      return { kind: 'within_anchored_cwd' };
    }
  }

  return { kind: 'outside_anchored_cwd' };
}

function reasonForClassification(
  classification: TargetClassification,
  ctx: RmContext,
): string | null {
  switch (classification.kind) {
    case 'root_or_home_target':
      return REASON_RM_RF_ROOT_HOME;
    case 'cwd_self_target':
      return REASON_RM_RF;
    case 'temp_target':
      return null;
    case 'within_anchored_cwd':
      if (ctx.paranoid) {
        return `${REASON_RM_RF} (SAFETY_NET_PARANOID_RM enabled)`;
      }
      return null;
    case 'outside_anchored_cwd':
      return REASON_RM_RF;
  }
}

function isDangerousRootOrHomeTarget(path: string): boolean {
  const normalized = path.trim();

  if (normalized === '/' || normalized === '/*') {
    return true;
  }

  if (normalized === '~' || normalized === '~/' || normalized.startsWith('~/')) {
    if (normalized === '~' || normalized === '~/' || normalized === '~/*') {
      return true;
    }
  }

  if (normalized === '$HOME' || normalized === '$HOME/' || normalized === '$HOME/*') {
    return true;
  }

  if (normalized === '${HOME}' || normalized === '${HOME}/' || normalized === '${HOME}/*') {
    return true;
  }

  return false;
}

function isTempTarget(path: string, allowTmpdirVar: boolean): boolean {
  const normalized = path.trim();

  if (normalized.includes('..')) {
    return false;
  }

  if (normalized === '/tmp' || normalized.startsWith('/tmp/')) {
    return true;
  }

  if (normalized === '/var/tmp' || normalized.startsWith('/var/tmp/')) {
    return true;
  }

  const systemTmpdir = tmpdir();
  if (normalized.startsWith(`${systemTmpdir}/`) || normalized === systemTmpdir) {
    return true;
  }

  if (allowTmpdirVar) {
    if (normalized === '$TMPDIR' || normalized.startsWith('$TMPDIR/')) {
      return true;
    }
    if (normalized === '${TMPDIR}' || normalized.startsWith('${TMPDIR}/')) {
      return true;
    }
  }

  return false;
}

function getHomeDirForRmPolicy(): string {
  return process.env.HOME ?? homedir();
}

function isCwdHomeForRmPolicy(cwd: string, homeDir: string): boolean {
  try {
    const normalizedCwd = normalize(cwd);
    const normalizedHome = normalize(homeDir);
    return normalizedCwd === normalizedHome;
  } catch {
    return false;
  }
}

function isCwdSelfTarget(target: string, cwd: string): boolean {
  if (target === '.' || target === './') {
    return true;
  }

  try {
    const resolved = resolve(cwd, target);
    const realCwd = realpathSync(cwd);
    const realResolved = realpathSync(resolved);
    return realResolved === realCwd;
  } catch {
    // realpathSync throws if the path doesn't exist; fall back to a
    // normalize/resolve based comparison.
    try {
      const resolved = resolve(cwd, target);
      const normalizedCwd = normalize(cwd);
      return resolved === normalizedCwd;
    } catch {
      return false;
    }
  }
}

function isTargetWithinCwd(target: string, originalCwd: string, effectiveCwd?: string): boolean {
  const resolveCwd = effectiveCwd ?? originalCwd;
  if (target.startsWith('~') || target.startsWith('$HOME') || target.startsWith('${HOME}')) {
    return false;
  }

  if (target.includes('$') || target.includes('`')) {
    return false;
  }

  if (target.startsWith('/')) {
    try {
      const normalizedTarget = normalize(target);
      const normalizedCwd = `${normalize(originalCwd)}/`;
      return normalizedTarget.startsWith(normalizedCwd);
    } catch {
      return false;
    }
  }

  if (target.startsWith('./') || !target.includes('/')) {
    try {
      const resolved = resolve(resolveCwd, target);
      const normalizedOriginalCwd = normalize(originalCwd);
      return resolved.startsWith(`${normalizedOriginalCwd}/`) || resolved === normalizedOriginalCwd;
    } catch {
      return false;
    }
  }

  if (target.startsWith('../')) {
    return false;
  }

  try {
    const resolved = resolve(resolveCwd, target);
    const normalizedCwd = normalize(originalCwd);
    return resolved.startsWith(`${normalizedCwd}/`) || resolved === normalizedCwd;
  } catch {
    return false;
  }
}

export function isHomeDirectory(cwd: string): boolean {
  const home = process.env.HOME ?? homedir();
  try {
    const normalizedCwd = normalize(cwd);
    const normalizedHome = normalize(home);
    return normalizedCwd === normalizedHome;
  } catch {
    return false;
  }
}
