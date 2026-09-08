import { isAbsolute } from 'node:path';
import { type Budget, LIMITS } from '@/core/budget';
import { resolveChdirTarget } from '@/core/paths/chdir';
import { hasUnsafeTmpdirWordSplitting, isTmpdirValueTrusted } from '@/core/paths/tmpdir';
import { filterDestructiveCommandMatch } from '@/core/policy/effective-rules';
import { isInterpreterCommand } from '@/core/policy/transparent-wrappers';
import { AWK_INTERPRETERS, SHELL_WRAPPERS } from '@/core/rules/constants';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { type DestructiveCommandRuleId, destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch, PolicyRule } from '@/core/rules/types';
import type { CommandWord } from '@/core/shell/model';
import { normalizeCommandToken } from '@/core/shell/tokens';
import { parseSimpleWords } from '@/core/shell/traversal';
import type { AnalyzeNestedOverrides, PathResolver } from '@/gate/analysis';
import { extractAwkExecutableSources } from './awk';
import { analyzeChildCommandMatch } from './child-analyzer';
import {
  collectCommandTemplate,
  type NestedCommandAnalyzeContext,
  type NormalizedChildCommand,
  normalizeChildCommands,
} from './child-command';
import { analysisWordText, textCommandWords } from './command-words';
import { dangerousInTextMatch } from './dangerous-text';
import { getFindPrimaryArity, isFindExecPrimary } from './find';
import { extractGitSubcommandAndRest } from './git/parse';
import { GIT_RULE_SUBCOMMANDS } from './git/rules';
import { extractInterpreterExecutableSources } from './interpreters';
import { type ParallelAnalysisReservation, reserveParallelAnalysis } from './parallel-budget';
import { analyzeRmMatch } from './rm';
import { hasRecursiveForceFlags } from './rm-flags';
import {
  extractPositionalShellSource,
  extractShellScriptOperandSource,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from './shell-execution';
import { extractDashCArg, isShellSyntaxCheck } from './shell-wrappers';
import { extractXargsChildCommandWithInfo } from './xargs';

export const REASON_PARALLEL_RM =
  'parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.';
export const REASON_PARALLEL_SHELL =
  'parallel with shell -c can execute arbitrary commands from dynamic input. Run the inner command directly on an explicit file list instead.';
const REASON_PARALLEL_COMMAND_STREAM =
  'parallel without a command reads executable commands from dynamic input. Use an explicit command template or ::: arguments instead.';
const REASON_PARALLEL_UNSUPPORTED =
  'parallel command construction cannot be verified safely. Use the default ::: separator, literal arguments, and built-in replacement strings.';
const PARALLEL_PLACEHOLDER_RE = /\{[^{}\s]*\}/;
const PARALLEL_RM_PLACEHOLDER_RE = /\{\}|\{-?\d+\}/g;
const AWK_SOURCE_OPTION_INPUTS = ['e', 'f', 'source', 'file', '-e', '-f', '--source', '--file'];
const INTERPRETER_SOURCE_OPTION_INPUTS = [
  'c',
  'e',
  'eval',
  'm',
  'r',
  'Mmodule',
  'import',
  'require',
  '-c',
  '-e',
  '-m',
  '-r',
  '--eval',
  '--import',
  '--require',
];
const PARALLEL_OPTIONS_WITH_VALUE = new Set([
  '-L',
  '-d',
  '-n',
  '--delay',
  '--delimiter',
  '--header',
  '--joblog',
  '--jl',
  '--max-args',
  '--max-lines',
  '--nice',
  '--results',
  '--result',
  '--res',
  '--tagstring',
  '--timeout',
]);
const PARALLEL_UNSUPPORTED_INPUT_OPTIONS = new Set([
  '--arg-file',
  '--colsep',
  '--rpl',
  '--arg-sep',
  '--arg-file-sep',
]);
const PARALLEL_REMOTE_OPTIONS = new Set(['-S', '--sshlogin', '--slf', '--sshloginfile']);
const PARALLEL_WORKDIR_OPTIONS = new Set(['--workdir', '--wd']);
const PARALLEL_APPENDED_SOURCE = '__CC_SAFETY_NET_PARALLEL_SOURCE__';
const UTF8_ENCODER = new TextEncoder();
// Each replacement has two fragment boundaries, each overcounted by two bytes when it forms a pair.
const MAX_EXPANDED_BYTE_OVERCOUNT =
  LIMITS.parallelDerivedBytes.cap + 4 * LIMITS.parallelPlaceholderReplacements.cap;

export interface ParallelAnalyzeContext extends NestedCommandAnalyzeContext {
  analyzeNested: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

function firstMatch<T>(
  values: Iterable<T>,
  analyze: (value: T) => DestructiveCommandRuleMatch | null,
): DestructiveCommandRuleMatch | null {
  for (const value of values) {
    const result = analyze(value);
    if (result) return result;
  }
  return null;
}

// The coarse dynamic-parallel rules are policy-filterable, but recognizable destructive text in an
// env value feeding the jobs must stay denied in every configuration, so this scan is never passed
// through filterDestructiveCommandMatch. Placeholder-free values are scanned too: the job shell
// expands them just the same, so narrowing the scan would let a literal payload reach the jobs.
function dangerousParallelEnvValue(
  values: Iterable<string>,
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return firstMatch([...values], (value) => dangerousInTextMatch(value, context.scanWork));
}

export function analyzeParallel(
  words: readonly CommandWord[],
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  // parallel options, replacement strings and the command template all match on text only.
  const tokens = words.map(analysisWordText);
  const ambientOptions = context.envAssignments?.has('PARALLEL')
    ? context.envAssignments.get('PARALLEL')
    : context.environment.env.get('PARALLEL');
  if (ambientOptions?.trim()) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }

  if (tokens.length === 2 && (tokens[1] === '--version' || tokens[1] === '--help')) {
    return null;
  }

  const parseResult = parseParallelCommand(tokens);
  const { template, jobs, runsRemotely, readsCommandsFromInput, unsupported, workdir, dryRun } =
    parseResult;

  if (unsupported) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
    const dangerousEnvValue = dangerousParallelEnvValue(
      context.envAssignments?.values() ?? [],
      context,
    );
    if (dangerousEnvValue) return dangerousEnvValue;
  }

  if (readsCommandsFromInput) {
    const reason = parallelCommandStreamDynamicReason(context);
    if (reason) return reason;
  }

  if (workdir !== undefined && runsRemotely) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }
  const workdirCwd = resolveParallelWorkdir(workdir, context.cwd, context.environment.paths);
  if (workdirCwd === null) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }
  const executionContext = runsRemotely
    ? { ...context, cwd: undefined, originalCwd: undefined }
    : workdirCwd === null || workdirCwd === undefined || workdirCwd === context.cwd
      ? context
      : { ...context, cwd: workdirCwd };

  if (dryRun) {
    const envValues = [...normalizeChildCommands(template, executionContext)].flatMap(
      (childCommand) => [...childCommand.envAssignments.values()],
    );
    if (envValues.some(hasExecutableParallelPlaceholder)) {
      const reason = parallelUnsupportedReason(context);
      if (reason) return reason;
    }
    return null;
  }

  if (template.length === 0) {
    if (jobs.some((job) => job.length !== 1)) {
      const reason = parallelUnsupportedReason(context);
      if (reason) return reason;
    }
    // parallel ::: 'cmd1' 'cmd2' - commands mode
    // Analyze each arg as a command
    const commands = jobs.map((job) => job[0] ?? '');
    reserveParallelAnalysis(context.budget, commandsModeWork(commands));
    const nestedOverrides = buildNestedOverrides(
      executionContext.envAssignments,
      executionContext.cwd,
      runsRemotely,
    );
    return firstMatch(commands, (command) => context.analyzeNested(command, nestedOverrides));
  }

  return firstMatch(normalizeChildCommands(template, executionContext), (childCommand) =>
    analyzeParallelChildCommand(childCommand, parseResult, context, executionContext),
  );
}

