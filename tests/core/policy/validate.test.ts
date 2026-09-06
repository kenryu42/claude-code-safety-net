import { describe, expect, test } from 'bun:test';
import { assertValidRulebook } from '@/core/policy/rulebook';
import * as schema from '@/core/policy/schema';
import * as validate from '@/core/policy/validate';
import { describeOutcome } from '../../helpers/fixture-tree';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';
import { mutate, RULEBOOK_VALUES, RULES_CONFIG_VALUES, USER_POLICY_VALUES } from './policy-values';

/**
 * The hand-written validators exist so the loader never pulls the schema library onto the hook's
 * path. They are only worth having if every diagnostic they produce is the one the schema
 * produces, so each fixture document and a seeded mutation of it goes through both. That
 * agreement is the whole property: a second implementation that answers differently is the one
 * failure this file exists to catch.
 */

const HOME = '/srv/home/tester';
const MUTATIONS_PER_VALUE = 300;

function samples(values: readonly unknown[]): unknown[] {
  const random = createSeededRandom(FUZZ_SEED);
  return values.flatMap((value) => [
    value,
    ...Array.from({ length: MUTATIONS_PER_VALUE }, () => mutate(value, random)),
  ]);
}

/** The document, trimmed, so a disagreement names the input that produced it. */
const named = (value: unknown) => String(JSON.stringify(value)).slice(0, 300);

describe('user policy diagnostics', () => {
  test.each([
    ['the minimal document is accepted', { version: 1 }, []],
    ['a missing version is the first thing reported', {}, ['version must be 1']],
    ['a document that is not an object is rejected whole', 'policy', ['Config must be an object']],
    [
      'an unrecognized top-level field is named',
      { version: 1, tier: 'gold' },
      ['unknown field "tier"'],
    ],
    [
      'an unrecognized level lists the levels that exist',
      { version: 1, safety: { level: 'lenient' } },
      ['safety.level must be "standard", "strict", or "paranoid"'],
    ],
    [
      'a capability override must be a boolean',
      { version: 1, safety: { level: 'strict', overrides: { fail_closed: 'yes' } } },
      ['safety.overrides.fail_closed must be a boolean'],
    ],
    [
      'every rejected allow path is reported at its own index',
      { version: 1, destructive_command_protection: { allow_paths: ['relative/dir', 42] } },
      [
        'destructive_command_protection.allow_paths[0] must be an absolute path or start with ~/',
        'destructive_command_protection.allow_paths[1] must be a non-empty path string',
      ],
    ],
    [
      'the secret lists report the reason each entry was refused',
      { version: 1, secret_protection: { deny_paths: ['~'], allow_paths: ['~/**/x'] } },
      [
        'secret_protection.deny_paths[0] cannot be the home directory or a path above it (this would block every command the agent runs)',
        'secret_protection.allow_paths[0] cannot contain glob characters (* or ?); list the exact file or directory',
      ],
    ],
    [
      'a retention window out of range names the range',
      { version: 1, audit: { retention_days: 0 } },
      ['audit.retention_days must be an integer between 1 and 365'],
    ],
    [
      'an override naming no built-in rule names the id it could not find',
      { version: 1, destructive_command_protection: { overrides: { 'git.no-such-rule': 'on' } } },
      ['unknown destructive command rule id "git.no-such-rule"'],
    ],
  ] as const)('%s', (_behavior, document, expected) => {
    expect(validate.getUserPolicyDiagnostics(document, HOME)).toEqual([...expected]);
  });
});

describe('rules config diagnostics', () => {
  test.each([
    ['a config with no sources is accepted', { version: 1 }, [], []],
    [
      'both source spellings are accepted and reported as usable',
      { version: 1, rules: ['infra-rules', 'acme/guardrails#main/deploy-rules'] },
      [],
      ['infra-rules', 'acme/guardrails#main/deploy-rules'],
    ],
    [
      'a source that is not a name reports the syntax rule it broke',
      { version: 1, rules: ['not a source!'] },
      [
        'rules[0]: Local rulebook sources must be bare names matching /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/: not a source!',
      ],
      [],
    ],
    [
      'a repeated source is reported at the repeat, and the first claim stays usable',
      { version: 1, rules: ['infra-rules', 'infra-rules'] },
      ['rules[1]: duplicate rulebook source "infra-rules"'],
      ['infra-rules'],
    ],
    [
      'a wrapper naming a command the analyzer inspects itself is refused',
      { version: 1, transparent_wrappers: ['git', 'rtk'] },
      ['transparent_wrappers[0]: reserved command "git" cannot be a wrapper'],
      [],
    ],
    [
      'an override key must name a rulebook and a rule',
      { version: 1, overrides: { plain: 'off' } },
      ['overrides.plain: must use <rulebook-name>/<rule-name>'],
      [],
    ],
    [
      'an override that rewrites a reason needs one',
      { version: 1, overrides: { 'a/b': { reason: '' } } },
      ['overrides.a/b.reason: required non-empty string'],
      [],
    ],
    ['a config that is not an object is rejected whole', null, ['Config must be an object'], []],
  ] as const)('%s', (_behavior, document, errors, sources) => {
    const result = validate.getRulesConfigValidation(document);
    expect(result.errors).toEqual([...errors]);
    expect([...result.sources]).toEqual([...sources]);
  });

  test('a config over the source limit is refused as a whole rather than per source', () => {
    expect(
      validate.getRulesConfigValidation({
        version: 1,
        rules: Array.from({ length: 65 }, (_unused, index) => `bulk-${index}`),
      }).errors,
    ).toEqual(["Rule config exceeds CC Safety Net's safe source limit."]);
  });
});

