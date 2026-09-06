import { describe, expect, test } from 'bun:test';
import { homedir } from 'node:os';
import { createProcessEnvironment } from '@next/core/environment';
import {
  createSemanticFactStore,
  createSemanticFacts,
  getCommandSyntaxFact,
  projectSensitiveShellText,
  StructuralShellSyntaxLimitError,
} from '@next/gate/guards/semantic-facts';
import type { ToolRoute } from '@next/gate/invocation';
import { createToolInvocation } from '@next/gate/invocation';
import {
  StructuralShellSyntaxLimitError as ShippedStructuralShellSyntaxLimitError,
  createSemanticFactStore as shippedCreateSemanticFactStore,
  createSemanticFacts as shippedCreateSemanticFacts,
  getCommandSyntaxFact as shippedGetCommandSyntaxFact,
  projectSensitiveShellText as shippedProjectSensitiveShellText,
} from '@/guards/semantic-facts';
import { createToolInvocation as shippedCreateToolInvocation } from '@/ir/invocation';
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

/** One row's facts from both implementations. */
function factsPair(row: FactRow) {
  return {
    next: createSemanticFacts(
      createToolInvocation(row.toolName, row.input, row.route, CONTEXT, row.command),
    ),
    shipped: shippedCreateSemanticFacts(
      shippedCreateToolInvocation(row.toolName, row.input, row.route, CONTEXT, row.command),
    ),
  };
}

/** The facts minus the store, whose closures cannot be compared across implementations. */
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
      const pair = factsPair(row);
      const facts = comparable(pair.next);
      expect(facts).toStrictEqual(comparable(pair.shipped));
      recorded.push([rowKey(row), facts]);
    }
    expectRecordedDigest('guards-semantic-facts/corpus-facts', recorded);
  });

  test('selects the same fact for each usage', () => {
    const recorded: [string, unknown][] = [];
    for (const row of rows) {
      const pair = factsPair(row);
      for (const usage of ['input-candidate', 'declared-command'] as const) {
        const source = getCommandSyntaxFact(pair.next, usage)?.source;
        expect(source).toStrictEqual(shippedGetCommandSyntaxFact(pair.shipped, usage)?.source);
        recorded.push([`${usage} ${rowKey(row)}`, source ?? null]);
      }
    }
    expectRecordedDigest('guards-semantic-facts/usage-facts', recorded);
  });

  test('the store parses and projects every corpus command identically', () => {
    const store = createSemanticFactStore();
    const shipped = shippedCreateSemanticFactStore();
    const recorded: [string, unknown][] = [];
    for (const source of [...corpusCommands(), ...FIXED_COMMANDS]) {
      for (const dialect of ['posix', 'powershell', 'auto'] as const) {
        const parsed = store.getCommandProgram(source, dialect);
        expect(parsed).toStrictEqual(shipped.getCommandProgram(source, dialect));
        recorded.push([`${dialect} ${source}`, parsed]);
      }
      const syntax = store.getShellSyntax(source);
      expect(syntax).toStrictEqual(shipped.getShellSyntax(source));
      const program = store.getCommandProgram(source, 'posix');
      const reused = store.getShellSyntax(source, program);
      expect(reused).toStrictEqual(
        shipped.getShellSyntax(source, shipped.getCommandProgram(source, 'posix')),
      );
      recorded.push([`syntax ${source}`, { syntax, reused }]);
    }
    expectRecordedDigest('guards-semantic-facts/store-programs', recorded);
  });

  test('the store rejects a program built from another source the same way', () => {
    const store = createSemanticFactStore();
    const shipped = shippedCreateSemanticFactStore();
    const other = store.getCommandProgram('echo other', 'posix');
    expect(() => store.getShellSyntax('echo mine', other)).toThrowError(
      new TypeError('Shell syntax source does not match command program source.'),
    );
    expect(() => shipped.getShellSyntax('echo mine', other)).toThrowError(
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
    // The shipped projection reads `process.env` itself, so `$TMPDIR` would expand to whatever
    // temp directory the host runs under and every other supported path variable to whatever the
    // host exports. Both sides run over a pinned `TMPDIR` with the rest unset, and the ported
    // environment is snapshotted inside the pinned window so it reads the same values.
    withProcessEnv({ ...UNSET_PATH_VARIABLES, TMPDIR: '/tmp' }, () => {
      const environment = createProcessEnvironment();
      for (const word of words) {
        const projected = projectSensitiveShellText(word, environment);
        expect(projected).toStrictEqual(shippedProjectSensitiveShellText(word));
        // `$HOME` expands to this machine's home, which the record cannot carry.
        recorded.push([word, normalize(projected, [[homedir(), '<home>']])]);
      }
    });
    expectRecordedDigest('guards-semantic-facts/sensitive-text', recorded);
  });

  test('raises the same structural limit error', () => {
    const error = new StructuralShellSyntaxLimitError();
    const shipped = new ShippedStructuralShellSyntaxLimitError();
    expect([error.name, error.message]).toStrictEqual([shipped.name, shipped.message]);
    expectRecordedDigest('guards-semantic-facts/limit-error', [
      ['structural', [error.name, error.message]],
    ]);
  });
});
