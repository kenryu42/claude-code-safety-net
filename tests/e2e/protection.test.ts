import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRuntimeBundles } from '../../scripts/build-runtime';
import { OPENCODE_HOST_SCRIPT, PI_HOST_SCRIPT } from '../../scripts/integration-host-scripts';
import { quoteShellPath, readAuditLogEntriesForSession } from '../helpers';
import {
  buildE2EArtifacts,
  expectAllowedAction,
  expectSingleAudit,
  parseJsonOutput,
  runBuiltHost,
  runNode,
  type SafetyLevel,
  withWorkspace,
} from './harness';

const adapters = [
  {
    agent: 'claude-code',
    flag: '--coding-cli',
    commandInput: (command: string, cwd: string, home: string, sessionId: string) => ({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      transcript_path: join(home, '.claude', 'sessions', 'transcript.jsonl'),
      cwd,
      tool_name: 'Bash',
      tool_input: { command },
    }),
    denyReason: getClaudeStyleDenyReason,
  },
  {
    agent: 'gemini-cli',
    flag: '-gc',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      hook_event_name: 'BeforeTool',
      session_id: sessionId,
      cwd,
      tool_name: 'run_shell_command',
      tool_input: { command },
    }),
    denyReason: (output: Record<string, unknown>) => {
      expect(output.decision).toBe('deny');
      return String(output.reason);
    },
  },
  {
    agent: 'kimi-code',
    flag: '-kc',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      cwd,
      tool_name: 'Bash',
      tool_input: { command },
      tool_call_id: `${sessionId}-tool-call`,
    }),
    denyReason: getClaudeStyleDenyReason,
  },
  {
    agent: 'copilot-cli',
    flag: '-cp',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      sessionId,
      timestamp: Date.now(),
      cwd,
      toolName: 'bash',
      toolArgs: JSON.stringify({ command }),
    }),
    denyReason: (output: Record<string, unknown>) => {
      expect(output.permissionDecision).toBe('deny');
      return String(output.permissionDecisionReason);
    },
  },
  {
    agent: 'antigravity-cli',
    flag: '-ac',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      toolCall: {
        name: 'run_command',
        args: { CommandLine: command, Cwd: cwd, WaitMsBeforeAsync: 1_000 },
      },
      conversationId: sessionId,
      workspacePaths: [cwd],
    }),
    denyReason: (output: Record<string, unknown>) => {
      expect(output.decision).toBe('deny');
      return String(output.reason);
    },
  },
  {
    agent: 'cursor',
    flag: '-cu',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      conversation_id: sessionId,
      hook_event_name: 'preToolUse',
      cwd,
      workspace_roots: [cwd],
      tool_name: 'Shell',
      tool_input: { command },
    }),
    // Cursor and Grok Build emit a decision on allow too, so silence cannot stand
    // in for permission the way it does for the others.
    isAllowOutput: (output: Record<string, unknown>) => output.permission === 'allow',
    denyReason: (output: Record<string, unknown>) => {
      expect(output.permission).toBe('deny');
      return String(output.user_message);
    },
  },
  {
    agent: 'grok-build',
    flag: '-gb',
    commandInput: (command: string, cwd: string, _home: string, sessionId: string) => ({
      hookEventName: 'pre_tool_use',
      sessionId,
      cwd,
      workspaceRoot: cwd,
      toolName: 'run_terminal_command',
      toolUseId: `${sessionId}-tool-call`,
      toolInput: { command },
      toolInputTruncated: false,
    }),
    isAllowOutput: (output: Record<string, unknown>) => output.decision === 'allow',
    denyReason: (output: Record<string, unknown>) => {
      expect(output.decision).toBe('deny');
      return String(output.reason);
    },
  },
] as const;

let buildRoot = '';
let cliPath = '';
let openCodePath = '';
let piPath = '';

beforeAll(async () => {
  buildRoot = await buildE2EArtifacts('cc-safety-net-e2e-', [buildRuntimeBundles]);
  cliPath = join(buildRoot, 'dist', 'bin', 'cc-safety-net.js');
  openCodePath = join(buildRoot, 'dist', 'index.js');
  piPath = join(buildRoot, 'dist', 'pi', 'index.js');
});

afterAll(() => {
  if (buildRoot) rmSync(buildRoot, { recursive: true, force: true });
});

