import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LIMITS } from '@/core/budget';
import { createProcessEnvironment } from '@/core/environment';
import { getUserPolicyPath } from '@/core/policy/paths';
import { runAntigravityCliHook as portedAntigravityCliHook } from '@/hosts/antigravity-cli/hook';
import { runClaudeCodeHook as portedClaudeCodeHook } from '@/hosts/claude-code/hook';
import { runCodexHook as portedCodexHook } from '@/hosts/codex/hook';
import { runCopilotCliHook as portedCopilotCliHook } from '@/hosts/copilot-cli/hook';
import { runCursorHook as portedCursorHook } from '@/hosts/cursor/hook';
import { runGeminiCLIHook as portedGeminiCLIHook } from '@/hosts/gemini-cli/hook';
import { runGrokBuildHook as portedGrokBuildHook } from '@/hosts/grok-build/hook';
import { runHermesAgentHook as portedHermesAgentHook } from '@/hosts/hermes-agent/hook';
import { runKimiCodeHook as portedKimiCodeHook } from '@/hosts/kimi-code/hook';
import { withEnv } from '../helpers';

/**
 * One table of hosts and payloads, shared by the in-process adapter runs and the process-level runs
 * through the bin: the same stdin bytes and the same environment must produce the recorded document
 * and the recorded audit line. Every payload is a literal document in the host's own protocol
 * shape, so a row that stops matching the host is a broken row rather than a silently rewritten one.
 */

export type HookRow = {
  name: string;
  stdin: string | Uint8Array;
  env?: Record<string, string | undefined>;
};

export type HookHost = {
  id: string;
  /** The long hook flag from the catalog, so the process-level runs spell `hook --<flag>`. */
  flag: string;
  ported: () => Promise<void>;
  rows: (fixture: HookFixture) => readonly HookRow[];
};

export type HookFixture = {
  root: string;
  home: string;
  project: string;
  outside: string;
  file: string;
  remove: () => void;
};

/** The `pathEnvironmentExpansion` breach pinned in tests/gate/failure-injection.test.ts: the
 *  pipeline throws inside on it, so it drives the fail-mode rows. */
export const BREACH_COMMAND = `cat ${'${HOME:-'.repeat(65)}x${'}'.repeat(65)}/.ssh/config`;

/** A nested program past the parser's word cap. The secret guard meets it as a `limited` program
 *  and throws `StructuralShellSyntaxLimitError`, the one breach class that is not an
 *  `AnalysisLimit`, so the audit line carries `structural-shell-syntax-limit`. */
export const STRUCTURAL_LIMIT_COMMAND = `bash -c '${'a '.repeat(16_400)}'`;

const SESSION = 's1';
/** Fourteen components that do not exist, so each target under them costs sixteen realpath
 *  attempts and the shared target-root budget breaches on the count alone. */
const MISSING_PREFIX = Array.from({ length: 14 }, (_, index) => `m${index}`).join('/');
const BAD_CONFIG_DIR = 'bad-config';
const NOT_A_DIRECTORY = 'not-a-directory';
/** One byte past the intake cap, still shaped like the JSON document a host would send. */
const OVERSIZED_PAYLOAD = `{"pad":"${'x'.repeat(8 * 1024 * 1024 - 9)}"}`;

