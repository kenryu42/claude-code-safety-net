import { describe, expect, test } from 'bun:test';
import { checkCustomRules } from '@/core/rules-custom';
import type { CustomRule } from '@/types';

describe('custom rule matching', () => {
  test('basic command match', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-git-add-all',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A', '--all'],
        reason: 'Use specific files.',
      },
    ];
    const result = checkCustomRules(['git', 'add', '-A'], rules);
    expect(result).toBe('[block-git-add-all] Use specific files.');
  });

  test('match with long option form', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-git-add-all',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A', '--all'],
        reason: 'Use specific files.',
      },
    ];
    const result = checkCustomRules(['git', 'add', '--all'], rules);
    expect(result).toBe('[block-git-add-all] Use specific files.');
  });

  test('no match when command differs', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-git-add-all',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules(['npm', 'add', '-A'], rules);
    expect(result).toBeNull();
  });

  test('no match when subcommand differs', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-git-add-all',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules(['git', 'commit', '-A'], rules);
    expect(result).toBeNull();
  });

  test('no match when no blocked args present', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-git-add-all',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A', '--all'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules(['git', 'add', 'file.txt'], rules);
    expect(result).toBeNull();
  });

  test('rule without subcommand matches any invocation', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-npm-global',
        command: 'npm',
        subcommand: undefined,
        block_args: ['-g', '--global'],
        reason: 'No global installs.',
      },
    ];
    // Match with install subcommand
    let result = checkCustomRules(['npm', 'install', '-g', 'pkg'], rules);
    expect(result).toBe('[block-npm-global] No global installs.');

    // Match with uninstall subcommand too
    result = checkCustomRules(['npm', 'uninstall', '-g', 'pkg'], rules);
    expect(result).toBe('[block-npm-global] No global installs.');
  });

  test('multiple rules first match wins', () => {
    const rules: CustomRule[] = [
      {
        name: 'rule1',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A'],
        reason: 'Rule 1 reason',
      },
      {
        name: 'rule2',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A'],
        reason: 'Rule 2 reason',
      },
    ];
    const result = checkCustomRules(['git', 'add', '-A'], rules);
    expect(result).toBe('[rule1] Rule 1 reason');
  });

  test('case sensitive command matching', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: undefined,
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    // Lowercase git matches
    let result = checkCustomRules(['git', '-A'], rules);
    expect(result).toBe('[test] test');

    // Uppercase GIT does NOT match (case-sensitive)
    result = checkCustomRules(['GIT', '-A'], rules);
    expect(result).toBeNull();
  });

  test('case sensitive arg matching', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: undefined,
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    // -A matches
    let result = checkCustomRules(['git', '-A'], rules);
    expect(result).not.toBeNull();

    // -a does NOT match
    result = checkCustomRules(['git', '-a'], rules);
    expect(result).toBeNull();
  });

  test('args with values can be matched', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'docker',
        subcommand: 'run',
        block_args: ['--privileged'],
        reason: 'No privileged mode.',
      },
    ];
    const result = checkCustomRules(['docker', 'run', '--privileged', 'image'], rules);
    expect(result).toBe('[test] No privileged mode.');
  });

  test('subcommand with options before - git -C handled correctly', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'push',
        block_args: ['--force'],
        reason: 'No force push.',
      },
    ];
    // git -C /path push --force: correctly identifies push as subcommand
    let result = checkCustomRules(['git', '-C', '/path', 'push', '--force'], rules);
    expect(result).toBe('[test] No force push.');

    // Attached form -C/path also works
    result = checkCustomRules(['git', '-C/path', 'push', '--force'], rules);
    expect(result).toBe('[test] No force push.');
  });

  test('docker compose pattern', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-docker-compose-up',
        command: 'docker',
        subcommand: 'compose',
        block_args: ['up'],
        reason: 'No docker compose up.',
      },
    ];
    const result = checkCustomRules(['docker', 'compose', 'up', '-d'], rules);
    expect(result).toBe('[block-docker-compose-up] No docker compose up.');
  });

  test('empty tokens returns null', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: undefined,
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules([], rules);
    expect(result).toBeNull();
  });

  test('empty rules returns null', () => {
    const result = checkCustomRules(['git', 'add', '-A'], []);
    expect(result).toBeNull();
  });

  test('command with path normalized', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: undefined,
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules(['/usr/bin/git', '-A'], rules);
    expect(result).toBe('[test] test');
  });

  test('block args with equals value', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'npm',
        subcommand: 'config',
        block_args: ['--location=global'],
        reason: 'No global config.',
      },
    ];
    const tokens = ['npm', 'config', 'set', '--location=global'];
    const result = checkCustomRules(tokens, rules);
    expect(result).toBe('[test] No global config.');
  });

  test('block dot for git add', () => {
    const rules: CustomRule[] = [
      {
        name: 'block-git-add-dot',
        command: 'git',
        subcommand: 'add',
        block_args: ['.'],
        reason: 'Use specific files.',
      },
    ];
    let result = checkCustomRules(['git', 'add', '.'], rules);
    expect(result).toBe('[block-git-add-dot] Use specific files.');

    // git add file.txt should pass
    result = checkCustomRules(['git', 'add', 'file.txt'], rules);
    expect(result).toBeNull();
  });

  test('multiple blocked args any matches', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A', '--all', '.', '-u'],
        reason: 'No blanket add.',
      },
    ];
    // Each blocked arg should trigger
    for (const arg of ['-A', '--all', '.', '-u']) {
      const result = checkCustomRules(['git', 'add', arg], rules);
      expect(result).not.toBeNull();
    }
  });

  test('combined short options expanded', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    // -Ap contains -A, so it should be blocked
    const result = checkCustomRules(['git', 'add', '-Ap'], rules);
    expect(result).toBe('[test] test');
  });

  test('combined short options case sensitive', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'add',
        block_args: ['-A'],
        reason: 'test',
      },
    ];
    // -ap does NOT contain -A (lowercase a != uppercase A)
    const result = checkCustomRules(['git', 'add', '-ap'], rules);
    expect(result).toBeNull();
  });

  test('combined short options multiple flags', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'add',
        block_args: ['-u'],
        reason: 'test',
      },
    ];
    // -Aup contains -u
    const result = checkCustomRules(['git', 'add', '-Aup'], rules);
    expect(result).toBe('[test] test');
  });

  test('long options not expanded', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'add',
        block_args: ['--all'],
        reason: 'test',
      },
    ];
    // --all-files is not --all
    const result = checkCustomRules(['git', 'add', '--all-files'], rules);
    expect(result).toBeNull();
  });

  test('subcommand after double dash', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'checkout',
        block_args: ['--force'],
        reason: 'test',
      },
    ];
    // git -- checkout --force: subcommand is checkout after --
    const result = checkCustomRules(['git', '--', 'checkout', '--force'], rules);
    expect(result).toBe('[test] test');
  });

  test('no subcommand after double dash at end', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'push',
        block_args: ['--force'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules(['git', '--'], rules);
    expect(result).toBeNull();
  });

  test('long option with equals', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'push',
        block_args: ['--force'],
        reason: 'test',
      },
    ];
    const result = checkCustomRules(['git', '--config=foo', 'push', '--force'], rules);
    expect(result).toBe('[test] test');
  });

  test('long option without equals', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'push',
        block_args: ['--force'],
        reason: 'test',
      },
    ];
    // --verbose is a flag, push is subcommand
    const result = checkCustomRules(['git', '--verbose', 'push', '--force'], rules);
    expect(result).toBe('[test] test');
  });

  test('attached short option value', () => {
    const rules: CustomRule[] = [
      {
        name: 'test',
        command: 'git',
        subcommand: 'push',
        block_args: ['--force'],
        reason: 'test',
      },
    ];
    // -C/path is attached, so push is next
    const result = checkCustomRules(['git', '-C/path', 'push', '--force'], rules);
    expect(result).toBe('[test] test');
  });
});
