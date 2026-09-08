import { resolve } from 'node:path';
import type { Decision } from '@/core/decision';
import type { Environment } from '@/core/environment';
import { PolicyFilesystemError, readPolicyFile } from '@/core/io/safe-read';
import { resolveCommandAnalysisContext } from '@/core/policy/analysis-context';
import { validateRulesConfigFile } from '@/core/policy/config-file';
import { getCCSafetyNetEnvModes } from '@/core/policy/env';
import {
  getPolicyPaths,
  getProjectRulesConfigPath,
  getUserRulesConfigPath,
} from '@/core/policy/paths';
import { createPolicySnapshot, loadPolicySnapshot } from '@/core/policy/snapshot';
import type {
  CustomRuleMetadata,
  DestructiveCommandRuleOverride,
  EffectiveDestructiveCommandRuleState,
  EffectiveSafetyCapabilities,
  EffectiveSafetyLevel,
  PolicySafetyLevel,
  PolicyScopes,
  PolicySnapshot,
} from '@/core/policy/types';
import { sanitizeDiagnosticText } from '@/core/redaction';
import { DESTRUCTIVE_COMMAND_RULE_METADATA } from '@/core/rules/destructive';
import { parseCommand } from '@/core/shell/parse';
import { projectSegmentWords } from '@/core/shell/traversal';
import { REASON_GIT_METADATA_PROTECTION } from './guards/git-metadata-protection';
import { REASON_POLICY_APPLY_PROTECTION } from './guards/policy-apply-protection';
import { REASON_POLICY_CONFIG_PROTECTION } from './guards/policy-protection';
import { StructuralShellSyntaxLimitError } from './guards/semantic-facts';
import { createToolInvocation, type ToolInvocation } from './invocation';
import { evaluateGuard } from './pipeline';
import {
  type CommandTrace,
  createCommandTraceContext,
  createCommandTraceRecorder,
  type TraceStep,
} from './trace';

/** Trace data for explain command */
interface ExplainTrace {
  steps: TraceStep[];
  segments: { index: number; steps: TraceStep[] }[];
}

/** Options for explain command */
export interface ExplainOptions {
  cwd?: string;
  userConfigDir?: string;
  strict?: boolean;
  policySnapshot?: PolicySnapshot;
}

/** Result of explain command */
export interface ExplainResult {
  trace: ExplainTrace;
  result: 'blocked' | 'allowed';
  reason?: string;
  segment?: string;
  ruleId?: string;
  customRule?: CustomRuleMetadata;
  configSource: string | null;
  configValid: boolean;
  effectiveLevel: EffectiveSafetyLevel;
  selectedPreset: PolicySafetyLevel;
  /** Which scope supplied `selectedPreset`, set only when a project policy file
   *  was read. The per-field deltas belong to `status` and `doctor`. */
  safetyPresetScope?: PolicyScopes['levelScope'];
  effectiveCapabilities: EffectiveSafetyCapabilities;
  destructiveCommandRuleOverrides: Readonly<Record<string, DestructiveCommandRuleOverride>>;
  ruleActivation?: EffectiveDestructiveCommandRuleState & { id: string };
}

/**
 * Explain runs the whole guard sequence over a synthetic shell invocation with a recording
 * trace sink attached, so a diagnostic surface reports exactly what the hook would decide
 * without executing anything.
 */
