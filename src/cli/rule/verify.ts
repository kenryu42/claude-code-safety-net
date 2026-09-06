import { join, resolve } from 'node:path';
import { colors } from '@/cli/utils/colors';
import type { Environment } from '@/core/environment';
import {
  bindDelegatedPolicyFilesystemTarget,
  getPolicyFilesystemTargetForPath,
  PolicyFilesystemError,
  type PolicyFilesystemTarget,
  readPolicyDirectoryEntries,
  readPolicyFile,
  writePolicyFileAtomic,
} from '@/core/io/safe-read';
import {
  getLegacyProjectConfigPath,
  getLegacyUserRulesConfigPath,
  type ValidationResult,
  validateConfigFile,
  validateRulesConfigFile,
} from '@/core/policy/config-file';
import {
  getPolicyPaths,
  getProjectRulesConfigPath,
  getUserRulesConfigPath,
} from '@/core/policy/paths';
import { assertValidRulebook } from '@/core/policy/rulebook';
import { getRulesConfigRuntimeErrorsForConfig } from '@/core/policy/scope-policy';
import { NAME_PATTERN, RULES_DIR } from '@/core/policy/source-syntax';
import { evaluateRulebookFixtures } from '@/gate/rulebook-fixtures';

const VERIFY_HEADER = 'CC Safety Net Config';
const VERIFY_SEPARATOR = '═'.repeat(VERIFY_HEADER.length);
const RULES_SCHEMA_URL =
  'https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json';
const RULES_DIR_RESERVED_ENTRIES = new Set(['rule.json', 'rule.lock', 'cache']);

type RulesConfigSchemaKind = 'rules' | 'legacy';

interface RulesVerifyOptions {
  cwd?: string;
  userConfigPath?: string;
  projectConfigPath?: string;
  legacyUserConfigPath?: string;
  legacyProjectConfigPath?: string;
}

