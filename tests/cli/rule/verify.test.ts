import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { join, posix } from 'node:path';
import { runRulesVerify as portedRulesVerify } from '@/cli/rule/verify';
import { snapshotTree, type TreeSpec, writeTree } from '../../helpers/fixture-tree';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  normalize,
  removeTempRoots,
  WINDOWS_SEPARATOR_FOLDS,
} from '../../helpers/temp-home';

/**
 * `rule verify` is the one diagnostic that writes: a valid config missing its `$schema` gets one
 * inserted. So each case compares the printed report, the exit code and the tree the run left
 * behind, over the same fixture built twice.
 */

afterEach(() => {
  removeTempRoots();
});

const RULEBOOK = (name: string, fixture: Record<string, unknown>) =>
  JSON.stringify({
    rulebook_version: 2,
    name,
    version: '1.0.0',
    allowed_commands: ['docker'],
    rules: [
      {
        name: 'block-system-prune',
        command: 'docker',
        match: { command_path: ['system', 'prune'] },
        reason: 'Prune everything and an unrelated stopped container goes with it.',
      },
    ],
    tests: [fixture],
  });

const PASSING_FIXTURE = {
  command: 'docker system prune',
  expect: 'blocked',
  rule: 'block-system-prune',
};
const FAILING_FIXTURE = { command: 'docker ps', expect: 'blocked', rule: 'block-system-prune' };

const USER_RULES_CONFIG = 'home/.cc-safety-net/rules/rule.json';
const USER_RULEBOOK = 'home/.cc-safety-net/rules/team-rules/rulebook.json';
const SCHEMA_STAMPED_CONFIG = JSON.stringify({ $schema: 'x', version: 1, rules: [] });
const LEGACY_USER_CONFIG = 'home/.cc-safety-net/config.json';
const PROJECT_RULES_CONFIG = 'project/.cc-safety-net/rules/rule.json';
const LEGACY_PROJECT_CONFIG = 'project/.safety-net.json';

const LEGACY_RULES = JSON.stringify({
  version: 1,
  rules: [
    {
      name: 'no-force-push',
      command: 'git',
      subcommand: 'push',
      block_args: ['--force'],
      reason: 'Force pushing rewrites history other clones already have.',
    },
  ],
});

