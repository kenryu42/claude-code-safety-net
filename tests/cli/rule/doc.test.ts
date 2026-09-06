import { expect, test } from 'bun:test';
import { RULE_DOC } from '@/cli/rule/doc';

/**
 * `rule doc` prints this document for an agent to read before it writes a rulebook, so every
 * path, flag and file name in it is an instruction that has to stay true. Comparing the whole
 * string is the check: a reworded sentence is fine, a renamed file is not.
 */

test('the rulebook reference is the shipped document, byte for byte', () => {
  expect(RULE_DOC).toMatchSnapshot();
});