export function runRulesVerify(environment: Environment, options: RulesVerifyOptions = {}): number {
  try {
    return runRulesVerifyInternal(environment, options);
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

function runRulesVerifyInternal(environment: Environment, options: RulesVerifyOptions): number {
  const cwd = options.cwd ?? process.cwd();
  const userConfig = options.userConfigPath ?? getUserRulesConfigPath(environment);
  const projectConfig = options.projectConfigPath ?? getProjectRulesConfigPath(cwd);
  const legacyUserConfig =
    options.legacyUserConfigPath ?? getLegacyUserRulesConfigPath(environment);
  const legacyProjectConfig = options.legacyProjectConfigPath ?? getLegacyProjectConfigPath(cwd);
  const githubSourceRulesDir = resolve(cwd, RULES_DIR);
  const paths = getPolicyPaths(environment, {
    cwd,
    userConfigPath: userConfig,
    projectConfigPath: projectConfig,
  });
  const defaultPaths = getPolicyPaths(environment, { cwd });
  const userConfigTarget = getPolicyFilesystemTargetForPath(paths.userScope, userConfig);
  const projectConfigTarget = getPolicyFilesystemTargetForPath(paths.projectScope, projectConfig);
  const legacyUserTarget = options.legacyUserConfigPath
    ? bindDelegatedPolicyFilesystemTarget(options.legacyUserConfigPath, 'user policy')
    : getPolicyFilesystemTargetForPath(defaultPaths.userScope, legacyUserConfig);
  const legacyProjectTarget = options.legacyProjectConfigPath
    ? bindDelegatedPolicyFilesystemTarget(options.legacyProjectConfigPath, 'project policy')
    : getPolicyFilesystemTargetForPath(defaultPaths.projectScope, legacyProjectConfig);

  let hasErrors = false;
  let hasWarnings = false;
  const configsChecked: Array<{
    scope: string;
    path: string;
    result: ValidationResult;
    schema: RulesConfigSchemaKind;
    target: PolicyFilesystemTarget;
    inactive?: boolean;
  }> = [];
  const warnings: string[] = [];
  const githubSourceRules = getGitHubSourceRulesValidation(
    getPolicyFilesystemTargetForPath(defaultPaths.projectScope, githubSourceRulesDir),
  );

  printRulesVerifyHeader();

  if (readPolicyFile(userConfigTarget) !== null) {
    const result = validateRulesConfigFile(userConfigTarget);
    result.errors.push(...getRulesConfigRuntimeErrorsForConfig(userConfig, paths.userScope));
    configsChecked.push({
      scope: 'User',
      path: userConfig,
      result,
      schema: 'rules',
      target: userConfigTarget,
    });
    if (result.errors.length > 0) hasErrors = true;
  }

  if (readPolicyFile(legacyUserTarget) !== null) {
    hasWarnings = true;
    if (readPolicyFile(userConfigTarget) !== null) {
      warnings.push(getLegacyRulesConfigWarning('user', 'cleanup'));
    } else {
      const result = validateConfigFile(legacyUserTarget);
      configsChecked.push({
        scope: 'User',
        path: legacyUserConfig,
        result,
        schema: 'legacy',
        inactive: true,
        target: legacyUserTarget,
      });
      warnings.push(
        getLegacyRulesConfigWarning('user', result.errors.length > 0 ? 'fix-or-delete' : 'migrate'),
      );
      if (result.errors.length > 0) hasErrors = true;
    }
  }

  if (readPolicyFile(projectConfigTarget) !== null) {
    const result = validateRulesConfigFile(projectConfigTarget);
    result.errors.push(...getRulesConfigRuntimeErrorsForConfig(projectConfig, paths.projectScope));
    configsChecked.push({
      scope: 'Project',
      path: resolve(projectConfig),
      result,
      schema: 'rules',
      target: projectConfigTarget,
    });
    if (result.errors.length > 0) hasErrors = true;
    if (readPolicyFile(legacyProjectTarget) !== null) {
      hasWarnings = true;
      warnings.push(getLegacyRulesConfigWarning('project', 'cleanup'));
    }
  } else if (readPolicyFile(legacyProjectTarget) !== null) {
    hasWarnings = true;
    hasErrors = true;
    const result = validateConfigFile(legacyProjectTarget);
    configsChecked.push({
      scope: 'Project',
      path: resolve(legacyProjectConfig),
      result,
      schema: 'legacy',
      inactive: true,
      target: legacyProjectTarget,
    });
    warnings.push(
      getLegacyRulesConfigWarning(
        'project',
        result.errors.length > 0 ? 'fix-or-delete' : 'migrate',
      ),
    );
  }

  if (githubSourceRules?.result.errors.length) hasErrors = true;

  if (configsChecked.length === 0 && !githubSourceRules) {
    console.log('\nNo config files found. Using built-in rules only.');
    return 0;
  }

  for (const config of configsChecked) {
    if (config.inactive) {
      printInactiveLegacyRulesConfig(config.scope, config.path, config.result);
    } else if (config.result.errors.length > 0) {
      printInvalidRulesConfig(config.scope, config.path, config.result.errors);
    } else {
      if (config.schema === 'rules' && addRulesSchemaIfMissing(config.target)) {
        console.log(`\nAdded $schema to ${config.scope.toLowerCase()} config.`);
      }
      printValidRulesConfig(config.scope, config.path, config.result, config.schema);
    }
  }

  for (const warning of warnings) console.error(`\n${colors.red(warning)}`);

  if (githubSourceRules) {
    if (githubSourceRules.result.errors.length > 0) {
      printInvalidGitHubSourceRules(githubSourceRules.path, githubSourceRules.result.errors);
    } else {
      printValidGitHubSourceRules(githubSourceRules.path, githubSourceRules.result);
    }
  }

  if (hasErrors) {
    console.error('\nConfig validation failed.');
    return 1;
  }

  console.log(hasWarnings ? '\nConfigs valid with warnings.' : '\nAll configs valid.');
  return 0;
}

function getLegacyRulesConfigWarning(
  scope: 'project' | 'user',
  action: 'cleanup' | 'migrate' | 'fix-or-delete',
): string {
  const label = `legacy ${scope} config`;
  if (action === 'cleanup') {
    return `Warning: Legacy ${scope} config is no longer needed. Run \`npx -y cc-safety-net rule migrate --cleanup\` to clean it up safely.`;
  }
  if (action === 'migrate') {
    return `Warning: Legacy ${scope} config is ignored by CC Safety Net. Run \`npx -y cc-safety-net rule migrate\`.`;
  }
  return `Warning: Legacy ${scope} config is no longer supported. Fix or delete the ${label}, then run \`npx -y cc-safety-net rule migrate\`.`;
}

function getGitHubSourceRulesValidation(
  target: PolicyFilesystemTarget,
): { path: string; result: ValidationResult } | null {
  if (readPolicyDirectoryEntries(target) === null) return null;
  const result = validateGitHubSourceRules(target);
  if (result.ruleNames.size === 0 && result.errors.length === 0) return null;
  return { path: target.path, result };
}

function validateGitHubSourceRules(target: PolicyFilesystemTarget): ValidationResult {
  const errors: string[] = [];
  const ruleNames = new Set<string>();
  const entries = (readPolicyDirectoryEntries(target) ?? [])
    .filter((entry) => !RULES_DIR_RESERVED_ENTRIES.has(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    return { errors, ruleNames };
  }

  for (const entry of entries) {
    if (!NAME_PATTERN.test(entry.name)) {
      errors.push(`rulebook directory names must match ${NAME_PATTERN}: ${entry.name}`);
      continue;
    }
    if (entry.kind !== 'directory') {
      errors.push(`${entry.name} must be a rulebook directory`);
      continue;
    }

    const rulebookTarget = getPolicyFilesystemTargetForPath(
      target.scope,
      join(target.path, entry.name, 'rulebook.json'),
    );
    const content = readPolicyFile(rulebookTarget);
    if (content === null) {
      errors.push(`${entry.name}/rulebook.json is required`);
      continue;
    }

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content) as unknown;
      } catch {
        errors.push(`${entry.name}/rulebook.json: invalid JSON`);
        continue;
      }
      const rulebook = assertValidRulebook(parsed);
      if (rulebook.name !== entry.name) {
        errors.push(`rulebook name "${rulebook.name}" must match folder "${entry.name}"`);
        continue;
      }
      const fixtureFailures = evaluateRulebookFixtures(rulebook);
      if (fixtureFailures.length > 0) {
        errors.push(...fixtureFailures.map((failure) => `${entry.name}/rulebook.json: ${failure}`));
        continue;
      }
      ruleNames.add(entry.name);
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `${entry.name}/rulebook.json: ${error.message}`
          : `${entry.name}/rulebook.json: ${String(error)}`,
      );
    }
  }

  return { errors, ruleNames };
}