function runVerify(label: string, spec: TreeSpec, call: (context: VerifyContext) => number) {
  const root = createTempRoot(`verify-${label}-`);
  const home = join(root, 'home');
  const env = isolationEnv(home);
  writeTree(root, spec);
  // The report is one stream to the reader, so both channels land in one list in call order.
  const written: string[] = [];
  const spies = (['log', 'error'] as const).map((channel) =>
    spyOn(console, channel).mockImplementation((...parts: unknown[]) => {
      written.push(parts.join(' '));
    }),
  );
  try {
    const code = call({ home, env, cwd: join(root, 'project') });
    return normalize({ code, written, tree: snapshotTree(root) }, [
      [root, '<root>'],
      ...WINDOWS_SEPARATOR_FOLDS,
    ]);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
}

type VerifyContext = { home: string; env: Record<string, string | undefined>; cwd: string };

const configContent = (tree: ReturnType<typeof snapshotTree>, path: string) =>
  tree.find((entry) => entry.path === path)?.content;

function verifyBothWays(spec: TreeSpec) {
  const ported = runVerify('ported', spec, (context) =>
    portedRulesVerify(environmentFor(context.home, context.env), { cwd: context.cwd }),
  );
  expect(ported).toMatchSnapshot();
  return { ...ported, report: ported.written.join('\n') };
}

describe('rule verify', () => {
  test('no config anywhere reports the built-in rules alone', () => {
    const outcome = verifyBothWays({});
    expect(outcome.code).toBe(0);
    expect(outcome.written).toEqual([
      'CC Safety Net Config',
      '════════════════════',
      '\nNo config files found. Using built-in rules only.',
    ]);
  });

  test('a valid user config gains its schema and lists its sources', () => {
    const outcome = verifyBothWays({
      [USER_RULES_CONFIG]: JSON.stringify({ version: 1, rules: ['team-rules'] }),
      [USER_RULEBOOK]: RULEBOOK('team-rules', PASSING_FIXTURE),
    });
    expect(outcome.code).toBe(0);
    expect(outcome.report).toContain('\nAdded $schema to user config.');
    expect(outcome.report).toContain(
      `✓ User config: ${posix.join('<root>', 'home', '.cc-safety-net', 'rules', 'rule.json')}`,
    );
    expect(outcome.report).toContain('    1. team-rules');
    expect(outcome.report).toContain('\nAll configs valid.');
    // The insertion is the only write the command makes, and it leads the rewritten file.
    expect(configContent(outcome.tree, USER_RULES_CONFIG)).toContain(`{\n  "$schema": "https:`);
  });

  test('an unparseable user config is reported as invalid', () => {
    const outcome = verifyBothWays({ [USER_RULES_CONFIG]: 'not json' });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain('✗ User config: ');
    expect(outcome.report).toContain('    1. Invalid JSON');
    expect(outcome.report).toContain('\nConfig validation failed.');
    expect(configContent(outcome.tree, USER_RULES_CONFIG)).toBe('not json');
  });

  test('an override naming no rule its sources define is a runtime error', () => {
    const outcome = verifyBothWays({
      [USER_RULES_CONFIG]: JSON.stringify({
        version: 1,
        rules: ['team-rules'],
        overrides: { 'team-rules/no-such-rule': 'off' },
      }),
      [USER_RULEBOOK]: RULEBOOK('team-rules', PASSING_FIXTURE),
    });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain('unknown override key "team-rules/no-such-rule" in ');
    // A config the run refused is a config it does not rewrite.
    expect(configContent(outcome.tree, USER_RULES_CONFIG)).not.toContain('$schema');
  });

  test('a rulebook whose fixture fails is reported by index', () => {
    const outcome = verifyBothWays({
      'project/.cc-safety-net/rules/broken-rules/rulebook.json': RULEBOOK(
        'broken-rules',
        FAILING_FIXTURE,
      ),
    });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain(
      `✗ GitHub source rules: ${posix.join('<root>', 'project', '.cc-safety-net', 'rules')}`,
    );
    expect(outcome.report).toContain(
      '    1. broken-rules/rulebook.json: tests[0]: expected "block-system-prune" to block "docker ps" but no rule matched',
    );
  });

  test('a rulebook whose name disagrees with its folder is refused', () => {
    const outcome = verifyBothWays({
      'project/.cc-safety-net/rules/team-rules/rulebook.json': RULEBOOK('other', PASSING_FIXTURE),
    });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain('    1. rulebook name "other" must match folder "team-rules"');
  });

  test('a regular file beside the rulebooks is not a rulebook', () => {
    const outcome = verifyBothWays({ 'project/.cc-safety-net/rules/stray': 'not a rulebook' });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain('    1. stray must be a rulebook directory');
  });

  test('a legacy user config on its own is reported as ignored', () => {
    const outcome = verifyBothWays({ [LEGACY_USER_CONFIG]: LEGACY_RULES });
    expect(outcome.code).toBe(0);
    expect(outcome.report).toContain(
      '✗ Legacy user config: <root>/home/.cc-safety-net/config.json',
    );
    expect(outcome.report).toContain('  Status: ignored by CC Safety Net');
    expect(outcome.report).toContain('    1. no-force-push');
    expect(outcome.report).toContain(
      'Warning: Legacy user config is ignored by CC Safety Net. Run `npx -y cc-safety-net rule migrate`.',
    );
    expect(outcome.report).toContain('\nConfigs valid with warnings.');
  });

  test('a legacy user config that no longer validates is an error', () => {
    const outcome = verifyBothWays({
      [LEGACY_USER_CONFIG]: JSON.stringify({ version: 1, rules: [{}] }),
    });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain('    1. rules[0].name: required string');
    expect(outcome.report).toContain('    4. rules[0].reason: required string');
    expect(outcome.report).toContain('Warning: Legacy user config is no longer supported.');
  });

  test('a legacy user config beside a current one is only cleanup', () => {
    const outcome = verifyBothWays({
      [LEGACY_USER_CONFIG]: LEGACY_RULES,
      [USER_RULES_CONFIG]: SCHEMA_STAMPED_CONFIG,
    });
    expect(outcome.code).toBe(0);
    expect(outcome.report).toContain('  Sources: (none)');
    expect(outcome.report).toContain(
      'Warning: Legacy user config is no longer needed. Run `npx -y cc-safety-net rule migrate --cleanup` to clean it up safely.',
    );
  });

  test('a legacy project config is reported against the project scope', () => {
    const outcome = verifyBothWays({ [LEGACY_PROJECT_CONFIG]: LEGACY_RULES });
    expect(outcome.code).toBe(1);
    expect(outcome.report).toContain(
      `✗ Legacy project config: ${posix.join('<root>', 'project', '.safety-net.json')}`,
    );
    expect(outcome.report).toContain(
      'Warning: Legacy project config is ignored by CC Safety Net. Run `npx -y cc-safety-net rule migrate`.',
    );
  });

  test('a legacy project config beside a current one is only cleanup', () => {
    const outcome = verifyBothWays({
      [LEGACY_PROJECT_CONFIG]: LEGACY_RULES,
      [PROJECT_RULES_CONFIG]: SCHEMA_STAMPED_CONFIG,
    });
    expect(outcome.code).toBe(0);
    expect(outcome.report).toContain(
      '✓ Project config: <root>/project/.cc-safety-net/rules/rule.json',
    );
    expect(outcome.report).toContain('Warning: Legacy project config is no longer needed.');
  });

  test('a regular file where the rules directory belongs stops the run', () => {
    const outcome = verifyBothWays({ 'home/.cc-safety-net/rules': 'not a directory' });
    expect(outcome.code).toBe(1);
    expect(outcome.written.at(-1)).toBe('Unable to access user policy filesystem safely.');
  });
});
