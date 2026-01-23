/**
 * Verify user and project scope config files for safety-net.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getProjectConfigPath,
  getUserConfigPath,
  type ValidationResult,
  validateConfigFile,
} from '@/core/config';

export interface VerifyConfigOptions {
  userConfigPath?: string;
  projectConfigPath?: string;
}

const HEADER = 'Safety Net Config';
const SEPARATOR = '═'.repeat(HEADER.length);
const SCHEMA_URL =
  'https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json';

function printHeader(): void {
  console.log(HEADER);
  console.log(SEPARATOR);
}

function printValidConfig(scope: string, path: string, result: ValidationResult): void {
  console.log(`\n✓ ${scope} config: ${path}`);
  if (result.ruleNames.size > 0) {
    console.log('  Rules:');
    let i = 1;
    for (const name of result.ruleNames) {
      console.log(`    ${i}. ${name}`);
      i++;
    }
  } else {
    console.log('  Rules: (none)');
  }
}

function printInvalidConfig(scope: string, path: string, errors: string[]): void {
  console.error(`\n✗ ${scope} config: ${path}`);
  console.error('  Errors:');
  let errorNum = 1;
  for (const error of errors) {
    for (const part of error.split('; ')) {
      console.error(`    ${errorNum}. ${part}`);
      errorNum++;
    }
  }
}

function addSchemaIfMissing(path: string): boolean {
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    if (parsed.$schema) {
      return false;
    }

    const updated = { $schema: SCHEMA_URL, ...parsed };
    writeFileSync(path, JSON.stringify(updated, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify config files and print results.
 * @returns Exit code (0 = success, 1 = errors found)
 */
export function verifyConfig(options: VerifyConfigOptions = {}): number {
  const userConfig = options.userConfigPath ?? getUserConfigPath();
  const projectConfig = options.projectConfigPath ?? getProjectConfigPath();

  let hasErrors = false;
  const configsChecked: Array<{
    scope: string;
    path: string;
    result: ValidationResult;
  }> = [];

  printHeader();

  if (existsSync(userConfig)) {
    const result = validateConfigFile(userConfig);
    configsChecked.push({ scope: 'User', path: userConfig, result });
    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }

  if (existsSync(projectConfig)) {
    const result = validateConfigFile(projectConfig);
    configsChecked.push({
      scope: 'Project',
      path: resolve(projectConfig),
      result,
    });
    if (result.errors.length > 0) {
      hasErrors = true;
    }
  }

  if (configsChecked.length === 0) {
    console.log('\nNo config files found. Using built-in rules only.');
    return 0;
  }

  for (const { scope, path, result } of configsChecked) {
    if (result.errors.length > 0) {
      printInvalidConfig(scope, path, result.errors);
    } else {
      if (addSchemaIfMissing(path)) {
        console.log(`\nAdded $schema to ${scope.toLowerCase()} config.`);
      }
      printValidConfig(scope, path, result);
    }
  }

  if (hasErrors) {
    console.error('\nConfig validation failed.');
    return 1;
  }

  console.log('\nAll configs valid.');
  return 0;
}