const VALID_RULEBOOK = {
  rulebook_version: 1,
  name: 'infra-guards',
  version: '2.4.0',
  allowed_commands: ['terraform'],
  rules: [
    {
      name: 'block-destroy',
      command: 'terraform',
      subcommand: 'destroy',
      block_args: ['-auto-approve'],
      reason: 'Destroying infrastructure needs a human.',
      intent: 'manual_only',
    },
  ],
};

const V2_RULE = {
  name: 'block-uninstall',
  command: 'helm',
  match: { command_path: ['uninstall'], any_args: ['--no-hooks'], exclude_args: ['--dry-run'] },
  reason: 'Uninstalling a release drops live state.',
  intent: 'hard_stop',
};

const V2_RULEBOOK = {
  rulebook_version: 2,
  name: 'deploy-guards',
  version: '0.1.0',
  allowed_commands: ['helm'],
  rules: [V2_RULE],
};

describe('rulebook diagnostics', () => {
  test.each([
    [
      'a valid rulebook is accepted and reports its rule names',
      VALID_RULEBOOK,
      [],
      ['block-destroy'],
    ],
    [
      'an unsupported rulebook version reads as a sentence, not a field error',
      { ...VALID_RULEBOOK, rulebook_version: 3 },
      ['rulebook_version must be 1 or 2'],
      ['block-destroy'],
    ],
    [
      'a rulebook name that is not a bare name is refused',
      { ...VALID_RULEBOOK, name: 'not a rule name' },
      ['name: required string matching rule name pattern'],
      ['block-destroy'],
    ],
    ['rules must be an array', { ...VALID_RULEBOOK, rules: 'none' }, ['rules: required array'], []],
    [
      'a rulebook that is not an object is rejected whole',
      'rulebook',
      ['Rulebook must be an object'],
      [],
    ],
    [
      'a rulebook version string must not be empty',
      { ...VALID_RULEBOOK, version: '' },
      ['version: required non-empty string'],
      ['block-destroy'],
    ],
    [
      'allowed_commands must be an array, not a single command',
      { ...VALID_RULEBOOK, allowed_commands: 'terraform' },
      ['allowed_commands: required array'],
      ['block-destroy'],
    ],
    [
      'every allowed command that is not a command name is reported at its index',
      { ...VALID_RULEBOOK, allowed_commands: [null, 'terraform', 'not a command'] },
      [
        'allowed_commands[0]: must match command pattern',
        'allowed_commands[2]: must match command pattern',
      ],
      ['block-destroy'],
    ],
    [
      'a repeated allowed command is reported at the repeat, naming the command',
      { ...VALID_RULEBOOK, allowed_commands: ['terraform', 'terraform', 'kubectl', 'kubectl'] },
      [
        'allowed_commands[1]: duplicate command "terraform"',
        'allowed_commands[3]: duplicate command "kubectl"',
      ],
      ['block-destroy'],
    ],
    [
      'a rule that is not an object is reported at its index and contributes no name',
      { ...VALID_RULEBOOK, rules: [null, 3, 'rule', []] },
      [
        'rules[0]: must be an object',
        'rules[1]: must be an object',
        'rules[2]: must be an object',
        'rules[3]: must be an object',
      ],
      [],
    ],
    [
      'an empty v1 rule reports every field it must carry',
      { ...VALID_RULEBOOK, rules: [{}] },
      [
        'rules[0].name: required string',
        'rules[0].command: required string matching command pattern',
        'rules[0].block_args: required non-empty array',
        'rules[0].reason: required non-empty string up to 256 characters',
      ],
      [],
    ],
    [
      'a v1 subcommand must be a command name',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], subcommand: 9 }] },
      ['rules[0].subcommand: must match command pattern'],
      ['block-destroy'],
    ],
    [
      'a v1 rule blocking nothing is refused',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], block_args: [] }] },
      ['rules[0].block_args: required non-empty array'],
      ['block-destroy'],
    ],
    [
      'each unusable blocked argument is reported at its own index',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], block_args: ['', 4, '-f'] }] },
      [
        'rules[0].block_args[0]: must be a non-empty string',
        'rules[0].block_args[1]: must be a non-empty string',
      ],
      ['block-destroy'],
    ],
    [
      'a rule without a reason cannot be shown to a user',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], reason: '' }] },
      ['rules[0].reason: required non-empty string up to 256 characters'],
      ['block-destroy'],
    ],
    [
      'a reason past the length bound reads as the same requirement',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], reason: 'r'.repeat(257) }] },
      ['rules[0].reason: required non-empty string up to 256 characters'],
      ['block-destroy'],
    ],
    [
      'an intent outside the catalogue lists the intents that exist',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], intent: 'shrug' }] },
      [
        'rules[0].intent: must be one of hard_stop, use_alternative, scope_down, manual_only, stop_and_explain',
      ],
      ['block-destroy'],
    ],
    [
      'a rule may only guard a command the rulebook declared',
      { ...VALID_RULEBOOK, rules: [{ ...VALID_RULEBOOK.rules[0], command: 'ansible' }] },
      ['rules[0].command: "ansible" must be listed in allowed_commands'],
      ['block-destroy'],
    ],
    [
      'a version 2 rule must carry a match object',
      { ...V2_RULEBOOK, rules: [{ ...V2_RULE, match: undefined }] },
      ['rules[0].match: required object'],
      ['block-uninstall'],
    ],
    [
      'a match reports its command path, its empty token list and each unusable token',
      {
        ...V2_RULEBOOK,
        rules: [{ ...V2_RULE, match: { command_path: 'x', any_args: [], exclude_args: [1, 1] } }],
      },
      [
        'rules[0].match.command_path: required non-empty array of non-empty strings',
        'rules[0].match.any_args: must be a non-empty array of unique non-empty strings',
        'rules[0].match.exclude_args[0]: must be a non-empty string',
        'rules[0].match.exclude_args[1]: must be a non-empty string',
      ],
      ['block-uninstall'],
    ],
    [
      'a token list reports an empty token and then its own duplication',
      {
        ...V2_RULEBOOK,
        rules: [{ ...V2_RULE, match: { command_path: ['a'], any_args: ['a', 'a', ''] } }],
      },
      [
        'rules[0].match.any_args[2]: must be a non-empty string',
        'rules[0].match.any_args: must not contain duplicate values',
      ],
      ['block-uninstall'],
    ],
    [
      'the version 1 matching fields are refused in a version 2 rule',
      {
        ...V2_RULEBOOK,
        rules: [{ ...V2_RULE, subcommand: 'uninstall', block_args: ['--no-hooks'] }],
      },
      [
        'rules[0].subcommand: not supported in rulebook_version 2',
        'rules[0].block_args: not supported in rulebook_version 2',
      ],
      ['block-uninstall'],
    ],
    [
      'tests must be an array when present',
      { ...VALID_RULEBOOK, tests: 'none' },
      ['tests: must be an array if provided'],
      ['block-destroy'],
    ],
    [
      'a fixture that is not an object is reported at its index',
      { ...VALID_RULEBOOK, tests: [null, 'x'] },
      ['tests[0]: must be an object', 'tests[1]: must be an object'],
      ['block-destroy'],
    ],
    [
      'a fixture needs a command to run and an outcome to expect',
      { ...VALID_RULEBOOK, tests: [{ command: '  ', expect: 'maybe' }] },
      [
        'tests[0].command: required non-empty string',
        'tests[0].expect: must be "blocked" or "allowed"',
      ],
      ['block-destroy'],
    ],
    [
      'a blocked fixture must name the rule it expects, and a non-string rule says so first',
      {
        ...VALID_RULEBOOK,
        tests: [{ command: 'terraform destroy', expect: 'blocked', rule: null }],
      },
      [
        'tests[0].rule: must be a string if provided',
        'tests[0].rule: required string for blocked fixtures',
      ],
      ['block-destroy'],
    ],
    [
      'a blocked fixture naming a rule the rulebook does not declare is reported once per rule',
      {
        ...VALID_RULEBOOK,
        tests: [
          { command: 'terraform apply', expect: 'blocked', rule: 'missing-rule' },
          { command: 'terraform apply', expect: 'blocked', rule: 'missing-rule' },
          { command: 'terraform apply', expect: 'blocked', rule: 'other-missing' },
        ],
      },
      [
        'tests: blocked fixture references unknown rule "missing-rule"',
        'tests: blocked fixture references unknown rule "other-missing"',
      ],
      ['block-destroy'],
    ],
    [
      'a rulebook carrying only its version reports every required field',
      { rulebook_version: 1 },
      [
        'name: required string matching rule name pattern',
        'version: required non-empty string',
        'allowed_commands: required array',
        'rules: required array',
      ],
      [],
    ],
  ] as const)('%s', (_behavior, rulebook, errors, names) => {
    const result = validate.validateRulebook(rulebook);
    expect(result.errors).toEqual([...errors]);
    expect([...result.ruleNames]).toEqual([...names]);
  });

  test('rule names collide case-insensitively, and the later claim is the one reported', () => {
    const result = validate.validateRulebook({
      ...VALID_RULEBOOK,
      rules: [
        { ...VALID_RULEBOOK.rules[0], name: 'dup' },
        { ...VALID_RULEBOOK.rules[0], name: 'DUP' },
      ],
    });
    expect(result.errors).toEqual(['rules[1].name: duplicate rule name "DUP"']);
    expect([...result.ruleNames]).toEqual(['dup']);
  });

  test('past the diagnostic budget the list is cut short and says so', () => {
    const errors = validate.validateRulebook({
      ...VALID_RULEBOOK,
      rules: Array.from({ length: 70 }, (_unused, index) => index),
    }).errors;
    expect(errors).toHaveLength(65);
    expect(errors.at(0)).toBe('rules[0]: must be an object');
    expect(errors.at(-2)).toBe('rules[63]: must be an object');
    expect(errors.at(-1)).toBe('Additional rulebook validation errors were omitted.');
  });

  test('a rulebook over the acceptance limits is refused before any field is read', () => {
    expect(
      validate.validateRulebook({
        ...VALID_RULEBOOK,
        rules: Array.from({ length: 1_025 }, () => ({})),
      }).errors,
    ).toEqual(["Rulebook exceeds CC Safety Net's safe validation limits."]);
  });
});