export function explainCommand(
  command: string,
  options: ExplainOptions = {},
  environment: Environment,
): ExplainResult {
  // Resolve to absolute path - relative paths break cwd comparison logic
  const cwd = resolve(options.cwd ?? process.cwd());
  const snapshot =
    options.policySnapshot ??
    loadPolicySnapshot(environment, { cwd, userConfigDir: options.userConfigDir });
  const modes = getCCSafetyNetEnvModes(snapshot.policy, environment.env);
  const strictOverride = options.strict;
  const context = resolveCommandAnalysisContext({
    policySnapshot: snapshot,
    effectiveCapabilities: modes.capabilities,
    strict: strictOverride ?? modes.strict,
    paranoidRm: modes.paranoidRm,
    paranoidInterpreters: modes.paranoidInterpreters,
    worktreeMode: modes.worktreeMode,
  });
  const configuration = {
    effectiveLevel: context.effectiveLevel,
    selectedPreset: snapshot.policy.safety.level ?? 'standard',
    ...(snapshot.policyScopes ? { safetyPresetScope: snapshot.policyScopes.levelScope } : {}),
    effectiveCapabilities: context.effectiveCapabilities,
    destructiveCommandRuleOverrides: snapshot.policy.destructiveCommandRuleOverrides,
  };
  const { configSource, configValid } = getConfigSource(environment, {
    cwd,
    userConfigDir: options.userConfigDir,
  });

  if (!command || !command.trim()) {
    return {
      trace: { steps: [{ type: 'error', message: 'No command provided' }], segments: [] },
      result: 'allowed',
      configSource,
      configValid,
      ...configuration,
    };
  }

  const program = parseCommand(command, 'auto');
  // What `src`'s pre-analysis scanner threw for a structural-limit syntax. The pipeline would
  // answer the hook with the recursion denial before any protection runs, so explain reports
  // the limit itself instead of a denial the hook path never shows a user.
  if (program.status === 'limited') throw new StructuralShellSyntaxLimitError();
  const displayProgram =
    program.dialect === 'powershell' ? parseCommand(command, 'posix') : program;
  const segments = projectSegmentWords(displayProgram);
  const recorder = createCommandTraceRecorder();
  const trace = createCommandTraceContext(recorder);
  // Recorded before the guard runs so the recorder collects the command's assignment values
  // and redacts them out of every later step, as `src`'s evaluator wrapper did.
  trace.recordGlobal({
    type: 'parse',
    input: command,
    segments: segments.map((words) => [...words]),
  });
  const invocation = createToolInvocation(
    'Bash',
    { command },
    { kind: 'command', shell: 'auto' },
    { configCwd: cwd, executionCwd: cwd },
    command,
  );
  const evaluation = evaluateGuard(invocation, {
    environment,
    trace,
    dependencies: {
      loadPolicySnapshot: () => snapshot,
      ...(strictOverride === undefined
        ? {}
        : { getModes: () => ({ ...modes, strict: strictOverride }) }),
    },
  });
  const decision = evaluation.decision.kind === 'deny' ? evaluation.decision : null;

  // A protection denied before the analyzer ran, so the recorder holds nothing but the parse
  // step: report the matcher that answered, exactly as `src`'s pre-analysis scan did.
  if (
    decision &&
    (evaluation.stage === 'policy-protection' || evaluation.stage === 'secret-protection')
  ) {
    const matcher = preAnalysisMatcher(decision);
    return {
      trace: {
        steps: [],
        segments: [
          {
            index: 0,
            steps: [
              { type: 'rule-check', rule: matcher.rule, matched: true, reason: decision.reason },
            ],
          },
        ],
      },
      result: 'blocked',
      reason: sanitizeDiagnosticText(decision.reason),
      segment: sanitizeDiagnosticText(denialSegment(decision, command)),
      ...(matcher.ruleId ? { ruleId: sanitizeDiagnosticText(matcher.ruleId) } : {}),
      configSource,
      configValid,
      ...configuration,
    };
  }

  const index = trace.getNextSegmentIndex();
  if (decision && index > 0 && index < segments.length) {
    trace.recordSegment({ type: 'segment-skipped', index, reason: 'prior-segment-blocked' }, index);
  }
  const commandTrace = recorder.finish(
    decision
      ? {
          result: 'blocked',
          reason: decision.reason,
          segment: denialSegment(decision, command),
          ...(decision.ruleId ? { ruleId: decision.ruleId } : {}),
        }
      : { result: 'allowed' },
  );
  const activationRuleId =
    decision?.ruleId ?? identifyModeGatedCandidate(invocation, snapshot, modes, environment);
  const activationMetadata = DESTRUCTIVE_COMMAND_RULE_METADATA.find(
    (rule) => rule.id === activationRuleId && rule.activationCapability,
  );
  const activationState = activationMetadata
    ? context.policy.effectiveDestructiveCommandRules[activationMetadata.id]
    : undefined;
  return {
    trace: projectExplainTrace(commandTrace),
    result: decision ? 'blocked' : 'allowed',
    reason: decision ? sanitizeDiagnosticText(decision.reason) : undefined,
    segment: decision ? sanitizeDiagnosticText(denialSegment(decision, command)) : undefined,
    ruleId: decision?.ruleId ? sanitizeDiagnosticText(decision.ruleId) : undefined,
    customRule: sanitizeCustomRule(getCustomRule(decision?.ruleId, snapshot)),
    configSource,
    configValid,
    ...configuration,
    ...(activationMetadata && activationState
      ? {
          ruleActivation: {
            id: activationMetadata.id,
            ...activationState,
          },
        }
      : {}),
  };
}

type CommandDenial = Extract<Decision, { kind: 'deny' }>;

/** The segment a denial points at, with the whole command as the fallback `src` used. */
function denialSegment(decision: CommandDenial, command: string): string {
  return decision.evidence.find((item) => item.kind === 'command')?.segment ?? command;
}

/**
 * Which pre-analysis matcher answered. The pipeline runs the same four in the same order as
 * `src`'s scan, so the reason it denied with names the matcher, and the secret guard is the
 * only one of them that reports a rule id of its own.
 */
function preAnalysisMatcher(decision: CommandDenial) {
  if (decision.reason === REASON_POLICY_CONFIG_PROTECTION)
    return {
      ruleId: 'policy-protection',
      rule: 'policy-protection:findPolicyConfigMutationTargetInSemanticFacts',
    };
  if (decision.reason === REASON_POLICY_APPLY_PROTECTION)
    return {
      ruleId: 'policy-apply-protection',
      rule: 'policy-apply-protection:findPolicyApplyInvocationInSemanticFacts',
    };
  if (decision.reason === REASON_GIT_METADATA_PROTECTION)
    return {
      ruleId: 'git-metadata-protection',
      rule: 'git-metadata-protection:findGitMetadataMutationTargetInSemanticFacts',
    };
  return {
    ruleId: decision.ruleId,
    rule: 'secret-protection:findSensitiveTargetInSemanticFacts',
  };
}