export function createHookFixture(prefix: string): HookFixture {
  const root = mkdtempSync(join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), prefix));
  const home = join(root, 'home');
  const project = join(root, 'project');
  for (const dir of [
    join(home, '.codex', 'sessions'),
    join(home, '.copilot'),
    join(home, '.claude', 'projects'),
    join(home, '.ssh'),
    join(project, 'sub'),
    join(root, 'outside'),
    join(root, BAD_CONFIG_DIR),
  ]) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(join(home, '.codex', 'sessions', 't.jsonl'), '');
  writeFileSync(join(home, '.copilot', 's.jsonl'), '');
  writeFileSync(join(home, '.claude', 'projects', 'p.jsonl'), '');
  writeFileSync(join(home, '.ssh', 'id_rsa'), `${['-----BEGIN', 'KEY-----'].join(' ')}\n`);
  writeFileSync(join(project, 'README.md'), 'a file the read rows point at\n');
  writeFileSync(join(root, NOT_A_DIRECTORY), 'a file where a directory is expected\n');
  // The malformed user policy the config-fallback row loads, at whatever path the loader names
  // for a home of its own, rather than at a path this helper spells out a second time.
  writeFileSync(
    withEnv({ CC_SAFETY_NET_HOME: join(root, BAD_CONFIG_DIR) }, () =>
      getUserPolicyPath(createProcessEnvironment()),
    ),
    '{',
  );
  return {
    root,
    home,
    project,
    outside: join(root, 'outside'),
    file: join(root, NOT_A_DIRECTORY),
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

export function hostEnv(fixture: HookFixture, auditHome: string) {
  return {
    HOME: fixture.home,
    CC_SAFETY_NET_HOME: join(fixture.home, '.cc-safety-net'),
    CC_SAFETY_NET_AUDIT_HOME: auditHome,
  };
}

/** What a common row varies: the tool, its input, the directory the call claims, and the event. */
type Payload = { tool?: string; args?: unknown; cwd?: string; event?: string };

type HostSpec = {
  id: string;
  flag: string;
  ported: () => Promise<void>;
  /** The host's shell tool, and how a command reaches its tool input. */
  commandTool: string;
  commandArgs?: (command: string) => Record<string, unknown>;
  /** An event the host reads but does not handle; absent when the host accepts every payload. */
  unsupportedEvent?: string;
  build: (payload: Payload) => unknown;
  extraRows?: (fixture: HookFixture) => readonly HookRow[];
};

const claudeShaped = (event: string) => (payload: Payload) => ({
  session_id: SESSION,
  hook_event_name: payload.event ?? event,
  tool_name: payload.tool,
  tool_input: payload.args,
  cwd: payload.cwd,
});

const claudePayload = (fixture: HookFixture, overrides: Record<string, unknown>) =>
  JSON.stringify({
    session_id: SESSION,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git status' },
    cwd: fixture.project,
    ...overrides,
  });

const copilotPayload = (fixture: HookFixture, overrides: Record<string, unknown>) =>
  JSON.stringify({
    sessionId: SESSION,
    timestamp: 0,
    cwd: fixture.project,
    toolName: 'bash',
    toolArgs: JSON.stringify({ command: 'git status' }),
    ...overrides,
  });

const cursorPayload = (fixture: HookFixture, overrides: Record<string, unknown>) =>
  JSON.stringify({
    conversation_id: SESSION,
    hook_event_name: 'preToolUse',
    tool_name: 'Shell',
    tool_input: { command: 'git status' },
    cwd: fixture.project,
    workspace_roots: [fixture.project],
    ...overrides,
  });

const antigravityPayload = (fixture: HookFixture, args: Record<string, unknown>) =>
  JSON.stringify({
    conversationId: SESSION,
    workspacePaths: [fixture.project],
    toolCall: { name: 'run_command', args: { CommandLine: 'git status', ...args } },
  });

const grokPayload = (fixture: HookFixture, overrides: Record<string, unknown>) =>
  JSON.stringify({
    sessionId: SESSION,
    cwd: fixture.project,
    toolName: 'run_terminal_command',
    toolInput: { command: 'git status' },
    ...overrides,
  });

const hermesPayload = (fixture: HookFixture, workdir: string) =>
  JSON.stringify({
    session_id: SESSION,
    hook_event_name: 'pre_tool_call',
    tool_name: 'terminal',
    tool_input: { command: 'git status', workdir },
    cwd: fixture.project,
  });

const kimiPayload = (fixture: HookFixture, cwd: unknown) =>
  JSON.stringify({
    session_id: SESSION,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'git status', cwd },
    cwd: fixture.project,
  });

