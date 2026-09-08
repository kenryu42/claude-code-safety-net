import { afterAll, describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createProcessEnvironment } from '@/core/environment';
import { getUserPolicyPath } from '@/core/policy/paths';
import { getNonCommandToolInputKind } from '@/core/tool-input';
import { createGateTree, portedVerdict, toolCall } from '../helpers/gate-differential';
import { policySnapshot } from '../helpers/policy';
import { pipelineContractCases } from './pipeline-contract-cases';

/**
 * Hosts hand the gate more than shell commands: a file to read, a patch to apply, a directory to
 * search. Those payloads never reach the analyzer, so the routing table and the guards are the
 * only things deciding them, and every row records how they were routed and decided. Every row
 * runs at standard and at strict.
 */

const tree = createGateTree('gate-tool-routes-');
const environment = createProcessEnvironment();
const home = homedir();
const userPolicyPath = getUserPolicyPath(environment);

afterAll(() => {
  tree.remove();
});

const LEVELS = {
  standard: policySnapshot(),
  strict: policySnapshot({ safety: { level: 'strict' } }),
};

/** The gate's verdict for a call at one level. */
function verdictFor(toolName: string, input: unknown, cwd: string, level: keyof typeof LEVELS) {
  const route =
    toolName === 'Bash'
      ? ({ kind: 'command', shell: 'posix' } as const)
      : { kind: getNonCommandToolInputKind(toolName) };
  return portedVerdict(toolCall(toolName, input, route, cwd), environment, {
    loadPolicySnapshot: () => LEVELS[level],
  });
}

/** What a row is about: which way the call went and, when it was refused, on whose authority. */
const decisionOf = (verdict: ReturnType<typeof verdictFor>) => ({
  outcome: verdict.outcome,
  stage: verdict.stage,
  ruleId: verdict.ruleId,
});

/**
 * The safety level tunes command analysis, and none of these payloads reaches it: a path, a patch
 * or a search is decided by the routing table and the guards alone. So every row must decide the
 * same way at standard and at strict, and a row that started depending on the level would be a
 * change of which stage owns it.
 */
function decisionAtEveryLevel(toolName: string, input: unknown, cwd: string) {
  const standard = verdictFor(toolName, input, cwd, 'standard');
  expect(decisionOf(verdictFor(toolName, input, cwd, 'strict'))).toStrictEqual(
    decisionOf(standard),
  );
  return standard;
}

describe('the pipeline corpus rows that carry no command', () => {
  const rows = pipelineContractCases({
    workspace: tree.workspace,
    repo: tree.repository,
    home,
    userPolicyPath,
    userPolicyDir: dirname(userPolicyPath),
  }).filter((row) => row.route.kind !== 'command');

  test('every non-command row decides the way the corpus declares, at either level', () => {
    expect(rows.length).toBe(5);
    for (const row of rows) {
      const verdict = decisionAtEveryLevel(
        row.toolName,
        row.input,
        row.cwd === 'repo' ? tree.repository : tree.workspace,
      );
      if (row.expected.kind === 'allow') {
        expect(verdict.outcome, row.name).toBe('allow');
        continue;
      }
      expect(
        { outcome: verdict.outcome, stage: verdict.stage, ruleId: verdict.ruleId },
        row.name,
      ).toStrictEqual({
        outcome: 'deny',
        stage: row.expected.stage,
        ruleId: row.expected.ruleId,
      });
    }
  });
});

