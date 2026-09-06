import { describe, expect, test } from 'bun:test';
import { checkPolicyRuleMatch as checkWithNext } from '@next/core/rules/custom';
import type { PolicyRule } from '@next/core/rules/types';
import { checkPolicyRuleMatch as checkWithSrc } from '@/rules/custom';
import { behavioralContractCases } from '../../../analyzer/behavioral-contract-cases';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, createSeededRandom, FUZZ_SEED } from '../../helpers/shell-inputs';

/**
 * The custom-rule compiler is fed the same rule tables and token lists in both
 * implementations. Token lists are analyzer input; nothing here is executed.
 */

const V1_RULES: readonly PolicyRule[] = [
  {
    name: 'docker-prune',
    command: 'docker',
    subcommand: 'system',
    block_args: ['prune'],
    reason: 'r',
  },
  {
    name: 'docker-rm-force',
    command: 'docker',
    subcommand: 'rm',
    block_args: ['-f', '--force'],
    reason: 'r',
    intent: 'use_alternative',
  },
  {
    name: 'docker-volume',
    command: 'docker',
    subcommand: 'volume',
    block_args: ['rm', 'prune'],
    reason: 'r',
  },
  {
    name: 'docker-upper',
    command: 'DOCKER',
    subcommand: 'image',
    block_args: ['prune'],
    reason: 'r',
  },
  {
    name: 'git-push-force',
    command: 'git',
    subcommand: 'push',
    block_args: ['--force', '-f'],
    reason: 'r',
  },
  {
    name: 'git-branch-delete',
    command: 'git',
    subcommand: 'branch',
    block_args: ['-D', '-d', '--delete'],
    reason: 'r',
    intent: 'manual_only',
  },
  { name: 'git-any-hard', command: 'git', block_args: ['--hard'], reason: 'r' },
  { name: 'git-clean', command: 'git', subcommand: 'clean', block_args: ['-f', '-x'], reason: 'r' },
  { name: 'git-stash-empty', command: 'git', subcommand: 'stash', block_args: [], reason: 'r' },
  {
    name: 'git-checkout-dash',
    command: 'git',
    subcommand: 'checkout',
    block_args: ['--'],
    reason: 'r',
  },
  {
    name: 'git-exe-reset',
    command: 'C:\\Program Files\\Git\\bin\\git.exe',
    subcommand: 'reset',
    block_args: ['--hard'],
    reason: 'r',
    intent: 'stop_and_explain',
  },
  {
    name: 'npm-publish',
    command: 'npm',
    subcommand: 'publish',
    block_args: ['--access', 'public'],
    reason: 'r',
  },
  {
    name: 'npm-global',
    command: 'npm',
    subcommand: 'install',
    block_args: ['-g', '--global'],
    reason: 'r',
    intent: 'scope_down',
  },
  { name: 'rm-recursive', command: 'rm', block_args: ['-r', '-R'], reason: 'r' },
  { name: 'rm-force', command: 'rm', block_args: ['-f'], reason: 'r', intent: 'hard_stop' },
  {
    name: 'kubectl-delete-all',
    command: 'kubectl',
    subcommand: 'delete',
    block_args: ['--all', '-A'],
    reason: 'r',
  },
  {
    name: 'terraform-destroy-v1',
    command: 'terraform',
    subcommand: 'destroy',
    block_args: ['-auto-approve', '--auto-approve'],
    reason: 'r',
  },
  {
    name: 'gh-repo-delete',
    command: 'gh',
    subcommand: 'repo',
    block_args: ['delete'],
    reason: 'r',
  },
];

function v2(
  name: string,
  command: string,
  match: PolicyRule['match'],
  intent?: PolicyRule['intent'],
): PolicyRule {
  return { name, command, block_args: [], match, reason: `${name} reason`, intent };
}

