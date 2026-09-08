import { type Budget, createBudget } from '@/core/budget';
import {
  getEffectiveTmpdirValue,
  hasUnsafeTmpdirWordSplitting,
  isTmpdirOverriddenToNonTemp,
  isTmpdirValueTrusted,
} from '@/core/paths/tmpdir';
import {
  type DestructiveCommandRulePolicy,
  filterDestructiveCommandMatch,
} from '@/core/policy/effective-rules';
import type { EffectivePolicy } from '@/core/policy/types';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import type { CommandWord } from '@/core/shell/model';
import { getBasename } from '@/core/shell/tokens';
import type { AnalyzeNestedOverrides, EnvironmentContext } from '@/gate/analysis';
import {
  isProtectedGitHookNameSelection,
  REASON_GIT_METADATA_PROTECTION,
} from '@/gate/guards/git-metadata-protection';
import { analysisWordText, textCommandWords } from './command-words';
import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  deleteTargetWordFacts,
  isTrustedTempDescendantTarget,
  type RecursiveDeleteTargetTrustOptions,
} from './recursive-delete-targets';
import { hasRecursiveForceFlags } from './rm-flags';
import { stripWrappers, stripWrappersForPathScan } from './wrapper-prelude';

const REASON_FIND_DELETE = 'find -delete permanently removes files. Use -print first to preview.';
const REASON_FIND_EXEC_RM_RF = 'find -exec rm -rf is dangerous. Use explicit file list instead.';
const FIND_EXEC_PRIMARIES = new Set(['-exec', '-execdir', '-ok', '-okdir']);
const FIND_PRIMARY_ARITY = new Map<string, number>([
  ...[
    '-Bmin',
    '-Bnewer',
    '-Btime',
    '-amin',
    '-anewer',
    '-atime',
    '-cmin',
    '-cnewer',
    '-context',
    '-ctime',
    '-f',
    '-flags',
    '-fprint',
    '-fprint0',
    '-fls',
    '-fstype',
    '-gid',
    '-group',
    '-ilname',
    '-iname',
    '-inum',
    '-ipath',
    '-iwholename',
    '-iregex',
    '-links',
    '-lname',
    '-maxdepth',
    '-mindepth',
    '-mmin',
    '-mnewer',
    '-mtime',
    '-name',
    '-newer',
    '-newerXY',
    '-newermt',
    '-path',
    '-perm',
    '-printf',
    '-regex',
    '-samefile',
    '-size',
    '-type',
    '-uid',
    '-used',
    '-user',
    '-wholename',
    '-xattrname',
    '-xtype',
  ].map((primary) => [primary, 1] as const),
  ['-fprintf', 2],
]);

export interface AnalyzeFindContext extends RecursiveDeleteTargetTrustOptions {
  budget?: Budget;
  envAssignments?: ReadonlyMap<string, string>;
  policy?: DestructiveCommandRulePolicy &
    Partial<Pick<EffectivePolicy, 'destructiveCommandAllowPaths'>>;
  analyzeTokens?: (
    tokens: readonly string[],
    cwd: string | null | undefined,
  ) => DestructiveCommandRuleMatch | null;
  analyzeNested?: (
    command: string,
    overrides?: AnalyzeNestedOverrides,
  ) => DestructiveCommandRuleMatch | null;
}

export function analyzeFindMatch(
  words: readonly CommandWord[],
  context: AnalyzeFindContext,
): DestructiveCommandRuleMatch | null {
  // The primary/arity walk is textual; only the starting points read word facts.
  const tokens = words.map(analysisWordText);
  const catastrophicMatch = findCatastrophicDeleteMatch(words, tokens, context);
  if (catastrophicMatch) return catastrophicMatch;
  // Check for -delete outside of -exec/-execdir blocks
  if (findHasDelete(tokens, 1) && !hasOnlyTrustedTempDeleteTargets(words, tokens, context)) {
    const match = filterDestructiveCommandMatch(
      destructiveCommandMatch('find.delete', REASON_FIND_DELETE),
      context.policy,
    );
    if (match) return match;
  }

  const budget = context.budget ?? createBudget();
  // Check all executable child primaries for dangerous commands
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const arity = getFindPrimaryArity(token ?? '');
    if (arity > 0) {
      i += arity + 1;
      continue;
    }
    if (!isFindExecPrimary(token)) {
      i++;
      continue;
    }

    budget.charge('derivedTokens', tokens.length - i - 1);
    const execCommand = getFindExecCommand(tokens, i);
    i = execCommand.nextIndex;
    const directMatch = analyzeFindExecCommand(execCommand.tokens, context.environment);
    if (directMatch) {
      const match = filterDestructiveCommandMatch(directMatch, context.policy);
      if (match) return match;
    }

    const directoryRelative = token === '-execdir' || token === '-okdir';
    const nestedMatch = context.analyzeTokens
      ? context.analyzeTokens(execCommand.tokens, directoryRelative ? null : context.cwd)
      : context.analyzeNested
        ? context.analyzeNested(execCommand.tokens.join(' '), {
            effectiveCwd: directoryRelative ? undefined : context.cwd,
            envAssignments: context.envAssignments,
          })
        : null;
    const match = nestedMatch?.id.startsWith('custom.')
      ? nestedMatch
      : filterDestructiveCommandMatch(nestedMatch, context.policy);
    if (match) return match;
  }

  return null;
}

