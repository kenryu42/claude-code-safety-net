import { normalize } from 'node:path';
import { AnalysisLimit, LIMITS } from '@/core/budget';
import { resolveChdirTarget } from '@/core/paths/chdir';
import { isTmpdirOverriddenToNonTemp } from '@/core/paths/tmpdir';
import {
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/policy/effective-rules';
import { isInterpreterCommand } from '@/core/policy/transparent-wrappers';
import type { CommandAnalysisPolicy } from '@/core/policy/types';
import { AWK_INTERPRETERS, DISPLAY_COMMANDS, SHELL_WRAPPERS } from '@/core/rules/constants';
import { checkPolicyRuleMatch } from '@/core/rules/custom';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { CommandView, CommandWord } from '@/core/shell/model';
import { getBasename, hasUnclosedQuotes, normalizeCommandToken } from '@/core/shell/tokens';
import type {
  AnalyzeResult,
  DestructiveCommandRuleMatch,
  EnvironmentContext,
  PathResolver,
} from '@/gate/analysis';
import type { CommandTraceContext } from '@/gate/trace';
import { analyzeAwkSystemCallMatch, extractAwkExecutableSources } from './awk';
import { type NormalizedChildCommand, normalizeChildCommands } from './child-command';
import { analysisWordText, analyzedViewWords, textCommandWords } from './command-words';
import { dangerousInTextMatch } from './dangerous-text';
import { analyzeDynamicCommandStructure, hasDynamicExecutableSource } from './derived-input';
import { analyzeDeviceCommandMatch } from './device';
import { analyzeGitDetailed } from './git';
import { resolveTrackedHeredocPath } from './heredoc-files';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  extractInterpreterExecutableSources,
  isInterpreterDisplayOnly,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from './interpreters';
import { REASON_STRICT_UNPARSEABLE } from './reasons';
import {
  ANALYZER_RULES,
  type AnalyzerRuleContext,
  gitAnalyzeOptions,
  type InternalOptions,
  matchFromBlockResult,
} from './rule';
import {
  extractEvalSource,
  extractPositionalShellSource,
  extractShellScriptOperandSource,
  extractShellStdinSource,
  extractTrapSource,
  isVerifiableLocalGeneratorSource,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from './shell-execution';
import {
  extractDashCArg,
  extractShellStartupLoaderMetadata,
  isShellSyntaxCheck,
} from './shell-wrappers';
import { isStandardCommandWrapper, unwrapTransparentWrapper } from './transparent-wrappers';
import {
  reconstructEnvSplitWords,
  stripEnvAssignmentWords,
  stripWrappers,
  stripWrapperWords,
} from './wrapper-prelude';

type AnalyzeBlockResult = Omit<AnalyzeResult, 'segment'>;

const REASON_DYNAMIC_SHELL_SOURCE =
  'shell execution source cannot be verified safely. Use a literal command string or ask the user to run it manually.';
function findCommandAnalyzer(head: string) {
  return ANALYZER_RULES.find((rule) => rule.heads.has(head))?.analyze;
}

export function analyzeSegment(
  commandWords: readonly CommandWord[],
  depth: number,
  options: InternalOptions,
): AnalyzeBlockResult | null {
  let trace = options.trace;
  if (commandWords.length === 0) {
    return null;
  }

  const dialect = options.commandView?.dialect ?? 'posix';
  const texts = (candidates: readonly CommandWord[]) =>
    candidates.map((word) => (dialect === 'posix' ? analysisWordText(word) : word.text));
  const cwdUnknown = options.effectiveCwd === null;
  const baseCwdForRm = cwdUnknown ? undefined : (options.effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;
  const leading = stripEnvAssignmentWords(commandWords);
  if (leading.envAssignments.size > 0) {
    trace?.recordSegment({
      type: 'env-strip',
      input: texts(commandWords),
      envVars: [...leading.envAssignments.keys()],
      output: texts(leading.words),
    });
  }
  const prelude = stripWrapperWords(
    leading.words,
    options.environment,
    baseCwdForRm,
    new Map([...(options.envAssignments ?? []), ...leading.envAssignments]),
  );
  // The `env -S` split-string language is not emulated: env splices the split words ahead of the
  // retained operands, so the reconstructed text owns the linear dangerous-text scan
  // unconditionally, and strict mode refuses the unverified execution source outright. Standard
  // mode splices inert values ahead of the operands and analyzes that reconstruction as the real
  // command line; an allow still falls through to analyzing the operands on their own.
  const envSplitValues = prelude.envSplitValues ?? [];
  if (envSplitValues.length > 0) {
    const splitCommandText = [...envSplitValues, ...texts(prelude.words)].join(' ');
    const dangerousSplitMatch = dangerousInTextMatch(splitCommandText, options.scanWork);
    if (dangerousSplitMatch) {
      trace?.recordSegment({
        type: 'dangerous-text',
        token: splitCommandText,
        matched: true,
        reason: dangerousSplitMatch.reason,
      });
      return blockResultFromMatch(dangerousSplitMatch);
    }
    if (options.strict) {
      return dynamicShellSourceResult(trace);
    }
    const spliced = reconstructEnvSplitWords(envSplitValues, texts(prelude.words));
    if (spliced) {
      options.budget.charge('derivedTokens', spliced.length);
      const splicedResult = options.analyzeNested(spliced.join(' '), {
        effectiveCwd: prelude.cwd === undefined ? options.effectiveCwd : prelude.cwd,
        envAssignments: new Map([
          ...(options.envAssignments ?? []),
          ...leading.envAssignments,
          ...prelude.envAssignments,
        ]),
      });
      if (splicedResult) return splicedResult;
    }
  }
  // Words the prelude rewrote carry no parser facts, so the whole command analyzes as text.
  const words = prelude.rewritten
    ? textCommandWords(texts(prelude.words))
    : analyzedViewWords(dialect, prelude.words);
  const stripped = texts(words);
  const normalizedOptions = {
    ...options,
    wrapperNormalizationBudget: options.wrapperNormalizationBudget ?? { iterations: 0 },
  };
  if (trace && leading.words.length > words.length) {
    const strippedEnv = texts(leading.words);
    trace.recordSegment({
      type: 'leading-tokens-stripped',
      input: strippedEnv,
      removed: strippedEnv.slice(0, strippedEnv.length - words.length),
      output: stripped,
    });
  }

  const envAssignments = new Map([
    ...(options.envAssignments ?? []),
    ...leading.envAssignments,
    ...prelude.envAssignments,
  ]);
  const head = stripped[0];
  if (!head) return null;

  if (isStandardCommandWrapper(head)) {
    throw new AnalysisLimit('wrapperPeelIterations');
  }

  const normalizedHead = normalizeCommandToken(head);
  const cwdForRm = prelude.cwd === null ? undefined : (prelude.cwd ?? baseCwdForRm);
  const originalCwdForRm = prelude.cwd === null ? undefined : originalCwd;
  const nestedEffectiveCwd = prelude.cwd === undefined ? options.effectiveCwd : prelude.cwd;
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments, options.environment);

  // Reads the parsed words: PowerShell stand-ins would report every head as dynamic.
  const dynamicCommandMatch = analyzeDynamicCommandStructure(
    dialect,
    prelude.words,
    options.environment,
    depth === 0,
    options.strict,
    options.policy,
  );
  if (dynamicCommandMatch) {
    trace?.recordSegment({
      type: 'rule-check',
      rule: 'analyzer/segment.ts:analyzeDynamicCommandStructure',
      matched: true,
      reason: dynamicCommandMatch.reason,
    });
    return blockResultFromMatch(dynamicCommandMatch);
  }

  const transparentWrapper = unwrapTransparentWrapper(stripped, options.policy);
  if (transparentWrapper) {
    for (const childIndex of [
      transparentWrapper.childIndex,
      ...transparentWrapper.alternativeChildIndices,
    ]) {
      reserveWrapperNormalization(normalizedOptions.wrapperNormalizationBudget);
      const candidateWords = words.slice(childIndex);
      trace?.recordSegment({
        type: 'transparent-wrapper',
        wrapper: transparentWrapper.wrapper,
        output: texts(candidateWords),
      });
      const result = analyzeSegment(candidateWords, depth, {
        ...normalizedOptions,
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (result) return result;
    }
    return null;
  }

  const shellBuiltinSource =
    normalizedHead === 'eval'
      ? extractEvalSource(words)
      : normalizedHead === 'trap'
        ? extractTrapSource(words)
        : undefined;
  if (
    shellBuiltinSource?.kind === 'dynamic' &&
    (options.strict ||
      !options.commandView ||
      !isVerifiableLocalGeneratorSource(options.commandView))
  ) {
    return dynamicShellSourceResult(trace);
  }
  if (shellBuiltinSource?.kind === 'literal') {
    trace?.recordSegment({
      type: 'recurse',
      reason: normalizedHead === 'eval' ? 'shell-eval' : 'shell-trap',
      innerCommand: shellBuiltinSource.source,
      depth: depth + 1,
    });
    // eval and trap run their source in this shell, which still holds the caller's functions.
    const result = options.analyzeNested(shellBuiltinSource.source, {
      effectiveCwd: nestedEffectiveCwd,
      envAssignments,
      functionDefinitions: options.functionDefinitions,
    });
    if (result) return result;
  }

  if (isShellWrapperCommand(head, normalizedHead)) {
    if (isShellSyntaxCheck(stripped)) return null;
    const startupResult = analyzeShellStartupSources(
      stripped,
      envAssignments,
      nestedEffectiveCwd,
      options,
      trace,
      depth,
    );
    if (startupResult) return startupResult;
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      const positionalSource = extractPositionalShellSource(words, dashCArg);
      if (positionalSource.kind === 'dynamic') return dynamicShellSourceResult(trace);
      const source = positionalSource.kind === 'literal' ? positionalSource.source : dashCArg;
      const traceInnerCommand = unwrapTraceQuotes(source);
      trace?.recordSegment({
        type: 'shell-wrapper',
        wrapper: normalizedHead,
        innerCommand: traceInnerCommand,
      });
      trace?.recordSegment({
        type: 'recurse',
        reason: 'shell-wrapper',
        innerCommand: traceInnerCommand,
        depth: depth + 1,
      });
      const result = options.analyzeNested(source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (result) return result;
      return shellSourceHasUnresolvedDynamicExecutionCarrier(source)
        ? dynamicShellSourceResult(trace)
        : null;
    }

    const scriptSource = extractShellScriptOperandSource(words);
    if (scriptSource.kind === 'dynamic') return dynamicShellSourceResult(trace);
    if (scriptSource.kind === 'literal') {
      return analyzeTrackedHeredocScript(
        scriptSource.source,
        nestedEffectiveCwd,
        envAssignments,
        options,
        trace,
        depth,
      );
    }

    const stdinSource = extractShellStdinSource(
      words,
      options.commandView?.redirections ?? [],
      options.hasPipelineInput ?? false,
      options.literalShellInput,
    );
    if (stdinSource.kind === 'dynamic') return dynamicShellSourceResult(trace);
    if (stdinSource.kind === 'literal') {
      trace?.recordSegment({
        type: 'recurse',
        reason: 'shell-stdin',
        innerCommand: stdinSource.source,
        depth: depth + 1,
      });
      return options.analyzeNested(stdinSource.source, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
    }
  }

  if (normalizedHead === 'source' || normalizedHead === '.') {
    const sourceSearchPathIndex = stripped[1] === '-p' ? 2 : null;
    if (sourceSearchPathIndex !== null) {
      const sourceSearchPath = options.commandView ? words[sourceSearchPathIndex] : undefined;
      if (!sourceSearchPath) return null;
      if (sourceSearchPath.provenance !== 'literal') return dynamicShellSourceResult(trace);
    }
    const sourceCandidateIndex = sourceSearchPathIndex === null ? 1 : 3;
    const sourceOperandIndex =
      stripped[sourceCandidateIndex] === '--' ? sourceCandidateIndex + 1 : sourceCandidateIndex;
    const source = options.commandView ? words[sourceOperandIndex] : undefined;
    if (!source) return null;
    if (source.provenance === 'literal') {
      return analyzeTrackedHeredocScript(
        source.text,
        nestedEffectiveCwd,
        envAssignments,
        options,
        trace,
        depth,
      );
    }
    if (
      options.strict ||
      !options.commandView ||
      !isVerifiableLocalGeneratorSource(options.commandView)
    ) {
      return dynamicShellSourceResult(trace);
    }
  }

  if (AWK_INTERPRETERS.has(normalizedHead)) {
    if (
      options.strict &&
      hasDynamicExecutableSource(extractAwkExecutableSources(stripped), words)
    ) {
      return dynamicShellSourceResult(trace);
    }
    const awkMatch = analyzeAwkSystemCallMatch(stripped, (command) =>
      matchFromBlockResult(
        options.analyzeNested(command, {
          effectiveCwd: nestedEffectiveCwd,
          envAssignments,
        }),
      ),
    );
    const awkReason = filterDestructiveCommandMatch(awkMatch, options.policy);
    if (awkReason) {
      trace?.recordSegment({
        type: 'rule-check',
        rule: 'awk:analyzeAwkSystemCallMatch',
        matched: true,
        reason: awkReason.reason,
      });
      return blockResultFromMatch(awkReason);
    }
  }

  if (isInterpreterCommand(normalizedHead)) {
    if (
      options.strict &&
      hasDynamicExecutableSource(extractInterpreterExecutableSources(stripped), words)
    ) {
      return dynamicShellSourceResult(trace);
    }
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      const paranoidInterpreterRuleEnabled = destructiveCommandRuleIsEnabled(
        options.policy,
        'interpreter.one-liner-paranoid',
        !!options.paranoidInterpreters,
      );
      trace?.recordSegment({
        type: 'interpreter',
        interpreter: normalizedHead,
        codeArg,
        paranoidBlocked: paranoidInterpreterRuleEnabled,
      });
      if (paranoidInterpreterRuleEnabled) {
        const match = filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.one-liner-paranoid', REASON_INTERPRETER_BLOCKED),
          options.policy,
        );
        if (match) return blockResultFromMatch(match);
      }

      if (isInterpreterDisplayOnly(normalizedHead, codeArg)) return null;

      trace?.recordSegment({
        type: 'recurse',
        reason: 'interpreter',
        innerCommand: codeArg,
        depth: depth + 1,
      });
      const innerReason = options.analyzeNested(codeArg, {
        effectiveCwd: nestedEffectiveCwd,
        envAssignments,
      });
      if (
        innerReason &&
        innerReason.ruleId !== 'raw-text.dangerous-command' &&
        (innerReason.reason !== REASON_STRICT_UNPARSEABLE || hasUnclosedQuotes(codeArg))
      ) {
        return innerReason;
      }

      if (containsDangerousCode(codeArg, options.scanWork)) {
        const match = filterDestructiveCommandMatch(
          destructiveCommandMatch('interpreter.dangerous-command', REASON_INTERPRETER_DANGEROUS),
          options.policy,
        );
        if (match) {
          trace?.recordSegment({
            type: 'dangerous-text',
            token: codeArg,
            matched: true,
            reason: REASON_INTERPRETER_DANGEROUS,
          });
          return blockResultFromMatch(match);
        }
      }
      trace = undefined;
    }
  }

  if (normalizedHead === 'busybox' && stripped.length > 1) {
    reserveWrapperNormalization(normalizedOptions.wrapperNormalizationBudget);
    trace?.recordSegment({ type: 'busybox', subcommand: stripped[1] ?? 'unknown' });
    trace?.recordSegment({
      type: 'recurse',
      reason: 'busybox',
      innerCommand: stripped.slice(1).join(' '),
      depth: depth + 1,
    });
    return analyzeSegment(words.slice(1), depth, {
      ...normalizedOptions,
      effectiveCwd: nestedEffectiveCwd,
      envAssignments,
    });
  }

  const filteredDeviceMatch = filterDestructiveCommandMatch(
    analyzeDeviceCommandMatch(normalizedHead, stripped),
    options.policy,
  );
  if (filteredDeviceMatch) {
    trace?.recordSegment({
      type: 'rule-check',
      rule: 'analyzer/device.ts:analyzeDeviceCommandMatch',
      matched: true,
      reason: filteredDeviceMatch.reason,
    });
    return blockResultFromMatch(filteredDeviceMatch);
  }

  const analyzerOptions =
    trace === normalizedOptions.trace ? normalizedOptions : { ...normalizedOptions, trace };
  const commandContext: AnalyzerRuleContext = {
    words,
    head: normalizedHead,
    cwd: cwdForRm,
    originalCwd: originalCwdForRm,
    envAssignments,
    allowTmpdirVar,
    dynamicArguments: prelude.words.some((word) => word.provenance === 'command-substitution'),
    depth,
    effectiveCwd: nestedEffectiveCwd,
    options: analyzerOptions,
    analyzeChildTokens: (childTokens, childCwd) =>
      matchFromBlockResult(
        analyzeSegment(textCommandWords(childTokens), depth + 1, {
          ...analyzerOptions,
          commandView: undefined,
          effectiveCwd: childCwd,
          envAssignments,
        }),
      ) ?? checkPolicyRuleMatch(childTokens, analyzerOptions.policy.rules),
  };
  const commandAnalyzer = findCommandAnalyzer(normalizedHead);
  if (normalizedHead === 'rm' || normalizedHead === 'xargs' || normalizedHead === 'parallel') {
    trace?.recordSegment({
      type: 'tmpdir-check',
      tmpdirValue:
        envAssignments.has('TMPDIR') || options.environment.env.has('TMPDIR') ? '<redacted>' : null,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar,
    });
  }
  const gitDetail =
    trace && normalizedHead === 'git'
      ? analyzeGitDetailed(commandContext.words, gitAnalyzeOptions(commandContext))
      : undefined;
  const commandResult = filterBuiltInCommandMatch(
    gitDetail ? gitDetail.match : (commandAnalyzer?.(commandContext) ?? null),
    options.policy,
  );
  if (trace)
    recordCommandAnalyzerTrace(commandContext, commandResult, gitDetail?.relaxation ?? null);
  if (commandResult) {
    return blockResultFromMatch(commandResult);
  }

  const matchedKnown = commandAnalyzer !== undefined;

  // Fallback: scan tokens for embedded git/rm/find commands
  // This catches cases like "command -px git reset --hard" where the head
  // token is not a known command but contains dangerous commands later
  // Skip for display-only commands that don't execute their arguments
  const scansForEmbedded = !matchedKnown && !DISPLAY_COMMANDS.has(normalizedHead);
  const tokensScanned: string[] | undefined = trace && scansForEmbedded ? [] : undefined;
  if (scansForEmbedded) {
    for (let i = 1; i < stripped.length; i++) {
      const token = stripped[i];
      if (!token) continue;
      tokensScanned?.push(token);

      const match = filterBuiltInCommandMatch(
        analyzeEmbeddedCommand(commandContext, stripped, i),
        options.policy,
      );
      if (match) {
        trace?.recordSegment({
          type: 'fallback-scan',
          tokensScanned: tokensScanned ?? [],
          embeddedCommandFound: normalizeCommandToken(token),
        });
        return blockResultFromMatch(match);
      }
    }
  }
  trace?.recordSegment({ type: 'fallback-scan', tokensScanned: tokensScanned ?? [] });

  if (depth !== 0 && matchedKnown) {
    trace?.recordSegment({
      type: 'custom-rules-check',
      rulesChecked: false,
      matched: false,
    });
    return null;
  }

  const customResult = checkPolicyRuleMatch(stripped, options.policy.rules);
  trace?.recordSegment({
    type: 'custom-rules-check',
    rulesChecked: options.policy.rules.length > 0,
    matched: !!customResult,
    reason: customResult?.reason,
  });
  if (customResult) {
    return blockResultFromMatch(customResult);
  }

  return null;
}

function analyzeShellStartupSources(
  tokens: readonly string[],
  envAssignments: ReadonlyMap<string, string>,
  effectiveCwd: string | null | undefined,
  options: InternalOptions,
  trace: CommandTraceContext | undefined,
  depth: number,
): AnalyzeBlockResult | null {
  const startup = extractShellStartupLoaderMetadata(tokens);
  if (startup.argvSource?.kind === 'absent') return dynamicShellSourceResult(trace);
  if (startup.argvSourceApplies && startup.argvSource) {
    const result = analyzeTrackedHeredocScript(
      startup.argvSource.value,
      effectiveCwd,
      envAssignments,
      options,
      trace,
      depth,
      true,
    );
    if (result) return result;
  }

  if (!startup.envSourceApplies || !startup.envName) return null;
  const envSource = envAssignments.get(startup.envName);
  if (!envSource) return null;
  return analyzeTrackedHeredocScript(
    envSource,
    effectiveCwd,
    envAssignments,
    options,
    trace,
    depth,
    true,
  );
}

function analyzeTrackedHeredocScript(
  source: string,
  effectiveCwd: string | null | undefined,
  envAssignments: ReadonlyMap<string, string>,
  options: InternalOptions,
  trace: CommandTraceContext | undefined,
  depth: number,
  failClosed = false,
): AnalyzeBlockResult | null {
  if (failClosed && /[$`*?[\]]/.test(source)) return dynamicShellSourceResult(trace);
  const path = resolveTrackedHeredocPath(
    source,
    effectiveCwd,
    options.environment.paths,
    options.budget,
  );
  const body = path ? options.literalHeredocFiles?.get(path) : undefined;
  if (body === undefined) return failClosed ? dynamicShellSourceResult(trace) : null;

  options.budget.charge('derivedTokens', 1);
  trace?.recordSegment({
    type: 'recurse',
    reason: 'heredoc-file',
    innerCommand: body,
    depth: depth + 1,
  });
  return options.analyzeNested(body, { effectiveCwd, envAssignments });
}

function unwrapTraceQuotes(command: string): string {
  const first = command[0];
  return command.length >= 2 && (first === '"' || first === "'") && command.at(-1) === first
    ? command.slice(1, -1)
    : command;
}

function recordCommandAnalyzerTrace(
  context: AnalyzerRuleContext,
  match: DestructiveCommandRuleMatch | null,
  relaxation: ReturnType<typeof analyzeGitDetailed>['relaxation'],
): void {
  const rule = {
    git: 'git:analyzeGitMatch',
    rm: 'analyzer/rm.ts:analyzeRmMatch',
    find: 'analyzer/find.ts:analyzeFindMatch',
    xargs: 'analyzer/xargs.ts:analyzeXargs',
    parallel: 'analyzer/parallel.ts:analyzeParallel',
  }[context.head];
  if (!rule) return;
  context.options.trace?.recordSegment({
    type: 'rule-check',
    rule,
    matched: !!match || !!relaxation,
    reason: match?.reason ?? relaxation?.originalReason,
  });
  if (relaxation) {
    context.options.trace?.recordSegment({
      type: 'worktree-relaxation',
      originalReason: relaxation.originalReason,
      gitCwd: relaxation.gitCwd,
    });
  }
}

function reserveWrapperNormalization(budget: { iterations: number }): void {
  if (budget.iterations >= LIMITS.wrapperPeelIterations.cap) {
    throw new AnalysisLimit('wrapperPeelIterations');
  }
  budget.iterations++;
}

function blockResultFromMatch(match: DestructiveCommandRuleMatch): AnalyzeBlockResult {
  return { reason: match.reason, ruleId: match.id || undefined, intent: match.intent };
}

function dynamicShellSourceResult(trace: CommandTraceContext | undefined): AnalyzeBlockResult {
  trace?.recordSegment({ type: 'error', message: REASON_DYNAMIC_SHELL_SOURCE });
  return blockResultFromMatch(dynamicShellSourceMatch());
}

function dynamicShellSourceMatch(): DestructiveCommandRuleMatch {
  return { id: '', reason: REASON_DYNAMIC_SHELL_SOURCE, intent: 'stop_and_explain' };
}

function isShellWrapperCommand(head: string, normalizedHead: string): boolean {
  // Dynamic shell variables stay unresolved; keep the basename fallback for explicit shell paths.
  return (
    SHELL_WRAPPERS.has(normalizedHead) ||
    head === '$SHELL' ||
    head === '${SHELL}' ||
    SHELL_WRAPPERS.has(getBasename(normalizedHead))
  );
}

function analyzeEmbeddedCommand(
  context: AnalyzerRuleContext,
  tokens: readonly string[],
  index: number,
): DestructiveCommandRuleMatch | null {
  const childCommands = normalizeChildCommands(tokens.slice(index), {
    environment: context.options.environment,
    cwd: context.cwd,
    envAssignments: context.envAssignments,
    policy: context.options.policy,
  });

  for (const childCommand of childCommands) {
    const result = analyzeNormalizedEmbeddedCommand(context, index, childCommand);
    if (result) return result;
  }

  return null;
}

function analyzeNormalizedEmbeddedCommand(
  context: AnalyzerRuleContext,
  index: number,
  childCommand: NormalizedChildCommand,
): DestructiveCommandRuleMatch | null {
  const token = childCommand.tokens[0];
  if (!token) {
    return null;
  }

  const cmd = normalizeCommandToken(token);
  if (isShellWrapperCommand(token, cmd)) {
    context.options.budget.charge('derivedTokens', context.words.length - index);
    const shellTokens = childCommand.tokens;
    if (isShellSyntaxCheck(shellTokens)) return null;
    const dashCArg = extractDashCArg(shellTokens);
    if (!dashCArg) {
      if (extractShellScriptOperandSource(textCommandWords(shellTokens)).kind === 'dynamic') {
        return dynamicShellSourceMatch();
      }
      return matchEmbeddedCustomRule(context, childCommand);
    }
    const result = context.options.analyzeNested(dashCArg, {
      effectiveCwd:
        childCommand.wrapperCwd === undefined ? context.effectiveCwd : childCommand.wrapperCwd,
      envAssignments: childCommand.envAssignments,
    });
    return result ? matchFromBlockResult(result) : matchEmbeddedCustomRule(context, childCommand);
  }

  const analyzer = findCommandAnalyzer(cmd);
  if (!analyzer || cmd === 'xargs' || cmd === 'parallel') {
    if (childCommand.wrappedByTransparent && context.options.policy.rules.length > 0) {
      context.options.budget.charge('derivedTokens', context.words.length - index);
    }
    return matchEmbeddedCustomRule(context, childCommand);
  }

  context.options.budget.charge('derivedTokens', context.words.length - index);
  const embeddedTokens = [cmd, ...childCommand.tokens.slice(1)];
  const embeddedContext: AnalyzerRuleContext = {
    ...context,
    words: textCommandWords(embeddedTokens),
    head: cmd,
    cwd: childCommand.cwd,
    originalCwd: childCommand.wrapperCwd === null ? undefined : context.originalCwd,
    envAssignments: childCommand.envAssignments,
    allowTmpdirVar: !isTmpdirOverriddenToNonTemp(
      childCommand.envAssignments,
      context.options.environment,
    ),
    effectiveCwd:
      childCommand.wrapperCwd === undefined ? context.effectiveCwd : childCommand.wrapperCwd,
    options: cmd === 'git' ? { ...context.options, worktreeMode: false } : context.options,
  };
  return analyzer(embeddedContext) ?? matchEmbeddedCustomRule(context, childCommand);
}

function matchEmbeddedCustomRule(
  context: AnalyzerRuleContext,
  childCommand: NormalizedChildCommand,
): DestructiveCommandRuleMatch | null {
  return childCommand.wrappedByTransparent
    ? checkPolicyRuleMatch(childCommand.tokens, context.options.policy.rules)
    : null;
}

function filterBuiltInCommandMatch(
  match: DestructiveCommandRuleMatch | null,
  policy: CommandAnalysisPolicy,
): DestructiveCommandRuleMatch | null {
  // Raw-text matches reaching this path are minted unfiltered on purpose (recognizable destructive
  // text must stay denied in every configuration); nested analyses filter theirs before returning.
  return match?.id.startsWith('custom.') || match?.id === 'raw-text.dangerous-command'
    ? match
    : filterDestructiveCommandMatch(match, policy);
}

const CWD_CHANGE_REGEX =
  /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;
const POWERSHELL_LOCATION_COMMANDS = new Set([
  'cd',
  'chdir',
  'pop-location',
  'popd',
  'push-location',
  'pushd',
  'set-location',
  'sl',
]);
type PowerShellLocationEffect =
  | { kind: 'none' }
  | { kind: 'unknown' }
  | { kind: 'target'; target: string };

function posixSegmentChangesCwd(
  segment: readonly string[],
  environment: EnvironmentContext,
): boolean {
  const unwrapped = getCwdChangeTokens(segment, environment);
  if (unwrapped.length === 0) return false;
  const head = unwrapped[getCdCommandIndex(unwrapped)];
  if (head === 'cd' || head === 'pushd' || head === 'popd') return true;
  return CWD_CHANGE_REGEX.test(segment.join(' '));
}

export function resolveCwdAfterCommandView(
  commandView: Pick<CommandView, 'dialect' | 'words'>,
  cwd: string | null | undefined,
  environment: EnvironmentContext,
  literalPipelineInput?: string,
): string | null | undefined {
  if (commandView.dialect === 'powershell') {
    const effect = getPowerShellLocationEffect(commandView.words, literalPipelineInput);
    if (effect.kind === 'none') return undefined;
    if (!cwd || effect.kind === 'unknown') return null;
    return resolveKnownCwdTarget(
      normalizePowerShellLocationTarget(effect.target),
      cwd,
      environment.paths,
    );
  }

  const segment = commandView.words.map(analysisWordText);
  if (!posixSegmentChangesCwd(segment, environment)) return undefined;
  if (!cwd) return null;

  const unwrapped = getCwdChangeTokens(segment, environment, cwd);
  const cdIndex = getCdCommandIndex(unwrapped);
  if (cdIndex === -1 || unwrapped[cdIndex] !== 'cd') {
    return null;
  }

  return resolveKnownCwdTarget(unwrapped[cdIndex + 1], cwd, environment.paths);
}

function resolveKnownCwdTarget(
  target: string | undefined,
  cwd: string,
  paths: PathResolver,
): string | null {
  if (!target || target === '-' || target.includes('$') || target.includes('`')) {
    return null;
  }

  try {
    return samePath(resolveChdirTarget(cwd, target, paths), cwd, paths) ? cwd : null;
  } catch {
    return null;
  }
}

function getPowerShellLocationEffect(
  words: readonly CommandWord[],
  literalPipelineInput: string | undefined,
): PowerShellLocationEffect {
  const commandIndex = isBarePowerShellCallOperator(words[0]) ? 1 : 0;
  const commandWord = words[commandIndex];
  if (!isStaticPowerShellCommandWord(commandWord, commandIndex === 1)) return { kind: 'none' };

  const command = commandWord.text.toLowerCase();
  const bareCommand = command.split(/[\\/]/).pop() ?? command;
  if (!POWERSHELL_LOCATION_COMMANDS.has(bareCommand)) return { kind: 'none' };
  if (command !== bareCommand || bareCommand === 'pop-location' || bareCommand === 'popd') {
    return { kind: 'unknown' };
  }
  return getPowerShellLocationArgumentEffect(words.slice(commandIndex + 1), literalPipelineInput);
}

function isBarePowerShellCallOperator(word: CommandWord | undefined): boolean {
  return (
    word?.provenance === 'literal' &&
    !word.quoted &&
    word.raw === word.text &&
    (word.text === '&' || word.text === '.')
  );
}

function isStaticPowerShellCommandWord(
  word: CommandWord | undefined,
  invoked: boolean,
): word is CommandWord {
  return word?.provenance === 'literal' && (invoked || (!word.quoted && word.raw === word.text));
}

function getPowerShellLocationArgumentEffect(
  args: readonly CommandWord[],
  literalPipelineInput: string | undefined,
): PowerShellLocationEffect {
  let target: string | undefined;
  for (const word of args) {
    if (word.provenance !== 'literal' || target !== undefined) return { kind: 'unknown' };
    target = word.text;
  }
  if (target !== undefined) return { kind: 'target', target };
  return literalPipelineInput === undefined
    ? { kind: 'unknown' }
    : { kind: 'target', target: literalPipelineInput };
}

function normalizePowerShellLocationTarget(target: string): string | undefined {
  return target.includes('::') ? undefined : target.replaceAll('\\', '/');
}

function getCdCommandIndex(tokens: readonly string[]): number {
  let headIndex = 0;
  if (tokens[0] === 'builtin' && tokens.length > 1) {
    headIndex = 1;
  }
  if (tokens[headIndex] !== 'time') {
    return headIndex;
  }

  let i = headIndex + 1;
  while (tokens[i]?.startsWith('-')) {
    i++;
  }
  return i;
}

function getCwdChangeTokens(
  segment: readonly string[],
  environment: EnvironmentContext,
  cwd?: string | null,
): string[] {
  const stripped = stripLeadingGrouping(segment);
  return stripWrappers([...stripped], environment, cwd);
}

function samePath(a: string, b: string, paths: PathResolver): boolean {
  const resolvedA = paths.realpath(a);
  const resolvedB = paths.realpath(b);
  if (resolvedA === null || resolvedB === null) return normalize(a) === normalize(b);
  return normalize(resolvedA) === normalize(resolvedB);
}

function stripLeadingGrouping(tokens: readonly string[]): readonly string[] {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token !== '{' && token !== '(' && token !== '$(') break;
    i++;
  }
  return tokens.slice(i);
}