const V2_RULES: readonly PolicyRule[] = [
  v2('tf-destroy', 'terraform', { command_path: ['destroy'] }),
  v2('tf-apply-destroy', 'terraform', {
    command_path: ['apply'],
    any_args: ['-destroy', '--destroy'],
  }),
  v2('tf-state-rm', 'terraform', {
    command_path: ['state', 'rm'],
    exclude_args: ['-dry-run', '--dry-run'],
  }),
  v2('aws-terminate', 'aws', { command_path: ['ec2', 'terminate-instances'] }, 'hard_stop'),
  v2('aws-s3-rm', 'aws', { command_path: ['s3', 'rm'], exclude_args: ['--dryrun'] }),
  v2('aws-s3-rb', 'aws', { command_path: ['s3', 'rb'], any_args: ['--force'] }),
  v2('aws-rds-delete', 'aws', {
    command_path: ['rds', 'delete-db-instance'],
    any_args: ['--skip-final-snapshot'],
    exclude_args: ['--dry-run'],
  }),
  v2('gcloud-instances-delete', 'gcloud', { command_path: ['compute', 'instances', 'delete'] }),
  v2('gcloud-beta-instances-delete', 'gcloud', {
    command_path: ['beta', 'compute', 'instances', 'delete'],
  }),
  v2('gcloud-projects-delete', 'gcloud', {
    command_path: ['projects', 'delete'],
    any_args: ['--quiet', '-q'],
  }),
  v2(
    'gcloud-sql-delete',
    'gcloud',
    { command_path: ['sql', 'instances', 'delete'] },
    'manual_only',
  ),
  v2('az-group-delete', 'az', { command_path: ['group', 'delete'] }),
  v2('az-vm-delete', 'az', { command_path: ['vm', 'delete'], any_args: ['--yes', '-y'] }),
  v2('az-storage-delete', 'az', {
    command_path: ['storage', 'account', 'delete'],
    exclude_args: ['--dry-run'],
  }),
  v2('az-exe-ad-delete', 'az.exe', { command_path: ['ad', 'app', 'delete'] }, 'use_alternative'),
  v2('docker-prune-all', 'docker', {
    command_path: ['system', 'prune'],
    any_args: ['-a', '--all'],
  }),
  v2('git-push-force-v2', 'git', {
    command_path: ['push'],
    any_args: ['--force', '-f'],
    exclude_args: ['--force-with-lease'],
  }),
  v2('kubectl-delete-ns', 'kubectl', { command_path: ['delete', 'namespace'] }, 'scope_down'),
  v2('nuke-anywhere', 'rm', { command_path: [], any_args: ['--nuke'] }),
];

const CORPUS_RULES: readonly PolicyRule[] = behavioralContractCases({
  cwd: '/work/project',
  home: '/home/agent',
}).flatMap((row) => row.options.policySnapshot.policy.rules);

const RULE_TABLES = [
  V1_RULES,
  V2_RULES,
  CORPUS_RULES,
  [...V2_RULES, ...V1_RULES, ...CORPUS_RULES],
  [],
];

const FIXED_TOKEN_LISTS = [
  [],
  [''],
  ['git'],
  ['git', 'push', '--force'],
  ['git', 'push', '--force-with-lease', '-f'],
  ['git', '-c', 'push', '--force'],
  ['git', '-c', 'core.hooksPath=/tmp', 'push', '-f'],
  ['git', '-C', '.', '--git-dir', '.git', 'push', '--force'],
  ['git', '--', 'push', '--force'],
  ['git', '-C', '.', '--', 'push', '-f'],
  ['git', '--unknown', 'push', '--force'],
  ['git', '--unknown=1', 'push', '-f'],
  ['git', '--unknown', '--other', 'push', '-f'],
  ['git', 'branch', '-fD', 'old'],
  ['git', 'reset', '--hard'],
  ['/usr/bin/git', 'reset', '--hard'],
  ['C:\\Program Files\\Git\\bin\\git.exe', 'reset', '--hard'],
  ['GIT.EXE', 'clean', '-fdx'],
  ['git', 'stash', 'drop'],
  ['git', 'checkout', '--', 'file'],
  ['docker', 'system', 'prune'],
  ['docker', '-H', 'tcp://host', 'system', 'prune', '-a'],
  ['docker', '--context', 'prod', '-l', 'debug', 'rm', '-f', 'c1'],
  ['docker', '--config=~/.docker', 'volume', 'rm', 'v1'],
  ['Docker', 'image', 'prune'],
  ['aws', 'ec2', 'terminate-instances', '--instance-ids', 'i-1'],
  ['aws', '--profile', 'prod', '--region', 'us-east-1', 'ec2', 'terminate-instances'],
  ['aws', '--profile=prod', 's3', 'rm', 's3://b/k'],
  ['aws', '--profile', 's3', 'rm', 's3://b/k'],
  ['aws', 's3', 'rm', '--dryrun', 's3://b/k'],
  ['aws', 's3', 'rb', '--force', 's3://b'],
  ['aws', '--debug', 's3', 'rb', 's3://b'],
  ['AWS.EXE', 'rds', 'delete-db-instance', '--skip-final-snapshot'],
  ['gcloud', 'compute', 'instances', 'delete', 'vm-1'],
  ['gcloud', '--project', 'p', '--format', 'json', 'compute', 'instances', 'delete'],
  ['gcloud', 'beta', 'compute', 'instances', 'delete'],
  ['gcloud', '--quiet', 'projects', 'delete', 'p'],
  ['gcloud', 'projects', 'delete', 'p', '-q'],
  ['az', 'group', 'delete', '-n', 'rg'],
  ['az', '-o', 'json', 'group', 'delete'],
  ['az', '--output', 'group', 'delete'],
  ['az', 'vm', 'delete', '--yes'],
  ['az.exe', 'ad', 'app', 'delete', '--id', 'x'],
  ['az', 'storage', 'account', 'delete', '--dry-run'],
  ['terraform', 'destroy'],
  ['terraform', '-chdir=infra', 'destroy', '-auto-approve'],
  ['terraform', 'apply', '-destroy'],
  ['terraform', 'apply', '--auto-approve'],
  ['terraform', 'state', 'rm', 'aws_instance.x'],
  ['terraform', 'state', 'rm', '--dry-run', 'aws_instance.x'],
  ['kubectl', 'delete', 'namespace', 'prod'],
  ['kubectl', 'delete', 'pods', '--all'],
  ['npm', 'install', '-g', 'pkg'],
  ['npm', 'publish', '--access', 'public'],
  ['npm', '--prefix', 'dir', 'install', '--global'],
  ['rm', '-rf', '/'],
  ['rm', '--', '-rf'],
  ['rm', '-xyz'],
  ['rm', '--nuke'],
  ['rm', 'x', '--nuke'],
  ['gh', 'repo', 'delete', 'o/r'],
  ['echo', 'git', 'push', '--force'],
];

