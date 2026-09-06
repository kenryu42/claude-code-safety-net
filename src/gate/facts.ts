import type { CommandProgram, ShellKind } from '@/core/shell/model';
import type { ShellSyntaxFacts } from '@/core/shell/projection';
import type { ToolCallContext, ToolRoute } from './invocation';

export type CommandFactUsage = 'input-candidate' | 'declared-command';

export type CommandSyntaxFacts = {
  readonly usages: readonly CommandFactUsage[];
  readonly source: string;
  readonly program: CommandProgram;
  readonly shell: ShellSyntaxFacts;
};

export type SemanticFactStore = {
  readonly getShellSyntax: (source: string, program?: CommandProgram) => ShellSyntaxFacts;
  readonly getCommandProgram: (source: string, dialect: ShellKind) => CommandProgram;
};

export type SemanticFacts = {
  readonly invocation: {
    readonly toolName: string;
    readonly route: ToolRoute;
    readonly context: ToolCallContext;
  };
  readonly commands: readonly CommandSyntaxFacts[];
  readonly paths: readonly string[];
  readonly store: SemanticFactStore;
};
