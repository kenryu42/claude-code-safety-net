import type {
  ActiveRulebookSummary,
  LoadedRulesPolicy,
  RuleOverride,
} from '@/core/policy/rules-config';
import type { CustomRule } from '@/core/policy/types';
import type { AddRulebookSourceResult } from '@/rules-manager/types';

export function printRuleChangeResult(
  result: {
    ok: boolean;
    errors: string[];
    changes?: string[];
    entries: ActiveRulebookSummary[];
  },
  action: string,
): void {
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  printSuccessfulRuleChange(result, action);
}

export function printRuleAddResult(
  result: AddRulebookSourceResult,
  source: string,
  scopeLine: string,
): void {
  // Which scope an add landed in is invisible otherwise, so running from the wrong directory
  // reads as success. A failed add wrote nothing, so it names no destination.
  if (result.ok) console.log(scopeLine);
  if (!result.add) {
    printRuleChangeResult(result, `Added rulebook source: ${source}`);
    return;
  }
  if (!result.ok) {
    printResultErrors(result);
    return;
  }
  if (result.add.added.length > 0) {
    console.log(
      `Added ${result.add.added.length} ${result.add.added.length === 1 ? 'rulebook' : 'rulebooks'} from ${result.add.source} at ${result.add.ref}:`,
    );
    result.add.added.forEach((name) => {
      console.log(`  - ${name}`);
    });
  }
  if (result.add.alreadyConfigured.length > 0) {
    console.log(
      `Rulebooks already configured from ${result.add.source} at ${result.add.ref}: ${result.add.alreadyConfigured.join(', ')}`,
    );
  }
  if (result.add.commits.length > 0) {
    console.log(
      `Vendored at ${result.add.commits.map((commit) => commit.slice(0, 7)).join(', ')}.`,
    );
  }
  printSuccessfulRuleChange(result, 'Rule config updated.');
}

function printSuccessfulRuleChange(
  result: { entries: ActiveRulebookSummary[]; changes?: string[] },
  action: string,
): void {
  for (const change of result.changes ?? []) console.log(change);
  console.log(action);
  console.log('');
  printActiveRulebookSummary(result.entries);
}

function printActiveRulebookSummary(entries: ActiveRulebookSummary[]): void {
  if (entries.length === 0) {
    console.log('Active rulebooks: (none)');
    return;
  }
  console.log(`Active rulebooks (${entries.length}):`);
  for (const entry of entries) {
    console.log(`  - ${entry.name} ${entry.version} (${formatRuleCount(entry.ruleCount)})`);
    console.log(`    Source: ${entry.spec}`);
  }
}

function formatRuleCount(count: number): string {
  return `${count} ${count === 1 ? 'rule' : 'rules'}`;
}

export function printRulesListReport(policy: LoadedRulesPolicy): void {
  printListSection('Active sources', policy.rulebooks, (rulebook) => [
    `[${rulebook.source}] ${rulebook.name} ${rulebook.version}`,
    `  Source: ${rulebook.spec}`,
  ]);
  printListSection('Active rules', policy.rules, (rule) => [
    `[${getRuleSource(policy, rule.name)}] ${rule.name}`,
    ...describeRuleMatch(rule),
    `  Reason: ${rule.reason}`,
  ]);
  printListSection('Disabled rules', getMergedOverrides(policy, 'off'), (override) => [
    override.key,
  ]);
  printListSection('Reason overrides', getMergedOverrides(policy, 'reason'), (override) => [
    override.key,
    `  Reason: ${(override.value as { reason: string }).reason}`,
  ]);
  printListSection('Transparent wrappers', policy.transparent_wrappers, (wrapper) => [wrapper]);
  printListSection('Issues', policy.errors, (error) => [error]);
  printListSection('Warnings', policy.warnings, (warning) => [warning]);
}

function printListSection<T>(title: string, items: T[], format: (item: T) => string[]): void {
  if (items.length === 0) {
    console.log(`${title}: (none)`);
    return;
  }
  console.log(`${title} (${items.length}):`);
  for (const item of items) {
    const [firstLine, ...detailLines] = format(item);
    console.log(`  - ${firstLine}`);
    for (const line of detailLines) console.log(`    ${line}`);
  }
}

/**
 * How a rule matches, in the shape its own rulebook version states it. A version 2 rule
 * carries no `block_args`, so printing that row would show an empty list for every one of
 * them and hide the `match` contract that actually decides the block.
 */
function describeRuleMatch(rule: CustomRule): string[] {
  if (!rule.match) {
    return [
      `  Command: ${rule.subcommand ? `${rule.command} ${rule.subcommand}` : rule.command}`,
      `  Block args: ${rule.block_args.join(', ')}`,
    ];
  }
  return [
    `  Command: ${[rule.command, ...rule.match.command_path].join(' ')}`,
    ...(rule.match.any_args ? [`  Any args: ${rule.match.any_args.join(', ')}`] : []),
    ...(rule.match.exclude_args ? [`  Exclude args: ${rule.match.exclude_args.join(', ')}`] : []),
  ];
}

function getRuleSource(policy: LoadedRulesPolicy, ruleName: string): 'user' | 'project' {
  return (
    policy.rulebooks.find((rulebook) => rulebook.rules.includes(ruleName))?.source ?? 'project'
  );
}

function getMergedOverrides(
  policy: LoadedRulesPolicy,
  kind: 'off' | 'reason',
): Array<{ key: string; value: RuleOverride }> {
  return Object.entries({
    ...(policy.userConfig?.overrides ?? {}),
    ...(policy.projectConfig?.overrides ?? {}),
  })
    .filter((entry): entry is [string, RuleOverride] => {
      if (kind === 'off') return entry[1] === 'off';
      return !!entry[1] && typeof entry[1] === 'object';
    })
    .map(([key, value]) => ({ key, value }));
}

function printResultErrors(result: { errors: string[] }): void {
  for (const error of result.errors) console.error(error);
}