function findCatastrophicDeleteMatch(
  words: readonly CommandWord[],
  tokens: readonly string[],
  context: AnalyzeFindContext,
): DestructiveCommandRuleMatch | null {
  const deletesDirectly = findHasDelete(tokens, 1);
  if (!deletesDirectly && !findExecRmDeletesFoundPaths(tokens, context.environment)) return null;
  // An omitted starting point means find searches `.` implicitly.
  const targets = getFindStartingPoints(words) ?? textCommandWords(['.']);
  const targetContext = createRecursiveDeleteTargetContext({
    ...context,
    allowPaths: context.policy?.destructiveCommandAllowPaths,
    posixShell: true,
  });
  for (const target of targets) {
    const facts = deleteTargetWordFacts(target);
    for (const expandedTarget of facts.expandedTargets ?? [analysisWordText(target)]) {
      const classification = classifyRecursiveDeleteTarget(expandedTarget, targetContext, {
        targetIsLiteral: facts.expandedTargets !== undefined || facts.targetIsLiteral,
        tmpdirWordSplittingProtected: facts.tmpdirWordSplittingProtected,
      });
      // A find traversal that deletes found paths erases the starting tree's
      // contents even when each individual removal is non-recursive.
      if (classification.kind === 'root_or_home_target') {
        return destructiveCommandMatch(
          'rm.recursive-force-root-or-home',
          'rm -rf targeting root or home directory is extremely dangerous and always blocked.',
        );
      }
      if (classification.kind === 'git_metadata_target') {
        return destructiveCommandMatch('find.delete-git-metadata', REASON_GIT_METADATA_PROTECTION);
      }
    }
  }
  if (
    findSelectsHooksByName(tokens) &&
    targetContext.resolvedCwd &&
    isProtectedGitHookNameSelection(
      targets.map(analysisWordText),
      targetContext.resolvedCwd,
      targetContext.protectedGitMetadata,
      targetContext.environment,
      targetContext.budget,
    )
  ) {
    return destructiveCommandMatch('find.delete-git-metadata', REASON_GIT_METADATA_PROTECTION);
  }
  return null;
}

export function findExecRmDeletesFoundPaths(
  tokens: readonly string[],
  environment: EnvironmentContext,
): boolean {
  let index = 0;
  while (index < tokens.length) {
    if (!isFindExecPrimary(tokens[index])) {
      index++;
      continue;
    }
    const command = getFindExecCommand(tokens, index);
    const stripped = stripWrappersForPathScan([...command.tokens], environment);
    const head = getBasename(stripped[0] ?? '').toLowerCase();
    if ((head === 'rm' || head === 'rmdir') && stripped.some((token) => token.includes('{}'))) {
      return true;
    }
    index = command.nextIndex;
  }
  return false;
}

function findSelectsHooksByName(tokens: readonly string[]): boolean {
  return tokens.some((token, index) => {
    if (!['-name', '-iname'].includes(token)) return false;
    return tokens[index + 1]?.toLowerCase() === 'hooks';
  });
}

