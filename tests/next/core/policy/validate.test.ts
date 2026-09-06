import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { assertValidRulebook as portedAssertValidRulebook } from '@next/core/policy/rulebook';
import * as portedSchema from '@next/core/policy/schema';
import * as ported from '@next/core/policy/validate';
import * as z from 'zod';
import * as shippedSchema from '@/policy/schema';
import { assertValidRulebook, validateRulebook } from '@/rules/rulebook';
import { describeOutcome } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';
import { normalize } from '../../helpers/temp-home';
import { mutate, RULEBOOK_VALUES, RULES_CONFIG_VALUES, USER_POLICY_VALUES } from './policy-values';

/**
 * The hand-written validators under `next/` exist so the loader never pulls the schema
 * library onto the hook's path. They are only worth having if every diagnostic they
 * produce is the one the schema produced, so each fixture document and a seeded mutation
 * of it goes through the shipped schema, the ported schema, and the hand-written check.
 */

const HOME = process.env.HOME || homedir();
/** The one machine-specific string the documents and the diagnostics can carry. */
const HOME_FOLDS = [[HOME, '<home>']] as const;
const MUTATIONS_PER_VALUE = 300;

function samples(values: readonly unknown[]): unknown[] {
  const random = createSeededRandom(FUZZ_SEED);
  return values.flatMap((value) => [
    value,
    ...Array.from({ length: MUTATIONS_PER_VALUE }, () => mutate(value, random)),
  ]);
}

function reported(value: unknown, result: unknown) {
  return { document: String(JSON.stringify(value)).slice(0, 300), result };
}

describe('policy validators without the schema library', () => {
  test('report the shipped user policy diagnostics', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const value of samples(USER_POLICY_VALUES)) {
      const expected = reported(value, shippedSchema.getUserPolicyDiagnostics(value));
      const read = reported(value, ported.getUserPolicyDiagnostics(value, HOME));
      expect(read).toStrictEqual(expected);
      expect(reported(value, portedSchema.getUserPolicyDiagnostics(value, HOME))).toStrictEqual(
        expected,
      );
      recorded.push([read.document, read.result]);
    }
    expectRecordedDigest('core-policy-validate/user-policy', normalize(recorded, HOME_FOLDS));
  }, 60_000);

  test('report the shipped rules config diagnostics and usable sources', () => {
    const flatten = (validation: { errors: string[]; sources: Set<string> }) => ({
      errors: validation.errors,
      sources: [...validation.sources],
    });
    const recorded: (readonly [string, unknown])[] = [];
    for (const value of samples(RULES_CONFIG_VALUES)) {
      const expected = reported(value, flatten(shippedSchema.getRulesConfigValidation(value)));
      const read = reported(value, flatten(ported.getRulesConfigValidation(value)));
      expect(read).toStrictEqual(expected);
      expect(reported(value, flatten(portedSchema.getRulesConfigValidation(value)))).toStrictEqual(
        expected,
      );
      recorded.push([read.document, read.result]);
    }
    expectRecordedDigest('core-policy-validate/rules-config', normalize(recorded, HOME_FOLDS));
  }, 60_000);

  test('report the shipped rulebook diagnostics and rule names', () => {
    const flatten = (validation: { errors: string[]; ruleNames: Set<string> }) => ({
      errors: validation.errors,
      ruleNames: [...validation.ruleNames],
    });
    const recorded: (readonly [string, unknown])[] = [];
    for (const value of samples(RULEBOOK_VALUES)) {
      const read = reported(value, flatten(ported.validateRulebook(value)));
      expect(read).toStrictEqual(reported(value, flatten(validateRulebook(value))));
      const asserted = reported(
        value,
        describeOutcome(() => portedAssertValidRulebook(value)),
      );
      expect(asserted).toStrictEqual(
        reported(
          value,
          describeOutcome(() => assertValidRulebook(value)),
        ),
      );
      recorded.push([read.document, { validation: read.result, assertion: asserted.result }]);
    }
    expectRecordedDigest('core-policy-validate/rulebook', normalize(recorded, HOME_FOLDS));
  }, 60_000);
});

describe('the ported schema', () => {
  test('accepts and rejects the same documents as the shipped one', () => {
    for (const value of RULES_CONFIG_VALUES) {
      const parsed = reported(value, portedSchema.getRulesConfigSchema().safeParse(value).success);
      expect(parsed).toStrictEqual(
        reported(value, shippedSchema.getRulesConfigSchema().safeParse(value).success),
      );
      expect(parsed).toMatchSnapshot();
    }
    for (const value of USER_POLICY_VALUES) {
      const parsed = reported(
        value,
        portedSchema.getUserPolicySchema(HOME).safeParse(value).success,
      );
      expect(parsed).toStrictEqual(
        reported(value, shippedSchema.getUserPolicySchema().safeParse(value).success),
      );
      expect(parsed).toMatchSnapshot();
    }
  });

  test('generates the shipped rule config JSON schema', () => {
    const options = { io: 'input', target: 'draft-7' } as const;
    const schema = z.toJSONSchema(portedSchema.getRulesConfigSchema(), options);
    expect(schema).toStrictEqual(z.toJSONSchema(shippedSchema.getRulesConfigSchema(), options));
    expect(schema).toMatchSnapshot();
  });
});