function analyzeParallelChildCommand(
  childCommand: NormalizedChildCommand,
  parseResult: ParallelParseResult,
  context: ParallelAnalyzeContext,
  executionContext: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  const { jobs, templateHasPlaceholder, runsRemotely, usesStdin } = parseResult;
  const childTokens = childCommand.tokens;
  const childContext = {
    ...executionContext,
    cwd: childCommand.cwd,
    envAssignments: childCommand.envAssignments,
  };
  const childEnvValues = [...childCommand.envAssignments.values()];
  if (childEnvValues.some(hasUnsupportedParallelPlaceholder)) {
    const reason = parallelUnsupportedReason(context);
    if (reason) return reason;
  }
  const dangerousChildEnvValue = dangerousParallelEnvValue(childEnvValues, context);
  if (dangerousChildEnvValue) return dangerousChildEnvValue;
  const envHasPlaceholder = childEnvValues.some(hasParallelPlaceholder);
  const hasPlaceholder = templateHasPlaceholder || envHasPlaceholder;
  const hasDynamicStdinPlaceholder = usesStdin && hasPlaceholder;
  const nestedOverrides = buildNestedOverrides(
    childCommand.envAssignments,
    childCommand.wrapperCwd,
    runsRemotely || hasDynamicStdinPlaceholder,
  );

  // Check for shell wrapper with -c
  if (SHELL_WRAPPERS.has(childCommand.head)) {
    const analyzeExpandedShellArgv = () => {
      if (!templateHasPlaceholder || jobs.length === 0) return null;
      reserveParallelAnalysis(context.budget, expandedTokenJobWork(childTokens, jobs, 'generic'));
      return firstMatch(jobs, (job) =>
        analyzeChildCommandMatch(
          childTokens.map((token) => replaceParallelJobPlaceholder(token, job)),
          childContext,
        ),
      );
    };
    if (isShellSyntaxCheck(childTokens)) return analyzeExpandedShellArgv();
    const dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      // If script IS just the placeholder, stdin provides entire script - dangerous
      if (isOnlyParallelPlaceholder(dashCArg)) {
        const reason = parallelShellDynamicReason(context);
        if (reason) return reason;
        if (jobs.length === 0) return null;
        reserveParallelAnalysis(context.budget, expandedStringJobWork(dashCArg, jobs));
        return firstMatch(jobs, (job) =>
          context.analyzeNested(replaceParallelJobPlaceholder(dashCArg, job), nestedOverrides),
        );
      }
      // If script contains placeholder
      if (hasParallelPlaceholder(dashCArg)) {
        if (jobs.length > 0) {
          // Expand with actual args and analyze
          reserveParallelAnalysis(context.budget, expandedStringJobWork(dashCArg, jobs));
          return firstMatch(jobs, (job) =>
            context.analyzeNested(replaceParallelJobPlaceholder(dashCArg, job), nestedOverrides),
          );
        }
        // Stdin mode with placeholder - analyze the script template
        // Check if the script pattern is dangerous (e.g., rm -rf {})
        reserveParallelAnalysis(context.budget, staticStringWork(dashCArg));
        const scriptTokens = parseSimpleWords(dashCArg);
        if (
          scriptTokens?.[0] &&
          normalizeCommandToken(scriptTokens[0]) === 'rm' &&
          hasRecursiveForceFlags(scriptTokens)
        ) {
          const reason = parallelRmDynamicReason(context);
          if (reason) {
            return reason;
          }
        }
        const dynamicReason = scriptTokens
          ? analyzeChildCommandMatch(scriptTokens, childContext, {
              dynamicInput: usesStdin,
              shellDynamicMatch: destructiveCommandMatch(
                'parallel.shell-dynamic',
                REASON_PARALLEL_SHELL,
              ),
              rmDynamicMatch: destructiveCommandMatch(
                'parallel.rm-recursive-force-dynamic',
                REASON_PARALLEL_RM,
              ),
            })
          : null;
        if (dynamicReason) {
          return dynamicReason;
        }
        return context.analyzeNested(dashCArg, nestedOverrides);
      }
      // Script doesn't have placeholder - analyze it directly
      const positionalSources =
        !envHasPlaceholder && (!templateHasPlaceholder || jobs.length > 0)
          ? (jobs.length > 0 ? jobs : [undefined]).map((job) =>
              extractPositionalShellSource(
                textCommandWords(
                  job === undefined
                    ? childTokens
                    : templateHasPlaceholder
                      ? childTokens.map((token) => replaceParallelJobPlaceholder(token, job))
                      : [...childTokens, ...job],
                ),
                dashCArg,
              ),
            )
          : [];
      if (positionalSources.some((source) => source.kind === 'dynamic')) {
        const reason = parallelShellDynamicReason(context);
        if (reason) return reason;
      }
      const literalPositionalSources = positionalSources.flatMap((source) =>
        source.kind === 'literal' ? [source.source] : [],
      );
      if (literalPositionalSources.length > 0) {
        reserveParallelAnalysis(context.budget, commandsModeWork(literalPositionalSources));
        return firstMatch(literalPositionalSources, (source) =>
          context.analyzeNested(source, nestedOverrides),
        );
      }
      reserveParallelAnalysis(context.budget, staticStringWork(dashCArg));
      if (shellSourceHasUnresolvedDynamicExecutionCarrier(dashCArg)) {
        const dynamicReason = parallelShellDynamicReason(context);
        if (dynamicReason) return dynamicReason;
      }
      const reason = context.analyzeNested(dashCArg, nestedOverrides);
      if (reason) {
        return reason;
      }
      // If there's a placeholder in the shell wrapper args (not script),
      // it's still dangerous
      if (hasPlaceholder) {
        return parallelShellDynamicReason(context);
      }
      return null;
    }

    const scriptSource = extractShellScriptOperandSource(textCommandWords(childTokens));
    if (
      scriptSource.kind === 'dynamic' ||
      (scriptSource.kind === 'literal' && hasParallelPlaceholder(scriptSource.source))
    ) {
      const reason = parallelShellDynamicReason(context);
      return reason ?? analyzeExpandedShellArgv();
    }
    if (scriptSource.kind === 'literal') return analyzeExpandedShellArgv();

    // bash -c without script argument
    // If there are args from :::, those become the scripts - dangerous pattern
    if (jobs.length > 0) {
      // The pattern of passing scripts via ::: to bash -c is inherently dangerous
      const reason = parallelShellDynamicReason(context);
      if (reason) return reason;
      const expandedArgvReason = analyzeExpandedShellArgv();
      if (expandedArgvReason) return expandedArgvReason;
      if (templateHasPlaceholder) return null;
      const sources = jobs.flatMap((job) => (job[0] === undefined ? [] : [job[0]]));
      reserveParallelAnalysis(context.budget, commandsModeWork(sources));
      return firstMatch(sources, (source) => context.analyzeNested(source, nestedOverrides));
    }
    // Stdin provides the script - dangerous
    if (hasPlaceholder || usesStdin) {
      const reason = parallelShellDynamicReason(context);
      return reason ?? analyzeExpandedShellArgv();
    }
    return null;
  }

  // For rm -rf, expand with actual args and analyze each expansion
  if (childCommand.head === 'rm' && hasRecursiveForceFlags(childTokens)) {
    if (templateHasPlaceholder && jobs.length > 0) {
      // Expand template with each arg and analyze
      reserveParallelAnalysis(context.budget, expandedTokenJobWork(childTokens, jobs, 'rm'));
      return firstMatch(jobs, (job) =>
        analyzeParallelRmExpansion(
          childTokens.map((token) => replaceParallelRmJobPlaceholder(token, job)),
          childCommand.cwd,
          executionContext,
        ),
      );
    }
    // No placeholder or no args - analyze template as-is
    // If there are args (from :::), they get appended, analyze each expansion
    if (jobs.length > 0) {
      reserveParallelAnalysis(context.budget, appendedTokenJobWork(childTokens, jobs));
      return firstMatch(jobs, (job) =>
        analyzeParallelRmExpansion([...childTokens, ...job], childCommand.cwd, executionContext),
      );
    }
    const staticResult = analyzeParallelRmExpansion(
      childTokens.flatMap((token, index) => {
        if (index === 0 || !hasParallelPlaceholder(token)) return [token];
        return token.startsWith('-') ? [replaceParallelRmJobPlaceholder(token, [''])] : [];
      }),
      childCommand.cwd,
      executionContext,
    );
    if (staticResult) return staticResult;
    return parallelRmDynamicReason(context);
  }

  reserveParallelAnalysis(
    context.budget,
    templateHasPlaceholder && jobs.length > 0
      ? expandedTokenJobWork(childTokens, jobs, 'generic')
      : jobs.length > 0
        ? appendedTokenJobWork(childTokens, jobs)
        : staticTokenWork(childTokens),
  );
  const childJobs: readonly (ParallelJob | undefined)[] = jobs.length > 0 ? jobs : [undefined];
  return firstMatch(childJobs, (job) => {
    const tokens =
      job === undefined
        ? childTokens
        : templateHasPlaceholder
          ? childTokens.map((token) => replaceParallelJobPlaceholder(token, job))
          : [...childTokens, ...job];
    const shellDynamicMatch = destructiveCommandMatch(
      'parallel.shell-dynamic',
      REASON_PARALLEL_SHELL,
    );
    const findDynamicInput =
      usesStdin && childCommand.head === 'find'
        ? analyzeDynamicParallelFind(tokens, executionContext)
        : null;
    const dynamicCustomResult =
      matchDynamicParallelPolicyRule(
        tokens,
        usesStdin,
        context.policy?.rules ?? [],
        context.budget,
      ) ??
      findDynamicInput?.customResult ??
      null;
    const normalizedHead = normalizeCommandToken(childCommand.head);
    const dynamicRmInput =
      usesStdin &&
      ((normalizedHead === 'rm' && parallelInputCanChangeRmOptions(tokens)) ||
        (normalizedHead === 'xargs' && nestedRmInputCanChangeOptions(tokens)) ||
        findDynamicInput?.rmOptions === true);
    const dynamicSourceInput =
      usesStdin &&
      (dynamicRmInput ||
        findDynamicInput?.executedSource === true ||
        (findDynamicInput === null &&
          parallelInputCanChangeExecutedSource(tokens, normalizedHead)));
    const result = analyzeChildCommandMatch(
      tokens,
      {
        ...childContext,
        worktreeMode: runsRemotely || usesStdin || hasPlaceholder ? false : context.worktreeMode,
      },
      {
        dynamicInput: usesStdin || hasPlaceholder,
        dynamicRmInput,
        dynamicSourceInput: dynamicCustomResult !== null || dynamicSourceInput,
        shellDynamicMatch,
        dynamicSourceMatch: shellDynamicMatch,
        rmDynamicMatch: destructiveCommandMatch(
          'parallel.rm-recursive-force-dynamic',
          REASON_PARALLEL_RM,
        ),
      },
    );
    // Prefer the parallel dynamic-source rule when stdin/placeholders can change executable
    // source selection, even if a nested analyzer (e.g. awk.system-dynamic) also matches.
    if (dynamicSourceInput) {
      const parallelDynamic = filterDestructiveCommandMatch(shellDynamicMatch, context.policy);
      if (parallelDynamic) return parallelDynamic;
    }
    return (
      result ?? dynamicCustomResult ?? checkPolicyRuleMatch(tokens, context.policy?.rules ?? [])
    );
  });
}

