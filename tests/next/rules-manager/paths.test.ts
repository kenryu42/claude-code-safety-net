import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { join } from 'node:path';
import {
  getLegacyProjectRulesConfigPath,
  getProjectRulesLockPath,
  getScopePaths,
  getUserRulesLockPath,
} from '@next/rules-manager/paths';
import type { SyncRulesConfigOptions } from '@next/rules-manager/types';
import {
  getLegacyProjectRulesConfigPath as shippedLegacyProjectRulesConfigPath,
  getProjectRulesLockPath as shippedProjectRulesLockPath,
  getScopePaths as shippedScopePaths,
  getUserRulesLockPath as shippedUserRulesLockPath,
} from '@/rules/policy/paths';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  recordPorted,
  removeTempRoots,
  rootFolds,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * `getScopePaths` decides which config a rule command writes and which root bounds the write, so
 * a scope resolved one directory too high would let a write escape its capability. Each row
 * resolves the same selection twice — the shipped module through `process.env` and `process.cwd`,
 * the ported one through an `Environment` over a second root — and compares the whole projection
 * with each side's own root spelled `<root>`.
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

/** One temp root per side, each with the same home and project layout inside it. */
function sides(label: string) {
  const side = (name: string) => {
    const root = createTempRoot(`${label}-${name}-`);
    const home = join(root, 'home');
    return { root, home, project: join(root, 'project'), values: isolationEnv(home) };
  };
  return { shipped: side('shipped'), ported: side('ported') };
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
    const { shipped, ported } = sides('scope-paths');
    const shippedScope = withProcessEnv(shipped.values, () =>
      scopeOf(shippedScopePaths(row.options(shipped.root))),
    );
    const portedScope = scopeOf(
      getScopePaths(environmentFor(ported.home, ported.values), row.options(ported.root)),
    );
    const scope = normalize(portedScope, [[ported.root, '<root>']]);
    expect(scope).toEqual(normalize(shippedScope, [[shipped.root, '<root>']]));
    expect(scope).toMatchSnapshot();
  });

  test('an omitted working directory falls back to the process one', () => {
    const { shipped, ported } = sides('scope-paths-cwd');
    const shippedScope = withProcessEnv(shipped.values, () =>
      withCwd(shipped.project, () => scopeOf(shippedScopePaths({}))),
    );
    const portedScope = withCwd(ported.project, () =>
      scopeOf(getScopePaths(environmentFor(ported.home, ported.values), {})),
    );
    const scope = normalize(portedScope, [[ported.root, '<root>']]);
    expect(scope).toEqual(normalize(shippedScope, [[shipped.root, '<root>']]));
    expect(portedScope.configPath).toBe(
      join(ported.project, '.cc-safety-net', 'rules', 'rule.json'),
    );
    expect(scope).toMatchSnapshot();
  });
});

describe('the retired lock and legacy paths resolve where the shipped ones resolve', () => {
  test('the user lockfile follows the relocated safety-net home', () => {
    const { shipped, ported } = sides('lock-user');
    const lock = getUserRulesLockPath(environmentFor(ported.home, ported.values));
    expect(lock).toBe(
      withProcessEnv(shipped.values, () => shippedUserRulesLockPath()).replace(
        shipped.root,
        ported.root,
      ),
    );
    recordPorted(lock, rootFolds(ported.root));
  });

  test('an explicit user config directory moves the user lockfile', () => {
    const { shipped, ported } = sides('lock-user-dir');
    const options = (root: string) => ({ userConfigDir: join(root, 'elsewhere', 'rules') });
    const lock = getUserRulesLockPath(
      environmentFor(ported.home, ported.values),
      options(ported.root),
    );
    expect(lock).toBe(
      withProcessEnv(shipped.values, () => shippedUserRulesLockPath(options(shipped.root))).replace(
        shipped.root,
        ported.root,
      ),
    );
    recordPorted(lock, rootFolds(ported.root));
  });

  test('the project lockfile sits beside the project rule config', () => {
    const root = createTempRoot('lock-project-');
    const lock = getProjectRulesLockPath(join(root, 'project'));
    expect(lock).toBe(shippedProjectRulesLockPath(join(root, 'project')));
    recordPorted(lock, rootFolds(root));
  });

  test('the legacy project config sits at the working directory root', () => {
    const root = createTempRoot('legacy-project-');
    const legacy = getLegacyProjectRulesConfigPath({ cwd: join(root, 'project') });
    expect(legacy).toBe(shippedLegacyProjectRulesConfigPath({ cwd: join(root, 'project') }));
    recordPorted(legacy, rootFolds(root));
  });

  test('an omitted working directory falls back to the process one for the legacy config', () => {
    const root = createTempRoot('legacy-project-cwd-');
    const legacy = withCwd(join(root, 'project'), () => getLegacyProjectRulesConfigPath());
    expect(legacy).toBe(
      withCwd(join(root, 'project'), () => shippedLegacyProjectRulesConfigPath()),
    );
    recordPorted(legacy, rootFolds(root));
  });
});