describe('built CLI protection contract', () => {
  for (const adapter of adapters) {
    describe(`${adapter.agent === 'claude-code' ? 'Coding CLI' : adapter.agent} hook protocol`, () => {
      test('allows git status and records the allowed decision', async () => {
        await withWorkspace(async ({ cwd, home }) => {
          const safeSession = `${adapter.agent}-safe`;
          await expectAllowedAction(cwd, home, safeSession, (action) =>
            runGated(
              adapter,
              adapter.commandInput('git status', cwd, home, safeSession),
              cwd,
              home,
              action,
            ),
          );
        });
      });

      test.each([
        ['git reset --hard', 'git.reset-hard', 'git-reset'],
        ['rm -rf .', 'rm.recursive-force-cwd-self', 'rm-cwd'],
      ] as const)('blocks %s and preserves the target', async (command, ruleId, name) => {
        await withWorkspace(async ({ cwd, home }) => {
          const sessionId = `${adapter.agent}-${name}`;
          const sentinel = join(cwd, `${name}-sentinel`);
          writeFileSync(sentinel, 'preserve');
          const result = await runGated(
            adapter,
            adapter.commandInput(command, cwd, home, sessionId),
            cwd,
            home,
            () => rmSync(sentinel),
          );

          expect(result.allowed).toBe(false);
          expect(result.reason).toContain(ruleId);
          expect(readFileSync(sentinel, 'utf8')).toBe('preserve');
          expectSingleAudit(home, sessionId, {
            agent: adapter.agent,
            command,
            ruleId,
          });
        });
      });
    });
  }

  test.each([
    ['bash syntax', "bash -n -c '(( rm -rf / root ))'"],
    ['Node data', `node -e 'console.log("rm -rf /")'`],
    ['xargs positional input', `find src -type f | xargs sh -c 'wc -l "$1"' _`],
    ['Parallel literal shell source', `parallel sh -c 'printf safe' ::: job`],
    ['literal stdin-to-shell flow', `printf '%s\\n' 'printf safe' | sh`],
    [
      'heredoc-created safe script',
      `cat > ./ccsn-e2e-script.sh <<'EOF'\nprintf safe\nEOF\nsh ./ccsn-e2e-script.sh`,
    ],
    ['parallel probe', 'command -v parallel'],
    ['secret metadata', 'test -f "$HOME/.ssh/id_rsa"'],
    [
      'self-explain output',
      `bun src/entries/bin.ts explain --json --cwd /tmp/ccsn-scout 'cat /tmp/ccsn-scout/fixture/.env' | jq -c '{result}'`,
    ],
  ] as const)('Coding CLI allows log-derived %s in standard mode', async (name, command) => {
    await withWorkspace(async ({ cwd, home }) => {
      const sessionId = `log-regression-${name.replaceAll(' ', '-')}-standard`;
      await expectAllowedAction(cwd, home, sessionId, (action) =>
        runCodingCliTool('Bash', { command }, cwd, home, sessionId, action, 'standard'),
      );
    });
  });

  test('Coding CLI blocks secret metadata in strict mode', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const strictCommand = 'test -f "$HOME/.ssh/id_rsa"';
      const strictSession = 'log-regression-secret-metadata-strict';
      const strictResult = await runCodingCliTool(
        'Bash',
        { command: strictCommand },
        cwd,
        home,
        strictSession,
        () => writeFileSync(join(cwd, 'strict-secret-metadata-ran'), 'ran'),
        'strict',
      );
      expect(strictResult.allowed).toBe(false);
      expect(strictResult.reason).toContain('secret.home.ssh');
      expectSingleAudit(home, strictSession, {
        agent: 'claude-code',
        command: strictCommand,
        ruleId: 'secret.home.ssh',
      });
    });
  });

  test('Coding CLI blocks secret metadata in paranoid mode', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const paranoidCommand = 'test -f "$HOME/.ssh/id_rsa"';
      const paranoidSession = 'log-regression-secret-metadata-paranoid';
      const paranoidResult = await runCodingCliTool(
        'Bash',
        { command: paranoidCommand },
        cwd,
        home,
        paranoidSession,
        () => writeFileSync(join(cwd, 'paranoid-secret-metadata-ran'), 'ran'),
        'paranoid',
      );
      expect(paranoidResult.allowed).toBe(false);
      expect(paranoidResult.reason).toContain('secret.home.ssh');
      expectSingleAudit(home, paranoidSession, {
        agent: 'claude-code',
        command: paranoidCommand,
        ruleId: 'secret.home.ssh',
      });
    });
  });

  // Dotfile and password managers routinely make ~/.ssh a symlink. Canonicalizing
  // the candidate rewrites it to the link target, which no longer starts with
  // `~/.ssh`, so the rule that names the directory used to stop matching. Guarded
  // at the packaged-artifact level because that binary is what ships.
  test('Coding CLI blocks credentials under a symlinked ~/.ssh', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      mkdirSync(join(home, 'vault', 'ssh'), { recursive: true });
      writeFileSync(join(home, 'vault', 'ssh', 'config'), 'Host *');
      symlinkSync(join(home, 'vault', 'ssh'), join(home, '.ssh'), 'dir');

      const command = 'cat "$HOME/.ssh/config"';
      const sessionId = 'claude-symlinked-ssh-secret';
      const result = await runCodingCliTool('Bash', { command }, cwd, home, sessionId, () =>
        writeFileSync(join(cwd, 'symlinked-ssh-ran'), 'ran'),
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('secret.home.ssh');
      expectSingleAudit(home, sessionId, {
        agent: 'claude-code',
        command,
        ruleId: 'secret.home.ssh',
      });
    });
  });

  // This fixture proves POSIX quoting preserves a regex backslash, which is not a Windows-shell
  // capability. PowerShell quoting is covered by its own parser and integration tests.
  test.skipIf(process.platform === 'win32')(
    'Coding CLI allows a regex operand of an unmodelled search tool and records only the allow decision',
    async () => {
      const command = 'git grep -n "process\\.env" -- .';
      await withWorkspace(async ({ cwd, home }) => {
        const sessionId = 'claude-allows-regex-operand';
        await expectAllowedAction(cwd, home, sessionId, (action) =>
          runCodingCliTool('Bash', { command }, cwd, home, sessionId, action),
        );
      });
    },
  );

  test('Coding CLI allows a remote URL naming an env template and records only the allow decision', async () => {
    const command = 'curl -sL https://raw.githubusercontent.com/o/r/main/.env.test';
    await withWorkspace(async ({ cwd, home }) => {
      const sessionId = 'claude-allows-remote-url';
      await expectAllowedAction(cwd, home, sessionId, (action) =>
        runCodingCliTool('Bash', { command }, cwd, home, sessionId, action),
      );
    });
  });

  test.each([
    ['Bash execution', 'bash-executes', "bash -c 'rm -rf /'", 'rm.recursive-force-root-or-home'],
    [
      'Node execution',
      'node-executes',
      `node -e 'require("node:child_process").execSync("rm -rf /")'`,
      'interpreter.dangerous-command',
    ],
    [
      'xargs source execution',
      'xargs-source',
      `find src -type f | xargs -I{} sh -c 'echo {}; sed -n 1,20p {}'`,
      'xargs.shell-dynamic',
    ],
    [
      'Parallel source execution',
      'parallel-source',
      `parallel sh -c {} ::: 'git reset --hard'`,
      'parallel.shell-dynamic',
    ],
    [
      'literal stdin-to-shell execution',
      'stdin-shell',
      `printf '%s\\n' 'git reset --hard' | sh`,
      'git.reset-hard',
    ],
    [
      'heredoc-created script execution',
      'heredoc-script',
      `cat > ./ccsn-e2e-script.sh <<'EOF'\ngit reset --hard\nEOF\nsh ./ccsn-e2e-script.sh`,
      'git.reset-hard',
    ],
    ['parallel command stream', 'parallel-stream', 'parallel', 'parallel.command-stream-dynamic'],
    ['secret content', 'secret-content', 'cat "$HOME/.ssh/id_rsa"', 'secret.home.ssh'],
  ] as const)('Coding CLI blocks log-derived %s in standard mode', async (_name, slug, command, ruleId) => {
    await withWorkspace(async ({ cwd, home }) => {
      const sessionId = `log-regression-${slug}-standard`;
      const result = await runCodingCliTool(
        'Bash',
        { command },
        cwd,
        home,
        sessionId,
        () => writeFileSync(join(cwd, `${slug}-ran`), 'ran'),
        'standard',
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(ruleId);
      expectSingleAudit(home, sessionId, { agent: 'claude-code', command, ruleId });
    });
  });

  test('Coding CLI blocks direct .env reads', async () => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const reads: string[] = [];
      const secretSession = 'claude-secret-env';
      const secretResult = await runCodingCliTool(
        'Read',
        { file_path: '.env' },
        cwd,
        home,
        secretSession,
        () => reads.push(readFileSync(join(cwd, '.env'), 'utf8')),
      );
      expect(secretResult.allowed).toBe(false);
      expect(secretResult.reason).toContain('secret.basename.env');
      expect(reads).toEqual([]);
      expectSingleAudit(home, secretSession, {
        agent: 'claude-code',
        command: '.env',
        ruleId: 'secret.basename.env',
      });
    });
  });

  test.each([
    ['.env.example', 'SECRET=example'],
    ['README.md', 'public'],
  ] as const)('Coding CLI allows harmless %s reads', async (filePath, expected) => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const reads: string[] = [];
      const sessionId = `claude-${filePath.replaceAll('.', '-')}`;
      const result = await runCodingCliTool(
        'Read',
        { file_path: filePath },
        cwd,
        home,
        sessionId,
        () => reads.push(readFileSync(join(cwd, filePath), 'utf8')),
      );
      expect(result).toEqual({ allowed: true });
      expect(reads.at(-1)).toBe(expected);
      expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
    });
  });

  test.each([
    ['Grep content', 'Grep', { pattern: '.env', path: 'src' }],
    [
      'patch content',
      'apply_patch',
      {
        command: [
          '*** Begin Patch',
          '*** Update File: tests/example.test.ts',
          '@@',
          ' rm -rf ~',
          '*** End Patch',
        ].join('\n'),
      },
    ],
  ] as const)('Coding CLI allows harmless %s without auditing it', async (name, toolName, toolInput) => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const sessionId = `claude-${name.replaceAll(' ', '-')}`;
      await expectAllowedAction(
        cwd,
        home,
        sessionId,
        (action) => runCodingCliTool(toolName, toolInput, cwd, home, sessionId, action),
        false,
      );
    });
  });

  test.each([
    ['relative path', 'relative', '../.env'],
    ['symlink', 'symlink', 'public.txt'],
  ] as const)('Coding CLI blocks .env reads through a %s', async (_name, pathKind, filePath) => {
    await withSecretWorkspace(async ({ cwd, home }) => {
      const sessionId = `claude-${pathKind}-secret`;
      const executionCwd = pathKind === 'relative' ? join(cwd, 'nested') : cwd;
      const reads: string[] = [];
      const result = await runCodingCliTool(
        'Read',
        { file_path: filePath },
        executionCwd,
        home,
        sessionId,
        () => reads.push(readFileSync(join(executionCwd, filePath), 'utf8')),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('secret.basename.env');
      expectSingleAudit(home, sessionId, {
        agent: 'claude-code',
        command: filePath,
        ruleId: 'secret.basename.env',
      });
      expect(reads).toEqual([]);
    });
  });

  test.each([
    ['direct Write', 'write'],
    ['absolute shell redirect', 'redirect'],
    ['environment shell redirect', 'env'],
    ['symlink Write', 'symlink'],
  ] as const)('Coding CLI blocks policy mutation through %s', async (_name, kind) => {
    await withPolicyWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
      const sessionId = `claude-policy-${kind}`;
      const [toolName, toolInput] = policyMutation(kind, cwd, policyPath);
      const result = await runCodingCliTool(toolName, toolInput, cwd, home, sessionId, () =>
        writeFileSync(policyPath, 'mutated'),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain(
        'This path contains the protected policy config and you must not modify or delete it.',
      );
      expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
      expectSingleAudit(home, sessionId, { agent: 'claude-code' });
    });
  });

  test('Coding CLI allows policy reads', async () => {
    await withPolicyWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
      const reads: string[] = [];
      const readSession = 'claude-policy-read';
      expect(
        await runCodingCliTool('Read', { file_path: policyPath }, cwd, home, readSession, () =>
          reads.push(readFileSync(policyPath, 'utf8')),
        ),
      ).toEqual({ allowed: true });
      expect(reads).toEqual([originalPolicy]);
      expect(readAuditLogEntriesForSession(home, readSession)).toEqual([]);
    });
  });

  test('Coding CLI allows policy directory inspection', async () => {
    await withPolicyWorkspace(async ({ cwd, home, safetyNetHome }) => {
      const reads: string[] = [];
      const inspectSession = 'claude-policy-inspect';
      expect(
        await runGated(
          adapters[0],
          adapters[0].commandInput(
            `ls -la ${quoteShellPath(safetyNetHome)}`,
            cwd,
            home,
            inspectSession,
          ),
          cwd,
          home,
          () => reads.push(readdirSync(safetyNetHome).join(',')),
        ),
      ).toEqual({ allowed: true });
      expect(reads.at(-1)).toContain('policy.json');
      expect(readAuditLogEntriesForSession(home, inspectSession)).toMatchObject([
        { decision: 'allow', reason: 'allowed' },
      ]);
    });
  });

  test('Coding CLI blocks rm -rf .git and preserves Git metadata', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      mkdirSync(join(cwd, '.git', 'hooks'), { recursive: true });
      writeFileSync(join(cwd, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\n');
      const command = 'rm -rf .git';
      const sessionId = 'claude-git-metadata-guard';
      const result = await runCodingCliTool('Bash', { command }, cwd, home, sessionId, () =>
        rmSync(join(cwd, '.git'), { recursive: true, force: true }),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('rm.git-metadata');
      expect(readFileSync(join(cwd, '.git', 'hooks', 'pre-commit'), 'utf8')).toBe('#!/bin/sh\n');
      expectSingleAudit(home, sessionId, {
        agent: 'claude-code',
        command,
        ruleId: 'rm.git-metadata',
      });
    });
  });

  test('Coding CLI allows project-local rm -rf at standard but blocks it at paranoid', async () => {
    await withWorkspace(async ({ cwd, home }) => {
      const command = 'rm -rf ./cache';

      const standardSession = 'claude-paranoid-delta-standard';
      await expectAllowedAction(cwd, home, standardSession, (action) =>
        runCodingCliTool('Bash', { command }, cwd, home, standardSession, action, 'standard'),
      );

      mkdirSync(join(cwd, 'cache'));
      writeFileSync(join(cwd, 'cache', 'sentinel'), 'preserve');
      const paranoidSession = 'claude-paranoid-delta-paranoid';
      const paranoidResult = await runCodingCliTool(
        'Bash',
        { command },
        cwd,
        home,
        paranoidSession,
        () => rmSync(join(cwd, 'cache'), { recursive: true, force: true }),
        'paranoid',
      );
      expect(paranoidResult.allowed).toBe(false);
      expect(paranoidResult.reason).toContain('rm.recursive-force-paranoid');
      expect(readFileSync(join(cwd, 'cache', 'sentinel'), 'utf8')).toBe('preserve');
      expectSingleAudit(home, paranoidSession, {
        agent: 'claude-code',
        command,
        ruleId: 'rm.recursive-force-paranoid',
      });
    });
  });
});

