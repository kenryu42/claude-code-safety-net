import {
  createFailedClosedDenial,
  formatDenial,
  formatIntegrationError,
  type IntegrationDenial,
  projectGuardDenial,
} from '@/core/denial';
import { createProcessEnvironment, type PathResolver } from '@/core/environment';
import { ENV_FLAGS, envTruthy, shouldRecordAllowedCommands } from '@/core/policy/env';
import { resolveContainedCwd } from '@/gate/intake';
import { createToolInvocation, type ToolInvocation } from '@/gate/invocation';
import { type GuardDependencies, GuardEvaluationError } from '@/gate/pipeline';
import { writeIntegrationDenialAudit } from '@/hosts/audit';
import { evaluateRuntimeGuard } from '@/hosts/runtime';

/** Canonical OpenClaw shell tool. Only this tool has a proven parameter and workspace mapping. */
const OPENCLAW_EXEC_TOOL = 'exec';

/**
 * `exec.host` values analyzed against the local Gateway host, the only host whose paths the agent
 * workspace describes. `gateway` is proven local; `auto` is accepted because an absent host is the
 * default shape on an install without a sandbox, though a sandbox-configured host resolves `auto`
 * to the sandbox instead (residual documented in SECURITY.md). `sandbox`, `node`, and unknown
 * values run somewhere else.
 */
const PROVEN_EXEC_HOSTS = new Set(['auto', 'gateway']);

type OpenClawToolContext = {
  toolName: string;
  agentId?: string;
  sessionId?: string;
  sessionKey?: string;
  abortSignal?: AbortSignal;
};

type OpenClawBeforeToolCallEvent = {
  toolName?: unknown;
  params?: unknown;
  toolKind?: unknown;
};

/** OpenClaw treats a missing result as "no decision" and never rewrites params on our behalf. */
type OpenClawBeforeToolCallResult = { block: true; blockReason: string } | undefined;

type OpenClawPluginApi = {
  config: unknown;
  runtime: {
    agent: {
      resolveAgentWorkspaceDir: (config: unknown, agentId: string) => string | undefined;
    };
  };
  on: (
    hookName: 'before_tool_call',
    handler: (event: unknown, ctx: OpenClawToolContext) => OpenClawBeforeToolCallResult,
    opts: { matcher: readonly [string, ...string[]]; priority: number },
  ) => void;
};

type MalformedOpenClawToolCall = {
  malformed: true;
  denial: IntegrationDenial;
  cwd: string | null;
};

export function registerOpenClawPlugin(api: OpenClawPluginApi): void {
  api.on('before_tool_call', createOpenClawBeforeToolCallHandler(api), {
    matcher: [OPENCLAW_EXEC_TOOL],
    priority: 50,
  });
}

/** @internal */
export function createOpenClawBeforeToolCallHandler(
  api: OpenClawPluginApi,
  options: { guardDependencies?: Partial<GuardDependencies> } = {},
): (event: unknown, ctx: OpenClawToolContext) => OpenClawBeforeToolCallResult {
  return (event, ctx) => {
    try {
      return handleOpenClawBeforeToolCall(event, ctx, api, options);
    } catch (error) {
      console.error('CC Safety Net error:', error);
      return blockOpenClawToolCall(createFailedClosedDenial());
    }
  };
}

function handleOpenClawBeforeToolCall(
  event: unknown,
  ctx: OpenClawToolContext,
  api: OpenClawPluginApi,
  options: { guardDependencies?: Partial<GuardDependencies> },
): OpenClawBeforeToolCallResult {
  const environment = createProcessEnvironment();
  // OpenClaw stops waiting for this hook when the tool call is cancelled, so spending the
  // analysis budget on a call that can no longer run only risks allowing it after the fact.
  if (ctx.abortSignal?.aborted) return blockOpenClawToolCall(createFailedClosedDenial());

  const toolCall = getOpenClawToolCall(event, ctx, api, environment.paths);
  if (!toolCall) return undefined;

  const getSessionId = () => ctx.sessionId ?? ctx.sessionKey;
  if ('malformed' in toolCall) {
    writeIntegrationDenialAudit(environment, toolCall.denial, getSessionId, {
      agent: 'openclaw',
      toolName: toolCall.denial.toolName,
      cwd: toolCall.cwd,
    });
    return blockOpenClawToolCall(toolCall.denial);
  }

  try {
    const evaluation = evaluateRuntimeGuard(environment, toolCall, {
      guard: {
        auditAllowed: shouldRecordAllowedCommands(environment.env),
        dependencies: options.guardDependencies,
      },
      audit: { agent: 'openclaw', getSessionId },
    });
    return blockOpenClawEvaluation(evaluation, true);
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    if (envTruthy(ENV_FLAGS.debug, environment.env)) {
      console.error(
        `CC Safety Net debug: openclaw before_tool_call analysis failed: ${formatIntegrationError(error.cause)}`,
      );
    }
    return blockOpenClawEvaluation(error.evaluation, true);
  }
}

