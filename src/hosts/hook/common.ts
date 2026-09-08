import {
  createFailedClosedDenial,
  formatDenial,
  formatIntegrationError,
  type IntegrationDenial,
  projectGuardDenial,
} from '@/core/denial';
import { createProcessEnvironment, type Environment } from '@/core/environment';
import { ENV_FLAGS, envTruthy, shouldRecordAllowedCommands } from '@/core/policy/env';
import { getCommandFromToolInput, ToolInputLimitError } from '@/core/tool-input';
import {
  outputFailedClosed,
  parseHookJson,
  readBoundedHookInput,
  resolveStandardHookContext,
} from '@/gate/intake';
import type { ToolCallContext, ToolRoute } from '@/gate/invocation';
import { createToolInvocation } from '@/gate/invocation';
import { type GuardDependencies, GuardEvaluationError, type GuardStage } from '@/gate/pipeline';
import { writeIntegrationDenialAudit } from '@/hosts/audit';
import { evaluateRuntimeGuard } from '@/hosts/runtime';

type HookDenyOutput = (denial: IntegrationDenial) => void;

type HookAdapter<T> = {
  agent: string;
  getAgent?: (input: T, environment: Environment) => string;
  outputDeny: HookDenyOutput;
  outputAllow?: () => void;
  guardDependencies?: Partial<GuardDependencies>;
  isSupported: (input: T) => boolean;
  getToolName: (input: T) => unknown;
  getToolInput: (
    input: T,
    toolName: string,
    outputDeny: HookDenyOutput,
    environment: Environment,
  ) => ToolInputResult;
  getContext: (
    input: T,
    toolInput: unknown,
    toolName: string,
    outputDeny: HookDenyOutput,
    environment: Environment,
  ) => ToolCallContext | null;
  getSessionId: (input: T) => string | undefined;
};

type ConfiguredHookAdapter<T> = Omit<HookAdapter<T>, 'outputDeny' | 'outputAllow'> & {
  createDenyOutput: (message: string) => object;
  createAllowOutput?: () => object;
};

type ToolInputResult = { ok: true; input: unknown; route: ToolRoute } | { ok: false };

/** The context every host that reports its own cwd resolves: the hook's `cwd` field, falling back
 *  to the process's. */
export const getStandardHookContext: HookAdapter<{ cwd?: string }>['getContext'] = (
  input,
  toolInput,
  toolName,
  outputDeny,
  environment,
) =>
  resolveStandardHookContext(
    input.cwd,
    toolInput,
    toolName,
    outputDeny,
    environment.paths,
    process.cwd(),
  );

function outputHookDeny(
  createDenyOutput: (message: string) => object,
  denial: IntegrationDenial,
): void {
  console.log(JSON.stringify(createDenyOutput(formatDenial(denial))));
}

async function readHookInput<T>(outputDeny: HookDenyOutput): Promise<T | undefined> {
  let inputText: string;
  try {
    inputText = (await readBoundedHookInput(process.stdin)).trim();
  } catch {
    outputDeny({ reason: 'Failed to parse hook input JSON.' });
    return undefined;
  }

  if (!inputText) {
    outputDeny({ reason: 'Missing hook input JSON.' });
    return undefined;
  }

  return parseHookJson<T>(inputText, outputDeny, 'Failed to parse hook input JSON.');
}