describe('built Pi extension protection contract', () => {
  test('loads once through the Pi host and preserves every public contract', async () => {
    await withIntegrationWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
      const resetSession = 'pi-reset';
      const resetSentinel = join(cwd, 'pi-reset-sentinel');
      writeFileSync(resetSentinel, 'preserve');
      const results = (
        await runBuiltHost(
          piPath,
          PI_HOST_SCRIPT,
          [
            { kind: 'registration', commandArgs: 'block git reset', idle: false },
            piToolRequest('bash', { command: 'git status' }, 'pi-safe'),
            piToolRequest('bash', { command: 'git reset --hard' }, resetSession),
            piToolRequest('Read', { file_path: '.env' }, 'pi-secret'),
            piToolRequest('Read', { file_path: '.env.example' }, 'pi--env-example'),
            piToolRequest('Read', { file_path: 'README.md' }, 'pi-README-md'),
            piToolRequest(
              'Write',
              { file_path: policyPath, content: 'mutated' },
              'pi-policy-write',
            ),
          ],
          cwd,
          home,
        )
      ).results as Record<string, unknown>[];

      expect(results).toHaveLength(7);
      expect(hostResult(results, 0)).toMatchObject({
        eventNames: ['tool_call'],
        commandNames: ['cc-safety-net'],
        commandDescription:
          'Operate CC Safety Net: explain blocks, rules, integrations, diagnostics',
        sentMessages: [
          {
            content: expect.stringContaining('## User request\n\nblock git reset'),
            options: { deliverAs: 'followUp' },
          },
        ],
      });

      await expectAllowedAction(cwd, home, 'pi-safe', (action) =>
        Promise.resolve(applyPiHostResult(hostResult(results, 1), action)),
      );

      const resetResult = applyPiHostResult(hostResult(results, 2), () => rmSync(resetSentinel));
      expect(expectDeniedReason(resetResult)).toContain('git.reset-hard');
      expect(readFileSync(resetSentinel, 'utf8')).toBe('preserve');
      expectSingleAudit(home, resetSession, {
        agent: 'pi',
        command: 'git reset --hard',
        ruleId: 'git.reset-hard',
      });

      expectSecretReadBlocked('pi', hostResult(results, 3), applyPiHostResult, cwd, home);
      expectPublicReadsAllowed(applyPiHostResult, cwd, home, [
        [hostResult(results, 4), 'pi--env-example', '.env.example', 'SECRET=example'],
        [hostResult(results, 5), 'pi-README-md', 'README.md', 'public'],
      ]);

      const policyResult = applyPiHostResult(hostResult(results, 6), () =>
        writeFileSync(policyPath, 'mutated'),
      );
      expect(expectDeniedReason(policyResult)).toContain('protected policy config');
      expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
      expectSingleAudit(home, 'pi-policy-write', { agent: 'pi' });
    });
  });
});

