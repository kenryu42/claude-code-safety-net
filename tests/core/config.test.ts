import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import {
  getProjectConfigPath,
  getUserConfigPath,
  type LoadConfigOptions,
  loadConfig,
  validateConfig,
  validateConfigFile,
} from '@/core/config';

describe('config validation', () => {
  let tempDir: string;
  let userConfigDir: string;
  let loadOptions: LoadConfigOptions;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-config-'));
    userConfigDir = join(tempDir, '.cc-safety-net');
    loadOptions = { userConfigDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeProjectConfig(data: unknown): void {
    const path = join(tempDir, '.safety-net.json');
    if (typeof data === 'string') {
      writeFileSync(path, data, 'utf-8');
    } else {
      writeFileSync(path, JSON.stringify(data), 'utf-8');
    }
  }

  function loadFromProject(data: unknown) {
    writeProjectConfig(data);
    return loadConfig(tempDir, loadOptions);
  }

  describe('valid configs', () => {
    test('minimal valid config', () => {
      const config = loadFromProject({ version: 1 });
      expect(config.version).toBe(1);
      expect(config.rules).toEqual([]);
    });

    test('valid config with rules', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'block-git-add-all',
            command: 'git',
            subcommand: 'add',
            block_args: ['-A', '--all'],
            reason: 'Use specific files.',
          },
        ],
      });
      expect(config.rules.length).toBe(1);
      const rule = config.rules[0];
      expect(rule?.name).toBe('block-git-add-all');
      expect(rule?.command).toBe('git');
      expect(rule?.subcommand).toBe('add');
      expect(rule?.block_args).toEqual(['-A', '--all']);
      expect(rule?.reason).toBe('Use specific files.');
    });

    test('valid config without subcommand', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'block-npm-global',
            command: 'npm',
            block_args: ['-g'],
            reason: 'No global installs.',
          },
        ],
      });
      expect(config.rules.length).toBe(1);
      expect(config.rules[0]?.subcommand).toBeUndefined();
    });

    test('valid rule name patterns', () => {
      const validNames = [
        'a',
        'A',
        'rule1',
        'my-rule',
        'my_rule',
        'MyRule123',
        'a'.repeat(64), // max length
      ];
      for (const name of validNames) {
        const config = loadFromProject({
          version: 1,
          rules: [
            {
              name,
              command: 'git',
              block_args: ['-A'],
              reason: 'test',
            },
          ],
        });
        expect(config.rules[0]?.name).toBe(name);
      }
    });

    test('unknown fields ignored', () => {
      const config = loadFromProject({
        version: 1,
        future_field: 'ignored',
        rules: [
          {
            name: 'test',
            command: 'git',
            block_args: ['-A'],
            reason: 'test',
            unknown_rule_field: true,
          },
        ],
      });
      expect(config.rules.length).toBe(1);
    });
  });

  describe('invalid configs (all return default config silently)', () => {
    test('validateConfig rejects non-object', () => {
      const result = validateConfig(null);
      expect(result.errors).toEqual(['Config must be an object']);
    });

    test('invalid JSON syntax', () => {
      const config = loadFromProject('{ invalid json }');
      expect(config.rules).toEqual([]);
    });

    test('missing version', () => {
      const config = loadFromProject({ rules: [] });
      expect(config.rules).toEqual([]);
    });

    test('wrong version number', () => {
      const config = loadFromProject({ version: 2 });
      expect(config.rules).toEqual([]);
    });

    test('version not integer', () => {
      const config = loadFromProject({ version: '1' });
      expect(config.rules).toEqual([]);
    });

    test('missing required rule fields', () => {
      // Missing name
      let config = loadFromProject({
        version: 1,
        rules: [{ command: 'git', block_args: ['-A'], reason: 'x' }],
      });
      expect(config.rules).toEqual([]);

      // Missing command
      config = loadFromProject({
        version: 1,
        rules: [{ name: 'test', block_args: ['-A'], reason: 'x' }],
      });
      expect(config.rules).toEqual([]);

      // Missing block_args
      config = loadFromProject({
        version: 1,
        rules: [{ name: 'test', command: 'git', reason: 'x' }],
      });
      expect(config.rules).toEqual([]);

      // Missing reason
      config = loadFromProject({
        version: 1,
        rules: [{ name: 'test', command: 'git', block_args: ['-A'] }],
      });
      expect(config.rules).toEqual([]);
    });

    test('invalid name patterns', () => {
      const invalidNames = [
        '1rule', // starts with number
        '-rule', // starts with hyphen
        '_rule', // starts with underscore
        'rule with space', // contains space
        'rule.name', // contains dot
        'a'.repeat(65), // too long
        '', // empty
      ];
      for (const name of invalidNames) {
        const config = loadFromProject({
          version: 1,
          rules: [
            {
              name,
              command: 'git',
              block_args: ['-A'],
              reason: 'test',
            },
          ],
        });
        expect(config.rules).toEqual([]);
      }
    });

    test('invalid command patterns', () => {
      const invalidCommands = [
        '/usr/bin/git', // path, not just command
        'git add', // contains space
        '1git', // starts with number
        '', // empty
      ];
      for (const cmd of invalidCommands) {
        const config = loadFromProject({
          version: 1,
          rules: [
            {
              name: 'test',
              command: cmd,
              block_args: ['-A'],
              reason: 'test',
            },
          ],
        });
        expect(config.rules).toEqual([]);
      }
    });

    test('invalid subcommand patterns', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            subcommand: 'add files', // space
            block_args: ['-A'],
            reason: 'test',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('subcommand must be string when provided', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            subcommand: 123,
            block_args: ['-A'],
            reason: 'test',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('duplicate rule names case insensitive', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'MyRule',
            command: 'git',
            block_args: ['-A'],
            reason: 'test',
          },
          {
            name: 'myrule',
            command: 'npm',
            block_args: ['-g'],
            reason: 'test',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('empty block_args', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            block_args: [],
            reason: 'test',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('empty string in block_args', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            block_args: ['-A', ''],
            reason: 'test',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('non-string in block_args', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            block_args: ['-A', 123],
            reason: 'test',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('reason exceeds max length', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            block_args: ['-A'],
            reason: 'x'.repeat(257),
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('empty reason', () => {
      const config = loadFromProject({
        version: 1,
        rules: [
          {
            name: 'test',
            command: 'git',
            block_args: ['-A'],
            reason: '',
          },
        ],
      });
      expect(config.rules).toEqual([]);
    });

    test('empty config file', () => {
      const config = loadFromProject('');
      expect(config.rules).toEqual([]);
    });

    test('whitespace only config file', () => {
      const config = loadFromProject('   \n\t  ');
      expect(config.rules).toEqual([]);
    });

    test('config not object', () => {
      const config = loadFromProject('[]');
      expect(config.rules).toEqual([]);
    });

    test('rules not array', () => {
      const config = loadFromProject({ version: 1, rules: {} });
      expect(config.rules).toEqual([]);
    });

    test('rule not object', () => {
      const config = loadFromProject({
        version: 1,
        rules: ['not an object'],
      });
      expect(config.rules).toEqual([]);
    });
  });
});

describe('config scope merging', () => {
  let tempDir: string;
  let userConfigDir: string;
  let loadOptions: LoadConfigOptions;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-merge-'));
    userConfigDir = join(tempDir, '.cc-safety-net');
    loadOptions = { userConfigDir };
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeUserConfig(data: object): void {
    mkdirSync(userConfigDir, { recursive: true });
    writeFileSync(join(userConfigDir, 'config.json'), JSON.stringify(data), 'utf-8');
  }

  function writeProjectConfig(data: object): void {
    writeFileSync(join(tempDir, '.safety-net.json'), JSON.stringify(data), 'utf-8');
  }

  test('no config returns default', () => {
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules).toEqual([]);
  });

  test('user scope only', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'user-rule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.name).toBe('user-rule');
  });

  test('project scope only', () => {
    writeProjectConfig({
      version: 1,
      rules: [
        {
          name: 'project-rule',
          command: 'npm',
          block_args: ['-g'],
          reason: 'project',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.name).toBe('project-rule');
  });

  test('both scopes merged', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'user-rule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user',
        },
      ],
    });
    writeProjectConfig({
      version: 1,
      rules: [
        {
          name: 'project-rule',
          command: 'npm',
          block_args: ['-g'],
          reason: 'project',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(2);
    const ruleNames = new Set(config.rules.map((r) => r.name));
    expect(ruleNames).toEqual(new Set(['user-rule', 'project-rule']));
  });

  test('project overrides user on duplicate', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'shared-rule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user version',
        },
      ],
    });
    writeProjectConfig({
      version: 1,
      rules: [
        {
          name: 'shared-rule',
          command: 'git',
          block_args: ['--all'],
          reason: 'project version',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.reason).toBe('project version');
    expect(config.rules[0]?.block_args).toEqual(['--all']);
  });

  test('project overrides case insensitive', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'MyRule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user',
        },
      ],
    });
    writeProjectConfig({
      version: 1,
      rules: [
        {
          name: 'myrule',
          command: 'npm',
          block_args: ['-g'],
          reason: 'project',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.name).toBe('myrule');
    expect(config.rules[0]?.reason).toBe('project');
  });

  test('mixed override and merge', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'shared-rule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user shared',
        },
        {
          name: 'user-only',
          command: 'rm',
          block_args: ['-rf'],
          reason: 'user only',
        },
      ],
    });
    writeProjectConfig({
      version: 1,
      rules: [
        {
          name: 'shared-rule',
          command: 'git',
          block_args: ['--all'],
          reason: 'project shared',
        },
        {
          name: 'project-only',
          command: 'npm',
          block_args: ['-g'],
          reason: 'project only',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(3);

    const rulesByName = Object.fromEntries(config.rules.map((r) => [r.name, r]));
    expect(rulesByName['shared-rule']?.reason).toBe('project shared');
    expect(rulesByName['user-only']?.reason).toBe('user only');
    expect(rulesByName['project-only']?.reason).toBe('project only');
  });

  test('invalid user config ignored', () => {
    mkdirSync(userConfigDir, { recursive: true });
    writeFileSync(join(userConfigDir, 'config.json'), '{"version": 2}', 'utf-8');

    writeProjectConfig({
      version: 1,
      rules: [
        {
          name: 'project-rule',
          command: 'npm',
          block_args: ['-g'],
          reason: 'project',
        },
      ],
    });
    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.name).toBe('project-rule');
  });

  test('invalid project config ignored', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'user-rule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user',
        },
      ],
    });
    writeFileSync(join(tempDir, '.safety-net.json'), '{"version": 2}', 'utf-8');

    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.name).toBe('user-rule');
  });

  test('both invalid returns default', () => {
    mkdirSync(userConfigDir, { recursive: true });
    writeFileSync(join(userConfigDir, 'config.json'), '{"version": 2}', 'utf-8');
    writeFileSync(join(tempDir, '.safety-net.json'), 'invalid json', 'utf-8');

    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules).toEqual([]);
  });

  test('empty project rules still merges', () => {
    writeUserConfig({
      version: 1,
      rules: [
        {
          name: 'user-rule',
          command: 'git',
          block_args: ['-A'],
          reason: 'user',
        },
      ],
    });
    writeProjectConfig({ version: 1, rules: [] });

    const config = loadConfig(tempDir, loadOptions);
    expect(config.rules.length).toBe(1);
    expect(config.rules[0]?.name).toBe('user-rule');
  });
});

