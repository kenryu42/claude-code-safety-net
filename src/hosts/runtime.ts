import type { AuditErrorCode, AuditFailureStage } from '@/core/audit';
import { AnalysisLimit, LIMITS } from '@/core/budget';
import type { Environment } from '@/core/environment';
import { ToolInputLimitError } from '@/core/tool-input';
import { StructuralShellSyntaxLimitError } from '@/gate/guards/semantic-facts';
import type { ToolInvocation } from '@/gate/invocation';
import {
  evaluateGuard,
  type GuardEvaluation,
  GuardEvaluationError,
  type GuardOptions,
} from '@/gate/pipeline';
import { projectGuardAudit, writeGuardAudit } from './audit';

type RuntimeAuditOptions = {
  agent: string;
  shape?: string;
  getSessionId: () => string | undefined;
};

export function evaluateRuntimeGuard(
  environment: Environment,
  invocation: ToolInvocation,
  options: { guard?: Omit<GuardOptions, 'environment'>; audit: RuntimeAuditOptions },
) {
  try {
    const evaluation = evaluateGuard(invocation, { environment, ...options.guard });
    writeRuntimeAudit(environment, invocation, evaluation, options);
    return evaluation;
  } catch (error) {
    if (!(error instanceof GuardEvaluationError)) throw error;
    writeRuntimeAudit(
      environment,
      invocation,
      error.evaluation,
      options,
      !(error.cause instanceof ToolInputLimitError),
      { stage: error.stage, errorCode: classifyAuditError(error.cause) },
    );
    throw error;
  }
}

function writeRuntimeAudit(
  environment: Environment,
  invocation: ToolInvocation,
  evaluation: GuardEvaluation,
  options: { guard?: Omit<GuardOptions, 'environment'>; audit: RuntimeAuditOptions },
  includeInvocationCommand = true,
  failure?: { stage: AuditFailureStage; errorCode: AuditErrorCode },
): void {
  writeGuardAudit(
    environment,
    projectGuardAudit(
      invocation,
      evaluation,
      options.guard?.auditAllowed ?? false,
      includeInvocationCommand,
      failure,
    ),
    options.audit.getSessionId,
    {
      agent: options.audit.agent,
      shape: options.audit.shape,
    },
  );
}

function classifyAuditError(cause: unknown): AuditErrorCode {
  if (cause instanceof AnalysisLimit) return LIMITS[cause.kind].errorCode;
  if (cause instanceof ToolInputLimitError) return 'tool-input-limit';
  if (cause instanceof StructuralShellSyntaxLimitError) return 'structural-shell-syntax-limit';
  return 'unexpected-error';
}