describe('built OpenCode plugin protection contract', () => {
  test('loads once through the OpenCode host and preserves every public contract', async () => {
    await withIntegrationWorkspace(async ({ cwd, home, policyPath, originalPolicy }) => {
      const patchSession = 'opencode-patch-content';
      const policyPatchSession = 'opencode-policy-patch';
      const resetSession = 'opencode-reset';
      const resetSentinel = join(cwd, 'opencode-reset-sentinel');
      writeFileSync(resetSentinel, 'preserve');
      const results = (
        await runBuiltHost(
          openCodePath,
          OPENCODE_HOST_SCRIPT,
          [
            {
              kind: 'config',
              config: {
                shell: '/bin/bash',
                command: { existing: { description: 'Existing command', template: 'keep' } },
              },
            },
            openCodeToolRequest(
              'apply_patch',
              {
                patchText: [
                  '*** Begin Patch',
                  '*** Update File: README.md',
                  '@@',
                  '+rm -rf .',
                  '+.env',
                  '*** End Patch',
                ].join('\n'),
              },
              patchSession,
            ),
            openCodeToolRequest(
              'apply_patch',
              {
                patchText: [
                  '*** Begin Patch',
                  `*** Update File: ${policyPath}`,
                  '@@',
                  '-{"version":1}',
                  '+{}',
                  '*** End Patch',
                ].join('\n'),
              },
              policyPatchSession,
            ),
            openCodeToolRequest('bash', { command: 'git status' }, 'opencode-safe'),
            openCodeToolRequest('bash', { command: 'git reset --hard' }, resetSession),
            openCodeToolRequest('read', { path: '.env' }, 'opencode-secret'),
            openCodeToolRequest('read', { path: '.env.example' }, 'opencode--env-example'),
            openCodeToolRequest('read', { path: 'README.md' }, 'opencode-README-md'),
            openCodeToolRequest(
              'Write',
              { file_path: policyPath, content: 'mutated' },
              'opencode-policy-write',
            ),
          ],
          cwd,
          home,
        )
      ).results as Record<string, unknown>[];

      expect(results).toHaveLength(9);
      expect(hostResult(results, 0)).toMatchObject({
        exportNames: ['CCSafetyNetPlugin'],
        pluginCount: 1,
        commandNames: expect.arrayContaining(['cc-safety-net', 'existing']),
        existingCommand: { description: 'Existing command', template: 'keep' },
      });

      await expectAllowedAction(
        cwd,
        home,
        patchSession,
        (action) => Promise.resolve(applyOpenCodeHostResult(hostResult(results, 1), action)),
        false,
      );

      const policyPatchResult = applyOpenCodeHostResult(hostResult(results, 2), () =>
        writeFileSync(policyPath, 'mutated'),
      );
      expect(expectDeniedReason(policyPatchResult)).toContain('protected policy config');
      expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
      expectSingleAudit(home, policyPatchSession, { agent: 'opencode' });

      await expectAllowedAction(cwd, home, 'opencode-safe', (action) =>
        Promise.resolve(applyOpenCodeHostResult(hostResult(results, 3), action)),
      );

      const resetResult = applyOpenCodeHostResult(hostResult(results, 4), () =>
        rmSync(resetSentinel),
      );
      expect(expectDeniedReason(resetResult)).toContain('git.reset-hard');
      expect(readFileSync(resetSentinel, 'utf8')).toBe('preserve');
      expectSingleAudit(home, resetSession, {
        agent: 'opencode',
        command: 'git reset --hard',
        ruleId: 'git.reset-hard',
      });

      expectSecretReadBlocked(
        'opencode',
        hostResult(results, 5),
        applyOpenCodeHostResult,
        cwd,
        home,
      );
      expectPublicReadsAllowed(applyOpenCodeHostResult, cwd, home, [
        [hostResult(results, 6), 'opencode--env-example', '.env.example', 'SECRET=example'],
        [hostResult(results, 7), 'opencode-README-md', 'README.md', 'public'],
      ]);

      const policyResult = applyOpenCodeHostResult(hostResult(results, 8), () =>
        writeFileSync(policyPath, 'mutated'),
      );
      expect(expectDeniedReason(policyResult)).toContain('protected policy config');
      expect(readFileSync(policyPath, 'utf8')).toBe(originalPolicy);
      expectSingleAudit(home, 'opencode-policy-write', { agent: 'opencode' });
    });
  });
});

