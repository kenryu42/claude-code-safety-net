import { afterAll, describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createProcessEnvironment } from '@next/core/environment';
import { getUserPolicyPath } from '@next/core/policy/paths';
import { getNonCommandToolInputKind } from '@next/core/tool-input';
import { pipelineContractCases } from '../../engine/pipeline-contract-cases';
import { policySnapshot } from '../../helpers/policy';
import {
  createGateTree,
  portedVerdict,
  shippedVerdict,
  toolCall,
} from '../helpers/gate-differential';
import { recordPorted, rootFolds } from '../helpers/temp-home';

/**
 * Hosts hand the gate more than shell commands: a file to read, a patch to apply, a directory to
 * search. Those payloads never reach the analyzer, so the routing table and the guards are the
 * only things deciding them, and both implementations must route and decide them the same way.
 * Every row runs at standard and at strict.
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

/** The port's verdict for a call, asserted equal to the shipped gate's before it is returned. */
function agreedVerdict(
  name: string,
  toolName: string,
  input: unknown,
  cwd: string,
  level: keyof typeof LEVELS,
) {
  const route =
    toolName === 'Bash'
      ? ({ kind: 'command', shell: 'posix' } as const)
      : { kind: getNonCommandToolInputKind(toolName) };
  const call = toolCall(toolName, input, route, cwd);
  const dependencies = { loadPolicySnapshot: () => LEVELS[level] };
  const ported = portedVerdict(call, environment, dependencies);
  const compared = { name, level, verdict: ported };
  expect(compared).toStrictEqual({
    name,
    level,
    verdict: shippedVerdict(call, dependencies),
  });
  recordPorted(compared, [
    ...rootFolds(tree.root),
    [home, '<home>'],
    // The ambient `CC_SAFETY_NET_HOME` the suite's preload points at a fresh temp directory.
    [dirname(userPolicyPath), '<safety-net-home>'],
  ]);
  return ported;
}

describe('the pipeline corpus rows that carry no command', () => {
  const rows = pipelineContractCases({
    workspace: tree.workspace,
    repo: tree.repository,
    home,
    userPolicyPath,
    userPolicyDir: dirname(userPolicyPath),
  }).filter((row) => row.route.kind !== 'command');

  test('every non-command row is routed and decided identically', () => {
    expect(rows.length).toBe(5);
    for (const row of rows) {
      for (const level of ['standard', 'strict'] as const) {
        agreedVerdict(
          row.name,
          row.toolName,
          row.input,
          row.cwd === 'repo' ? tree.repository : tree.workspace,
          level,
        );
      }
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
      const standard = agreedVerdict(
        payload.name,
        payload.toolName,
        payload.input,
        cwd,
        'standard',
      );
      agreedVerdict(payload.name, payload.toolName, payload.input, cwd, 'strict');
      if (payload.denies === null) {
        expect(standard.outcome).toBe('allow');
        return;
      }
      expect(standard.outcome).toBe('deny');
      if (payload.denies === 'policy' || payload.denies === 'git-metadata') {
        expect(standard.stage).toBe('policy-protection');
        return;
      }
      expect({ stage: standard.stage, ruleId: standard.ruleId }).toStrictEqual({
        stage: 'secret-protection',
        ruleId: payload.denies,
      });
    });
  }

  test('the table covers every non-command route', () => {
    expect(
      [...new Set(PAYLOADS.map((payload) => getNonCommandToolInputKind(payload.toolName)))].sort(),
    ).toStrictEqual(['glob', 'grep', 'patch', 'path', 'unknown']);
  });
});