function parallelInputCanChangeExecutedSource(
  tokens: readonly string[],
  childHead: string,
): boolean {
  if (hasParallelPlaceholder(tokens[0] ?? '')) return true;
  if (childHead === 'eval' || childHead === 'source' || childHead === '.') return true;
  if (childHead === 'parallel' || childHead === 'xargs') return true;
  if (SHELL_WRAPPERS.has(childHead)) return shellArgvHasParallelSource(tokens);
  if (childHead === 'git') {
    return gitInputCanChangeProtectedOperation(tokens);
  }
  if (childHead === 'find') return true;
  if (AWK_INTERPRETERS.has(childHead))
    return executableSourceCanChange(tokens, AWK_SOURCE_OPTION_INPUTS, extractAwkExecutableSources);
  if (isInterpreterCommand(childHead))
    return executableSourceCanChange(
      tokens,
      INTERPRETER_SOURCE_OPTION_INPUTS,
      extractInterpreterExecutableSources,
    );
  return false;
}

function parallelInputCanChangeRmOptions(tokens: readonly string[]): boolean {
  const optionTerminator = tokens.indexOf('--');
  const optionTokens = tokens.slice(1, optionTerminator === -1 ? undefined : optionTerminator);
  const hasPlaceholder = tokens.some(hasParallelPlaceholder);
  if (!hasPlaceholder) return optionTerminator === -1;
  return optionTokens.some(
    (token) =>
      hasParallelPlaceholder(token) && (token.startsWith('-') || isOnlyParallelPlaceholder(token)),
  );
}