function withIntegrationWorkspace<T>(
  run: (context: {
    cwd: string;
    home: string;
    policyPath: string;
    originalPolicy: string;
  }) => T | Promise<T>,
) {
  return withWorkspace((context) => {
    writeSecretWorkspaceFixtures(context.cwd);
    return run({ ...context, ...writePolicyWorkspaceFixtures(context.cwd, context.home) });
  });
}

function withSecretWorkspace<T>(run: (context: { cwd: string; home: string }) => T | Promise<T>) {
  return withWorkspace((context) => {
    writeSecretWorkspaceFixtures(context.cwd);
    return run(context);
  });
}

function withPolicyWorkspace<T>(
  run: (context: {
    cwd: string;
    home: string;
    safetyNetHome: string;
    policyPath: string;
    originalPolicy: string;
  }) => T | Promise<T>,
) {
  return withWorkspace((context) => {
    return run({ ...context, ...writePolicyWorkspaceFixtures(context.cwd, context.home) });
  });
}

function writeSecretWorkspaceFixtures(cwd: string) {
  mkdirSync(join(cwd, 'src'));
  mkdirSync(join(cwd, 'nested'));
  writeFileSync(join(cwd, '.env'), 'SECRET=protected');
  writeFileSync(join(cwd, '.env.example'), 'SECRET=example');
  writeFileSync(join(cwd, 'README.md'), 'public');
  symlinkSync(join(cwd, '.env'), join(cwd, 'public.txt'));
}

