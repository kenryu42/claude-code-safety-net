import type { Rulebook } from '@/core/policy/rulebook';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import type { PolicyRule } from '@/core/rules/types';
import type { CommandProgram } from '@/core/shell/model';
import { parseCommand } from '@/core/shell/parse';
import { analysisWordText, analyzedViewWords } from '@/gate/analyzer/command-words';
import { stripEnvAssignmentWords } from '@/gate/analyzer/wrapper-prelude';

const RULE_ID_PREFIX = 'custom.';

/**
 * Evaluates a rulebook_version 2 rulebook's fixtures against its own rules: a blocked fixture
 * passes only when its named rule is the first match, an allowed fixture only when nothing
 * matches. Fixture commands are analyzer input strings — they are parsed, never executed.
 * Version 1 fixtures stay shape-validated only. Returns one diagnostic per failing fixture.
 */
export function evaluateRulebookFixtures(rulebook: Rulebook): string[] {
  if (rulebook.rulebook_version !== 2) {
    return [];
  }
  const rules: PolicyRule[] = rulebook.rules.map((rule) => ({
    name: rule.name,
    command: rule.command,
    block_args: [],
    match: rule.match,
    reason: rule.reason,
    intent: rule.intent,
  }));

  return (rulebook.tests ?? []).flatMap((fixture, index) => {
    const tokenLists = collectCommandTokenLists(parseCommand(fixture.command));
    if (tokenLists.length === 0) {
      return [`tests[${index}]: could not parse fixture command: ${fixture.command}`];
    }
    const matched = tokenLists.reduce<string | undefined>(
      (found, tokens) =>
        found ?? checkPolicyRuleMatch(tokens, rules)?.id.slice(RULE_ID_PREFIX.length),
      undefined,
    );
    if (fixture.expect === 'blocked') {
      if (matched === fixture.rule) {
        return [];
      }
      const actual = matched ? `"${matched}" matched first` : 'no rule matched';
      return [
        `tests[${index}]: expected "${fixture.rule}" to block "${fixture.command}" but ${actual}`,
      ];
    }
    return matched
      ? [`tests[${index}]: expected "${fixture.command}" to be allowed but "${matched}" matched`]
      : [];
  });
}

/** Analyzed tokens of every simple command a fixture's parse tree contains, in program order. */
function collectCommandTokenLists(program: CommandProgram): string[][] {
  return program.nodes.flatMap((node) => {
    if (node.kind === 'group' || node.kind === 'function') {
      return collectCommandTokenLists(node.body);
    }
    if (node.kind !== 'command') {
      return [];
    }
    const tokens = stripEnvAssignmentWords(analyzedViewWords(node.dialect, node.words)).words.map(
      analysisWordText,
    );
    return [
      ...(tokens.length > 0 ? [tokens] : []),
      ...node.nested.flatMap((nested) => collectCommandTokenLists(nested)),
    ];
  });
}
