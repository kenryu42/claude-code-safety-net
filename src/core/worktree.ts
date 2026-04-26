import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const GIT_GLOBAL_OPTS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-c',
  '-C',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--super-prefix',
  '--config-env',
]);

const GIT_CONTEXT_ENV_OVERRIDES = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR'] as const;

export interface GitExecutionContext {
  gitCwd: string | null;
  hasExplicitGitContext: boolean;
}

export function hasGitContextEnvOverride(envAssignments?: ReadonlyMap<string, string>): boolean {
  for (const name of GIT_CONTEXT_ENV_OVERRIDES) {
    if (envAssignments?.has(name) || Object.hasOwn(process.env, name)) {
      return true;
    }
  }
  return false;
}

export function getGitExecutionContext(
  tokens: readonly string[],
  cwd: string | undefined,
): GitExecutionContext {
  if (!cwd) {
    return { gitCwd: null, hasExplicitGitContext: false };
  }

  let gitCwd = resolve(cwd);
  if (!isDirectory(gitCwd)) {
    return { gitCwd: null, hasExplicitGitContext: false };
  }

  let hasExplicitGitContext = false;
  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      break;
    }

    if (!token.startsWith('-')) {
      break;
    }

    if (token === '-C') {
      const target = tokens[i + 1];
      if (!target) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      const resolvedCwd = resolveGitCwd(gitCwd, target);
      if (!resolvedCwd) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      gitCwd = resolvedCwd;
      i += 2;
      continue;
    }

    if (token.startsWith('-C') && token.length > 2) {
      const resolvedCwd = resolveGitCwd(gitCwd, token.slice(2));
      if (!resolvedCwd) {
        return { gitCwd: null, hasExplicitGitContext };
      }
      gitCwd = resolvedCwd;
      i++;
      continue;
    }

    if (token === '--git-dir' || token === '--work-tree') {
      hasExplicitGitContext = true;
      i += 2;
      continue;
    }

    if (token.startsWith('--git-dir=') || token.startsWith('--work-tree=')) {
      hasExplicitGitContext = true;
      i++;
      continue;
    }

    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
    } else if (token.startsWith('-c') && token.length > 2) {
      i++;
    } else {
      i++;
    }
  }

  return { gitCwd, hasExplicitGitContext };
}

export function isLinkedWorktree(cwd: string): boolean {
  const dotGitPath = findDotGit(cwd);
  if (!dotGitPath) {
    return false;
  }

  try {
    const stat = statSync(dotGitPath);
    if (!stat.isFile()) {
      return false;
    }

    const content = readFileSync(dotGitPath, 'utf-8');
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (!firstLine.startsWith('gitdir:')) {
      return false;
    }

    const rawGitDir = firstLine.slice('gitdir:'.length).trim();
    if (rawGitDir === '') {
      return false;
    }

    const gitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir);
    return existsSync(join(gitDir, 'commondir'));
  } catch {
    return false;
  }
}

function resolveGitCwd(baseCwd: string, target: string): string | null {
  const resolved = isAbsolute(target) ? target : resolve(baseCwd, target);
  return isDirectory(resolved) ? resolved : null;
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findDotGit(cwd: string): string | null {
  let current: string;
  try {
    current = realpathSync(cwd);
  } catch {
    return null;
  }

  while (true) {
    const dotGitPath = join(current, '.git');
    if (existsSync(dotGitPath)) {
      return dotGitPath;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}