function hasOnlyTrustedTempDeleteTargets(
  words: readonly CommandWord[],
  tokens: readonly string[],
  context: AnalyzeFindContext,
): boolean {
  if (tokens.includes('-L') || tokens.includes('-f') || tokens.includes('-follow')) return false;
  const targets = getFindStartingPoints(words);
  if (!targets) return false;
  const envAssignments = context.envAssignments ?? new Map();
  const effectiveTmpdirValue = getEffectiveTmpdirValue(envAssignments, context.environment);
  const trustedTmpdirValue =
    context.trustedTmpdirValue ?? isTmpdirValueTrusted(envAssignments, context.environment);
  const allowTmpdirVar =
    context.allowTmpdirVar ?? !isTmpdirOverriddenToNonTemp(envAssignments, context.environment);
  const targetContext = createRecursiveDeleteTargetContext({
    environment: context.environment,
    protectedGitMetadata: context.protectedGitMetadata,
    cwd: context.cwd,
    originalCwd: context.originalCwd,
    strict: context.strict,
    allowTmpdirVar: allowTmpdirVar && trustedTmpdirValue && Boolean(effectiveTmpdirValue),
    allowPaths: context.policy?.destructiveCommandAllowPaths,
    posixShell: true,
    tmpdirWordSplittingUnsafe:
      context.tmpdirWordSplittingUnsafe ??
      hasUnsafeTmpdirWordSplitting(envAssignments, context.environment),
    trustedTmpdirValue,
    budget: context.budget,
  });

  return targets.every((target) => {
    const facts = deleteTargetWordFacts(target);
    if (facts.unsafeBraceExpansion) return false;
    return (facts.expandedTargets ?? [analysisWordText(target)]).every((expandedTarget) =>
      isTrustedTempDescendantTarget(expandedTarget, targetContext, {
        containmentTarget: expandTmpdirTarget(expandedTarget, effectiveTmpdirValue),
        targetIsLiteral: facts.expandedTargets !== undefined || facts.targetIsLiteral,
        tmpdirWordSplittingProtected: facts.tmpdirWordSplittingProtected,
      }),
    );
  });
}

function expandTmpdirTarget(target: string, tmpdirValue: string | undefined): string {
  if (!tmpdirValue) return target;
  return target.replace(/^(?:\$TMPDIR|\$\{TMPDIR\})/, () => tmpdirValue);
}

export function getFindStartingPoints(words: readonly CommandWord[]): CommandWord[] | null {
  const tokenAt = (index: number) => {
    const word = words[index];
    return word ? analysisWordText(word) : undefined;
  };
  let index = 1;
  while (tokenAt(index) === '-H' || tokenAt(index) === '-P') index++;
  if (tokenAt(index) === '--') index++;

  const targets: CommandWord[] = [];
  while (index < words.length) {
    const token = tokenAt(index);
    const word = words[index];
    if (!token || !word || token.startsWith('-') || ['!', '(', ')'].includes(token)) break;
    targets.push(word);
    index++;
  }
  return targets.length > 0 ? targets : null;
}

function analyzeFindExecCommand(
  tokens: readonly string[],
  environment: EnvironmentContext,
): DestructiveCommandRuleMatch | null {
  let execCommand = stripWrappers([...tokens], environment);
  if (execCommand.length === 0) {
    return null;
  }

  let head = getBasename(execCommand[0] ?? '');
  if (head === 'busybox' && execCommand.length > 1) {
    execCommand = execCommand.slice(1);
    head = getBasename(execCommand[0] ?? '');
  }

  if (head === 'rm' && hasRecursiveForceFlags(execCommand)) {
    return destructiveCommandMatch('find.exec-rm-recursive-force', REASON_FIND_EXEC_RM_RF);
  }

  return null;
}

export function getFindExecCommand(
  tokens: readonly string[],
  execIndex: number,
): { tokens: string[]; nextIndex: number } {
  let terminatorIndex = execIndex + 1;
  while (
    terminatorIndex < tokens.length &&
    tokens[terminatorIndex] !== ';' &&
    !(tokens[terminatorIndex] === '+' && tokens[terminatorIndex - 1] === '{}')
  ) {
    terminatorIndex++;
  }

  // If no terminator is present, the parser may have separated the token as an operator.
  // In that case, treat the rest of the tokens as the exec command.
  return {
    tokens: tokens.slice(execIndex + 1, terminatorIndex),
    nextIndex: Math.min(terminatorIndex + 1, tokens.length),
  };
}

/**
 * Check if find command has -delete action (not as argument to another option).
 * Handles cases like "find -name -delete" where -delete is a filename pattern.
 */
export function findHasDelete(tokens: readonly string[], start: number): boolean {
  let i = start;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }

    // Skip executable child-primary bodies, including arguments named like another primary.
    if (isFindExecPrimary(token)) {
      i = getFindExecCommand(tokens, i).nextIndex;
      continue;
    }

    // Options that take an argument - skip the next token
    const arity = getFindPrimaryArity(token);
    if (arity > 0) {
      i += arity + 1;
      continue;
    }

    // Found -delete outside of -exec and not as an argument
    if (token === '-delete') {
      return true;
    }

    i++;
  }

  return false;
}

export function getFindPrimaryArity(token: string): number {
  return FIND_PRIMARY_ARITY.get(token) ?? (/^-newer[A-Za-z]{2}$/.test(token) ? 1 : 0);
}

export function isFindExecPrimary(token: string | undefined): boolean {
  return token !== undefined && FIND_EXEC_PRIMARIES.has(token);
}