describe('validate config file', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'safety-net-validate-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('valid file returns empty errors', () => {
    const path = join(tempDir, 'config.json');
    writeFileSync(path, JSON.stringify({ version: 1 }), 'utf-8');
    const result = validateConfigFile(path);
    expect(result.errors).toEqual([]);
  });

  test('nonexistent file returns error', () => {
    const result = validateConfigFile('/nonexistent/config.json');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('not found');
  });

  test('invalid file returns errors', () => {
    const path = join(tempDir, 'config.json');
    writeFileSync(path, JSON.stringify({ version: 2 }), 'utf-8');
    const result = validateConfigFile(path);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('version');
  });

  test('empty file returns error', () => {
    const path = join(tempDir, 'config.json');
    writeFileSync(path, '', 'utf-8');
    const result = validateConfigFile(path);
    expect(result.errors).toEqual(['Config file is empty']);
  });
});

describe('config path helpers', () => {
  test('getUserConfigPath returns the expected suffix', () => {
    const p = getUserConfigPath();
    expect(p).toContain(`${sep}.cc-safety-net${sep}config.json`);
  });

  test('getProjectConfigPath resolves cwd', () => {
    expect(getProjectConfigPath('/tmp')).toBe(resolve('/tmp', '.safety-net.json'));
  });
});