const HOST_SPECS: readonly HostSpec[] = [
  {
    id: 'claude-code',
    flag: '--coding-cli',
    ported: portedClaudeCodeHook,
    commandTool: 'Bash',
    unsupportedEvent: 'PostToolUse',
    build: claudeShaped('PreToolUse'),
    extraRows: (fixture) => [
      {
        name: 'a denied PowerShell command',
        stdin: claudePayload(fixture, {
          tool_name: 'PowerShell',
          tool_input: { command: 'Remove-Item -Recurse -Force C:\\' },
        }),
      },
      {
        name: 'an allowed PowerShell command',
        stdin: claudePayload(fixture, {
          tool_name: 'PowerShell',
          tool_input: { command: 'Get-ChildItem' },
        }),
      },
      {
        name: 'a transcript under the Codex home',
        stdin: claudePayload(fixture, {
          transcript_path: join(fixture.home, '.codex', 'sessions', 't.jsonl'),
        }),
      },
      {
        name: 'a transcript under the Copilot home',
        stdin: claudePayload(fixture, {
          transcript_path: join(fixture.home, '.copilot', 's.jsonl'),
        }),
      },
      {
        name: 'a transcript under the Claude config directory',
        stdin: claudePayload(fixture, {
          transcript_path: join(fixture.home, '.claude', 'projects', 'p.jsonl'),
        }),
      },
      {
        name: 'no transcript under a Claude Code entrypoint',
        stdin: claudePayload(fixture, {}),
        env: { CLAUDECODE: '1' },
      },
    ],
  },
  {
    // The Claude-shaped document again, without the transcript attribution Claude Code adds and
    // with `Bash` routed as `auto`, so the common rows carry the whole host.
    id: 'codex',
    flag: '--codex',
    ported: portedCodexHook,
    commandTool: 'Bash',
    unsupportedEvent: 'PostToolUse',
    build: claudeShaped('PreToolUse'),
  },
  {
    id: 'kimi-code',
    flag: '--kimi-code',
    ported: portedKimiCodeHook,
    commandTool: 'Bash',
    unsupportedEvent: 'PostToolUse',
    build: claudeShaped('PreToolUse'),
    extraRows: (fixture) => [
      {
        name: 'a tool cwd inside the session cwd',
        stdin: kimiPayload(fixture, join(fixture.project, 'sub')),
      },
      { name: 'a tool cwd outside the session cwd', stdin: kimiPayload(fixture, fixture.outside) },
      { name: 'a blank tool cwd', stdin: kimiPayload(fixture, '') },
      { name: 'a tool cwd that is not a string', stdin: kimiPayload(fixture, 5) },
    ],
  },
  {
    id: 'gemini-cli',
    flag: '--gemini-cli',
    ported: portedGeminiCLIHook,
    commandTool: 'run_shell_command',
    unsupportedEvent: 'AfterTool',
    build: claudeShaped('BeforeTool'),
  },
  {
    id: 'copilot-cli',
    flag: '--copilot-cli',
    ported: portedCopilotCliHook,
    commandTool: 'bash',
    // Copilot is the one host whose tool input arrives as a JSON string, so every common row
    // already exercises that parse; these rows are the shapes only Copilot can send.
    build: (payload) => ({
      sessionId: SESSION,
      timestamp: 0,
      cwd: payload.cwd,
      toolName: payload.tool,
      toolArgs: payload.args === undefined ? undefined : JSON.stringify(payload.args),
    }),
    extraRows: (fixture) => [
      { name: 'tool args that are not a string', stdin: copilotPayload(fixture, { toolArgs: 5 }) },
      { name: 'tool args that are not JSON', stdin: copilotPayload(fixture, { toolArgs: '{' }) },
      {
        name: 'a powershell command',
        stdin: copilotPayload(fixture, {
          toolName: 'powershell',
          toolArgs: JSON.stringify({ command: 'Remove-Item -Recurse -Force C:\\' }),
        }),
      },
      { name: 'a blank session id', stdin: copilotPayload(fixture, { sessionId: '' }) },
    ],
  },
  {
    id: 'cursor',
    flag: '--cursor',
    ported: portedCursorHook,
    commandTool: 'Shell',
    build: (payload) => ({
      conversation_id: SESSION,
      hook_event_name: 'preToolUse',
      tool_name: payload.tool,
      tool_input: payload.args,
      cwd: payload.cwd,
    }),
    extraRows: (fixture) => [
      {
        name: 'a working directory inside the workspace roots',
        stdin: cursorPayload(fixture, {
          tool_input: { command: 'git status', working_directory: join(fixture.project, 'sub') },
        }),
      },
      {
        name: 'a working directory outside the workspace roots',
        stdin: cursorPayload(fixture, {
          tool_input: { command: 'git status', working_directory: fixture.outside },
        }),
      },
      {
        name: 'a blank working directory',
        stdin: cursorPayload(fixture, {
          tool_input: { command: 'git status', working_directory: '' },
        }),
      },
      { name: 'no workspace roots', stdin: cursorPayload(fixture, { workspace_roots: [] }) },
      {
        name: 'a cwd outside the workspace roots',
        stdin: cursorPayload(fixture, { cwd: fixture.outside }),
      },
    ],
  },
  {
    id: 'antigravity-cli',
    flag: '--agy-cli',
    ported: portedAntigravityCliHook,
    commandTool: 'run_command',
    commandArgs: (command) => ({ CommandLine: command }),
    build: (payload) => ({
      conversationId: SESSION,
      workspacePaths: payload.cwd === undefined ? undefined : [payload.cwd],
      toolCall: { name: payload.tool, args: payload.args },
    }),
    extraRows: (fixture) => [
      {
        name: 'a Cwd inside the workspace paths',
        stdin: antigravityPayload(fixture, { Cwd: join(fixture.project, 'sub') }),
      },
      {
        name: 'a Cwd outside the workspace paths',
        stdin: antigravityPayload(fixture, { Cwd: fixture.outside }),
      },
      { name: 'a blank Cwd', stdin: antigravityPayload(fixture, { Cwd: '' }) },
      {
        // The one branch whose exception class the port re-typed: the target-root walk shares one
        // budget across the targets, so past the cap it denies without naming a directory.
        name: 'view targets past the path-canonicalization budget',
        stdin: JSON.stringify({
          conversationId: SESSION,
          workspacePaths: [fixture.project],
          toolCall: {
            name: 'view_file',
            args: {
              targets: Array.from({ length: LIMITS.realpathAttempts.cap / 16 + 1 }, (_, index) => ({
                AbsolutePath: join(fixture.project, MISSING_PREFIX, `t-${index}.txt`),
              })),
            },
          },
        }),
      },
    ],
  },
  {
    id: 'grok-build',
    flag: '--grok-build',
    ported: portedGrokBuildHook,
    commandTool: 'run_terminal_command',
    build: (payload) => ({
      sessionId: SESSION,
      cwd: payload.cwd,
      toolName: payload.tool,
      toolInput: payload.args,
    }),
    extraRows: (fixture) => [
      {
        name: 'tool input the host truncated',
        stdin: grokPayload(fixture, { toolInputTruncated: true }),
      },
      {
        name: 'a cwd inside the workspace root',
        stdin: grokPayload(fixture, {
          workspaceRoot: fixture.project,
          cwd: join(fixture.project, 'sub'),
        }),
      },
      {
        name: 'a cwd outside the workspace root',
        stdin: grokPayload(fixture, { workspaceRoot: fixture.project, cwd: fixture.outside }),
      },
    ],
  },
  {
    id: 'hermes-agent',
    flag: '--hermes-agent',
    ported: portedHermesAgentHook,
    commandTool: 'terminal',
    unsupportedEvent: 'post_tool_call',
    build: claudeShaped('pre_tool_call'),
    extraRows: (fixture) => [
      { name: 'a workdir that exists', stdin: hermesPayload(fixture, 'sub') },
      { name: 'a workdir that does not exist', stdin: hermesPayload(fixture, 'missing-dir') },
      { name: 'a blank workdir', stdin: hermesPayload(fixture, '') },
    ],
  },
];

