import { AnalysisLimit, type Budget, LIMITS } from '@/core/budget';
import type { DestructiveCommandRulePolicy } from '@/core/policy/effective-rules';
import type { EffectivePolicy } from '@/core/policy/types';
import { getBasename } from '@/core/shell/tokens';
import type { EnvironmentContext, ProtectedGitMetadata } from '@/gate/analysis';
import { isStandardCommandWrapper, unwrapTransparentWrapper } from './transparent-wrappers';
import { reconstructEnvSplitWords, stripWrappersWithInfo } from './wrapper-prelude';

export interface ChildCommandContext {
  /** Process state nested analysis reads instead of touching env, home or the filesystem. */
  environment: EnvironmentContext;
  cwd: string | undefined;
  envAssignments?: ReadonlyMap<string, string>;
  policy?: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'> & DestructiveCommandRulePolicy;
}

export interface NestedCommandAnalyzeContext extends ChildCommandContext {
  budget: Budget;
  originalCwd: string | undefined;
  strict?: boolean;
  paranoidRm: boolean | undefined;
  paranoidInterpreters?: boolean;
  allowTmpdirVar: boolean;
  worktreeMode?: boolean;
  scanWork?: { units: number };
  protectedGitMetadata: ProtectedGitMetadata | null;
}

export interface NormalizedChildCommand {
  tokens: string[];
  cwd: string | undefined;
  wrapperCwd: string | null | undefined;
  wrapperEnvAssignments: ReadonlyMap<string, string>;
  envAssignments: ReadonlyMap<string, string>;
  head: string;
  wrappedByTransparent: boolean;
}

/** @internal */
export function normalizeChildCommand(
  tokens: readonly string[],
  context: ChildCommandContext,
): NormalizedChildCommand {
  const childCommand = normalizeChildCommands(tokens, context).next().value;
  if (!childCommand) throw new AnalysisLimit('derivedCommandShape');
  return childCommand;
}

export function normalizeChildCommands(
  tokens: readonly string[],
  context: ChildCommandContext,
): Generator<NormalizedChildCommand> {
  const policy = context.policy ?? { rules: [], transparentWrappers: [] };
  return normalizeChildCommandCandidates(
    [...tokens],
    context.environment,
    context.cwd,
    context.cwd,
    new Map(),
    new Map(context.envAssignments ?? []),
    policy,
    { iterations: 0 },
    false,
  );
}

function* normalizeChildCommandCandidates(
  tokens: string[],
  environment: EnvironmentContext,
  wrapperCwd: string | null | undefined,
  cwd: string | undefined,
  wrapperEnvAssignments: Map<string, string>,
  envAssignments: Map<string, string>,
  policy: Pick<EffectivePolicy, 'rules' | 'transparentWrappers'>,
  budget: { iterations: number },
  wrappedByTransparent: boolean,
): Generator<NormalizedChildCommand> {
  const wrapperInfo = stripWrappersWithInfo(tokens, environment, wrapperCwd, envAssignments);
  for (const [key, value] of wrapperInfo.envAssignments) {
    envAssignments.set(key, value);
    wrapperEnvAssignments.set(key, value);
  }
  const childTokens = wrapperInfo.tokens;
  const childWrapperCwd = wrapperInfo.cwd;

  if (wrapperInfo.envSplitValues) {
    // `env -S` execs its whitespace-split argv without a shell, so inert values splice ahead of
    // the retained operands and normalize as the real child command. Values needing the
    // quote/expansion/comment language still have no channel for a match and fail closed.
    const spliced = reconstructEnvSplitWords(wrapperInfo.envSplitValues, childTokens);
    if (!spliced) throw new AnalysisLimit('derivedCommandShape');
    reserveChildNormalization(budget);
    yield* normalizeChildCommandCandidates(
      spliced,
      environment,
      childWrapperCwd,
      cwd,
      wrapperEnvAssignments,
      envAssignments,
      policy,
      budget,
      wrappedByTransparent,
    );
    return;
  }

  if (isStandardCommandWrapper(childTokens[0] ?? '')) {
    throw new AnalysisLimit('wrapperPeelIterations');
  }

  const transparentWrapper = unwrapTransparentWrapper(childTokens, policy);
  if (transparentWrapper) {
    for (const childIndex of [
      transparentWrapper.childIndex,
      ...transparentWrapper.alternativeChildIndices,
    ]) {
      reserveChildNormalization(budget);
      yield* normalizeChildCommandCandidates(
        childIndex === transparentWrapper.childIndex
          ? transparentWrapper.tokens
          : [...childTokens.slice(childIndex)],
        environment,
        childWrapperCwd,
        cwd,
        new Map(wrapperEnvAssignments),
        new Map(envAssignments),
        policy,
        budget,
        true,
      );
    }
    return;
  }

  if (isBusyboxWrapper(childTokens)) {
    reserveChildNormalization(budget);
    yield* normalizeChildCommandCandidates(
      [...childTokens.slice(1)],
      environment,
      childWrapperCwd,
      cwd,
      wrapperEnvAssignments,
      envAssignments,
      policy,
      budget,
      wrappedByTransparent,
    );
    return;
  }

  yield normalizedChildCommand(
    childTokens,
    childWrapperCwd,
    cwd,
    wrapperEnvAssignments,
    envAssignments,
    wrappedByTransparent,
  );
}

function normalizedChildCommand(
  tokens: string[],
  wrapperCwd: string | null | undefined,
  cwd: string | undefined,
  wrapperEnvAssignments: Map<string, string>,
  envAssignments: Map<string, string>,
  wrappedByTransparent: boolean,
): NormalizedChildCommand {
  return {
    tokens,
    cwd: wrapperCwd === null ? undefined : (wrapperCwd ?? cwd),
    wrapperCwd,
    wrapperEnvAssignments,
    envAssignments,
    head: getBasename(tokens[0] ?? '').toLowerCase(),
    wrappedByTransparent,
  };
}

function reserveChildNormalization(budget: { iterations: number }): void {
  if (budget.iterations >= LIMITS.wrapperPeelIterations.cap) {
    throw new AnalysisLimit('wrapperPeelIterations');
  }
  budget.iterations++;
}

function isBusyboxWrapper(tokens: readonly string[]): boolean {
  return getBasename(tokens[0] ?? '').toLowerCase() === 'busybox' && tokens.length > 1;
}

export function collectCommandTemplate(tokens: readonly string[], start: number) {
  const templateTokens: string[] = [];
  let i = start;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined || token === ':::') break;
    templateTokens.push(token);
    i++;
  }

  return {
    markerIndex: i < tokens.length && tokens[i] === ':::' ? i : -1,
    templateTokens,
  };
}
