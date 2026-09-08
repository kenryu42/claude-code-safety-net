import type { Budget } from '@/core/budget';
import { hasUnsafeTmpdirWordSplitting, isTmpdirValueTrusted } from '@/core/paths/tmpdir';
import type { CommandAnalysisPolicy } from '@/core/policy/types';
import type { CommandProgram, CommandView, CommandWord } from '@/core/shell/model';
import type {
  AnalyzeInput,
  AnalyzeNestedOverrides,
  AnalyzeResult,
  DestructiveCommandRuleMatch,
} from '@/gate/analysis';
import type { NestedCommandAnalyzeContext } from './child-command';
import { analyzeFindMatch } from './find';
import { analyzeGitMatch } from './git';
import { analyzeParallel } from './parallel';
import { analyzeRmMatch } from './rm';
import { analyzeXargs } from './xargs';

export type InternalOptions = AnalyzeInput & {
  policy: CommandAnalysisPolicy;
  effectiveCwd: string | null | undefined;
  analyzeNested: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => Omit<AnalyzeResult, 'segment'> | null;
  commandView?: CommandView;
  budget: Budget;
  scanWork?: { units: number };
  hasPipelineInput?: boolean;
  literalShellInput?: string;
  literalHeredocFiles?: ReadonlyMap<string, string>;
  functionDefinitions?: ReadonlyMap<string, CommandProgram>;
  wrapperNormalizationBudget?: { iterations: number };
};

export type AnalyzerRuleContext = {
  /**
   * Words of this command after env assignments and wrappers are removed. They are the
   * parsed words when the parsed command still lines up with what is analyzed, and
   * text-only stand-ins otherwise (derived commands, `env -S` splits).
   */
  readonly words: readonly CommandWord[];
  readonly head: string;
  readonly cwd: string | undefined;
  readonly originalCwd: string | undefined;
  readonly effectiveCwd: string | null | undefined;
  readonly envAssignments: ReadonlyMap<string, string>;
  readonly allowTmpdirVar: boolean;
  /** Whether any word of this command is substitution output, so its text is unknown. */
  readonly dynamicArguments: boolean;
  readonly depth: number;
  readonly options: InternalOptions;
  /**
   * Analyzes a command this one derives from its own arguments (a find -exec child) with
   * the parent's budget, policy and env. Only analyzeSegment can do that, and rules cannot
   * call it directly without an import cycle.
   */
  readonly analyzeChildTokens: (
    tokens: readonly string[],
    cwd: string | null | undefined,
  ) => DestructiveCommandRuleMatch | null;
};

type AnalyzerRule = {
  readonly heads: ReadonlySet<string>;
  readonly analyze: (context: AnalyzerRuleContext) => DestructiveCommandRuleMatch | null;
};

export const ANALYZER_RULES: readonly AnalyzerRule[] = [
  {
    heads: new Set(['rm', 'rmdir']),
    analyze: (context) =>
      analyzeRmMatch(context.words, {
        environment: context.options.environment,
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        strict: context.options.strict,
        paranoid: context.options.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(
          context.envAssignments,
          context.options.environment,
        ),
        trustedTmpdirValue: isTmpdirValueTrusted(
          context.envAssignments,
          context.options.environment,
        ),
        protectedGitMetadata: context.options.protectedGitMetadata,
        policy: context.options.policy,
        budget: context.options.budget,
      }),
  },
  {
    heads: new Set(['git']),
    analyze: (context) => analyzeGitMatch(context.words, gitAnalyzeOptions(context)),
  },
  {
    heads: new Set(['find']),
    analyze: (context) =>
      analyzeFindMatch(context.words, {
        environment: context.options.environment,
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        strict: context.options.strict,
        allowTmpdirVar: context.allowTmpdirVar,
        tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(
          context.envAssignments,
          context.options.environment,
        ),
        trustedTmpdirValue: isTmpdirValueTrusted(
          context.envAssignments,
          context.options.environment,
        ),
        protectedGitMetadata: context.options.protectedGitMetadata,
        budget: context.options.budget,
        envAssignments: context.envAssignments,
        policy: context.options.policy,
        analyzeTokens: context.analyzeChildTokens,
        analyzeNested: (command, overrides) =>
          matchFromBlockResult(context.options.analyzeNested(command, overrides)),
      }),
  },
  {
    heads: new Set(['xargs']),
    analyze: (context) =>
      analyzeXargs(context.words, {
        ...nestedCommandAnalyzeContext(context),
        analyzeNested: (command, overrides) =>
          matchFromBlockResult(context.options.analyzeNested(command, overrides)),
      }),
  },
  {
    heads: new Set(['parallel']),
    analyze: (context) =>
      analyzeParallel(context.words, {
        ...nestedCommandAnalyzeContext(context),
        analyzeNested: (command, overrides) =>
          matchFromBlockResult(context.options.analyzeNested(command, overrides)),
      }),
  },
];

function nestedCommandAnalyzeContext(context: AnalyzerRuleContext): NestedCommandAnalyzeContext {
  return {
    environment: context.options.environment,
    cwd: context.cwd,
    originalCwd: context.originalCwd,
    strict: context.options.strict,
    paranoidRm: context.options.paranoidRm,
    paranoidInterpreters: context.options.paranoidInterpreters,
    allowTmpdirVar: context.allowTmpdirVar,
    protectedGitMetadata: context.options.protectedGitMetadata,
    budget: context.options.budget,
    envAssignments: context.envAssignments,
    worktreeMode: context.options.worktreeMode,
    policy: context.options.policy,
    scanWork: context.options.scanWork,
  };
}

/** Reads a nested analysis result back as the match shape the rules return. */
export function matchFromBlockResult(
  result: Omit<AnalyzeResult, 'segment'> | null,
): DestructiveCommandRuleMatch | null {
  return result
    ? { id: result.ruleId ?? '', reason: result.reason, intent: result.intent ?? 'manual_only' }
    : null;
}

/** Shared with the trace path, which calls analyzeGitDetailed for the worktree relaxation. */
export function gitAnalyzeOptions(context: AnalyzerRuleContext) {
  return {
    environment: context.options.environment,
    cwd: context.cwd,
    dynamicArguments: context.dynamicArguments,
    envAssignments: context.envAssignments,
    policy: context.options.policy,
    worktreeMode: context.options.worktreeMode,
  };
}