interface GetConfigSourceOptions {
  cwd: string;
  /** Override user rules config directory for testing */
  userConfigDir?: string;
  /** Override user rules config path for testing */
  userConfigPath?: string;
}

/**
 * Get the config source path and validity status.
 * Checks project config first, falls back to user config.
 *
 * @internal
 */
export function getConfigSource(
  environment: Environment,
  options: GetConfigSourceOptions,
): {
  configSource: string | null;
  configValid: boolean;
} {
  const projectPath = getProjectRulesConfigPath(options.cwd);
  const userPath = options.userConfigPath ?? getUserRulesConfigPath(environment, options);
  const paths = getPolicyPaths(environment, {
    cwd: options.cwd,
    userConfigDir: options.userConfigDir,
    userConfigPath: options.userConfigPath,
  });

  try {
    if (readPolicyFile(paths.projectConfigTarget) !== null) {
      const validation = validateRulesConfigFile(paths.projectConfigTarget);
      if (validation.errors.length === 0) {
        return { configSource: projectPath, configValid: true };
      }
      return { configSource: projectPath, configValid: false };
    }
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { configSource: projectPath, configValid: false };
    }
    throw error;
  }

  try {
    if (readPolicyFile(paths.userConfigTarget) !== null) {
      const validation = validateRulesConfigFile(paths.userConfigTarget);
      return { configSource: userPath, configValid: validation.errors.length === 0 };
    }

    return { configSource: null, configValid: true };
  } catch (error) {
    if (error instanceof PolicyFilesystemError) {
      return { configSource: userPath, configValid: false };
    }
    throw error;
  }
}

/**
 * The rule a mode-gated activation would have matched: the same evaluation with every
 * activation-gated rule forced on and the strict modes raised. `src` ran the analyzer alone
 * here, so the mode-dependent secret guard is switched off rather than allowed to pre-empt the
 * destructive candidate; the three mode-independent protections already passed above.
 */
function identifyModeGatedCandidate(
  invocation: ToolInvocation,
  snapshot: PolicySnapshot,
  modes: ReturnType<typeof getCCSafetyNetEnvModes>,
  environment: Environment,
) {
  const policy = snapshot.policy;
  const candidateSnapshot = createPolicySnapshot(
    {
      ...policy,
      destructiveCommandProtectionEnabled: true,
      destructiveCommandRuleOverrides: {
        ...policy.destructiveCommandRuleOverrides,
        ...Object.fromEntries(
          DESTRUCTIVE_COMMAND_RULE_METADATA.flatMap((rule) =>
            rule.activationCapability ? [[rule.id, 'on'] as const] : [],
          ),
        ),
      },
    },
    snapshot.state === 'degraded'
      ? { diagnostics: snapshot.diagnostics, reason: snapshot.reason }
      : undefined,
  );
  const evaluation = evaluateGuard(invocation, {
    environment,
    dependencies: {
      loadPolicySnapshot: () => candidateSnapshot,
      getModes: () => ({ ...modes, strict: true, paranoidRm: true, paranoidInterpreters: true }),
      findSensitiveTarget: () => null,
    },
  });
  return evaluation.decision.kind === 'deny' ? evaluation.decision.ruleId : undefined;
}

function sanitizeCustomRule(rule: ExplainResult['customRule']): ExplainResult['customRule'] {
  if (!rule) return undefined;
  return {
    id: sanitizeDiagnosticText(rule.id),
    ...(rule.rulebook
      ? {
          rulebook: {
            name: sanitizeDiagnosticText(rule.rulebook.name),
            version: sanitizeDiagnosticText(rule.rulebook.version),
          },
        }
      : {}),
    ...(rule.source ? { source: sanitizeDiagnosticText(rule.source) } : {}),
    ...(rule.override
      ? {
          override: {
            type: 'reason' as const,
            reason: sanitizeDiagnosticText(rule.override.reason),
          },
        }
      : {}),
  };
}

function projectExplainTrace(trace: CommandTrace): ExplainTrace {
  const steps = trace.events.flatMap((event) =>
    event.kind === 'step' && event.scope === 'global' ? [event.step] : [],
  );
  const segments = new Map<number, ExplainTrace['segments'][number]>();
  for (const event of trace.events) {
    if (event.kind !== 'step' || event.scope !== 'segment') continue;
    const segment = segments.get(event.segmentIndex) ?? { index: event.segmentIndex, steps: [] };
    segment.steps.push(event.step);
    segments.set(event.segmentIndex, segment);
  }
  return { steps, segments: [...segments.values()] };
}

function getCustomRule(
  ruleId: string | undefined,
  snapshot: PolicySnapshot,
): ExplainResult['customRule'] {
  const id = ruleId?.replace(/^custom\./, '');
  if (!id || !snapshot.policy.rules.some((rule) => rule.name === id)) return undefined;
  return snapshot.ruleMetadata[id] ?? Object.freeze({ id });
}