function gitInputCanChangeProtectedOperation(tokens: readonly string[]): boolean {
  if (gitGlobalConfigCanChange(tokens)) return true;
  const parsed = extractGitSubcommandAndRest(tokens);
  if (parsed.subcommand === null || hasParallelPlaceholder(parsed.subcommand)) return true;
  if (!GIT_RULE_SUBCOMMANDS.has(parsed.subcommand.toLowerCase())) return false;

  const optionTerminator = parsed.rest.indexOf('--');
  const structuralTokens = parsed.rest.slice(
    0,
    optionTerminator === -1 ? undefined : optionTerminator,
  );
  const hasPlaceholder = tokens.some(hasParallelPlaceholder);
  if (!hasPlaceholder) return optionTerminator === -1;
  return structuralTokens.some(hasParallelPlaceholder);
}

function gitGlobalConfigCanChange(tokens: readonly string[]): boolean {
  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token || token === '--' || !token.startsWith('-')) return false;
    if (token === '-c' || token === '--config-env') {
      if (hasParallelPlaceholder(tokens[index + 1] ?? '')) return true;
      index++;
      continue;
    }
    if ((token.startsWith('-c') && token.length > 2) || token.startsWith('--config-env=')) {
      if (hasParallelPlaceholder(token)) return true;
      continue;
    }
    if (hasParallelPlaceholder(token)) return true;
  }
  return false;
}

function shellArgvHasParallelSource(tokens: readonly string[]): boolean {
  if (isShellSyntaxCheck(tokens)) return false;
  const dashCArg = extractDashCArg(tokens);
  if (dashCArg !== null) return hasParallelPlaceholder(dashCArg);
  const scriptSource = extractShellScriptOperandSource(textCommandWords(tokens));
  if (scriptSource.kind === 'literal') return hasParallelPlaceholder(scriptSource.source);
  if (scriptSource.kind === 'dynamic') return true;
  return !tokens.some(hasParallelPlaceholder);
}