const FUZZ_HEADS = [
  'git',
  'docker',
  'aws',
  'gcloud',
  'az',
  'npm',
  'terraform',
  'kubectl',
  'rm',
  'gh',
  '/usr/bin/git',
  'C:\\Program Files\\Git\\bin\\git.exe',
  'Docker',
  'AWS.EXE',
  'az.exe',
  './git',
  'echo',
  '',
];

const FUZZ_WORDS = [
  'push',
  'reset',
  'checkout',
  'system',
  'prune',
  'rm',
  'rb',
  'ec2',
  'terminate-instances',
  's3',
  'compute',
  'instances',
  'delete',
  'delete-db-instance',
  'group',
  'vm',
  'storage',
  'account',
  'install',
  'publish',
  'destroy',
  'apply',
  'state',
  'beta',
  'projects',
  'sql',
  'rds',
  'namespace',
  'image',
  'volume',
  'branch',
  'clean',
  'stash',
  'repo',
  'ad',
  'app',
  'origin',
  'main',
  'prod',
  'us-east-1',
  'json',
  '.',
  '/tmp/x',
  'HEAD',
  'core.hooksPath=/tmp',
  'public',
  '',
  '-f',
  '-rf',
  '-fd',
  '-fdx',
  '-D',
  '-d',
  '-x',
  '-g',
  '-A',
  '-a',
  '-q',
  '-y',
  '-n',
  '-c',
  '-C',
  '-H',
  '-l',
  '-o',
  '-xyz',
  '-rfD',
  '-',
  '--',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--config-env',
  '--config',
  '--context',
  '--host',
  '--log-level',
  '--profile',
  '--region',
  '--output',
  '--query',
  '--subscription',
  '--project',
  '--format',
  '--account',
  '--force',
  '--force-with-lease',
  '--hard',
  '--dry-run',
  '-dry-run',
  '--dryrun',
  '-destroy',
  '--destroy',
  '--all',
  '--delete',
  '--global',
  '--yes',
  '--quiet',
  '--nuke',
  '--auto-approve',
  '-auto-approve',
  '--skip-final-snapshot',
  '--access',
  '--unknown',
  '--profile=prod',
  '-chdir=infra',
  '--output=json',
  '-o=json',
  '--unknown=1',
];

function fuzzTokenLists(count: number, seed: number) {
  const random = createSeededRandom(seed);
  const pick = (values: readonly string[]) => values[Math.floor(random() * values.length)] ?? '';
  return Array.from({ length: count }, () => {
    const length = Math.floor(random() * 10);
    return Array.from({ length }, (_, index) =>
      index === 0 && random() < 0.85 ? pick(FUZZ_HEADS) : pick(FUZZ_WORDS),
    );
  });
}

describe('checkPolicyRuleMatch parity', () => {
  test('agrees with the shipped compiler on every token list and rule table', () => {
    const lists = [
      ...FIXED_TOKEN_LISTS,
      ...corpusCommands().map((command) => command.split(/\s+/).filter((token) => token !== '')),
      ...fuzzTokenLists(400, FUZZ_SEED),
    ];
    expect(lists.length).toBeGreaterThanOrEqual(200);
    const recorded = lists.flatMap((tokens, row) =>
      RULE_TABLES.map((rules, table) => {
        const next = checkWithNext(tokens, rules);
        expect(next).toEqual(checkWithSrc(tokens, rules));
        return [`${row}-${table}`, next] as const;
      }),
    );
    const outcomes = recorded.map((entry) => entry[1]);
    const matched = new Set(outcomes.flatMap((match) => (match === null ? [] : [match.id])));
    expect(outcomes.some((match) => match === null)).toBe(true);
    // The tables must actually fire: a rule set no input matches proves nothing.
    expect(matched.size).toBeGreaterThan(20);
    expectRecordedDigest('core-rules-custom/rule-matches', recorded);
  });
});
