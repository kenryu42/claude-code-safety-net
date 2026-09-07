import { describe, expect, test } from 'bun:test';
import { resolve, sep } from 'node:path';
import { createTestEnvironment } from '@/core/environment';
import {
  getLocalRulebookPath,
  getPolicyPaths,
  getProjectPolicyPath,
  getProjectRulesConfigPath,
  getProjectRulesDir,
  getUserPolicyPath,
  getUserRulesConfigPath,
  getUserRulesDir,
  type RulesPolicyOptions,
} from '@/core/policy/paths';

/**
 * Path resolution is pure computation over the caller's options and the environment, so every row
 * states the absolute path it must produce. The filesystem scope each config is read inside is
 * part of that: it is the capability that bounds the read, and a scope rooted one directory too
 * high would let a symlinked config escape the scope it belongs to.
 */

/** The paths are joined with the host's separator; the rows spell them with `/`. */
const slash = (path: string) => path.split(sep).join('/');

// Absolute on the host: Windows resolves a `/`-rooted spelling onto the current drive, and the
// rows are the paths the resolver produces from them.
const ROOT = slash(resolve('/srv/root'));
const NESTED = slash(resolve('/srv/root/workspaces/app'));
const OUTSIDE = slash(resolve('/srv/policy-paths-sibling'));
const HOME = slash(resolve('/srv/home/tester'));

const environmentWith = (safetyNetHome?: string) =>
  createTestEnvironment({
    env: new Map(safetyNetHome ? [['CC_SAFETY_NET_HOME', safetyNetHome]] : []),
    home: HOME,
  });

const USER_SCOPES: readonly {
  readonly behavior: string;
  readonly safetyNetHome?: string;
  readonly options: Omit<RulesPolicyOptions, 'cwd'>;
  readonly rulesDir: string;
  readonly configPath: string;
  readonly policyPath: string;
  /** The root of the capability the user config is read inside. */
  readonly scopeRoot: string;
  readonly targetRelativePath: string;
}[] = [
  {
    behavior: 'an explicit user config directory holds rule.json and its parent holds policy.json',
    options: { userConfigDir: `${ROOT}/user/rules` },
    rulesDir: `${ROOT}/user/rules`,
    configPath: `${ROOT}/user/rules/rule.json`,
    policyPath: `${ROOT}/user/policy.json`,
    scopeRoot: `${ROOT}/user`,
    targetRelativePath: 'rules/rule.json',
  },
  {
    behavior: 'an explicit user config file names its own directory as the rules directory',
    options: { userConfigPath: `${ROOT}/custom/home/rules/rule.json` },
    rulesDir: `${ROOT}/custom/home/rules`,
    configPath: `${ROOT}/custom/home/rules/rule.json`,
    policyPath: `${ROOT}/custom/home/policy.json`,
    scopeRoot: `${ROOT}/custom/home`,
    targetRelativePath: 'rules/rule.json',
  },
  {
    behavior: 'CC_SAFETY_NET_HOME relocates the whole user scope',
    safetyNetHome: `${ROOT}/sn-home`,
    options: {},
    rulesDir: `${ROOT}/sn-home/rules`,
    configPath: `${ROOT}/sn-home/rules/rule.json`,
    policyPath: `${ROOT}/sn-home/policy.json`,
    scopeRoot: `${ROOT}/sn-home`,
    targetRelativePath: 'rules/rule.json',
  },
  {
    behavior: 'with nothing set the user scope is .cc-safety-net under the home directory',
    options: {},
    rulesDir: `${HOME}/.cc-safety-net/rules`,
    configPath: `${HOME}/.cc-safety-net/rules/rule.json`,
    policyPath: `${HOME}/.cc-safety-net/policy.json`,
    scopeRoot: `${HOME}/.cc-safety-net`,
    targetRelativePath: 'rules/rule.json',
  },
];

