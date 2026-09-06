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
  normalize,
  recordPorted,
  removeTempRoots,
  rootFolds,
} from '../helpers/temp-home';

/**
 * `getScopePaths` decides which config a rule command writes and which root bounds the write, so
 * a scope resolved one directory too high would let a write escape its capability. Each row
 * resolves the selection through an `Environment` over its own root and records the whole
 * projection with that root spelled `<root>`.
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

const ROWS: Array<{ name: string; options: (root: string) => SyncRulesConfigOptions }> = [
  {
    name: 'the project scope under the working directory',
    options: (root) => ({ cwd: join(root, 'project') }),
  },
  {
    name: 'the user scope under the relocated safety-net home',
    options: (root) => ({ cwd: join(root, 'project'), global: true }),
  },
  {
    name: 'an explicit user config path',
    options: (root) => ({
      cwd: join(root, 'project'),
      global: true,
      userConfigPath: join(root, 'elsewhere', 'rules', 'rule.json'),
    }),
  },
  {
    name: 'an explicit user config directory',
    options: (root) => ({
      cwd: join(root, 'project'),
      global: true,
      userConfigDir: join(root, 'elsewhere', 'rules'),
    }),
  },
  {
    name: 'a project config inside the working directory',
    options: (root) => ({
      cwd: join(root, 'project'),
      projectConfigPath: join(root, 'project', 'nested', 'rules', 'rule.json'),
    }),
  },
  {
    name: 'a project config outside the working directory',
    options: (root) => ({
      cwd: join(root, 'project'),
      projectConfigPath: join(root, 'sibling', '.cc-safety-net', 'rules', 'rule.json'),
    }),
  },
];

describe('getScopePaths resolves the scope the shipped module resolves', () => {
  test.each(ROWS)('$name', (row) => {
    const { ported } = sides('scope-paths');
    const portedScope = scopeOf(
      getScopePaths(environmentFor(ported.home, ported.values), row.options(ported.root)),
    );
    expect(normalize(portedScope, [[ported.root, '<root>']])).toMatchSnapshot();
  });

  test('an omitted working directory falls back to the process one', () => {
    const { ported } = sides('scope-paths-cwd');
    const portedScope = withCwd(ported.project, () =>
      scopeOf(getScopePaths(environmentFor(ported.home, ported.values), {})),
    );
    expect(portedScope.configPath).toBe(
      join(ported.project, '.cc-safety-net', 'rules', 'rule.json'),
    );
    expect(normalize(portedScope, [[ported.root, '<root>']])).toMatchSnapshot();
  });
});

describe('the retired lock and legacy paths resolve where the shipped ones resolve', () => {
  test('the user lockfile follows the relocated safety-net home', () => {
    const { ported } = sides('lock-user');
    recordPorted(
      getUserRulesLockPath(environmentFor(ported.home, ported.values)),
      rootFolds(ported.root),
    );
  });

  test('an explicit user config directory moves the user lockfile', () => {
    const { ported } = sides('lock-user-dir');
    const options = (root: string) => ({ userConfigDir: join(root, 'elsewhere', 'rules') });
    recordPorted(
      getUserRulesLockPath(environmentFor(ported.home, ported.values), options(ported.root)),
      rootFolds(ported.root),
    );
  });

  test('the project lockfile sits beside the project rule config', () => {
    const root = createTempRoot('lock-project-');
    recordPorted(getProjectRulesLockPath(join(root, 'project')), rootFolds(root));
  });

  test('the legacy project config sits at the working directory root', () => {
    const root = createTempRoot('legacy-project-');
    recordPorted(getLegacyProjectRulesConfigPath({ cwd: join(root, 'project') }), rootFolds(root));
  });

  test('an omitted working directory falls back to the process one for the legacy config', () => {
    const root = createTempRoot('legacy-project-cwd-');
    recordPorted(
      withCwd(join(root, 'project'), () => getLegacyProjectRulesConfigPath()),
      rootFolds(root),
    );
  });
});