async function runHookAdapter<T>(adapter: HookAdapter<T>): Promise<void> {
  const environment = createProcessEnvironment();
  const input = await readHookInput<T>(adapter.outputDeny);
  if (input === undefined) {
    return;
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    outputFailedClosed(adapter.outputDeny);
    return;
  }

  if (!adapter.isSupported(input)) {
    return;
  }

  const agent = adapter.getAgent?.(input, environment) ?? adapter.agent;
  const shape = adapter.agent === agent ? undefined : adapter.agent;
  const auditCwd = getHookAuditCwd(input);

  const outputPreflightDeny = (denial: IntegrationDenial, toolName?: string): void => {
    writeIntegrationDenialAudit(environment, denial, () => adapter.getSessionId(input), {
      agent,
      shape,
      toolName,
      cwd: auditCwd,
    });
    adapter.outputDeny(denial);
  };

  const toolNameInput = adapter.getToolName(input);
  if (typeof toolNameInput !== 'string' || toolNameInput.trim() === '') {
    outputFailedClosed((denial) => outputPreflightDeny(denial), getRawHookToolInput(input));
    return;
  }
  const toolName = toolNameInput;
  const outputToolPreflightDeny = (denial: IntegrationDenial): void =>
    outputPreflightDeny(denial, toolName);

  let toolInputResult: ToolInputResult;
  try {
    toolInputResult = adapter.getToolInput(input, toolName, outputToolPreflightDeny, environment);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError)) throw error;
    outputFailedClosed(outputToolPreflightDeny, undefined, toolName);
    return;
  }
  if (!toolInputResult.ok) return;

  const context = adapter.getContext(
    input,
    toolInputResult.input,
    toolName,
    outputToolPreflightDeny,
    environment,
  );
  if (!context) return;

  let command: string | undefined;
  try {
    command = getCommandFromToolInput(toolInputResult.input);
  } catch (error) {
    if (!(error instanceof ToolInputLimitError)) throw error;
    outputFailedClosed(outputToolPreflightDeny, undefined, toolName);
    return;
  }
  const invocation = createToolInvocation(
    toolName,
    toolInputResult.input,
    toolInputResult.route,
    context,
    command ?? null,
  );
  try {
    const evaluation = evaluateRuntimeGuard(environment, invocation, {
      guard: {
        auditAllowed: shouldRecordAllowedCommands(environment.env),
        dependencies: adapter.guardDependencies,
      },
      audit: { agent, shape, getSessionId: () => adapter.getSessionId(input) },
    });
    const denial = projectGuardDenial(evaluation, {
      includeEvidence: true,
      toolName: evaluation.stage === 'command-analysis' ? undefined : toolName,
    });
    if (denial) {
      adapter.outputDeny(denial);
      return;
    }
    adapter.outputAllow?.();
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) {
      throw error;
    }
    logHookGuardError(error, environment.env);
    const denial = projectGuardDenial(error.evaluation, {
      includeEvidence: true,
      toolName: error.evaluation.stage === 'command-analysis' ? undefined : toolName,
    });
    if (denial) adapter.outputDeny(denial);
    return;
  }
}

function logHookGuardError(error: GuardEvaluationError, env: ReadonlyMap<string, string>): void {
  if (!envTruthy(ENV_FLAGS.debug, env)) return;
  console.error(
    `CC Safety Net debug: ${getHookGuardErrorLabel(error.stage)}: ${formatIntegrationError(error.cause)}`,
  );
}

function getHookGuardErrorLabel(stage: GuardStage): string {
  if (stage === 'policy-protection') return 'hook policy protection failed';
  if (stage === 'config-load') return 'hook config loading failed';
  if (stage === 'secret-protection') return 'hook secret protection failed';
  return 'hook analysis failed';
}

function getRawHookToolInput(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  if (Object.hasOwn(input, 'tool_input')) return (input as Record<string, unknown>).tool_input;
  const toolCall = (input as Record<string, unknown>).toolCall;
  if (toolCall && typeof toolCall === 'object' && !Array.isArray(toolCall)) {
    return (toolCall as Record<string, unknown>).args;
  }
  return undefined;
}

function getHookAuditCwd(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const cwd = (input as Record<string, unknown>).cwd;
  if (typeof cwd === 'string') return cwd;
  const toolCall = (input as Record<string, unknown>).toolCall;
  if (!toolCall || typeof toolCall !== 'object' || Array.isArray(toolCall)) return null;
  const args = (toolCall as Record<string, unknown>).args;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const commandCwd = (args as Record<string, unknown>).Cwd;
  return typeof commandCwd === 'string' ? commandCwd : null;
}

export async function runConfiguredHookAdapter<T>(
  adapter: ConfiguredHookAdapter<T>,
): Promise<void> {
  const outputDeny: HookDenyOutput = (denial) => outputHookDeny(adapter.createDenyOutput, denial);
  const createAllowOutput = adapter.createAllowOutput;
  const outputAllow = createAllowOutput
    ? () => console.log(JSON.stringify(createAllowOutput()))
    : undefined;

  try {
    await runHookAdapter<T>({ ...adapter, outputDeny, outputAllow });
  } catch (error) {
    console.error('CC Safety Net error:', error);
    outputDeny(createFailedClosedDenial());
  }
}
