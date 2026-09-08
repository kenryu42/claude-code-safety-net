import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir as systemTempRoot } from 'node:os';
import { join } from 'node:path';
import { REASON_DERIVED_COMMAND_WORK_LIMIT } from '@/core/budget';
import { createTestEnvironment, processPathResolver as portedPaths } from '@/core/environment';
import { resolveProtectedGitMetadata } from '@/core/git/metadata';
import type { EffectiveSafetyCapabilities } from '@/core/policy/types';
import { analyzeOrCapBreach, analyzeCommand as portedAnalyzeCommand } from '@/gate/analyzer';
import { REASON_RECURSION_LIMIT } from '@/gate/analyzer/reasons';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { policySnapshot } from '../../helpers/policy';
import { corpusCommands, differentialSources } from '../../helpers/shell-inputs';

/**
 * The analyzer entry point decides the whole destructive half of the gate, so this runs the corpus
 * commands, the fixed parser table and the seeded fuzz through it with one policy, one capability
 * set and one process state, and records the deny decision. Every budget the entry owns also gets
 * a breach and a below-the-cap counterpart, so a cap that silently moves fails here rather than in
 * a later phase.
 */

const workspace = mkdtempSync(join(systemTempRoot(), 'analyze-command-differential-'));
const agentHome = join(workspace, 'agent-home');
const scratch = join(workspace, 'scratch');
const project = join(workspace, 'checkout');
for (const directory of [agentHome, scratch, project, join(project, '.git')]) {
  mkdirSync(directory, { recursive: true });
}

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const processState = new Map([
  ['HOME', agentHome],
  ['TMPDIR', scratch],
  ['PATH', '/usr/bin:/bin'],
  ['SHELL', '/bin/bash'],
  ['USER', 'agent'],
]);

const portedEnvironment = createTestEnvironment({
  env: processState,
  home: agentHome,
  tmpdir: scratch,
  paths: portedPaths,
});

// Resolved once, so the recorded decisions isolate the entry point from anchor resolution
// (pinned by tests/core/git/metadata.test.ts).
const gitMetadata = resolveProtectedGitMetadata(project, portedEnvironment);

const customRules = [
  {
    name: 'terraform-destroy',
    command: 'terraform',
    subcommand: 'destroy',
    block_args: ['-auto-approve'],
    reason: 'Terraform destroy removes live infrastructure. Ask the user to run it.',
  },
  {
    name: 'helm-uninstall',
    command: 'helm',
    block_args: ['uninstall'],
    reason: 'Helm uninstall removes a release. Ask the user to run it.',
  },
];
const transparentWrappers = ['doas', 'nice'];

const portedSnapshot = policySnapshot({
  rules: customRules,
  transparent_wrappers: transparentWrappers,
});

function capabilityState(enabled: boolean) {
  return { enabled, source: 'preset' as const, sources: [] };
}

type AnalysisMode = {
  readonly label: string;
  readonly capabilities: EffectiveSafetyCapabilities;
  readonly options: {
    strict?: boolean;
    paranoidRm?: boolean;
    paranoidInterpreters?: boolean;
    worktreeMode?: boolean;
  };
};

function mode(label: string, options: AnalysisMode['options']): AnalysisMode {
  return {
    label,
    capabilities: {
      fail_closed: capabilityState(options.strict ?? false),
      paranoid_rm: capabilityState(options.paranoidRm ?? false),
      paranoid_interpreters: capabilityState(options.paranoidInterpreters ?? false),
    },
    options,
  };
}

const FULL_INPUT_MODES: readonly AnalysisMode[] = [
  mode('standard', {}),
  mode('strict', { strict: true }),
];

const CORPUS_ONLY_MODES: readonly AnalysisMode[] = [
  mode('paranoid_rm', { paranoidRm: true }),
  mode('paranoid_interpreters', { paranoidInterpreters: true }),
  mode('worktree_mode', { worktreeMode: true }),
];

/**
 * The analyzer throws the caps the pipeline maps back into denials; the recorded decision maps
 * them the same way and rethrows the rest.
 */
function portedDecision(command: string, analysis: AnalysisMode) {
  return analyzeOrCapBreach(
    () =>
      portedAnalyzeCommand(command, {
        policySnapshot: portedSnapshot,
        effectiveCapabilities: analysis.capabilities,
        environment: portedEnvironment,
        protectedGitMetadata: gitMetadata,
        cwd: project,
        ...analysis.options,
      }),
    command,
  ).decision;
}

/**
 * Every decision the port reached since the last digest. Each test drains it, so the recorded
 * hash covers exactly the commands that test compared.
 */