describe('the user policy scope', () => {
  test.each(USER_SCOPES.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    const environment = environmentWith(row.safetyNetHome);
    expect(slash(getUserRulesDir(environment, row.options))).toBe(row.rulesDir);
    expect(slash(getUserRulesConfigPath(environment, row.options))).toBe(row.configPath);
    expect(slash(getUserPolicyPath(environment, row.options))).toBe(row.policyPath);

    const paths = getPolicyPaths(environment, { cwd: ROOT, ...row.options });
    expect(slash(paths.userConfigPath)).toBe(row.configPath);
    expect(slash(paths.userScope.root)).toBe(row.scopeRoot);
    expect(paths.userScope.label).toBe('user policy');
    expect(slash(paths.userConfigTarget.path)).toBe(row.configPath);
    expect(slash(paths.userConfigTarget.relativePath)).toBe(row.targetRelativePath);
  });

  test.each(
    USER_SCOPES.map((row) => [row.behavior, row] as const),
  )('a local rulebook lives in a directory of its own beside rule.json — %s', (_behavior, row) => {
    expect(
      slash(
        getLocalRulebookPath(
          getUserRulesDir(environmentWith(row.safetyNetHome), row.options),
          'team-rules',
        ),
      ),
    ).toBe(`${row.rulesDir}/team-rules/rulebook.json`);
  });
});

const PROJECT_SCOPES: readonly {
  readonly behavior: string;
  readonly cwd: string;
  readonly projectConfigPath?: string;
  readonly configPath: string;
  readonly scopeRoot: string;
  readonly targetRelativePath: string;
}[] = [
  {
    behavior: 'the default project config sits under the project directory',
    cwd: ROOT,
    configPath: `${ROOT}/.cc-safety-net/rules/rule.json`,
    scopeRoot: ROOT,
    targetRelativePath: '.cc-safety-net/rules/rule.json',
  },
  {
    behavior: 'a nested project directory carries its own project scope',
    cwd: NESTED,
    configPath: `${NESTED}/.cc-safety-net/rules/rule.json`,
    scopeRoot: NESTED,
    targetRelativePath: '.cc-safety-net/rules/rule.json',
  },
  {
    behavior: 'a config named inside the project keeps the project directory as its scope root',
    cwd: NESTED,
    projectConfigPath: `${NESTED}/config/rules/rule.json`,
    configPath: `${NESTED}/config/rules/rule.json`,
    scopeRoot: NESTED,
    targetRelativePath: 'config/rules/rule.json',
  },
  {
    // A config outside the project cannot be read inside the project's capability, so the scope
    // is rebound to the config's own grandparent instead of widening the project scope.
    behavior: 'a config outside the project is scoped to its own grandparent directory',
    cwd: ROOT,
    projectConfigPath: `${OUTSIDE}/.cc-safety-net/rules/rule.json`,
    configPath: `${OUTSIDE}/.cc-safety-net/rules/rule.json`,
    scopeRoot: `${OUTSIDE}/.cc-safety-net`,
    targetRelativePath: 'rules/rule.json',
  },
];

describe('the project policy scope', () => {
  test.each(PROJECT_SCOPES.map((row) => [row.behavior, row] as const))('%s', (_behavior, row) => {
    const options: RulesPolicyOptions = {
      cwd: row.cwd,
      ...(row.projectConfigPath ? { projectConfigPath: row.projectConfigPath } : {}),
    };
    const paths = getPolicyPaths(environmentWith(), options);
    expect(slash(paths.projectConfigPath)).toBe(row.configPath);
    expect(slash(paths.projectScope.root)).toBe(row.scopeRoot);
    expect(paths.projectScope.label).toBe('project policy');
    expect(slash(paths.projectConfigTarget.path)).toBe(row.configPath);
    expect(slash(paths.projectConfigTarget.relativePath)).toBe(row.targetRelativePath);
  });

  test.each([
    ['the project directory itself', ROOT],
    ['a nested project directory', NESTED],
  ])('%s holds its rules and policy under .cc-safety-net', (_behavior, cwd) => {
    expect(slash(getProjectRulesDir(cwd))).toBe(`${cwd}/.cc-safety-net/rules`);
    expect(slash(getProjectRulesConfigPath(cwd))).toBe(`${cwd}/.cc-safety-net/rules/rule.json`);
    expect(slash(getProjectPolicyPath(cwd))).toBe(`${cwd}/.cc-safety-net/policy.json`);
  });

  test('a trailing separator on the project directory resolves to the same paths', () => {
    expect(getProjectRulesDir(`${NESTED}/`)).toBe(getProjectRulesDir(NESTED));
    expect(getProjectRulesConfigPath(`${NESTED}/`)).toBe(getProjectRulesConfigPath(NESTED));
    expect(getProjectPolicyPath(`${NESTED}/`)).toBe(getProjectPolicyPath(NESTED));
    expect(slash(getPolicyPaths(environmentWith(), { cwd: `${NESTED}/` }).projectScope.root)).toBe(
      NESTED,
    );
  });
});
