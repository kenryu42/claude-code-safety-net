import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeCommand } from '@/core/analyze';
import { loadConfig } from '@/core/config';

function writeConfig(dir: string, data: object): void {
  const path = join(dir, '.safety-net.json');
  writeFileSync(path, JSON.stringify(data), 'utf-8');
}

function runGuard(command: string, cwd?: string): string | null {
  const config = loadConfig(cwd);
  return analyzeCommand(command, { cwd, config })?.reason ?? null;
}

function assertBlocked(command: string, reasonContains: string, cwd?: string): void {
  const result = runGuard(command, cwd);
  expect(result).not.toBeNull();
  expect(result).toContain(reasonContains);
}

function assertAllowed(command: string, cwd?: string): void {
  const result = runGuard(command, cwd);
  expect(result).toBeNull();
}

describe('custom rules integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-custom-rules-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('custom rule blocks command', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-git-add-all',
          command: 'git',
          subcommand: 'add',
          block_args: ['-A', '--all', '.'],
          reason: 'Use specific files.',
        },
      ],
    });
    assertBlocked('git add -A', '[block-git-add-all] Use specific files.', tempDir);
  });

  test('custom rule blocks with dot', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-git-add-all',
          command: 'git',
          subcommand: 'add',
          block_args: ['-A', '--all', '.'],
          reason: 'Use specific files.',
        },
      ],
    });
    assertBlocked('git add .', '[block-git-add-all]', tempDir);
  });

  test('custom rule allows non-matching command', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-git-add-all',
          command: 'git',
          subcommand: 'add',
          block_args: ['-A'],
          reason: 'Use specific files.',
        },
      ],
    });
    assertAllowed('git add file.txt', tempDir);
  });

  test('builtin rule takes precedence', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'custom-reset-rule',
          command: 'git',
          subcommand: 'reset',
          block_args: ['--soft'],
          reason: 'Custom reason.',
        },
      ],
    });
    // Built-in rule blocks git reset --hard, not custom rule
    assertBlocked('git reset --hard', 'git reset --hard destroys', tempDir);
  });

  test('multiple custom rules - any match triggers block', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-git-add-all',
          command: 'git',
          subcommand: 'add',
          block_args: ['-A'],
          reason: 'No blanket add.',
        },
        {
          name: 'block-npm-global',
          command: 'npm',
          subcommand: 'install',
          block_args: ['-g'],
          reason: 'No global installs.',
        },
      ],
    });
    assertBlocked('git add -A', '[block-git-add-all]', tempDir);
    assertBlocked('npm install -g pkg', '[block-npm-global]', tempDir);
  });

  test('rule without subcommand matches any invocation', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-npm-global',
          command: 'npm',
          block_args: ['-g', '--global'],
          reason: 'No global.',
        },
      ],
    });
    assertBlocked('npm install -g pkg', '[block-npm-global]', tempDir);
    assertBlocked('npm uninstall -g pkg', '[block-npm-global]', tempDir);
  });

  test('no config uses builtin only', () => {
    // tempDir has no config file
    assertBlocked('git reset --hard', 'git reset --hard destroys', tempDir);
    assertAllowed('git add -A', tempDir);
  });

  test('empty rules list uses builtin only', () => {
    writeConfig(tempDir, { version: 1, rules: [] });
    assertBlocked('git reset --hard', 'git reset --hard destroys', tempDir);
    assertAllowed('git add -A', tempDir);
  });

  test('invalid config uses builtin only', () => {
    const path = join(tempDir, '.safety-net.json');
    writeFileSync(path, '{"version": 2}', 'utf-8');

    assertBlocked('git reset --hard', 'git reset --hard destroys', tempDir);
    assertAllowed('echo hello', tempDir);
  });

  test('custom rules not applied to embedded commands', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-git-add-all',
          command: 'git',
          subcommand: 'add',
          block_args: ['-A'],
          reason: 'No blanket add.',
        },
      ],
    });
    // Direct command is blocked
    assertBlocked('git add -A', '[block-git-add-all]', tempDir);
    // Embedded in bash -c is NOT blocked by custom rule (per spec)
    assertAllowed("bash -c 'git add -A'", tempDir);
  });

  test('custom rules apply to xargs', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-xargs-grep',
          command: 'xargs',
          block_args: ['grep'],
          reason: 'Use ripgrep instead.',
        },
      ],
    });
    assertBlocked('find . | xargs grep pattern', '[block-xargs-grep]', tempDir);
  });

  test('custom rules apply to parallel', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-parallel-curl',
          command: 'parallel',
          block_args: ['curl'],
          reason: 'No parallel curl.',
        },
      ],
    });
    assertBlocked('parallel curl ::: url1 url2', '[block-parallel-curl]', tempDir);
  });

  test('attached option value not false positive', () => {
    writeConfig(tempDir, {
      version: 1,
      rules: [
        {
          name: 'block-p-flag',
          command: 'git',
          block_args: ['-p'],
          reason: 'No -p allowed.',
        },
      ],
    });
    // -C/path/to/project contains 'p' in the path, but should NOT match -p
    assertAllowed('git -C/path/to/project status', tempDir);
  });
});
