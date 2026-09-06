import type { ShellCommand, ToolCall, URI } from '@ampcode/plugin';
import {
  createFailedClosedDenial,
  formatDenial,
  formatIntegrationError,
  type IntegrationDenial,
  projectGuardDenial,
} from '@/core/denial';
import { createProcessEnvironment, type PathResolver } from '@/core/environment';
import { ENV_FLAGS, envTruthy, shouldRecordAllowedCommands } from '@/core/policy/env';
import * as toolRouting from '@/core/tool-input';
import { resolveCanonicalCwd, resolveContainedCwd } from '@/gate/intake';
import * as invocationDomain from '@/gate/invocation';
import { type GuardDependencies, GuardEvaluationError } from '@/gate/pipeline';
import { writeIntegrationDenialAudit } from '@/hosts/audit';
import * as guardEngine from '@/hosts/runtime';

type AmpApi = {
  system: { workspaceRoot: URI | null };
  helpers: {
    filePathFromURI: (uri: URI) => string;
    shellCommandFromToolCall: (event: ToolCall) => ShellCommand | null;
  };
};

type AmpToolCallEvent = {
  tool?: unknown;
  input?: unknown;
  thread?: { id?: unknown };
};

type AmpToolCallResult = { action: 'allow' } | { action: 'reject-and-continue'; message: string };

type MalformedAmpToolCall = {
  malformed: true;
  denial: IntegrationDenial;
  cwd: string | null;
};

type AmpHandlerOptions = {
  guardDependencies?: Partial<GuardDependencies>;
};

export const handleAmpToolCall = createAmpToolCallHandler();

/** @internal */
export function createAmpToolCallHandler(
  options: AmpHandlerOptions = {},
): (event: unknown, amp: AmpApi) => AmpToolCallResult {
  return (event, amp) => {
    try {
      return handleAmpToolCallWithDependencies(event, amp, options);
    } catch (error) {
      console.error('CC Safety Net error:', error);
      return rejectAmpToolCall(createFailedClosedDenial());
    }
  };
}

function handleAmpToolCallWithDependencies(
  event: unknown,
  amp: AmpApi,
  options: AmpHandlerOptions,
): AmpToolCallResult {
  const environment = createProcessEnvironment();
  const toolCall = getAmpToolInvocation(event, amp, environment.paths);
  const getSessionId = () => ampThreadId(event);

  if ('malformed' in toolCall) {
    writeIntegrationDenialAudit(environment, toolCall.denial, getSessionId, {
      agent: 'amp',
      toolName: toolCall.denial.toolName,
      cwd: toolCall.cwd,
    });
    return rejectAmpToolCall(toolCall.denial);
  }

  try {
    const evaluation = guardEngine.evaluateRuntimeGuard(environment, toolCall, {
      guard: {
        auditAllowed: shouldRecordAllowedCommands(environment.env),
        dependencies: options.guardDependencies,
      },
      audit: {
        agent: 'amp',
        getSessionId,
      },
    });
    return projectAmpEvaluation(evaluation, true);
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    if (envTruthy(ENV_FLAGS.debug, environment.env)) {
      console.error(
        `CC Safety Net debug: amp tool.call analysis failed: ${formatIntegrationError(error.cause)}`,
      );
    }
    return projectAmpEvaluation(error.evaluation, toolCall.route.kind === 'command');
  }
}

function getAmpToolInvocation(
  event: unknown,
  amp: AmpApi,
  paths: PathResolver,
): MalformedAmpToolCall | invocationDomain.ToolInvocation {
  if (!event || typeof event !== 'object') return malformedAmpToolCall(null);
  const toolCall = event as AmpToolCallEvent;
  if (typeof toolCall.tool !== 'string' || toolCall.tool.trim() === '') {
    return malformedAmpToolCall(null);
  }
  if (!toolCall.input || typeof toolCall.input !== 'object') {
    return malformedAmpToolCall(null, toolCall.tool);
  }

  const workspaceRoot = resolveAmpWorkspaceRoot(amp, paths);
  if (!workspaceRoot) return malformedAmpToolCall(null, toolCall.tool);

  const shell = extractAmpShellCommand(amp, event);
  if (!shell.ok) return malformedAmpToolCall(workspaceRoot, toolCall.tool);

  if (!shell.command) {
    return invocationDomain.createToolInvocation(
      toolCall.tool,
      toolCall.input,
      { kind: toolRouting.getNonCommandToolInputKind(toolCall.tool) },
      { configCwd: workspaceRoot, executionCwd: workspaceRoot },
      null,
    );
  }

  if (typeof shell.command.command !== 'string' || shell.command.command.trim() === '') {
    return malformedAmpToolCall(workspaceRoot, toolCall.tool);
  }

  const executionCwd =
    typeof shell.command.dir === 'string'
      ? resolveCanonicalCwd(shell.command.dir, workspaceRoot, paths)
      : workspaceRoot;
  if (!executionCwd) {
    return {
      malformed: true,
      denial: {
        reason:
          'CC Safety Net could not use the requested working directory because it does not exist, is inaccessible, is not a directory, or uses an unsupported path form. Use an existing accessible working directory. If the requested directory is missing, create it from an accessible location before retrying the command.',
        intent: 'use_alternative',
        command: shell.command.command,
        segment: shell.command.dir,
        toolName: toolCall.tool,
      },
      cwd: workspaceRoot,
    };
  }

  return invocationDomain.createToolInvocation(
    toolCall.tool,
    toolCall.input,
    { kind: 'command', shell: 'posix' },
    { configCwd: workspaceRoot, executionCwd },
    shell.command.command,
  );
}

function resolveAmpWorkspaceRoot(amp: AmpApi, paths: PathResolver): string | undefined {
  const workspaceRoot = amp.system.workspaceRoot;
  if (!workspaceRoot) return undefined;
  try {
    const rootPath = amp.helpers.filePathFromURI(workspaceRoot);
    if (typeof rootPath !== 'string' || rootPath.trim() === '') return undefined;
    return resolveContainedCwd('.', [rootPath], paths);
  } catch {
    return undefined;
  }
}

function extractAmpShellCommand(
  amp: AmpApi,
  event: unknown,
): { ok: true; command: ShellCommand | null } | { ok: false } {
  try {
    return { ok: true, command: amp.helpers.shellCommandFromToolCall(event as ToolCall) };
  } catch {
    return { ok: false };
  }
}

function ampThreadId(event: unknown): string | undefined {
  if (!event || typeof event !== 'object') return undefined;
  const id = (event as AmpToolCallEvent).thread?.id;
  return typeof id === 'string' && id.trim() !== '' ? id : undefined;
}

function malformedAmpToolCall(cwd: string | null, toolName?: string): MalformedAmpToolCall {
  return {
    malformed: true,
    denial: createFailedClosedDenial({ toolName }),
    cwd,
  };
}

function projectAmpEvaluation(
  evaluation: Parameters<typeof projectGuardDenial>[0],
  includeEvidence: boolean,
): AmpToolCallResult {
  const denial = projectGuardDenial(evaluation, { includeEvidence });
  return denial ? rejectAmpToolCall(denial) : { action: 'allow' };
}

function rejectAmpToolCall(denial: IntegrationDenial): AmpToolCallResult {
  return { action: 'reject-and-continue', message: formatDenial(denial) };
}