function writePolicyWorkspaceFixtures(cwd: string, home: string) {
  const safetyNetHome = join(home, '.cc-safety-net');
  const policyPath = join(safetyNetHome, 'policy.json');
  const originalPolicy = JSON.stringify({ version: 1 });
  mkdirSync(safetyNetHome, { recursive: true });
  writeFileSync(policyPath, originalPolicy);
  symlinkSync(policyPath, join(cwd, 'policy-alias.json'));
  return { safetyNetHome, policyPath, originalPolicy };
}

function policyMutation(
  kind: 'write' | 'redirect' | 'env' | 'symlink',
  cwd: string,
  policyPath: string,
) {
  if (kind === 'write') return ['Write', { file_path: policyPath, content: '{}' }] as const;
  if (kind === 'redirect') {
    return ['Bash', { command: `printf mutated > ${quoteShellPath(policyPath)}` }] as const;
  }
  if (kind === 'env') {
    return ['Bash', { command: 'printf mutated > $CC_SAFETY_NET_HOME/policy.json' }] as const;
  }
  return ['Write', { file_path: join(cwd, 'policy-alias.json'), content: '{}' }] as const;
}

async function runGated(
  adapter: (typeof adapters)[number],
  input: unknown,
  cwd: string,
  home: string,
  action: () => void,
  level?: SafetyLevel,
) {
  const stdout = await runBuiltHook(adapter.flag, input, cwd, home, level);
  const output = stdout ? parseJsonOutput('CLI hook', stdout) : undefined;
  if (!output || ('isAllowOutput' in adapter && adapter.isAllowOutput(output))) {
    action();
    return { allowed: true } as const;
  }
  return { allowed: false, reason: adapter.denyReason(output) } as const;
}

