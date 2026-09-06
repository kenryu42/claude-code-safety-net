import type { ShellKind } from '@/core/shell/model';
import type { NonCommandToolInputKind } from '@/core/tool-input';

export type CommandToolKind = ShellKind;

type NonCommandToolRoute = {
  [Kind in NonCommandToolInputKind]: { kind: Kind };
}[NonCommandToolInputKind];

export type ToolRoute = { kind: 'command'; shell: CommandToolKind } | NonCommandToolRoute;

export type ToolCallContext = {
  configCwd: string;
  executionCwd: string;
};

type ToolInvocationBase = {
  toolName: string;
  input: unknown;
  context: ToolCallContext;
};

export type ToolInvocation =
  | (ToolInvocationBase & {
      route: Extract<ToolRoute, { kind: 'command' }>;
      command: string | null;
    })
  | (ToolInvocationBase & {
      route: Exclude<ToolRoute, { kind: 'command' }>;
    });

export function createToolInvocation(
  toolName: string,
  input: unknown,
  route: ToolRoute,
  context: ToolCallContext,
  command: string | null,
): ToolInvocation {
  if (route.kind !== 'command') return { toolName, input, route, context };
  return { toolName, input, route, context, command };
}
