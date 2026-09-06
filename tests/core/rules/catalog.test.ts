import { describe, expect, test } from 'bun:test';
import * as nextDestructive from '@/core/rules/destructive';
import * as nextSecret from '@/core/rules/secret';

/**
 * The catalogs are data: every record, in order, with its descriptive text and matcher data, is
 * pinned as the object graph it is.
 */
describe('rule catalogs', () => {
  test('destructive records and the id set are identical', () => {
    expect(nextDestructive.DESTRUCTIVE_COMMAND_RULE_METADATA).toMatchSnapshot();
    expect(nextDestructive.DESTRUCTIVE_COMMAND_RULE_METADATA).toHaveLength(59);
    expect(nextDestructive.DESTRUCTIVE_COMMAND_RULE_ID_SET).toMatchSnapshot();
  });

  test('destructiveCommandMatch carries the same intent for every id', () => {
    for (const rule of nextDestructive.DESTRUCTIVE_COMMAND_RULE_METADATA) {
      const id = rule.id as nextDestructive.DestructiveCommandRuleId;
      const match = nextDestructive.destructiveCommandMatch(id, `reason for ${id}`);
      expect(match).toMatchSnapshot();
    }
  });

  test('secret records, matcher data, and tiers are identical', () => {
    expect(nextSecret.SECRET_PROTECTION_RULE_METADATA).toMatchSnapshot();
    expect(nextSecret.SECRET_PROTECTION_RULE_METADATA).toHaveLength(134);
    expect(nextSecret.SECRET_BASENAME_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_ENV_VARIANT_RULE).toMatchSnapshot();
    expect(nextSecret.SECRET_HOME_PATH_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_CODING_CLI_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_VARIANT_SEPARATOR_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_VARIANT_DOT_SUFFIX_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_BROAD_SSH_KEY_BASENAME_RULE).toMatchSnapshot();
    expect(nextSecret.SECRET_EXTENSION_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_EXTENSION_PATTERN_RULES).toMatchSnapshot();
    expect(nextSecret.SECRET_DEFAULT_OFF_RULE_ID_SET).toMatchSnapshot();
    expect(nextSecret.SECRET_PROTECTION_RULE_ID_SET).toMatchSnapshot();
  });

  test('regular-expression matchers compile to the same source and flags', () => {
    const patterns = (rules: readonly { pattern: RegExp }[]) =>
      rules.map((rule) => [rule.pattern.source, rule.pattern.flags]);
    const compiled = patterns([
      nextSecret.SECRET_BROAD_SSH_KEY_BASENAME_RULE,
      ...nextSecret.SECRET_EXTENSION_PATTERN_RULES,
    ]);
    expect(compiled).toMatchSnapshot();
  });
});
