import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { createProcessEnvironment } from '@/core/environment';
import {
  createSemanticFactStore,
  createSemanticFacts,
  getCommandSyntaxFact,
  projectSensitiveShellText,
  StructuralShellSyntaxLimitError,
} from '@/gate/guards/semantic-facts';
import type { ToolRoute } from '@/gate/invocation';
import { createToolInvocation } from '@/gate/invocation';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, corpusToolInputs, FIXED_COMMANDS } from '../../helpers/shell-inputs';
import { normalize, withProcessEnv } from '../../helpers/temp-home';

/**
 * Every guard reads the call through these facts, so a divergence here moves a decision even
 * when the parser and the rule catalog agree.
 */

const CONTEXT = { configCwd: '/work/project', executionCwd: '/work/project/repo' };

/** The path variables the projection expands besides `HOME` and `TMPDIR`, pinned to unset. */
const UNSET_PATH_VARIABLES = Object.fromEntries(
  [
    'CC_SAFETY_NET_HOME',
    'CLAUDE_CONFIG_DIR',
    'CODEX_HOME',
    'COPILOT_HOME',
    'GEMINI_CLI_HOME',
    'GROK_HOME',
    'KIMI_CODE_HOME',
    'KIMI_SHARE_DIR',
    'OPENCODE_CONFIG',
    'OPENCODE_CONFIG_DIR',
    'PI_CODING_AGENT_DIR',
    'ProgramData',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
  ].map((name) => [name, undefined]),
);

const ROUTES: readonly ToolRoute[] = [
  { kind: 'command', shell: 'posix' },
  { kind: 'command', shell: 'powershell' },
  { kind: 'command', shell: 'auto' },
  { kind: 'patch' },
  { kind: 'path' },
  { kind: 'grep' },
  { kind: 'glob' },
  { kind: 'unknown' },
];

const EXTRA_INPUTS: readonly { toolName: string; input: unknown }[] = [
  { toolName: 'Bash', input: { command: 'rm -rf /tmp/x' } },
  { toolName: 'Read', input: { file_path: '/home/agent/.ssh/config' } },
  { toolName: 'Grep', input: { pattern: 'key', path: '/etc', glob: '*.pem' } },
  { toolName: 'Glob', input: { pattern: '**/*.env', search_directory: '/srv' } },
  { toolName: 'ApplyPatch', input: { patch: '*** Begin Patch\n*** Update File: a.txt\n' } },
  { toolName: 'NotebookEdit', input: { notebook_path: '/nb.ipynb', absolutePath: '/nb.ipynb' } },
  { toolName: 'Write', input: { targetFile: '/x', TargetFile: '/y', 'target-file': '/z' } },
  { toolName: 'Unknown', input: { command: '', file: '/a', include: '/b' } },
  { toolName: 'Bash', input: 'not-an-object' },
  { toolName: 'Bash', input: null },
  { toolName: '', input: {} },
];

const DECLARED_COMMANDS = [
  null,
  'rm -rf /tmp/x',
  'echo hi | tee out',
  'Remove-Item -Recurse C:\\Temp',
  '',
];

type FactRow = {
  toolName: string;
  input: unknown;
  route: ToolRoute;
  command: string | null;
};

/** Names one row in a digest: the tool, the route and both command sources. */
const rowKey = (row: FactRow) => JSON.stringify([row.toolName, row.route, row.command, row.input]);

/** One row's facts. */
function factsPair(row: FactRow) {
  return createSemanticFacts(
    createToolInvocation(row.toolName, row.input, row.route, CONTEXT, row.command),
  );
}

/** The facts minus the store, whose closures no record can carry. */
function comparable(facts: {
  invocation: unknown;
  commands: readonly { usages: unknown; source: string; program: unknown; shell: unknown }[];
  paths: readonly string[];
}) {
  return {
    invocation: facts.invocation,
    commands: facts.commands.map((fact) => ({
      usages: fact.usages,
      source: fact.source,
      program: fact.program,
      shell: fact.shell,
    })),
    paths: facts.paths,
  };
}

describe('next/gate/guards/semantic-facts against src/guards/semantic-facts', () => {
  const rows = [...corpusToolInputs(), ...EXTRA_INPUTS].flatMap((row) =>
    ROUTES.flatMap((route) => DECLARED_COMMANDS.map((command) => ({ ...row, route, command }))),
  );

  test('builds the same facts for every corpus input on every route', () => {
    expect(rows.length).toBeGreaterThan(1_000);
    const recorded: [string, unknown][] = [];
    for (const row of rows) {
      recorded.push([rowKey(row), comparable(factsPair(row))]);
    }
    expectRecordedDigest('guards-semantic-facts/corpus-facts', recorded);
  });

  test('selects the same fact for each usage', () => {
    const recorded: [string, unknown][] = [];
    for (const row of rows) {
      const pair = factsPair(row);
      for (const usage of ['input-candidate', 'declared-command'] as const) {
        recorded.push([
          `${usage} ${rowKey(row)}`,
          getCommandSyntaxFact(pair, usage)?.source ?? null,
        ]);
      }
    }
    expectRecordedDigest('guards-semantic-facts/usage-facts', recorded);
  });

  test('the store parses and projects every corpus command identically', () => {
    const store = createSemanticFactStore();
    const recorded: [string, unknown][] = [];
    for (const source of [...corpusCommands(), ...FIXED_COMMANDS]) {
      for (const dialect of ['posix', 'powershell', 'auto'] as const) {
        recorded.push([`${dialect} ${source}`, store.getCommandProgram(source, dialect)]);
      }
      const syntax = store.getShellSyntax(source);
      const reused = store.getShellSyntax(source, store.getCommandProgram(source, 'posix'));
      recorded.push([`syntax ${source}`, { syntax, reused }]);
    }
    expectRecordedDigest('guards-semantic-facts/store-programs', recorded);
  });

  test('the store rejects a program built from another source the same way', () => {
    const store = createSemanticFactStore();
    const other = store.getCommandProgram('echo other', 'posix');
    expect(() => store.getShellSyntax('echo mine', other)).toThrowError(
      new TypeError('Shell syntax source does not match command program source.'),
    );
  });

  test('expands the same path variables in sensitive text', () => {
    const words = [
      ...new Set(
        [...corpusCommands(), ...FIXED_COMMANDS].flatMap((command) => command.split(/\s+/)),
      ),
      '$HOME/.ssh/config',
      '${HOME}/.aws/credentials',
      '$TMPDIR/x',
      '$XDG_CONFIG_HOME/y',
      '${UNSET_VARIABLE:-/fallback}',
      'no-dollar-here',
      '$',
      '$$',
    ];
    const recorded: [string, unknown][] = [];
    // `$TMPDIR` would otherwise expand to whatever temp directory the host runs under, and every
    // other supported path variable to whatever the host exports. The projection runs over a
    // pinned `TMPDIR` with the rest unset, and the environment is snapshotted inside that window.
    withProcessEnv({ ...UNSET_PATH_VARIABLES, TMPDIR: '/tmp' }, () => {
      const environment = createProcessEnvironment();
      for (const word of words) {
        // `$HOME` expands to this machine's home, which the record cannot carry.
        recorded.push([
          word,
          normalize(projectSensitiveShellText(word, environment), [[homedir(), '<home>']]),
        ]);
      }
    });
    expectRecordedDigest('guards-semantic-facts/sensitive-text', recorded);
  });

  test('raises the same structural limit error', () => {
    const error = new StructuralShellSyntaxLimitError();
    expectRecordedDigest('guards-semantic-facts/limit-error', [
      ['structural', [error.name, error.message]],
    ]);
  });
});
