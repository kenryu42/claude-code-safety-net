import { join } from 'node:path';
import type { BlockIntent } from '@/core/decision';
import type { PolicySafetyLevel } from '@/core/policy/types';
import type { ToolRoute } from '@/gate/invocation';
import type { GuardStage } from '@/gate/pipeline';

/**
 * Contract rows that only the full guard pipeline can decide: secret-path,
 * policy-file, policy-apply, and Git-metadata protection, tool routing, and
 * fail-closed input handling. `behavioral-contract-cases.ts` owns the
 * destructive-command rows; both corpora run through `contract.test.ts`.
 */
export interface PipelineContractCase {
  name: string;
  toolName: string;
  input: unknown;
  route: ToolRoute;
  /** Which of the fixture directories the invocation runs in. */
  cwd: 'workspace' | 'repo';
  level?: PolicySafetyLevel;
  expected:
    | { kind: 'allow' }
    | {
        kind: 'block';
        stage: GuardStage;
        ruleId?: string;
        intent: BlockIntent;
        reasonIncludes: string;
      };
}

/**
 * Denial reasons hosts display. Contract constants: every implementation
 * reproduces them verbatim, so the corpus imports nothing but types.
 */
const REASON_SECRET_PROTECTION = 'Access to a sensitive path is not allowed.';
const REASON_POLICY_CONFIG_PROTECTION =
  'This path contains the protected policy config and you must not modify or delete it.';
const REASON_POLICY_APPLY_PROTECTION =
  'Only the user may apply a policy proposal, because it rewrites the configuration CC Safety Net enforces.';
const REASON_GIT_METADATA_PROTECTION =
  'Git metadata and hooks are protected. Ask the user before modifying them.';

export function pipelineContractCases(paths: {
  workspace: string;
  repo: string;
  home: string;
  userPolicyPath: string;
  userPolicyDir: string;
}): PipelineContractCase[] {
  const bash = (command: string): Pick<PipelineContractCase, 'toolName' | 'input' | 'route'> => ({
    toolName: 'Bash',
    input: { command },
    route: { kind: 'command', shell: 'posix' },
  });
  const secretBlock = (ruleId: string): PipelineContractCase['expected'] => ({
    kind: 'block',
    stage: 'secret-protection',
    ruleId,
    intent: 'hard_stop',
    reasonIncludes: REASON_SECRET_PROTECTION,
  });
  const policyBlock: PipelineContractCase['expected'] = {
    kind: 'block',
    stage: 'policy-protection',
    intent: 'hard_stop',
    reasonIncludes: REASON_POLICY_CONFIG_PROTECTION,
  };
  const gitMetadataBlock: PipelineContractCase['expected'] = {
    kind: 'block',
    stage: 'policy-protection',
    intent: 'hard_stop',
    reasonIncludes: REASON_GIT_METADATA_PROTECTION,
  };

  return [
    {
      name: 'denies reading an SSH config through the shell',
      ...bash('cat ~/.ssh/config'),
      cwd: 'workspace',
      expected: secretBlock('secret.home.ssh'),
    },
    {
      name: 'denies reading an SSH config after a cd into home',
      ...bash('cd ~ && cat .ssh/config'),
      cwd: 'workspace',
      expected: secretBlock('secret.home.ssh'),
    },
    {
      name: 'denies a destructive command on a sensitive path at secret protection, before command analysis',
      ...bash('rm -rf ~/.ssh'),
      cwd: 'workspace',
      expected: secretBlock('secret.home.ssh'),
    },
    {
      name: 'denies a cd whose operand is the AWS credential directory',
      ...bash('cd ~/.aws && cat credentials'),
      cwd: 'workspace',
      expected: secretBlock('secret.home.aws'),
    },
    {
      name: 'denies a sensitive path carried through a shell assignment',
      ...bash('f=~/.ssh/id_rsa; cat "$f"'),
      cwd: 'workspace',
      expected: secretBlock('secret.home.ssh'),
    },
    {
      name: 'denies a read tool targeting AWS credentials',
      toolName: 'Read',
      input: { file_path: join(paths.home, '.aws', 'credentials') },
      route: { kind: 'path' },
      cwd: 'workspace',
      expected: secretBlock('secret.home.aws'),
    },
    {
      name: 'allows a read tool targeting an ordinary file',
      toolName: 'Read',
      input: { file_path: 'README.md' },
      route: { kind: 'path' },
      cwd: 'workspace',
      expected: { kind: 'allow' },
    },
    {
      name: 'allows a search tool over an ordinary directory',
      toolName: 'Grep',
      input: { pattern: 'TODO', path: 'src' },
      route: { kind: 'grep' },
      cwd: 'workspace',
      expected: { kind: 'allow' },
    },
    {
      name: 'allows a metadata-only look at a sensitive directory at standard safety',
      ...bash('ls -la ~/.ssh'),
      cwd: 'workspace',
      expected: { kind: 'allow' },
    },
    {
      name: 'denies a metadata-only look at a sensitive directory at strict safety',
      ...bash('ls -la ~/.ssh'),
      cwd: 'workspace',
      level: 'strict',
      expected: secretBlock('secret.home.ssh'),
    },
    {
      name: 'denies a shell redirection into the user policy file',
      ...bash(`echo x > ${paths.userPolicyPath}`),
      cwd: 'workspace',
      expected: policyBlock,
    },
    {
      name: 'denies deleting the user policy file after a cd into its directory',
      ...bash(`cd ${paths.userPolicyDir} && rm policy.json`),
      cwd: 'workspace',
      expected: policyBlock,
    },
    {
      name: 'denies a write tool targeting the project policy file',
      toolName: 'Write',
      input: { file_path: join(paths.workspace, '.cc-safety-net', 'policy.json'), content: '{}' },
      route: { kind: 'path' },
      cwd: 'workspace',
      expected: policyBlock,
    },
    {
      name: 'denies an agent applying a project policy through a package runner',
      ...bash('npx -y cc-safety-net policy apply team.json'),
      cwd: 'workspace',
      expected: {
        kind: 'block',
        stage: 'policy-protection',
        intent: 'hard_stop',
        reasonIncludes: REASON_POLICY_APPLY_PROTECTION,
      },
    },
    {
      name: 'denies recursive removal of the Git directory',
      ...bash('rm -rf .git'),
      cwd: 'repo',
      expected: {
        kind: 'block',
        stage: 'command-analysis',
        ruleId: 'rm.git-metadata',
        intent: 'hard_stop',
        reasonIncludes: 'Git',
      },
    },
    {
      name: 'denies a shell redirection into a Git hook',
      ...bash('echo x > .git/hooks/pre-commit'),
      cwd: 'repo',
      expected: gitMetadataBlock,
    },
    {
      name: 'denies a write tool targeting a Git hook',
      toolName: 'Write',
      input: { file_path: '.git/hooks/pre-commit', content: '' },
      route: { kind: 'path' },
      cwd: 'repo',
      expected: gitMetadataBlock,
    },
    {
      name: 'fails closed on a blank shell command',
      ...bash('   '),
      cwd: 'workspace',
      expected: {
        kind: 'block',
        stage: 'command-validation',
        intent: 'stop_and_explain',
        reasonIncludes: 'failed closed',
      },
    },
    {
      name: 'denies destructive Git through the full pipeline',
      ...bash('git reset --hard'),
      cwd: 'workspace',
      expected: {
        kind: 'block',
        stage: 'command-analysis',
        ruleId: 'git.reset-hard',
        intent: 'use_alternative',
        reasonIncludes: 'destroys all uncommitted changes',
      },
    },
  ];
}
