import { writeAuditLog } from '@/audit/writer';
import type { AuditErrorCode, AuditFailureStage } from '@/core/audit';
import type { BlockIntent, Decision } from '@/core/decision';
import type { IntegrationDenial } from '@/core/denial';
import type { Environment } from '@/core/environment';
import type { EffectiveSafetyLevel } from '@/core/policy/types';
import type { ToolInvocation } from '@/gate/invocation';

type GuardEvaluation = {
  stage: string;
  decision: Decision;
  level?: EffectiveSafetyLevel;
  configFallback?: { reason: string };
};

type GuardAuditDescriptor = {
  decision: 'allow' | 'deny';
  command: string;
  segment: string;
  reason: string;
  cwd: string;
  toolName: string;
  level?: EffectiveSafetyLevel;
  configFallback?: true;
  ruleId?: string;
  intent?: BlockIntent;
  failureStage?: AuditFailureStage;
  errorCode?: AuditErrorCode;
};

export function projectGuardAudit(
  invocation: ToolInvocation,
  evaluation: GuardEvaluation,
  auditAllowed: boolean,
  includeInvocationCommand = true,
  failure?: { stage: AuditFailureStage; errorCode: AuditErrorCode },
): GuardAuditDescriptor | undefined {
  if (evaluation.decision.kind === 'allow') {
    if (!auditAllowed || invocation.route.kind !== 'command') return undefined;
    const command = getInvocationCommand(invocation);
    return {
      decision: 'allow',
      command,
      segment: command,
      reason: 'allowed',
      cwd: invocation.context.executionCwd,
      toolName: invocation.toolName,
      level: evaluation.level,
      ...(evaluation.configFallback ? { configFallback: true as const } : {}),
    };
  }

  const evidence = evaluation.decision.evidence.find((item) => item.kind === 'command');
  const command =
    evidence?.command ?? (includeInvocationCommand ? getInvocationCommand(invocation) : '');
  return {
    decision: 'deny',
    command,
    segment: evidence?.segment ?? command,
    reason: evaluation.decision.reason,
    cwd: invocation.context.executionCwd,
    toolName: invocation.toolName,
    level: evaluation.level,
    ...(evaluation.configFallback ? { configFallback: true as const } : {}),
    ruleId: evaluation.decision.ruleId,
    intent: evaluation.decision.intent,
    failureStage: failure?.stage,
    errorCode: failure?.errorCode,
  };
}

function getInvocationCommand(invocation: ToolInvocation): string {
  return 'command' in invocation ? (invocation.command ?? '') : '';
}

export function writeGuardAudit(
  environment: Environment,
  audit: GuardAuditDescriptor | undefined,
  getSessionId: () => string | undefined,
  options: { agent: string; shape?: string },
): void {
  if (!audit) return;
  let sessionId: string | undefined;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;
  writeAuditLog(environment, sessionId, audit.command, audit.segment, audit.reason, audit.cwd, {
    decision: audit.decision,
    agent: options.agent,
    shape: options.shape,
    level: audit.level,
    configFallback: audit.configFallback,
    toolName: audit.toolName,
    ruleId: audit.ruleId,
    intent: audit.intent,
    failureStage: audit.failureStage,
    errorCode: audit.errorCode,
  });
}

export function writeIntegrationDenialAudit(
  environment: Environment,
  denial: IntegrationDenial,
  getSessionId: () => string | undefined,
  options: {
    agent: string;
    shape?: string;
    toolName?: string;
    cwd?: string | null;
  },
): void {
  let sessionId: string | undefined;
  try {
    sessionId = getSessionId();
  } catch {
    return;
  }
  if (typeof sessionId !== 'string' || !sessionId.trim()) return;
  writeAuditLog(
    environment,
    sessionId,
    denial.command ?? '',
    denial.segment ?? denial.command ?? '',
    denial.reason,
    options.cwd ?? null,
    {
      decision: 'deny',
      agent: options.agent,
      shape: options.shape,
      toolName: options.toolName ?? denial.toolName,
      ruleId: denial.ruleId,
      intent: denial.intent,
    },
  );
}