function executableSourceCanChange<T extends { kind: string; tokenIndex: number; value: string }>(
  tokens: readonly string[],
  candidates: readonly string[],
  extractSources: (tokens: readonly string[]) => readonly T[],
): boolean {
  const existingSources = extractSources(tokens);
  if (existingSources.some((source) => hasParallelPlaceholder(source.value))) return true;
  if (!tokens.some(hasParallelPlaceholder)) {
    return extractSources([...tokens, PARALLEL_APPENDED_SOURCE]).some(
      (source) => source.value === PARALLEL_APPENDED_SOURCE,
    );
  }
  const existing = new Set(
    existingSources.map((source) => `${source.tokenIndex}\0${source.kind}\0${source.value}`),
  );
  return candidates.some((candidate) =>
    extractSources(tokens.map((token) => replaceParallelJobPlaceholder(token, [candidate]))).some(
      (source) => !existing.has(`${source.tokenIndex}\0${source.kind}\0${source.value}`),
    ),
  );
}

function matchDynamicParallelPolicyRule(
  tokens: readonly string[],
  usesStdin: boolean,
  rules: readonly PolicyRule[],
  budget: Budget,
): DestructiveCommandRuleMatch | null {
  if (!usesStdin || rules.length === 0) return null;
  const relevantRules = rules.filter(
    (rule) => normalizeCommandToken(rule.command) === normalizeCommandToken(tokens[0] ?? ''),
  );
  if (relevantRules.length === 0) return null;
  const hasPlaceholder = tokens.some(hasParallelPlaceholder);
  reserveParallelAnalysis(budget, dynamicCustomRuleWork(tokens, relevantRules, hasPlaceholder));

  if (!hasPlaceholder) {
    return firstMatch(relevantRules, (rule) =>
      checkPolicyRuleMatch(
        [...tokens, ...(rule.subcommand ? [rule.subcommand] : []), ...rule.block_args],
        [rule],
      ),
    );
  }

  return firstMatch(relevantRules, (rule) => {
    const inputCandidates = new Set(
      [rule.subcommand, ...rule.block_args].flatMap((target) =>
        target ? parallelInputsThatProduce(tokens, target) : [],
      ),
    );
    return firstMatch(inputCandidates, (input) =>
      checkPolicyRuleMatch(
        tokens.map((token) => replaceParallelJobPlaceholder(token, [input])),
        [rule],
      ),
    );
  });
}

function dynamicCustomRuleWork(
  tokens: readonly string[],
  rules: readonly PolicyRule[],
  hasPlaceholder: boolean,
): ParallelAnalysisReservation {
  const candidateCount = hasPlaceholder
    ? limitedMultiply(
        limitedAdd(
          rules.map((rule) => rule.block_args.length + (rule.subcommand ? 1 : 0)),
          LIMITS.parallelChildAnalyses.cap,
        ),
        2 * Math.max(tokens.length, 1),
        LIMITS.parallelChildAnalyses.cap,
      )
    : rules.length;
  return {
    childAnalyses: candidateCount,
    derivedTokens: limitedMultiply(candidateCount, tokens.length, LIMITS.parallelDerivedTokens.cap),
  };
}

function parallelInputsThatProduce(tokens: readonly string[], target: string): string[] {
  return tokens.flatMap((token) => {
    const matches = [...token.matchAll(/\{[^{}\s]*\}/g)];
    if (matches.length !== 1) return [];
    const match = matches[0];
    if (!match || match.index === undefined) return [];
    const prefix = token.slice(0, match.index);
    const suffix = token.slice(match.index + match[0].length);
    if (!target.startsWith(prefix) || !target.endsWith(suffix)) return [target];
    const input = target.slice(prefix.length, target.length - suffix.length);
    return input !== target ? [target, input] : [target];
  });
}

type DynamicParallelFindAnalysis = {
  customResult: DestructiveCommandRuleMatch | null;
  executedSource: boolean;
  rmOptions: boolean;
};

function analyzeDynamicParallelFind(
  tokens: readonly string[],
  context: ParallelAnalyzeContext,
): DynamicParallelFindAnalysis {
  const analysis: DynamicParallelFindAnalysis = {
    customResult: null,
    executedSource: !tokens.some(hasParallelPlaceholder),
    rmOptions: false,
  };
  let inExpression = false;
  let expressionDataArgs = 0;
  let execTokens: string[] | null = null;
  const analyzeExec = () => {
    if (!execTokens?.some(hasParallelPlaceholder)) return;
    for (const childCommand of normalizeChildCommands(execTokens, context)) {
      analysis.executedSource ||= parallelInputCanChangeExecutedSource(
        childCommand.tokens,
        childCommand.head,
      );
      analysis.rmOptions ||=
        (childCommand.head === 'rm' && parallelInputCanChangeRmOptions(childCommand.tokens)) ||
        (childCommand.head === 'xargs' && nestedRmInputCanChangeOptions(childCommand.tokens));
      analysis.customResult ??= matchDynamicParallelPolicyRule(
        childCommand.tokens,
        true,
        context.policy?.rules ?? [],
        context.budget,
      );
    }
  };

  for (const token of tokens.slice(1)) {
    if (!inExpression && !token.startsWith('-') && token !== '!' && token !== '(') {
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }
    inExpression = true;

    if (execTokens) {
      if (token === ';' || token === '+') {
        analyzeExec();
        execTokens = null;
        continue;
      }
      execTokens.push(token);
      continue;
    }

    if (expressionDataArgs > 0) {
      expressionDataArgs--;
      continue;
    }

    if (isFindExecPrimary(token)) {
      execTokens = [];
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }

    const arity = getFindPrimaryArity(token);
    if (arity > 0) {
      expressionDataArgs = arity;
      analysis.executedSource ||= hasParallelPlaceholder(token);
      continue;
    }

    analysis.executedSource ||= hasParallelPlaceholder(token);
  }
  analyzeExec();
  return analysis;
}

function nestedRmInputCanChangeOptions(tokens: readonly string[]): boolean {
  const childTokens = tokens.slice(extractXargsChildCommandWithInfo(tokens).childStart);
  return (
    normalizeCommandToken(childTokens[0] ?? '') === 'rm' &&
    parallelInputCanChangeRmOptions(childTokens)
  );
}

