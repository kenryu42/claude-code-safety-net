import type { Environment } from '@/core/environment';
import { expandSupportedPathEnvironmentVariables } from '@/core/paths/canonicalization';
import type { CommandProgram, ShellKind } from '@/core/shell/model';
import { parseCommand } from '@/core/shell/parse';
import {
  projectShellSyntax,
  type ShellSyntaxEntry,
  type ShellSyntaxFacts,
} from '@/core/shell/projection';
import {
  extractPatchTargetsFromToolInput,
  extractPathLikeToolValues,
  getCommandFromToolInput,
} from '@/core/tool-input';
import type {
  CommandFactUsage,
  CommandSyntaxFacts,
  SemanticFactStore,
  SemanticFacts,
} from '../facts';
import type { ToolInvocation } from '../invocation';

const PATH_LIKE_KEYS = new Set([
  'absolutepath',
  'directorypath',
  'directory_path',
  'file',
  'file_path',
  'filepath',
  'include',
  'notebook_path',
  'path',
  'searchdirectory',
  'search_directory',
  'searchpath',
  'targetfile',
  'target_file',
]);
const GREP_KEYS = new Set([...PATH_LIKE_KEYS, 'glob']);
const GLOB_KEYS = new Set([...GREP_KEYS, 'pattern']);
const EMPTY_SHELL_SYNTAX_ENTRIES: readonly ShellSyntaxEntry[] = [];

export type FactParserDependencies = {
  parseCommand: typeof parseCommand;
  projectShellSyntax: typeof projectShellSyntax;
};

const DEFAULT_PARSERS: FactParserDependencies = { parseCommand, projectShellSyntax };

export class StructuralShellSyntaxLimitError extends Error {
  override readonly name = 'StructuralShellSyntaxLimitError';

  constructor() {
    super('Structural command analysis limit exceeded.');
  }
}

export function createSemanticFacts(
  invocation: ToolInvocation,
  parserDependencies: Partial<FactParserDependencies> = {},
): SemanticFacts {
  const store = createSemanticFactStore({ ...DEFAULT_PARSERS, ...parserDependencies });
  const inputCommand = getCommandFromToolInput(invocation.input);
  const candidates: { usage: CommandFactUsage; source: string }[] = [];
  if (
    (invocation.route.kind === 'command' || invocation.route.kind === 'unknown') &&
    inputCommand
  ) {
    candidates.push({ usage: 'input-candidate', source: inputCommand });
  }
  if (invocation.route.kind === 'command' && 'command' in invocation && invocation.command) {
    candidates.push({ usage: 'declared-command', source: invocation.command });
  }

  const commands = candidates.reduce<CommandSyntaxFacts[]>((facts, candidate) => {
    const existingIndex = facts.findIndex((fact) => fact.source === candidate.source);
    if (existingIndex !== -1) {
      const existing = facts[existingIndex];
      if (!existing) return facts;
      facts[existingIndex] = {
        ...existing,
        usages: [...existing.usages, candidate.usage],
      };
      return facts;
    }
    const dialect =
      invocation.route.kind === 'command'
        ? invocation.route.shell
        : process.platform === 'win32'
          ? 'powershell'
          : 'posix';
    const program = store.getCommandProgram(candidate.source, dialect);
    facts.push({
      usages: [candidate.usage],
      source: candidate.source,
      program,
      shell: store.getShellSyntax(candidate.source, program),
    });
    return facts;
  }, []);

  return {
    invocation: {
      toolName: invocation.toolName,
      route: invocation.route,
      context: invocation.context,
    },
    commands,
    paths: extractDirectPathFacts(invocation),
    store,
  };
}

export function getCommandSyntaxFact(
  facts: SemanticFacts,
  usage: CommandFactUsage,
): CommandSyntaxFacts | undefined {
  return facts.commands.find((fact) => fact.usages.includes(usage));
}

export function projectSensitiveShellText(source: string, environment: Environment): string {
  // Scanning asks for this per token and per candidate path, so text that cannot expand
  // must not pay for the expansion walk at all.
  if (!source.includes('$')) return source;
  return expandSupportedPathEnvironmentVariables(source, environment);
}

/**
 * Shared cache that parses each unique command/dialect pair at most once.
 * @internal
 */
export function createSemanticFactStore(
  parserDependencies: Partial<FactParserDependencies> = {},
): SemanticFactStore {
  const parsers = { ...DEFAULT_PARSERS, ...parserDependencies };
  const shellFacts = new Map<string, ShellSyntaxFacts>();
  const commandPrograms = new Map<string, CommandProgram>();
  const structuralLimitFacts = new WeakMap<CommandProgram, ShellSyntaxFacts>();
  const getCommandProgram = (source: string, dialect: ShellKind) => {
    const key = `${dialect}\u0000${source}`;
    const existing = commandPrograms.get(key);
    if (existing) return existing;
    const program = parsers.parseCommand(source, dialect);
    commandPrograms.set(key, program);
    return program;
  };
  const getShellSyntax = (source: string, suppliedProgram?: CommandProgram) => {
    if (suppliedProgram && suppliedProgram.source !== source) {
      throw new TypeError('Shell syntax source does not match command program source.');
    }
    const program = suppliedProgram ?? getCommandProgram(source, 'posix');
    if (program.status === 'limited') {
      const existing = structuralLimitFacts.get(program);
      if (existing) return existing;
      const syntax = {
        status: 'structural-limit' as const,
        source,
        entries: EMPTY_SHELL_SYNTAX_ENTRIES,
        assignmentFallbacks: [],
      };
      structuralLimitFacts.set(program, syntax);
      return syntax;
    }
    const existing = shellFacts.get(source);
    if (existing) return existing;
    const syntax = parsers.projectShellSyntax(source, program);
    shellFacts.set(source, syntax);
    return syntax;
  };
  return {
    getShellSyntax,
    getCommandProgram,
  };
}

function extractDirectPathFacts(invocation: ToolInvocation): string[] {
  const keys =
    invocation.route.kind === 'grep'
      ? GREP_KEYS
      : invocation.route.kind === 'glob'
        ? GLOB_KEYS
        : PATH_LIKE_KEYS;
  return [
    ...extractPathLikeToolValues(invocation.input, keys),
    ...(invocation.route.kind === 'patch'
      ? extractPatchTargetsFromToolInput(invocation.input)
      : []),
  ];
}
