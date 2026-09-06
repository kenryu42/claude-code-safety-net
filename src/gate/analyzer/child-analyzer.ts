import type { Budget } from '@/core/budget';
import { hasUnsafeTmpdirWordSplitting, isTmpdirValueTrusted } from '@/core/paths/tmpdir';
import {
  type DestructiveCommandRulePolicy,
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/policy/effective-rules';
import { isInterpreterCommand } from '@/core/policy/transparent-wrappers';
import type { EffectivePolicy } from '@/core/policy/types';
import { AWK_INTERPRETERS, SHELL_WRAPPERS } from '@/core/rules/constants';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import { hasUnclosedQuotes, normalizeCommandToken } from '@/core/shell/tokens';
import type {
  AnalyzeNestedOverrides,
  EnvironmentContext,
  ProtectedGitMetadata,
} from '@/gate/analysis';
import { analyzeAwkSystemCallMatch } from './awk';
import { textCommandWords } from './command-words';
import { analyzeFindMatch } from './find';
import { analyzeGitMatch } from './git';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  isInterpreterDisplayOnly,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from './interpreters';
import { REASON_STRICT_UNPARSEABLE } from './reasons';
import { analyzeRmMatch } from './rm';
import { hasRecursiveForceFlags } from './rm-flags';
import {
  extractEvalSource,
  extractShellScriptOperandSource,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from './shell-execution';
import { extractDashCArg, isShellSyntaxCheck } from './shell-wrappers';

export interface ChildCommandAnalysisContext {
  /** Process state nested analysis reads instead of touching env, home or the filesystem. */
  environment: EnvironmentContext;
  cwd: string | undefined;
  budget?: Budget;
  originalCwd: string | undefined;
  strict?: boolean;
  paranoidRm: boolean | undefined;
  paranoidInterpreters?: boolean;
  allowTmpdirVar: boolean;
  envAssignments: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
  scanWork?: { units: number };
  protectedGitMetadata: ProtectedGitMetadata | null;
  policy?: DestructiveCommandRulePolicy & Partial<Pick<EffectivePolicy, 'rules'>>;
  analyzeNested?: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export interface ChildCommandAnalysisOptions {
  dynamicInput?: boolean;
  dynamicRmInput?: boolean;
  dynamicSourceInput?: boolean;
  shellDynamicMatch?: DestructiveCommandRuleMatch;
  dynamicSourceMatch?: DestructiveCommandRuleMatch;
  rmDynamicMatch?: DestructiveCommandRuleMatch;
}

export function analyzeChildCommandMatch(
  tokens: readonly string[],
  context: ChildCommandAnalysisContext,
  options: ChildCommandAnalysisOptions = {},
): DestructiveCommandRuleMatch | null {
  if (tokens.length === 0) {
    return null;
  }

  const head = tokens[0];
  if (!head) {
    return null;
  }

  const normalizedHead = normalizeCommandToken(head);

  if (normalizedHead === 'eval') {
    const source = extractEvalSource(textCommandWords(tokens));
    if (source.kind === 'dynamic') return getShellDynamicReason(options, context);
    if (source.kind === 'literal' && context.analyzeNested) {
      const result = context.analyzeNested(source.source, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments,
      });
      if (result) return result;
    }
    return getDynamicSourceReason(options, context);
  }

  if (SHELL_WRAPPERS.has(normalizedHead)) {
    if (isShellSyntaxCheck(tokens)) return null;
    const dashCArg = extractDashCArg(tokens);
    if (dashCArg) {
      if (options.dynamicSourceInput ?? options.dynamicInput) {
        const result = getShellDynamicReason(options, context);
        if (result) return result;
      }
      if (shellSourceHasUnresolvedDynamicExecutionCarrier(dashCArg)) {
        const result = getShellDynamicReason(options, context);
        if (result) return result;
      }
      if (!context.analyzeNested) return null;
      const result = context.analyzeNested(dashCArg, {
        effectiveCwd: context.cwd,
        envAssignments: context.envAssignments,
      });
      if (result) return result;
      return null;
    }

    const scriptSource = extractShellScriptOperandSource(textCommandWords(tokens));
    if (scriptSource.kind === 'dynamic') return getShellDynamicReason(options, context);
    if (scriptSource.kind === 'literal') {
      if (options.dynamicSourceInput) return getShellDynamicReason(options, context);
      return null;
    }
    if (options.dynamicSourceInput ?? options.dynamicInput) {
      return getShellDynamicReason(options, context);
    }
    return null;
  }

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    return (
      filterDestructiveCommandMatch(
        analyzeAwkSystemCallMatch(tokens, (command) =>
          context.analyzeNested
            ? context.analyzeNested(command, {
                effectiveCwd: context.cwd,
                envAssignments: context.envAssignments,
              })
            : null,
        ),
        context.policy,
      ) ??
      checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
      getDynamicSourceReason(options, context)
    );
  }

  if (isInterpreterCommand(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(tokens);
    if (!codeArg) {
      return getDynamicSourceReason(options, context);
    }

    if (
      destructiveCommandRuleIsEnabled(
        context.policy,
        'interpreter.one-liner-paranoid',
        !!context.paranoidInterpreters,
      )
    ) {
      const paranoidMatch = filterDestructiveCommandMatch(
        destructiveCommandMatch('interpreter.one-liner-paranoid', REASON_INTERPRETER_BLOCKED),
        context.policy,
      );
      if (paranoidMatch) return paranoidMatch;
    }

    if (isInterpreterDisplayOnly(normalizedHead, codeArg)) {
      return getDynamicSourceReason(options, context);
    }

    const nestedResult = context.analyzeNested?.(codeArg, {
      effectiveCwd: context.cwd,
      envAssignments: context.envAssignments,
    });
    if (
      nestedResult &&
      nestedResult.id !== 'raw-text.dangerous-command' &&
      (nestedResult.reason !== REASON_STRICT_UNPARSEABLE || hasUnclosedQuotes(codeArg))
    ) {
      return nestedResult;
    }

    if (containsDangerousCode(codeArg, context.scanWork)) {
      return (
        filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.dangerous-command', REASON_INTERPRETER_DANGEROUS),
          context.policy,
        ) ?? getDynamicSourceReason(options, context)
      );
    }
    return getDynamicSourceReason(options, context);
  }

  if (normalizedHead === 'rm' || normalizedHead === 'rmdir') {
    const dynamicRmPolicyApplies =
      normalizedHead === 'rm' && (hasRecursiveForceFlags(tokens) || options.dynamicRmInput);
    const rmMatch = filterDestructiveCommandMatch(
      analyzeRmMatch(textCommandWords(tokens), {
        environment: context.environment,
        cwd: context.cwd,
        budget: context.budget,
        originalCwd: context.originalCwd,
        strict: context.strict,
        paranoid: context.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(
          context.envAssignments,
          context.environment,
        ),
        trustedTmpdirValue: isTmpdirValueTrusted(context.envAssignments, context.environment),
        protectedGitMetadata: context.protectedGitMetadata,
        policy: context.policy,
      }),
      context.policy,
    );
    return (
      rmMatch ??
      (dynamicRmPolicyApplies && options.dynamicRmInput
        ? getDynamicSourceReason(options, context)
        : null) ??
      (dynamicRmPolicyApplies ? getDynamicRmReason(options, context) : null)
    );
  }

  if (normalizedHead === 'find') {
    return (
      analyzeFindMatch(textCommandWords(tokens), {
        ...context,
        analyzeTokens: (nestedTokens, cwd) =>
          analyzeChildCommandMatch(nestedTokens, { ...context, cwd: cwd ?? undefined }, options),
      }) ??
      checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
      getDynamicSourceReason(options, context)
    );
  }

  if (normalizedHead === 'git') {
    return (
      filterDestructiveCommandMatch(
        analyzeGitMatch(textCommandWords(tokens), {
          environment: context.environment,
          cwd: context.cwd,
          envAssignments: context.envAssignments,
          policy: context.policy,
          worktreeMode: options.dynamicInput ? false : context.worktreeMode,
        }),
        context.policy,
      ) ??
      checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
      getDynamicSourceReason(options, context)
    );
  }

  return (
    checkPolicyRuleMatch(tokens, context.policy?.rules ?? []) ??
    getDynamicSourceReason(options, context)
  );
}

function getShellDynamicReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return options.shellDynamicMatch
    ? filterDestructiveCommandMatch(options.shellDynamicMatch, context.policy)
    : null;
}

function getDynamicSourceReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return options.dynamicSourceInput && options.dynamicSourceMatch
    ? filterDestructiveCommandMatch(options.dynamicSourceMatch, context.policy)
    : null;
}

function getDynamicRmReason(
  options: ChildCommandAnalysisOptions,
  context: ChildCommandAnalysisContext,
): DestructiveCommandRuleMatch | null {
  return options.dynamicInput && options.rmDynamicMatch
    ? filterDestructiveCommandMatch(options.rmDynamicMatch, context.policy)
    : null;
}