function parallelReason(ruleId: DestructiveCommandRuleId, reason: string) {
  return (context: ParallelAnalyzeContext): DestructiveCommandRuleMatch | null =>
    filterDestructiveCommandMatch(destructiveCommandMatch(ruleId, reason), context.policy);
}

const parallelShellDynamicReason = parallelReason('parallel.shell-dynamic', REASON_PARALLEL_SHELL);
const parallelCommandStreamDynamicReason = parallelReason(
  'parallel.command-stream-dynamic',
  REASON_PARALLEL_COMMAND_STREAM,
);
const parallelUnsupportedReason = parallelReason(
  'parallel.command-stream-dynamic',
  REASON_PARALLEL_UNSUPPORTED,
);
const parallelRmDynamicReason = parallelReason(
  'parallel.rm-recursive-force-dynamic',
  REASON_PARALLEL_RM,
);

function analyzeParallelRmExpansion(
  tokens: string[],
  cwd: string | undefined,
  context: ParallelAnalyzeContext,
): DestructiveCommandRuleMatch | null {
  return filterDestructiveCommandMatch(
    analyzeRmMatch(textCommandWords(tokens), {
      environment: context.environment,
      cwd,
      budget: context.budget,
      originalCwd: context.originalCwd,
      strict: context.strict,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar,
      tmpdirWordSplittingUnsafe: hasUnsafeTmpdirWordSplitting(
        context.envAssignments ?? new Map(),
        context.environment,
      ),
      trustedTmpdirValue: isTmpdirValueTrusted(
        context.envAssignments ?? new Map(),
        context.environment,
      ),
      protectedGitMetadata: context.protectedGitMetadata,
      policy: context.policy,
    }),
    context.policy,
  );
}

type PlaceholderKind = 'generic' | 'rm';
type ParallelJob = readonly string[];

type ReplacementStats = {
  occurrences: number;
  fixedBytes: number;
};

function commandsModeWork(args: readonly string[]): ParallelAnalysisReservation {
  return {
    childAnalyses: args.length,
    derivedTokens: args.length,
    derivedBytes: sumUtf8Bytes(args),
  };
}

function staticStringWork(value: string): ParallelAnalysisReservation {
  return staticTokenWork([value]);
}

function staticTokenWork(tokens: readonly string[]): ParallelAnalysisReservation {
  return {
    childAnalyses: 1,
    derivedTokens: tokens.length,
    derivedBytes: sumUtf8Bytes(tokens),
  };
}

function appendedTokenJobWork(
  tokens: readonly string[],
  jobs: readonly ParallelJob[],
): ParallelAnalysisReservation {
  if (jobs.length > LIMITS.parallelChildAnalyses.cap) {
    return { childAnalyses: jobs.length };
  }
  return {
    childAnalyses: jobs.length,
    derivedTokens: limitedAdd(
      jobs.map((job) => tokens.length + job.length),
      LIMITS.parallelDerivedTokens.cap,
    ),
    derivedBytes: limitedAdd(
      [
        limitedMultiply(sumUtf8Bytes(tokens), jobs.length, LIMITS.parallelDerivedBytes.cap),
        limitedAdd(
          jobs.map((job) => sumUtf8Bytes(job)),
          LIMITS.parallelDerivedBytes.cap,
        ),
      ],
      LIMITS.parallelDerivedBytes.cap,
    ),
  };
}

function expandedStringJobWork(
  value: string,
  jobs: readonly ParallelJob[],
): ParallelAnalysisReservation {
  return expandedTokenJobWork([value], jobs, 'generic');
}

function expandedTokenJobWork(
  tokens: readonly string[],
  jobs: readonly ParallelJob[],
  placeholderKind: PlaceholderKind,
): ParallelAnalysisReservation {
  if (jobs.length > LIMITS.parallelChildAnalyses.cap) {
    return { childAnalyses: jobs.length };
  }
  const derivedTokens = limitedMultiply(
    tokens.length,
    jobs.length,
    LIMITS.parallelDerivedTokens.cap,
  );
  if (derivedTokens > LIMITS.parallelDerivedTokens.cap) {
    return { childAnalyses: jobs.length, derivedTokens };
  }
  const stats = combineReplacementStats(
    tokens.map((token) => getReplacementStats(token, placeholderKind)),
  );
  const placeholderReplacements = limitedMultiply(
    stats.occurrences,
    jobs.length,
    LIMITS.parallelPlaceholderReplacements.cap,
  );
  if (placeholderReplacements > LIMITS.parallelPlaceholderReplacements.cap) {
    return { childAnalyses: jobs.length, derivedTokens, placeholderReplacements };
  }
  if (expandedJobBytesExceedLimit(stats, jobs, placeholderReplacements)) {
    return {
      childAnalyses: jobs.length,
      derivedTokens,
      derivedBytes: LIMITS.parallelDerivedBytes.cap + 1,
      placeholderReplacements,
    };
  }
  const replace =
    placeholderKind === 'generic' ? replaceParallelJobPlaceholder : replaceParallelRmJobPlaceholder;
  const derivedBytes = limitedAdd(
    jobs.map((job) => sumUtf8Bytes(tokens.map((token) => replace(token, job)))),
    LIMITS.parallelDerivedBytes.cap,
  );
  return {
    childAnalyses: jobs.length,
    derivedTokens,
    derivedBytes,
    placeholderReplacements,
  };
}

function expandedJobBytesExceedLimit(
  stats: ReplacementStats,
  jobs: readonly ParallelJob[],
  placeholderReplacements: number,
): boolean {
  const byteCeiling = LIMITS.parallelDerivedBytes.cap + 4 * placeholderReplacements;
  return (
    limitedAdd(
      [
        limitedMultiply(stats.fixedBytes, jobs.length, byteCeiling),
        limitedMultiply(
          stats.occurrences,
          limitedAdd(
            jobs.map((job) =>
              job.reduce((largest, arg) => Math.max(largest, utf8ByteLength(arg)), 0),
            ),
            byteCeiling,
          ),
          byteCeiling,
        ),
      ],
      byteCeiling,
    ) > byteCeiling
  );
}