/** One payload per host-shaped tool, with the sensitive path reached through its own field. */
const PAYLOADS = [
  {
    name: 'Read follows a tilde path',
    toolName: 'Read',
    input: { file_path: '~/.ssh/config' },
    denies: 'secret.home.ssh',
  },
  {
    name: 'Read follows an absolute credential path',
    toolName: 'Read',
    input: { file_path: join(home, '.aws', 'credentials') },
    denies: 'secret.home.aws',
  },
  {
    name: 'Read of an ordinary file',
    toolName: 'Read',
    input: { file_path: 'README.md' },
    denies: null,
  },
  {
    name: 'Write creates a dotenv file',
    toolName: 'Write',
    input: { file_path: '.env', content: 'TOKEN=1\n' },
    denies: 'secret.basename.env',
  },
  {
    name: 'Write targets the user policy file',
    toolName: 'Write',
    input: { file_path: userPolicyPath, content: '{"version":1}' },
    denies: 'policy',
  },
  {
    name: 'Write targets a Git hook',
    toolName: 'Write',
    input: {
      file_path: join(tree.repository, '.git', 'hooks', 'pre-push'),
      content: '#!/bin/sh\n',
    },
    cwd: tree.repository,
    denies: 'git-metadata',
  },
  {
    // Both gates agree, and the agreement is the point: through a path route the Git guard
    // protects the hook directories and the repository's own markers, not every file in `.git`.
    name: 'Write targets the Git config file',
    toolName: 'Write',
    input: { file_path: join(tree.repository, '.git', 'config'), content: '[core]\n' },
    cwd: tree.repository,
    denies: null,
  },
  {
    name: 'Edit rewrites a private key',
    toolName: 'Edit',
    input: { file_path: 'deploy/id_rsa', old_string: 'a', new_string: 'b' },
    denies: 'secret.basename.id-rsa',
  },
  {
    name: 'Edit rewrites source',
    toolName: 'Edit',
    input: { file_path: 'src/index.ts', old_string: 'a', new_string: 'b' },
    denies: null,
  },
  {
    name: 'MultiEdit names the key in its path field',
    toolName: 'MultiEdit',
    input: { file_path: 'keys/id_ed25519', edits: [{ old_string: 'a', new_string: 'b' }] },
    denies: 'secret.basename.id-ed25519',
  },
  {
    name: 'MultiEdit mentions a sensitive path only in replacement text',
    toolName: 'MultiEdit',
    input: {
      file_path: 'src/app.ts',
      edits: [{ old_string: 'read()', new_string: "read('~/.ssh/config')" }],
    },
    denies: null,
  },
  {
    name: 'NotebookEdit follows its notebook path',
    toolName: 'NotebookEdit',
    input: { notebook_path: join(home, '.ssh', 'id_rsa'), new_source: 'print(1)' },
    denies: 'secret.home.ssh',
  },
  {
    name: 'Grep searches a credential directory',
    toolName: 'Grep',
    input: { pattern: 'AKIA', path: join(home, '.aws') },
    denies: 'secret.home.aws',
  },
  {
    name: 'Grep filters by a key glob',
    toolName: 'Grep',
    input: { pattern: 'PRIVATE', glob: 'deploy/server.pem', path: '.' },
    denies: 'secret.ext.pem',
  },
  {
    name: 'Glob names the dotenv file in its pattern',
    toolName: 'Glob',
    input: { pattern: '.env', path: '.' },
    denies: 'secret.basename.env',
  },
  {
    name: 'Glob searches source',
    toolName: 'Glob',
    input: { pattern: '**/*.ts', path: 'src' },
    denies: null,
  },
  {
    name: 'apply_patch updates a dotenv file through an apply-patch header',
    toolName: 'apply_patch',
    input: { input: '*** Begin Patch\n*** Update File: .env\n@@\n+TOKEN=1\n*** End Patch\n' },
    denies: 'secret.basename.env',
  },
  {
    name: 'apply_patch adds a key through a git diff header',
    toolName: 'apply_patch',
    input: {
      patch: 'diff --git a/deploy/id_rsa b/deploy/id_rsa\n--- /dev/null\n+++ b/deploy/id_rsa\n',
    },
    denies: 'secret.basename.id-rsa',
  },
  {
    name: 'apply_patch edits source through a unified diff header',
    toolName: 'apply_patch',
    input: { patch: '--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-a\n+b\n' },
    denies: null,
  },
  {
    name: 'an unrouted tool still has its payload read as a command',
    toolName: 'MysteryTool',
    input: { command: 'cat ~/.ssh/config' },
    denies: 'secret.home.ssh',
  },
  {
    // The other half of an unknown route: the path-like fields, which the secret guard reads
    // alongside the command candidate. Both gates deny it at standard and at strict.
    name: 'an unrouted tool names a private key in its path field',
    toolName: 'MysteryTool',
    input: { file_path: join(home, '.ssh', 'id_rsa') },
    denies: 'secret.home.ssh',
  },
] as const;

describe('hand-built host payloads', () => {
  for (const payload of PAYLOADS) {
    test(payload.name, () => {
      const cwd = 'cwd' in payload ? payload.cwd : tree.workspace;
      const verdict = decisionAtEveryLevel(payload.toolName, payload.input, cwd);

      if (payload.denies === null) {
        // An allowed payload never reached a guard that could name a rule for it.
        expect(decisionOf(verdict)).toStrictEqual({
          outcome: 'allow',
          stage: 'non-command',
          ruleId: undefined,
        });
        return;
      }
      // The policy and Git-metadata guards refuse a place rather than a catalogued secret, so
      // they answer with a stage and no rule id.
      const protects = payload.denies === 'policy' || payload.denies === 'git-metadata';
      expect(decisionOf(verdict)).toStrictEqual({
        outcome: 'deny',
        stage: protects ? 'policy-protection' : 'secret-protection',
        ruleId: protects ? undefined : payload.denies,
      });
    });
  }

  test('the table covers every non-command route', () => {
    expect(
      [...new Set(PAYLOADS.map((payload) => getNonCommandToolInputKind(payload.toolName)))].sort(),
    ).toStrictEqual(['glob', 'grep', 'patch', 'path', 'unknown']);
  });
});
