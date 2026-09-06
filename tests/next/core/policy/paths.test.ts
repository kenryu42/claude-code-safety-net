import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { createTestEnvironment } from '@next/core/environment';
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
} from '@next/core/policy/paths';
import { getUserPolicyPath as shippedGetUserPolicyPath } from '@/policy/store';
import {
  getLocalRulebookPath as shippedGetLocalRulebookPath,
  getPolicyPaths as shippedGetPolicyPaths,
  getProjectPolicyPath as shippedGetProjectPolicyPath,
  getProjectRulesConfigPath as shippedGetProjectRulesConfigPath,
  getProjectRulesDir as shippedGetProjectRulesDir,
  getUserRulesConfigPath as shippedGetUserRulesConfigPath,
  getUserRulesDir as shippedGetUserRulesDir,
} from '@/rules/policy/paths';
import { withEnv } from '../../../helpers';
import { recordPorted, rootFolds } from '../../helpers/temp-home';

const root = mkdtempSync(join(tmpdir(), 'next-policy-paths-'));
const outside = join(dirname(root), 'policy-paths-sibling');
const nested = join(root, 'workspaces', 'app');

afterAll(() => rmSync(root, { recursive: true, force: true }));

/** The fields both PolicyPaths shapes share; the capability brands differ by module. */
function comparablePolicyPaths(paths: {
  userConfigPath: string;
  projectConfigPath: string;
  userScope: { root: string; label: string };
  projectScope: { root: string; label: string };
  userConfigTarget: { path: string; relativePath: string };
  projectConfigTarget: { path: string; relativePath: string };
}) {
  return {
    userConfigPath: paths.userConfigPath,
    projectConfigPath: paths.projectConfigPath,
    userScopeRoot: paths.userScope.root,
    userScopeLabel: paths.userScope.label,
    projectScopeRoot: paths.projectScope.root,
    projectScopeLabel: paths.projectScope.label,
    userTargetPath: paths.userConfigTarget.path,
    userTargetRelativePath: paths.userConfigTarget.relativePath,
    projectTargetPath: paths.projectConfigTarget.path,
    projectTargetRelativePath: paths.projectConfigTarget.relativePath,
  };
}

const SCOPES: Array<{
  name: string;
  safetyNetHome?: string;
  options: (cwd: string) => Omit<RulesPolicyOptions, 'cwd'>;
}> = [
  { name: 'user config dir', options: () => ({ userConfigDir: join(root, 'user', 'rules') }) },
  {
    name: 'user config path',
    options: () => ({ userConfigPath: join(root, 'custom', 'home', 'rules', 'rule.json') }),
  },
  {
    name: 'project config under cwd',
    options: (cwd) => ({ projectConfigPath: join(cwd, 'config', 'rules', 'rule.json') }),
  },
  {
    name: 'project config outside cwd',
    options: () => ({
      projectConfigPath: join(outside, '.cc-safety-net', 'rules', 'rule.json'),
    }),
  },
  { name: 'safety net home set', safetyNetHome: join(root, 'sn-home'), options: () => ({}) },
  { name: 'safety net home unset', options: () => ({}) },
];

const WORKING_DIRECTORIES = [root, nested, `${nested}${sep}`];

/** Every real directory a resolved path can name. */
const PATH_FOLDS = [[outside, '<outside>'], ...rootFolds(root), [homedir(), '<home>']] as const;

describe('policy paths parity', () => {
  for (const scope of SCOPES) {
    for (const cwd of WORKING_DIRECTORIES) {
      test(`${scope.name} from ${cwd === root ? 'root' : cwd.endsWith(sep) ? 'nested with separator' : 'nested'}`, () => {
        const options: RulesPolicyOptions = { cwd, ...scope.options(cwd) };
        const shipped = withEnv({ CC_SAFETY_NET_HOME: scope.safetyNetHome }, () => ({
          policyPaths: comparablePolicyPaths(shippedGetPolicyPaths(options)),
          userPolicyPath: shippedGetUserPolicyPath(options),
          projectPolicyPath: shippedGetProjectPolicyPath(cwd),
          userRulesDir: shippedGetUserRulesDir(options),
          userRulesConfigPath: shippedGetUserRulesConfigPath(options),
          projectRulesDir: shippedGetProjectRulesDir(cwd),
          projectRulesConfigPath: shippedGetProjectRulesConfigPath(cwd),
          localRulebookPath: shippedGetLocalRulebookPath(
            shippedGetUserRulesDir(options),
            'team-rules',
          ),
        }));
        const environment = createTestEnvironment({
          env: new Map(scope.safetyNetHome ? [['CC_SAFETY_NET_HOME', scope.safetyNetHome]] : []),
          home: homedir(),
        });
        const resolved = {
          policyPaths: comparablePolicyPaths(getPolicyPaths(environment, options)),
          userPolicyPath: getUserPolicyPath(environment, options),
          projectPolicyPath: getProjectPolicyPath(cwd),
          userRulesDir: getUserRulesDir(environment, options),
          userRulesConfigPath: getUserRulesConfigPath(environment, options),
          projectRulesDir: getProjectRulesDir(cwd),
          projectRulesConfigPath: getProjectRulesConfigPath(cwd),
          localRulebookPath: getLocalRulebookPath(
            getUserRulesDir(environment, options),
            'team-rules',
          ),
        };
        expect(resolved).toStrictEqual(shipped);
        recordPorted(resolved, PATH_FOLDS);
      });
    }
  }
});
