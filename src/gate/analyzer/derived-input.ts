import {
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/policy/effective-rules';
import type { CommandAnalysisPolicy } from '@/core/policy/types';
import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/rules/constants';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import { type CommandView, type CommandWord, isDynamicExecutable } from '@/core/shell/model';
import { normalizeCommandToken } from '@/core/shell/tokens';
import type { DestructiveCommandRuleMatch, EnvironmentContext } from '@/gate/analysis';
import {
  analysisWordText,
  analyzedViewWords,
  isLiteralExecutionSourceWord,
  textCommandWords,
} from './command-words';
import { getFindPrimaryArity, isFindExecPrimary } from './find';
import { analyzeGitMatch } from './git';
import { GIT_RULE_SUBCOMMANDS } from './git/rules';
import { extractParallelChildStart, REASON_PARALLEL_RM, REASON_PARALLEL_SHELL } from './parallel';
import { hasRecursiveForceFlags } from './rm-flags';
import { stripWrapperWords } from './wrapper-prelude';
import { extractXargsChildCommandWithInfo, REASON_XARGS_RM, REASON_XARGS_SHELL } from './xargs';

const REASON_DYNAMIC_EXECUTABLE =
  'dynamic command name contains shell substitution output and cannot be verified safely. Use a literal executable name.';
const REASON_DYNAMIC_STRUCTURE =
  'shell substitution output can change guarded command structure and cannot be verified safely. Use literal subcommands and options.';
/** Whether any part of the word is substitution output, so its text is unknown. */
function hasCommandSubstitutionPart(word: CommandWord | undefined): boolean {
  return word?.parts.some((part) => part.provenance === 'command-substitution') ?? false;
}

/** Whether the word starts a literal option, so substitution output can extend it. */
function hasOptionLiteralPart(word: CommandWord | undefined): boolean {
  return (
    word?.parts.some(
      (part) => part.provenance === 'literal' && part.raw.replace(/^["']/, '').startsWith('-'),
    ) ?? false
  );
}

export function analyzeDynamicCommandStructure(
  dialect: CommandView['dialect'],
  words: readonly CommandWord[],
  environment: EnvironmentContext,
  topLevel: boolean,
  strict = false,
  policy?: CommandAnalysisPolicy,
): DestructiveCommandRuleMatch | null {
  // A variable executable name is only judged here for the command as written: derived
  // commands reach this path as reconstructed words their own carriers already fail closed on.
  const dynamicHead =
    isDynamicExecutable(dialect, words) ||
    (topLevel && dialect !== 'powershell' && words[0]?.provenance === 'variable');
  const dynamicExecutableMatch =
    dynamicHead && destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-executable', strict)
      ? destructiveCommandMatch('shell.dynamic-executable', REASON_DYNAMIC_EXECUTABLE)
      : null;
  return (
    filterDestructiveCommandMatch(dynamicExecutableMatch, policy) ??
    analyzeDynamicStructure(dialect, words, environment, strict, policy)
  );
}

function analyzeDynamicStructure(
  dialect: CommandView['dialect'],
  words: readonly CommandWord[],
  environment: EnvironmentContext,
  strict: boolean,
  policy?: CommandAnalysisPolicy,
): DestructiveCommandRuleMatch | null {
  if (words.length < 2) return null;
  const dynamicIndexes = words.flatMap((word, index) =>
    hasCommandSubstitutionPart(word) ? [index] : [],
  );
  if (dynamicIndexes.length === 0) return null;

  const head = normalizeCommandToken(words[0]?.text ?? '');
  if (head === 'git') {
    const gitWords = analyzedViewWords(dialect, words);
    const subcommandIndex = findGitSubcommandIndex(gitWords);
    if (
      destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      dynamicIndexes.some((index) => index <= subcommandIndex)
    ) {
      return filterDestructiveCommandMatch(
        destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
        policy,
      );
    }
    if (filterDestructiveCommandMatch(analyzeGitMatch(gitWords, { environment }), policy))
      return null;
    const subcommand = words[subcommandIndex]?.text.toLowerCase();
    const dataBoundary = gitWords.findIndex(
      (word, index) => index > subcommandIndex && analysisWordText(word) === '--',
    );
    if (
      destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      subcommand &&
      GIT_RULE_SUBCOMMANDS.has(subcommand) &&
      dynamicIndexes.some(
        (index) => index > subcommandIndex && (dataBoundary === -1 || index < dataBoundary),
      )
    ) {
      return filterDestructiveCommandMatch(
        destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
        policy,
      );
    }
    return null;
  }

  if (head === 'find') {
    return destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      hasDynamicFindStructure(words)
      ? filterDestructiveCommandMatch(
          destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
          policy,
        )
      : null;
  }

  if (head === 'rm') {
    const dataBoundary = words.findIndex(
      (word, index) => index > 0 && analysisWordText(word) === '--',
    );
    // A trailing substitution is left to the rm rules only when literal recursive+force flags
    // make rm.recursive-force-dynamic-target judge it; any other substitution output before a
    // literal `--` can inject options.
    const trailingJudgedByRmRules = hasRecursiveForceFlags(words.map(analysisWordText));
    return destructiveCommandRuleIsEnabled(policy, 'shell.dynamic-structure', strict) &&
      dynamicIndexes.some(
        (index) =>
          (dataBoundary === -1 || index < dataBoundary) &&
          (index < words.length - 1 || !trailingJudgedByRmRules),
      )
      ? filterDestructiveCommandMatch(
          destructiveCommandMatch('shell.dynamic-structure', REASON_DYNAMIC_STRUCTURE),
          policy,
        )
      : null;
  }

  if (head === 'xargs') {
    return analyzeDynamicChildStructure(
      dialect,
      words.slice(extractXargsChildCommandWithInfo(words.map(analysisWordText)).childStart),
      'xargs',
      environment,
      strict,
      policy,
    );
  }
  if (head === 'parallel') {
    return analyzeDynamicChildStructure(
      dialect,
      words.slice(extractParallelChildStart(words.map(analysisWordText))),
      'parallel',
      environment,
      strict,
      policy,
    );
  }
  return null;
}

function analyzeDynamicChildStructure(
  dialect: CommandView['dialect'],
  childWords: readonly CommandWord[],
  kind: 'xargs' | 'parallel',
  environment: EnvironmentContext,
  strict: boolean,
  policy?: CommandAnalysisPolicy,
): DestructiveCommandRuleMatch | null {
  if (childWords.length === 0) return null;
  const child = normalizeChildCommandWords(childWords, environment);
  if (isDynamicExecutable(dialect, child)) {
    const match = filterDestructiveCommandMatch(
      destructiveCommandMatch(
        `${kind}.shell-dynamic`,
        kind === 'xargs' ? REASON_XARGS_SHELL : REASON_PARALLEL_SHELL,
      ),
      policy,
    );
    if (match) return match;
  }
  const nestedStructure = analyzeDynamicStructure(dialect, child, environment, strict, policy);
  if (nestedStructure) return nestedStructure;
  if (
    child[0]?.text === 'rm' &&
    child.slice(1).some((word) => hasCommandSubstitutionPart(word) && hasOptionLiteralPart(word))
  ) {
    return filterDestructiveCommandMatch(
      destructiveCommandMatch(
        `${kind}.rm-recursive-force-dynamic`,
        kind === 'xargs' ? REASON_XARGS_RM : REASON_PARALLEL_RM,
      ),
      policy,
    );
  }
  return null;
}

function normalizeChildCommandWords(
  words: readonly CommandWord[],
  environment: EnvironmentContext,
): readonly CommandWord[] {
  const stripped = stripWrapperWords(words, environment);
  const normalized = stripped.rewritten
    ? textCommandWords(stripped.words.map(analysisWordText))
    : stripped.words;
  const normalizedHead = normalized[0];
  return normalizedHead && analysisWordText(normalizedHead) === 'busybox'
    ? normalized.slice(1)
    : normalized;
}

function findGitSubcommandIndex(words: readonly CommandWord[]): number {
  let i = 1;
  while (i < words.length) {
    const word = words[i];
    const token = word ? analysisWordText(word) : '';
    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }
    if (token.startsWith('-')) {
      i++;
      continue;
    }
    return i;
  }
  return i;
}

/**
 * Whether substitution output can reach a position that changes what find traverses,
 * deletes or executes, rather than only a value the expression matches against.
 */
function hasDynamicFindStructure(words: readonly CommandWord[]): boolean {
  let expressionStarted = false;
  let valuesRemaining = 0;
  let childStart = false;
  let inChild = false;

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    const dynamic = hasCommandSubstitutionPart(word);

    if (valuesRemaining > 0) {
      valuesRemaining--;
      continue;
    }

    if (inChild) {
      if (word.text === ';' || word.text === '+') {
        inChild = false;
        expressionStarted = true;
        childStart = false;
        continue;
      }
      if (dynamic && (childStart || hasOptionLiteralPart(word))) return true;
      childStart = false;
      continue;
    }

    if (!expressionStarted && !word.text.startsWith('-')) {
      if (dynamic && (i > 1 || hasOptionLiteralPart(word))) return true;
      continue;
    }

    expressionStarted = true;
    if (dynamic) return true;
    const arity = getFindPrimaryArity(word.text);
    if (arity > 0) {
      valuesRemaining = arity;
      continue;
    }
    if (isFindExecPrimary(word.text)) {
      inChild = true;
      childStart = true;
    }
  }
  return false;
}

/**
 * Whether an executable source the head reads is not a literal, so derived input decides
 * what runs.
 */
export function hasDynamicExecutableSource(
  sources: readonly { tokenIndex: number; kind: string; value: string }[],
  words: readonly CommandWord[],
): boolean {
  return sources.some((source) => {
    if (source.value === '-' && (source.kind === 'main-script' || source.kind === 'program-file')) {
      return true;
    }
    return !isLiteralExecutionSourceWord(words[source.tokenIndex], source.value);
  });
}
