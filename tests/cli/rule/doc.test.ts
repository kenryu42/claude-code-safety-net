import { afterEach, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULE_DOC } from '@/cli/rule/doc';
import { createTestEnvironment } from '@/core/environment';
import { assertValidRulebook } from '@/core/policy/rulebook';
import { readScopeRulesConfig } from '@/rules-manager/config-file';
import { getScopePaths } from '@/rules-manager/paths';
import { createTempRoot, removeTempRoots } from '../../helpers/temp-home';

/**
 * `rule doc` prints this document for an agent to read before it writes a rulebook, so every path
 * and every example in it is an instruction that has to stay true: a reworded sentence is fine, an
 * example the loader would reject or a file name the manager no longer writes is not.
 */

afterEach(removeTempRoots);

/** The fenced JSON blocks, in the order the document presents them. */
const examples = [...RULE_DOC.matchAll(/```json\n([\s\S]*?)```/g)].map(
  (match) => JSON.parse(match[1] ?? '') as Record<string, unknown>,
);

test('the document carries the three examples it walks through', () => {
  expect(examples).toHaveLength(3);
});

test('the rule.json example is a config the loader accepts', () => {
  const path = join(createTempRoot('rule-doc-'), 'rule.json');
  writeFileSync(path, JSON.stringify(examples[0]));

  expect(readScopeRulesConfig(path)).toEqual({
    ok: true,
    config: {
      version: 1,
      rules: ['project-rules', 'owner/repo#main/team-rules'],
      overrides: {
        'project-rules/block-docker-system-prune': {
          reason: 'Use targeted Docker cleanup commands.',
        },
        'team-rules/block-npm-global': 'off',
      },
      transparent_wrappers: ['rtk'],
    },
  });
});

test('both rulebook examples are rulebooks the validator accepts', () => {
  expect(() => assertValidRulebook(examples[1])).not.toThrow();
  // The third example is a single version 2 rule, shown without the rulebook around it.
  expect(() =>
    assertValidRulebook({
      rulebook_version: 2,
      name: 'doc-rules',
      version: '1.0.0',
      allowed_commands: ['terraform'],
      rules: [examples[2]],
    }),
  ).not.toThrow();
});

test('the paths it tells an agent to write are the paths the manager resolves', () => {
  const environment = createTestEnvironment({ home: '/home/agent' });
  const scope = (global?: true) => getScopePaths(environment, { cwd: '/work/app', global });

  // The table at the top of the document names these four locations.
  expect(RULE_DOC).toContain('`~/.cc-safety-net/rules/rule.json`');
  expect(RULE_DOC).toContain('`~/.cc-safety-net/rules/<rulebook-name>/rulebook.json`');
  expect(RULE_DOC).toContain('`.cc-safety-net/rules/rule.json`');
  expect(RULE_DOC).toContain('`.cc-safety-net/rules/<rulebook-name>/rulebook.json`');
  expect(scope(true).configPath).toBe(join('/home/agent', '.cc-safety-net/rules/rule.json'));
  expect(scope().configPath).toBe(join('/work/app', '.cc-safety-net/rules/rule.json'));
  // And the variable that moves the user root, which the manager reads off the environment.
  expect(RULE_DOC).toContain('`CC_SAFETY_NET_HOME`');
  expect(
    getScopePaths(
      createTestEnvironment({
        home: '/home/agent',
        env: new Map([['CC_SAFETY_NET_HOME', '/elsewhere']]),
      }),
      { cwd: '/work/app', global: true },
    ).configPath,
  ).toBe(join('/elsewhere', 'rules/rule.json'));
});
