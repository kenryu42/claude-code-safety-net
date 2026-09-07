import { describe, expect, test } from 'bun:test';
import * as nextDestructive from '@/core/rules/destructive';
import * as nextSecret from '@/core/rules/secret';

/**
 * The catalogs are data the rest of the engine addresses by id: a policy names a rule to switch
 * off, a denial carries the id it was answered by, and the GUI lists every record. So what the
 * tables owe is that the ids are unique and well formed, that each derived table still agrees with
 * the one it came from, and that the rows carrying a behaviour — a catastrophic rule, one gated on
 * a capability, one that ships off — are the rows that are supposed to carry it.
 */
describe('rule catalogs', () => {
  const destructive = nextDestructive.DESTRUCTIVE_COMMAND_RULE_METADATA;
  const secret = nextSecret.SECRET_PROTECTION_RULE_METADATA;

  test('every destructive record is uniquely identified and fully described', () => {
    expect(destructive).toHaveLength(59);
    const ids = destructive.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(nextDestructive.DESTRUCTIVE_COMMAND_RULE_ID_SET).toEqual(new Set(ids));

    for (const rule of destructive) {
      // `<area>.<rule>`: the id a policy override names and a denial carries.
      expect(rule.id, rule.id).toMatch(/^[a-z0-9-]+\.[a-z0-9-]+$/);
      // Every field is shown to someone: the GUI lists the category, label and description, and
      // `explain` prints the example.
      expect(rule.category, rule.id).not.toBe('');
      expect(rule.label, rule.id).not.toBe('');
      expect(rule.description, rule.id).toEndWith('.');
      expect(rule.example, rule.id).not.toBe('');
    }
  });

  test('the rules that carry a behaviour beyond their text are the ones that should', () => {
    // A catastrophic rule cannot be switched off by a policy, so the set is spelled out.
    expect(destructive.flatMap((rule) => (rule.catastrophic ? [rule.id] : []))).toEqual([
      'rm.recursive-force-root-or-home',
      'rm.git-metadata',
      'powershell.remove-item-root-or-home',
      'powershell.remove-item-recursive-force-root-or-home',
      'powershell.remove-item-git-metadata',
      'find.delete-git-metadata',
    ]);
    // A capability gates whether a rule is active at all: `fail_closed` rules answer only where
    // the analysis could not settle the target, and the two paranoid tiers ship behind the level.
    expect(
      destructive.flatMap((rule) =>
        rule.activationCapability ? [[rule.id, rule.activationCapability]] : [],
      ),
    ).toEqual([
      ['rm.recursive-force-dynamic-target', 'fail_closed'],
      ['rm.recursive-force-paranoid', 'paranoid_rm'],
      ['powershell.remove-item-recursive-force-dynamic-target', 'fail_closed'],
      ['powershell.remove-item-recursive-force-paranoid', 'paranoid_rm'],
      ['powershell.remove-item-pipeline-dynamic-target', 'fail_closed'],
      ['interpreter.one-liner-paranoid', 'paranoid_interpreters'],
      ['shell.dynamic-structure', 'fail_closed'],
      ['shell.dynamic-executable', 'fail_closed'],
    ]);
  });

  test('destructiveCommandMatch answers with the record intent and the reason it was handed', () => {
    // The intent decides which footer the denial prints, so a match that lost it would deny with
    // the wrong advice; an id with no record at all falls back to the strictest intent.
    expect([...new Set(destructive.map((rule) => rule.intent))].sort()).toEqual([
      'hard_stop',
      'manual_only',
      'scope_down',
      'stop_and_explain',
      'use_alternative',
    ]);
    for (const rule of destructive) {
      const id = rule.id as nextDestructive.DestructiveCommandRuleId;
      expect(nextDestructive.destructiveCommandMatch(id, `reason for ${id}`), id).toEqual({
        id,
        reason: `reason for ${id}`,
        intent: rule.intent,
      });
    }
  });

  test('the secret catalog is the matcher tables in order, and nothing else', () => {
    // A matcher table left out of the catalog would match files no policy can switch off and no
    // listing shows, so the concatenation is stated here rather than derived.
    expect(
      [
        ...nextSecret.SECRET_BASENAME_RULES,
        nextSecret.SECRET_ENV_VARIANT_RULE,
        ...nextSecret.SECRET_HOME_PATH_RULES,
        ...nextSecret.SECRET_VARIANT_SEPARATOR_RULES,
        ...nextSecret.SECRET_VARIANT_DOT_SUFFIX_RULES,
        nextSecret.SECRET_BROAD_SSH_KEY_BASENAME_RULE,
        ...nextSecret.SECRET_EXTENSION_RULES,
        ...nextSecret.SECRET_EXTENSION_PATTERN_RULES,
        ...nextSecret.SECRET_CODING_CLI_RULES,
      ].map((rule) => rule.id),
    ).toEqual(secret.map((rule) => rule.id));
    expect(secret).toHaveLength(134);
    expect(new Set(secret.map((rule) => rule.id)).size).toBe(secret.length);
    expect(nextSecret.SECRET_PROTECTION_RULE_ID_SET).toEqual(
      new Set(secret.map((rule) => rule.id)),
    );

    for (const rule of secret) {
      expect(rule.id, rule.id).toStartWith('secret.');
      expect(rule.category, rule.id).not.toBe('');
      expect(rule.label, rule.id).not.toBe('');
      // A coding-CLI rule names the paths it guards; every other rule describes what it blocks.
      expect(
        'paths' in rule ? rule.paths.length > 0 : rule.description.endsWith('.'),
        rule.id,
      ).toBe(true);
    }
  });

  test('the tier that ships off is the coding-CLI config rules', () => {
    // Agents edit these files as routine work, so the tier is opt-in; the flag the GUI reads and
    // the set the policy reads have to name the same rules.
    const off = secret.flatMap((rule) => (rule.defaultOff === true ? [rule.id] : []));
    expect(new Set(off)).toEqual(nextSecret.SECRET_DEFAULT_OFF_RULE_ID_SET);
    expect(off).toEqual(
      secret.flatMap((rule) => (rule.category === 'Coding CLI config' ? [rule.id] : [])),
    );
    expect(off).toHaveLength(11);
  });

  test('every pattern matcher is anchored at both ends and carries no flags', () => {
    // An unanchored pattern would match far more than the label it is listed under says.
    expect(
      [
        nextSecret.SECRET_BROAD_SSH_KEY_BASENAME_RULE,
        ...nextSecret.SECRET_EXTENSION_PATTERN_RULES,
      ].map((rule) => [rule.id, rule.pattern.source, rule.pattern.flags]),
    ).toEqual([
      ['secret.pattern.ssh-key-basename', '^.*_(rsa|dsa|ed25519|ecdsa)$', ''],
      ['secret.ext-pattern.key', '^key(pair)?$', ''],
      ['secret.ext-pattern.keystore', '^key(store|ring)$', ''],
      ['secret.ext-pattern.kdbx', '^kdbx?$', ''],
    ]);
  });
});