function commonRows(spec: HostSpec, fixture: HookFixture): HookRow[] {
  const commandArgs = spec.commandArgs ?? ((command: string) => ({ command }));
  const payload = (values: Payload) => JSON.stringify(spec.build(values));
  const commandPayload = (command: string, cwd?: string) =>
    payload({ tool: spec.commandTool, args: commandArgs(command), cwd });
  const inProject = (command: string) => commandPayload(command, fixture.project);

  return [
    { name: 'a denied command', stdin: inProject('rm -rf /') },
    { name: 'an allowed command', stdin: inProject('git status') },
    {
      name: 'an allowed command under the blocked-only audit scope',
      stdin: inProject('git status'),
      env: { CC_SAFETY_NET_AUDIT_SCOPE: 'blocked' },
    },
    ...(spec.unsupportedEvent === undefined
      ? []
      : [
          {
            name: 'an event the host does not handle',
            stdin: payload({
              tool: spec.commandTool,
              args: commandArgs('git status'),
              cwd: fixture.project,
              event: spec.unsupportedEvent,
            }),
          },
        ]),
    { name: 'a payload that is not JSON', stdin: '{' },
    { name: 'an empty payload', stdin: '' },
    { name: 'a payload that is an array', stdin: '[]' },
    { name: 'a payload past the input byte limit', stdin: OVERSIZED_PAYLOAD },
    {
      name: 'a payload without a tool name',
      stdin: payload({ args: commandArgs('git status'), cwd: fixture.project }),
    },
    {
      name: 'a read tool over a relative path',
      stdin: payload({ tool: 'Read', args: { file_path: 'README.md' }, cwd: fixture.project }),
    },
    {
      name: 'a read tool over a private key',
      stdin: payload({
        tool: 'Read',
        args: { file_path: join(fixture.home, '.ssh', 'id_rsa') },
        cwd: fixture.project,
      }),
    },
    { name: 'a payload without a cwd', stdin: commandPayload('git status') },
    { name: 'a cwd that is a regular file', stdin: commandPayload('git status', fixture.file) },
    {
      // Denied after the config load, unlike `rm -rf /`, so the degraded policy still reaches the
      // document as a `Config warning:` paragraph and the audit line as `configFallback`.
      name: 'a denied command under a malformed user policy',
      stdin: inProject('git reset --hard HEAD~1'),
      env: { CC_SAFETY_NET_HOME: join(fixture.root, BAD_CONFIG_DIR) },
    },
    { name: 'a command that breaches an analysis limit', stdin: inProject(BREACH_COMMAND) },
    {
      name: 'a command past the structural shell-syntax limit',
      stdin: inProject(STRUCTURAL_LIMIT_COMMAND),
    },
    {
      name: 'a command that breaches an analysis limit with debug output on',
      stdin: inProject(BREACH_COMMAND),
      env: { CC_SAFETY_NET_DEBUG: '1' },
    },
  ];
}

export const HOOK_HOSTS: readonly HookHost[] = HOST_SPECS.map((spec) => ({
  id: spec.id,
  flag: spec.flag,
  ported: spec.ported,
  rows: (fixture: HookFixture) => [
    ...commonRows(spec, fixture),
    ...(spec.extraRows?.(fixture) ?? []),
  ],
}));