function getReplacementStats(value: string, placeholderKind: PlaceholderKind): ReplacementStats {
  const matches =
    placeholderKind === 'generic'
      ? value.matchAll(/\{[^{}\s]*\}/g)
      : value.matchAll(PARALLEL_RM_PLACEHOLDER_RE);
  let occurrences = 0;
  let fixedBytes = 0;
  let lastIndex = 0;
  for (const match of matches) {
    if (occurrences >= LIMITS.parallelPlaceholderReplacements.cap) {
      return {
        occurrences: LIMITS.parallelPlaceholderReplacements.cap + 1,
        fixedBytes: 0,
      };
    }
    fixedBytes = limitedAdd(
      [fixedBytes, utf8ByteLength(value.slice(lastIndex, match.index))],
      MAX_EXPANDED_BYTE_OVERCOUNT,
    );
    occurrences++;
    lastIndex = match.index + match[0].length;
  }
  return {
    occurrences,
    fixedBytes:
      occurrences === 0
        ? utf8ByteLength(value)
        : limitedAdd(
            [fixedBytes, utf8ByteLength(value.slice(lastIndex))],
            MAX_EXPANDED_BYTE_OVERCOUNT,
          ),
  };
}

function combineReplacementStats(stats: readonly ReplacementStats[]): ReplacementStats {
  return {
    occurrences: limitedAdd(
      stats.map((value) => value.occurrences),
      LIMITS.parallelPlaceholderReplacements.cap,
    ),
    fixedBytes: limitedAdd(
      stats.map((value) => value.fixedBytes),
      MAX_EXPANDED_BYTE_OVERCOUNT,
    ),
  };
}

function sumUtf8Bytes(values: readonly string[], limit = LIMITS.parallelDerivedBytes.cap): number {
  return limitedAdd(values.map(utf8ByteLength), limit);
}

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function limitedAdd(values: readonly number[], limit: number): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0 || value > limit - total) {
      return limit + 1;
    }
    total += value;
  }
  return total;
}

function limitedMultiply(left: number, right: number, limit: number): number {
  if (
    !Number.isSafeInteger(left) ||
    !Number.isSafeInteger(right) ||
    left < 0 ||
    right < 0 ||
    (left !== 0 && right > Math.floor(limit / left))
  ) {
    return limit + 1;
  }
  return left * right;
}