const recorded: [string, unknown][] = [];

/** Records one command's decision, naming it so a digest diff points at the input. */
function expectSameDecision(command: string, analysis: AnalysisMode) {
  const ported = portedDecision(command, analysis);
  recorded.push([`${analysis.label}: ${command}`, ported]);
  return ported;
}

describe('analyzeCommand differential', () => {
  for (const analysis of FULL_INPUT_MODES) {
    test(`corpora, fixed commands and seeded fuzz agree at ${analysis.label}`, () => {
      const denials = differentialSources().filter(
        (command) => expectSameDecision(command, analysis) !== null,
      );
      expect(denials.length).toBeGreaterThan(20);
      expectRecordedDigest(
        `analyzer-analyze-command/sources-${analysis.label}`,
        recorded.splice(0),
        workspace,
      );
    });
  }

  for (const analysis of CORPUS_ONLY_MODES) {
    test(`the corpus agrees under ${analysis.label}`, () => {
      const commands = corpusCommands();
      expect(commands.length).toBeGreaterThan(50);
      for (const command of commands) expectSameDecision(command, analysis);
      expectRecordedDigest(
        `analyzer-analyze-command/corpus-${analysis.label}`,
        recorded.splice(0),
        workspace,
      );
    });
  }

  test('the custom rules and transparent wrappers of this snapshot are reachable', () => {
    const standard = FULL_INPUT_MODES[0];
    if (!standard) throw new Error('missing standard mode');
    for (const command of [
      'terraform destroy -auto-approve',
      'doas terraform destroy -auto-approve',
      'nice -n 5 helm uninstall release',
      'helm upgrade release',
    ]) {
      expectSameDecision(command, standard);
    }
    expect(expectSameDecision('terraform destroy -auto-approve', standard)?.ruleId).toBe(
      'custom.terraform-destroy',
    );
    expect(expectSameDecision('helm upgrade release', standard)).toBeNull();
    expectRecordedDigest('analyzer-analyze-command/custom-rules', recorded.splice(0), workspace);
  });
});

/** Nests `bash -c` so the analyzer meets the recursion cap before it meets the payload. */
function nestShellWrappers(depth: number, payload: string): string {
  let command = payload;
  for (let level = 0; level < depth; level++) {
    command = `bash -c ${JSON.stringify(command)}`;
  }
  return command;
}

function repeatWords(count: number, word: (index: number) => string): string {
  return Array.from({ length: count }, (_unused, index) => word(index)).join(' ');
}

const BUDGET_BREACHES: readonly {
  readonly budget: string;
  readonly breaching: string;
  readonly allowed: string;
  readonly reason: string;
}[] = [
  {
    budget: 'recursion depth',
    breaching: nestShellWrappers(10, 'echo ok'),
    allowed: nestShellWrappers(9, 'echo ok'),
    reason: REASON_RECURSION_LIMIT,
  },
  {
    // Each `&&` step keeps the state before it and the state with the new function defined, so
    // the distinct states outrun the control-flow cap that deduplication enforces.
    budget: 'control-flow states',
    breaching: repeatWords(64, (index) => `{ state${index}() { :; }; } &&`).slice(0, -3),
    allowed: repeatWords(63, (index) => `{ state${index}() { :; }; } &&`).slice(0, -3),
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
  },
  {
    budget: 'tracked heredoc files',
    breaching: `tee ${repeatWords(65, (index) => `sink${index}`)} <<'BODY'\nhello\nBODY`,
    allowed: `tee ${repeatWords(64, (index) => `sink${index}`)} <<'BODY'\nhello\nBODY`,
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
  },
  {
    // Every embedded shell token reserves the words left after it, so the reservations sum past
    // the derived-command cap well before the token list itself is remarkable.
    budget: 'derived command work',
    breaching: `unknown-head ${repeatWords(181, () => 'bash')}`,
    allowed: `unknown-head ${repeatWords(180, () => 'bash')}`,
    reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
  },
];

describe('analyzer budget breaches', () => {
  const standard = FULL_INPUT_MODES[0];
  if (!standard) throw new Error('missing standard mode');

  for (const breach of BUDGET_BREACHES) {
    test(`${breach.budget} denies with its reason, and stays silent below the cap`, () => {
      const denial = expectSameDecision(breach.breaching, standard);
      expect(denial?.reason).toBe(breach.reason);
      expect(denial?.intent).toBe('stop_and_explain');
      expect(expectSameDecision(breach.allowed, standard)).toBeNull();
      expectRecordedDigest(
        `analyzer-analyze-command/budget-${breach.budget}`,
        recorded.splice(0),
        workspace,
      );
    });
  }
});