/**
 * Every fixture document and 300 seeded mutations of it, through both implementations. Nothing is
 * recorded: the schema module is the oracle, and the property is that the two never disagree.
 */
describe('the hand-written validators agree with the schema on every document', () => {
  test('user policy diagnostics are identical, message for message and in order', () => {
    for (const value of samples(USER_POLICY_VALUES)) {
      expect(validate.getUserPolicyDiagnostics(value, HOME), named(value)).toStrictEqual(
        schema.getUserPolicyDiagnostics(value, HOME),
      );
    }
  }, 60_000);

  test('a user policy is accepted by the schema exactly when it has no diagnostics', () => {
    for (const value of samples(USER_POLICY_VALUES)) {
      expect(schema.getUserPolicySchema(HOME).safeParse(value).success, named(value)).toBe(
        validate.getUserPolicyDiagnostics(value, HOME).length === 0,
      );
    }
  }, 60_000);

  test('rules config diagnostics and usable sources are identical', () => {
    for (const value of samples(RULES_CONFIG_VALUES)) {
      const read = validate.getRulesConfigValidation(value);
      const oracle = schema.getRulesConfigValidation(value);
      expect(read.errors, named(value)).toStrictEqual(oracle.errors);
      expect([...read.sources], named(value)).toStrictEqual([...oracle.sources]);
    }
  }, 60_000);

  test('a rules config is accepted by the schema exactly when it has no diagnostics', () => {
    for (const value of samples(RULES_CONFIG_VALUES)) {
      expect(schema.getRulesConfigSchema().safeParse(value).success, named(value)).toBe(
        validate.getRulesConfigValidation(value).errors.length === 0,
      );
    }
  }, 60_000);

  test('rulebook validation answers every document with usable diagnostics and never throws', () => {
    for (const value of samples(RULEBOOK_VALUES)) {
      const result = validate.validateRulebook(value);
      // Every diagnostic is something a rulebook author can read and act on, and the list
      // stays inside the budget the truncation message announces.
      expect(
        result.errors.every((error) => typeof error === 'string' && error.trim() !== ''),
        named(value),
      ).toBe(true);
      expect(result.errors.length, named(value)).toBeLessThanOrEqual(65);
      // A reported rule name was written in the document; the set is what overrides resolve against.
      expect(
        [...result.ruleNames].every((name) =>
          validate.collectCustomRuleNames(value).some((written) => written.toLowerCase() === name),
        ),
        named(value),
      ).toBe(true);
    }
  }, 60_000);
});

describe('the rulebook assertion wrapper', () => {
  test('a valid rulebook is returned untouched', () => {
    expect(assertValidRulebook(VALID_RULEBOOK) as unknown).toBe(VALID_RULEBOOK);
  });

  test('an invalid rulebook throws with every diagnostic joined by "; "', () => {
    const thrown = describeOutcome(() => assertValidRulebook({ rulebook_version: 1 }));
    expect(thrown.ok).toBe(false);
    if (!thrown.ok) {
      expect(thrown.error.message).toBe(
        'name: required string matching rule name pattern; version: required non-empty string; allowed_commands: required array; rules: required array',
      );
    }
  });
});