function buildNestedOverrides(
  envAssignments: ReadonlyMap<string, string> | undefined,
  cwd: string | null | undefined,
  runsRemotely: boolean,
): AnalyzeNestedOverrides | undefined {
  const overrides: AnalyzeNestedOverrides = {};
  if (envAssignments) overrides.envAssignments = envAssignments;
  if (runsRemotely) {
    overrides.effectiveCwd = null;
    overrides.worktreeMode = false;
    return overrides;
  }
  if (cwd !== undefined) {
    overrides.effectiveCwd = cwd;
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

interface ParallelParseResult {
  template: string[];
  jobs: ParallelJob[];
  /** Index the child command starts at, so word-based callers can slice the same position. */
  childStart: number;
  templateHasPlaceholder: boolean;
  runsRemotely: boolean;
  usesStdin: boolean;
  readsCommandsFromInput: boolean;
  unsupported: boolean;
  workdir: string | undefined;
  dryRun: boolean;
}

/** @internal */
export function replaceParallelPlaceholder(token: string, arg: string): string {
  return token.replace(/\{[^{}\s]*\}/g, () => arg);
}

function replaceParallelJobPlaceholder(token: string, job: ParallelJob): string {
  return token.replace(/\{[^{}\s]*\}/g, (placeholder) =>
    getParallelPlaceholderValue(placeholder, job),
  );
}

function replaceParallelRmJobPlaceholder(token: string, job: ParallelJob): string {
  return token.replace(PARALLEL_RM_PLACEHOLDER_RE, (placeholder) =>
    getParallelPlaceholderValue(placeholder, job),
  );
}

function getParallelPlaceholderValue(placeholder: string, job: ParallelJob): string {
  const position = /^\{(-?\d+)[^{}\s]*\}$/.exec(placeholder)?.[1];
  if (position === undefined) {
    return job[0] ?? '';
  }
  const parsed = Number(position);
  const index = parsed > 0 ? parsed - 1 : job.length + parsed;
  return job[index] ?? '';
}

function hasParallelPlaceholder(token: string): boolean {
  return PARALLEL_PLACEHOLDER_RE.test(token);
}

function hasUnsupportedParallelPlaceholder(token: string): boolean {
  if (hasExecutableParallelPlaceholder(token)) return true;
  for (const match of token.matchAll(/\{[^{}\s]*\}/g)) {
    if (!/^(?:\{\}|\{-?\d+\})$/.test(match[0])) {
      return true;
    }
  }
  return false;
}

function hasExecutableParallelPlaceholder(token: string): boolean {
  const perlStart = token.indexOf('{=');
  return perlStart !== -1 && token.indexOf('=}', perlStart + 2) !== -1;
}

function isOnlyParallelPlaceholder(token: string): boolean {
  return /^\{[^{}\s]*\}$/.test(token);
}

function parseParallelCommand(tokens: readonly string[]): ParallelParseResult {
  let i = 1;
  const templateTokens: string[] = [];
  // No child command until the scan finds one; the empty slice then starts past the last token.
  let childStart = tokens.length;
  let markerIndex = -1;
  let runsRemotely = false;
  let usesPipe = false;
  let dryRun = false;
  let workdir: string | undefined;
  let unsupported = tokens.some(
    (token) => token === '::::' || token === '::::+' || token === ':::+',
  );

  // First pass: find the ::: marker and extract template
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;

    if (token === ':::') {
      markerIndex = i;
      break;
    }

    if (token === '--') {
      // Everything after -- until ::: is the template
      const template = collectCommandTemplate(tokens, i + 1);
      templateTokens.push(...template.templateTokens);
      childStart = i + 1;
      markerIndex = template.markerIndex;
      break;
    }

    if (!token.startsWith('-')) {
      const template = collectCommandTemplate(tokens, i);
      templateTokens.push(...template.templateTokens);
      childStart = i;
      markerIndex = template.markerIndex;
      break;
    }

    const nextToken = tokens[i + 1];
    const equalsIndex = token.indexOf('=');
    const optionName = equalsIndex === -1 ? token : token.slice(0, equalsIndex);
    const attachedValue = equalsIndex === -1 ? undefined : token.slice(equalsIndex + 1);

    if (token === '--dry-run') {
      dryRun = true;
      i++;
      continue;
    }
    if (token === '-I' || (token.startsWith('-I') && token.length > 2)) {
      unsupported ||= (token === '-I' ? nextToken : token.slice(2)) !== '{}';
      i += token === '-I' ? 2 : 1;
      continue;
    }
    if (token === '--replace' || token === '-i') {
      unsupported = true;
      i += 2;
      continue;
    }
    if (optionName === '--replace' || (token.startsWith('-i') && token.length > 2)) {
      const replacement = optionName === '--replace' ? attachedValue : token.slice(2);
      unsupported ||= replacement !== '' && replacement !== '{}';
      i++;
      continue;
    }
    if (token === '-a' || PARALLEL_UNSUPPORTED_INPUT_OPTIONS.has(optionName)) {
      unsupported = true;
      i += attachedValue === undefined ? 2 : 1;
      continue;
    }
    if (token === '--pipe' || token === '--pipepart') {
      usesPipe = true;
      i++;
      continue;
    }
    if (optionName === '--env') {
      // Selected environment values are supplied at run time, so the job text cannot be verified.
      unsupported = true;
      i += attachedValue === undefined ? 2 : 1;
      continue;
    }
    if (PARALLEL_REMOTE_OPTIONS.has(optionName) || (token.startsWith('-S') && token.length > 2)) {
      runsRemotely = true;
      i += PARALLEL_REMOTE_OPTIONS.has(token) ? 2 : 1;
      continue;
    }
    if (PARALLEL_WORKDIR_OPTIONS.has(optionName)) {
      const value = attachedValue ?? nextToken;
      if (value === undefined || value === ':::' || value === '--') {
        unsupported = true;
        i++;
        continue;
      }
      workdir = value;
      unsupported ||= attachedValue !== undefined && value === '';
      i += attachedValue === undefined ? 2 : 1;
      continue;
    }
    if (token.startsWith('-j') && token.length > 2 && /^\d+$/.test(token.slice(2))) {
      i++;
      continue;
    }
    if (token.startsWith('--') && attachedValue !== undefined) {
      i++;
      continue;
    }
    if (PARALLEL_OPTIONS_WITH_VALUE.has(token)) {
      if (nextToken === undefined || nextToken === ':::' || nextToken === '--') {
        unsupported = true;
        i++;
        continue;
      }
      i += 2;
      continue;
    }
    i += token === '-j' || token === '--jobs' ? 2 : 1;
  }

  unsupported ||= templateTokens.some(
    dryRun ? hasExecutableParallelPlaceholder : hasUnsupportedParallelPlaceholder,
  );

  // Extract argument sources after ::: and generate their Cartesian product.
  const argumentGroups: string[][] = [];
  if (markerIndex !== -1) {
    let group: string[] = [];
    for (let j = markerIndex + 1; j < tokens.length; j++) {
      const token = tokens[j];
      if (token === ':::') {
        argumentGroups.push(group);
        group = [];
        continue;
      }
      if (token !== undefined) {
        group.push(token);
      }
    }
    argumentGroups.push(group);
  }
  const jobs = expandParallelJobs(argumentGroups);

  const templateHasPlaceholder = templateTokens.some(hasParallelPlaceholder);
  const readsCommandsFromInput = templateTokens.length === 0 && markerIndex === -1;

  return {
    template: templateTokens,
    jobs,
    childStart,
    templateHasPlaceholder,
    runsRemotely,
    usesStdin: usesPipe || markerIndex === -1,
    readsCommandsFromInput,
    unsupported,
    workdir,
    dryRun,
  };
}

function resolveParallelWorkdir(
  workdir: string | undefined,
  cwd: string | undefined,
  paths: PathResolver,
): string | null | undefined {
  if (workdir === undefined) {
    return undefined;
  }
  if (workdir === '...' || /[{}$`*?~[]/.test(workdir)) {
    return null;
  }
  if (!cwd && !isAbsolute(workdir)) {
    return null;
  }
  try {
    return resolveChdirTarget(cwd ?? workdir, workdir, paths);
  } catch {
    return null;
  }
}

function expandParallelJobs(argumentGroups: readonly (readonly string[])[]): ParallelJob[] {
  if (argumentGroups.length === 0 || argumentGroups.some((group) => group.length === 0)) {
    return [];
  }
  let jobs: string[][] = [[]];
  for (const group of argumentGroups) {
    if (group.length === 1) {
      const arg = group[0];
      if (arg === undefined) return [];
      for (const job of jobs) job.push(arg);
      continue;
    }
    const expanded: string[][] = [];
    for (const job of jobs) {
      for (const arg of group) {
        expanded.push([...job, arg]);
        if (expanded.length > LIMITS.parallelChildAnalyses.cap) {
          return expanded;
        }
      }
    }
    jobs = expanded;
  }
  return jobs;
}

/** Index the child command starts at, so the dynamic-structure scan can slice the words there. */
export function extractParallelChildStart(tokens: readonly string[]): number {
  return parseParallelCommand(tokens).childStart;
}