function getOpenClawToolCall(
  event: unknown,
  ctx: OpenClawToolContext,
  api: OpenClawPluginApi,
  paths: PathResolver,
): MalformedOpenClawToolCall | ToolInvocation | undefined {
  if (!event || typeof event !== 'object') return malformedOpenClawToolCall(null);
  const toolName = (event as OpenClawBeforeToolCallEvent).toolName;
  if (typeof toolName !== 'string' || toolName.trim() === '') {
    return malformedOpenClawToolCall(null);
  }
  // Only `exec` has a proven parameter and execution-directory mapping.
  if (toolName !== OPENCLAW_EXEC_TOOL) return undefined;
  // OpenClaw stamps `toolKind` on tools that intentionally share a name — Code Mode's JavaScript
  // `exec` mirrors its code into `command` — and omits it entirely on the plain shell tool. Only
  // the untagged tool has a proven parameter mapping, so a tagged event gets no decision.
  if ((event as OpenClawBeforeToolCallEvent).toolKind !== undefined) return undefined;

  const params = (event as OpenClawBeforeToolCallEvent).params;
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return malformedOpenClawToolCall(null, toolName);
  }

  const execParams = params as Record<string, unknown>;
  const command = execParams.command;
  if (typeof command !== 'string' || command.trim() === '') {
    return malformedOpenClawToolCall(null, toolName);
  }
  if (execParams.host !== undefined && !PROVEN_EXEC_HOSTS.has(execParams.host as string)) {
    return malformedOpenClawToolCall(null, toolName, command);
  }

  const workspace = resolveOpenClawWorkspace(api, ctx.agentId, paths);
  if (!workspace) return malformedOpenClawToolCall(null, toolName, command);

  const executionCwd = resolveOpenClawExecutionCwd(workspace, execParams, paths);
  if (!executionCwd) {
    return malformedOpenClawToolCall(
      workspace,
      toolName,
      command,
      typeof execParams.workdir === 'string' ? execParams.workdir : undefined,
    );
  }

  return createToolInvocation(
    toolName,
    execParams,
    // OpenClaw exec runs the host shell: POSIX shells on Unix, PowerShell on Windows.
    { kind: 'command', shell: 'auto' },
    { configCwd: workspace, executionCwd },
    command,
  );
}

function resolveOpenClawWorkspace(
  api: OpenClawPluginApi,
  agentId: unknown,
  paths: PathResolver,
): string | undefined {
  if (typeof agentId !== 'string' || agentId.trim() === '') return undefined;
  try {
    const workspaceDir = api.runtime.agent.resolveAgentWorkspaceDir(api.config, agentId);
    if (typeof workspaceDir !== 'string' || workspaceDir.trim() === '') return undefined;
    return resolveContainedCwd('.', [workspaceDir], paths);
  } catch {
    return undefined;
  }
}

function resolveOpenClawExecutionCwd(
  workspace: string,
  execParams: Record<string, unknown>,
  paths: PathResolver,
): string | undefined {
  if (!Object.hasOwn(execParams, 'workdir') || execParams.workdir === undefined) return workspace;
  const workdir = execParams.workdir;
  if (typeof workdir !== 'string' || workdir.trim() === '') return undefined;
  return resolveContainedCwd(workdir, [workspace], paths);
}

function malformedOpenClawToolCall(
  cwd: string | null,
  toolName?: string,
  command?: string,
  segment?: string,
): MalformedOpenClawToolCall {
  return {
    malformed: true,
    denial: createFailedClosedDenial({ command, segment, toolName }),
    cwd,
  };
}

function blockOpenClawEvaluation(
  evaluation: Parameters<typeof projectGuardDenial>[0],
  includeEvidence: boolean,
): OpenClawBeforeToolCallResult {
  const denial = projectGuardDenial(evaluation, { includeEvidence });
  return denial ? blockOpenClawToolCall(denial) : undefined;
}

function blockOpenClawToolCall(denial: IntegrationDenial): OpenClawBeforeToolCallResult {
  return { block: true, blockReason: formatDenial(denial) };
}