function runCodingCliTool(
  toolName: string,
  toolInput: unknown,
  cwd: string,
  home: string,
  sessionId: string,
  action: () => void,
  level?: SafetyLevel,
) {
  return runGated(
    adapters[0],
    {
      hook_event_name: 'PreToolUse',
      session_id: sessionId,
      transcript_path: join(home, '.claude', 'sessions', 'transcript.jsonl'),
      cwd,
      tool_name: toolName,
      tool_input: toolInput,
    },
    cwd,
    home,
    action,
    level,
  );
}

async function runBuiltHook(
  flag: string,
  input: unknown,
  cwd: string,
  home: string,
  level?: SafetyLevel,
) {
  return (await runNode([cliPath, 'hook', flag], input, cwd, home, level)).stdout.trim();
}

type IntegrationGateResult = { allowed: true } | { allowed: false; reason: string };

function hostResult(results: Record<string, unknown>[], index: number) {
  const result = results[index];
  if (!result) throw new Error(`Missing integration host result ${index}`);
  return result;
}

function expectDeniedReason(result: IntegrationGateResult) {
  expect(result.allowed).toBe(false);
  if (result.allowed) throw new Error('Expected the integration host to block the action');
  return result.reason;
}

function piToolRequest(toolName: string, input: Record<string, unknown>, sessionId: string) {
  return {
    kind: 'tool_call',
    event: { type: 'tool_call', toolCallId: `${sessionId}-call`, toolName, input },
    sessionId,
  };
}