function printRulesVerifyHeader(): void {
  console.log(VERIFY_HEADER);
  console.log(VERIFY_SEPARATOR);
}

function printValidRulesConfig(
  scope: string,
  path: string,
  result: ValidationResult,
  schema: RulesConfigSchemaKind,
): void {
  console.log(`\n✓ ${scope} config: ${path}`);
  console.log(`  Schema: ${schema === 'rules' ? 'rulebook sources' : 'legacy inline rules'}`);
  if (result.ruleNames.size > 0) {
    console.log(`  ${schema === 'rules' ? 'Sources' : 'Rules'}:`);
    let i = 1;
    for (const name of result.ruleNames) {
      console.log(`    ${i}. ${name}`);
      i++;
    }
  } else {
    console.log(`  ${schema === 'rules' ? 'Sources' : 'Rules'}: (none)`);
  }
}

function printInactiveLegacyRulesConfig(
  scope: string,
  path: string,
  result: ValidationResult,
): void {
  console.error(`\n✗ Legacy ${scope.toLowerCase()} config: ${path}`);
  console.error('  Schema: legacy inline rules');
  console.error('  Status: ignored by CC Safety Net');
  if (result.errors.length > 0) {
    console.error('  Errors:');
    let errorNum = 1;
    for (const error of result.errors) {
      for (const part of error.split('; ')) {
        console.error(`    ${errorNum}. ${part}`);
        errorNum++;
      }
    }
    return;
  }
  if (result.ruleNames.size > 0) {
    console.error('  Rules:');
    let i = 1;
    for (const name of result.ruleNames) {
      console.error(`    ${i}. ${name}`);
      i++;
    }
    return;
  }
  console.error('  Rules: (none)');
}

function printInvalidRulesConfig(scope: string, path: string, errors: string[]): void {
  printInvalidVerifyTarget(`${scope} config`, path, errors);
}

function printValidGitHubSourceRules(path: string, result: ValidationResult): void {
  console.log(`\n✓ GitHub source rules: ${path}`);
  console.log('  Rulebooks:');
  let i = 1;
  for (const name of result.ruleNames) {
    console.log(`    ${i}. ${name}`);
    i++;
  }
}

function printInvalidGitHubSourceRules(path: string, errors: string[]): void {
  printInvalidVerifyTarget('GitHub source rules', path, errors);
}

function printInvalidVerifyTarget(label: string, path: string, errors: string[]): void {
  console.error(`\n✗ ${label}: ${path}`);
  console.error('  Errors:');
  let errorNum = 1;
  for (const error of errors) {
    for (const part of error.split('; ')) {
      console.error(`    ${errorNum}. ${part}`);
      errorNum++;
    }
  }
}

function addRulesSchemaIfMissing(target: PolicyFilesystemTarget): boolean {
  try {
    const content = readPolicyFile(target);
    if (content === null) return false;
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (parsed.$schema) return false;

    writePolicyFileAtomic(
      target,
      JSON.stringify({ $schema: RULES_SCHEMA_URL, ...parsed }, null, 2),
    );
    return true;
  } catch (error) {
    if (error instanceof PolicyFilesystemError) throw error;
    return false;
  }
}
