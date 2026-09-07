import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import {
  getLegacyProjectRulesConfigPath,
  getProjectRulesLockPath,
  getScopePaths,
  getUserRulesLockPath,
} from '@/rules-manager/paths';
import type { SyncRulesConfigOptions } from '@/rules-manager/types';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * `getScopePaths` decides which config a rule command writes and which root bounds the write, so
 * a scope resolved one directory too high would let a write escape its capability. Each row
 * resolves the selection through an `Environment` over its own root and names the directory the
 * config lands in, the root that bounds the write, and the scope it is labelled with.
 */

afterEach(removeTempRoots);

/** The scope as data: the branded capability objects differ per module, their paths do not. */
function scopeOf(paths: {
  configDir: string;
  configPath: string;
  lockPath: string;
  filesystemScope: { root: string; label: string };
  configTarget: { path: string };
  lockTarget: { path: string };
}) {
  return {
    configDir: paths.configDir,
    configPath: paths.configPath,
    lockPath: paths.lockPath,
    root: paths.filesystemScope.root,
    label: paths.filesystemScope.label,
    configTarget: paths.configTarget.path,
    lockTarget: paths.lockTarget.path,
  };
}

function withCwd<T>(cwd: string, run: () => T): T {
  const spy = spyOn(process, 'cwd').mockReturnValue(cwd);
  try {
    return run();
  } finally {
    spy.mockRestore();
  }
}

/** One temp root, with the home and project layout inside it. */
function sides(label: string) {
  const side = (name: string) => {
    const root = createTempRoot(`${label}-${name}-`);
    const home = join(root, 'home');
    return { root, home, project: join(root, 'project'), values: isolationEnv(home) };
  };
  return { ported: side('ported') };
}

const ROWS: Array<{
  name: string;
  options: (root: string) => SyncRulesConfigOptions;
  configDir: (root: string) => string;
  root: (root: string) => string;
  label: 'project policy' | 'user policy';
}> = [
  {
    name: 'the project scope under the working directory',
    options: (root) => ({ cwd: join(root, 'project') }),
    configDir: (root) => join(root, 'project', '.cc-safety-net', 'rules'),
    root: (root) => join(root, 'project'),
    label: 'project policy',
  },
  {
    name: 'the user scope under the relocated safety-net home',
    options: (root) => ({ cwd: join(root, 'project'), global: true }),
    configDir: (root) => join(root, 'home', '.cc-safety-net', 'rules'),
    // The user scope may write anywhere under the safety-net home, not only the rules directory.
    root: (root) => join(root, 'home', '.cc-safety-net'),
    label: 'user policy',
  },
  {
    name: 'an explicit user config path',
    options: (root) => ({
      cwd: join(root, 'project'),
      global: true,
      userConfigPath: join(root, 'elsewhere', 'rules', 'rule.json'),
    }),
    configDir: (root) => join(root, 'elsewhere', 'rules'),
    root: (root) => join(root, 'elsewhere'),
    label: 'user policy',
  },
  {
    name: 'an explicit user config directory',
    options: (root) => ({
      cwd: join(root, 'project'),
      global: true,
      userConfigDir: join(root, 'elsewhere', 'rules'),
    }),
    configDir: (root) => join(root, 'elsewhere', 'rules'),
    root: (root) => join(root, 'elsewhere'),
    label: 'user policy',
  },
  {
    name: 'a project config inside the working directory',
    options: (root) => ({
      cwd: join(root, 'project'),
      projectConfigPath: join(root, 'project', 'nested', 'rules', 'rule.json'),
    }),
    configDir: (root) => join(root, 'project', 'nested', 'rules'),
    // The working directory still bounds the write, not the nested directory the config sits in.
    root: (root) => join(root, 'project'),
    label: 'project policy',
  },
  {
    name: 'a project config outside the working directory',
    options: (root) => ({
      cwd: join(root, 'project'),
      projectConfigPath: join(root, 'sibling', '.cc-safety-net', 'rules', 'rule.json'),
    }),
    configDir: (root) => join(root, 'sibling', '.cc-safety-net', 'rules'),
    // A config outside the working directory carries its own bound: the safety-net directory
    // above it, so the write cannot reach the rest of the sibling checkout.
    root: (root) => join(root, 'sibling', '.cc-safety-net'),
    label: 'project policy',
  },
];

/** The config and the lock sit in the scope's directory, and each target repeats its own path. */
function scopeIn(configDir: string, root: string, label: string) {
  return {
    configDir,
    configPath: join(configDir, 'rule.json'),
    lockPath: join(configDir, 'rule.lock'),
    configTarget: join(configDir, 'rule.json'),
    lockTarget: join(configDir, 'rule.lock'),
    root,
    label,
  };
}

describe('getScopePaths resolves the scope the shipped module resolves', () => {
  test.each(ROWS)('$name', (row) => {
    const { ported } = sides('scope-paths');
    expect(
      scopeOf(getScopePaths(environmentFor(ported.home, ported.values), row.options(ported.root))),
    ).toEqual(scopeIn(row.configDir(ported.root), row.root(ported.root), row.label));
  });

  test('an omitted working directory falls back to the process one', () => {
    const { ported } = sides('scope-paths-cwd');
    expect(
      withCwd(ported.project, () =>
        scopeOf(getScopePaths(environmentFor(ported.home, ported.values), {})),
      ),
    ).toEqual(
      scopeIn(join(ported.project, '.cc-safety-net', 'rules'), ported.project, 'project policy'),
    );
  });
});

describe('the retired lock and legacy paths resolve where the shipped ones resolve', () => {
  test('the user lockfile follows the relocated safety-net home', () => {
    const { ported } = sides('lock-user');
    expect(getUserRulesLockPath(environmentFor(ported.home, ported.values))).toBe(
      join(ported.home, '.cc-safety-net', 'rules', 'rule.lock'),
    );
  });

  test('an explicit user config directory moves the user lockfile', () => {
    const { ported } = sides('lock-user-dir');
    expect(
      getUserRulesLockPath(environmentFor(ported.home, ported.values), {
        userConfigDir: join(ported.root, 'elsewhere', 'rules'),
      }),
    ).toBe(join(ported.root, 'elsewhere', 'rules', 'rule.lock'));
  });

  test('the project lockfile sits beside the project rule config', () => {
    const root = createTempRoot('lock-project-');
    expect(getProjectRulesLockPath(join(root, 'project'))).toBe(
      join(root, 'project', '.cc-safety-net', 'rules', 'rule.lock'),
    );
  });

  test('the legacy project config sits at the working directory root', () => {
    const root = createTempRoot('legacy-project-');
    expect(getLegacyProjectRulesConfigPath({ cwd: join(root, 'project') })).toBe(
      join(root, 'project', '.safety-net.json'),
    );
  });

  test('an omitted working directory falls back to the process one for the legacy config', () => {
    const root = createTempRoot('legacy-project-cwd-');
    expect(withCwd(join(root, 'project'), () => getLegacyProjectRulesConfigPath())).toBe(
      join(root, 'project', '.safety-net.json'),
    );
  });
});