function applyPiHostResult(output: Record<string, unknown>, action: () => void) {
  const result = output.result as { block: true; reason: string } | null;
  if (result?.block) return { allowed: false, reason: result.reason } as const;
  action();
  return { allowed: true } as const;
}

function openCodeToolRequest(tool: string, args: Record<string, unknown>, sessionId: string) {
  return { kind: 'tool', tool, args, sessionId };
}

function applyOpenCodeHostResult(output: Record<string, unknown>, action: () => void) {
  if (!output.allowed) return { allowed: false, reason: String(output.reason) } as const;
  action();
  return { allowed: true } as const;
}

function expectSecretReadBlocked(
  agent: 'pi' | 'opencode',
  result: Record<string, unknown>,
  apply: (output: Record<string, unknown>, action: () => void) => IntegrationGateResult,
  cwd: string,
  home: string,
) {
  const reads: string[] = [];
  expect(
    expectDeniedReason(apply(result, () => reads.push(readFileSync(join(cwd, '.env'), 'utf8')))),
  ).toContain('secret.basename.env');
  expect(reads).toEqual([]);
  expectSingleAudit(home, `${agent}-secret`, {
    agent,
    command: '.env',
    ruleId: 'secret.basename.env',
  });
}

function expectPublicReadsAllowed(
  apply: (output: Record<string, unknown>, action: () => void) => IntegrationGateResult,
  cwd: string,
  home: string,
  cases: readonly (readonly [Record<string, unknown>, string, string, string])[],
) {
  for (const [result, sessionId, filePath, expected] of cases) {
    const reads: string[] = [];
    expect(apply(result, () => reads.push(readFileSync(join(cwd, filePath), 'utf8')))).toEqual({
      allowed: true,
    });
    expect(reads).toEqual([expected]);
    expect(readAuditLogEntriesForSession(home, sessionId)).toEqual([]);
  }
}

function getClaudeStyleDenyReason(output: Record<string, unknown>) {
  const hookOutput = output.hookSpecificOutput as Record<string, unknown>;
  expect(hookOutput.hookEventName).toBe('PreToolUse');
  expect(hookOutput.permissionDecision).toBe('deny');
  return String(hookOutput.permissionDecisionReason);
}
