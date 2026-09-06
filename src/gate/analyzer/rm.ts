import { normalizeMsysDrivePath } from '@/core/paths/canonicalization';
import {
  type DestructiveCommandRulePolicy,
  destructiveCommandRuleIsEnabled,
  filterDestructiveCommandMatch,
} from '@/core/policy/effective-rules';
import type { EffectivePolicy } from '@/core/policy/types';
import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import type { CommandWord } from '@/core/shell/model';
import {
  isProtectedGitDeleteTarget,
  REASON_GIT_METADATA_PROTECTION,
} from '@/gate/guards/git-metadata-protection';
import { analysisWordText } from './command-words';
import {
  classifyRecursiveDeleteTarget,
  createRecursiveDeleteTargetContext,
  deleteTargetWordFacts,
  type RecursiveDeleteTargetClassification,
  type RecursiveDeleteTargetClassificationOptions,
  type RecursiveDeleteTargetContext,
  type RecursiveDeleteTargetOptions,
} from './recursive-delete-targets';
import { hasRecursiveForceFlags, hasRecursiveOption } from './rm-flags';

const REASON_RM_RF =
  'rm -rf outside cwd is blocked. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_RM_RF_POLICY =
  'rm -rf for non-temporary paths is blocked by the active safety policy. Retry deleting only explicit paths inside the current directory; escalate for anything outside it.';
const REASON_RM_RF_DYNAMIC_TARGET =
  'rm -rf target contains shell variables that cannot be verified safely. Use literal paths within cwd, /tmp, /var/tmp, or $TMPDIR.';
const REASON_RM_RF_ROOT_HOME =
  'rm -rf targeting root or home directory is extremely dangerous and always blocked.';
const REASON_RM_HOME_CWD =
  'rm -rf in home directory is dangerous. Change to a project directory first.';

export interface AnalyzeRmOptions extends RecursiveDeleteTargetOptions {
  policy?: DestructiveCommandRulePolicy &
    Partial<Pick<EffectivePolicy, 'destructiveCommandAllowPaths'>>;
}

export function analyzeRmMatch(
  words: readonly CommandWord[],
  options: AnalyzeRmOptions,
): DestructiveCommandRuleMatch | null {
  const ctx = createRecursiveDeleteTargetContext({
    ...options,
    allowPaths: options.policy?.destructiveCommandAllowPaths,
    posixShell: true,
  });
  const flagTexts = words.map(analysisWordText);
  const recursiveForce = hasRecursiveForceFlags(flagTexts);
  const recursive = hasRecursiveOption(flagTexts);
  const targets = extractTargets(words);

  for (const target of targets) {
    const facts = deleteTargetWordFacts(target.word);
    if (recursiveForce && facts.unsafeBraceExpansion) {
      const match = filterDestructiveCommandMatch(
        reasonForClassification({ kind: 'outside_anchored_cwd' }, ctx, options.policy),
        options.policy,
      );
      if (match) return match;
      continue;
    }

    for (const expandedTarget of facts.expandedTargets ?? [target.text]) {
      const nativeTarget = normalizeMsysDrivePath(expandedTarget);
      const classificationOptions = {
        targetIsLiteral: facts.expandedTargets !== undefined || facts.targetIsLiteral,
        tmpdirWordSplittingProtected: facts.tmpdirWordSplittingProtected,
      };
      if (
        !recursive &&
        ctx.resolvedCwd &&
        isProtectedGitDeleteTarget(
          nativeTarget,
          ctx.resolvedCwd,
          ctx.protectedGitMetadata,
          recursive,
          ctx.environment,
          ctx.budget,
        )
      ) {
        return destructiveCommandMatch('rm.git-metadata', REASON_GIT_METADATA_PROTECTION);
      }
      if (recursive && !recursiveForce) {
        const classification = classifyRecursiveDeleteTarget(
          nativeTarget,
          ctx,
          classificationOptions,
        );
        if (classification.kind === 'root_or_home_target') {
          return destructiveCommandMatch('rm.recursive-force-root-or-home', REASON_RM_RF_ROOT_HOME);
        }
        if (classification.kind === 'git_metadata_target') {
          return destructiveCommandMatch('rm.git-metadata', REASON_GIT_METADATA_PROTECTION);
        }
        continue;
      }
      if (!recursiveForce) continue;
      for (const classification of orderedTargetClassifications(
        nativeTarget,
        ctx,
        classificationOptions,
      )) {
        const candidate = reasonForClassification(classification, ctx, options.policy);
        const match = filterDestructiveCommandMatch(candidate, options.policy);
        if (match) return match;
      }
    }
  }

  return null;
}

function orderedTargetClassifications(
  target: string,
  ctx: RecursiveDeleteTargetContext,
  options: RecursiveDeleteTargetClassificationOptions,
): RecursiveDeleteTargetClassification[] {
  const primary = classifyRecursiveDeleteTarget(target, ctx, options);
  if (primary.kind === 'cwd_self_target') {
    return [primary, classifyRecursiveDeleteTarget(target, ctx, { ...options, skipCwdSelf: true })];
  }
  if (primary.kind !== 'home_cwd_target') return [primary];

  const targetSpecific = classifyRecursiveDeleteTarget(target, ctx, {
    ...options,
    skipHomeCwd: true,
  });
  if (targetSpecific.kind !== 'cwd_self_target') return [primary, targetSpecific];
  return [
    primary,
    targetSpecific,
    classifyRecursiveDeleteTarget(target, ctx, {
      ...options,
      skipHomeCwd: true,
      skipCwdSelf: true,
    }),
  ];
}

function extractTargets(words: readonly CommandWord[]): { text: string; word: CommandWord }[] {
  const targets: { text: string; word: CommandWord }[] = [];
  let pastDoubleDash = false;

  for (const word of words.slice(1)) {
    const text = analysisWordText(word);
    if (!text) continue;

    if (text === '--') {
      pastDoubleDash = true;
      continue;
    }

    if (pastDoubleDash) {
      targets.push({ text, word });
      continue;
    }

    if (!text.startsWith('-')) {
      targets.push({ text, word });
    }
  }

  return targets;
}

function reasonForClassification(
  classification: RecursiveDeleteTargetClassification,
  ctx: RecursiveDeleteTargetContext,
  policy: AnalyzeRmOptions['policy'],
): DestructiveCommandRuleMatch | null {
  switch (classification.kind) {
    case 'root_or_home_target':
      return destructiveCommandMatch('rm.recursive-force-root-or-home', REASON_RM_RF_ROOT_HOME);
    case 'git_metadata_target':
      return destructiveCommandMatch('rm.git-metadata', REASON_GIT_METADATA_PROTECTION);
    case 'temp_target':
      return null;
    case 'dynamic_target':
      if (!destructiveCommandRuleIsEnabled(policy, 'rm.recursive-force-dynamic-target', ctx.strict))
        return null;
      return destructiveCommandMatch(
        'rm.recursive-force-dynamic-target',
        REASON_RM_RF_DYNAMIC_TARGET,
      );
    case 'home_cwd_target':
      return destructiveCommandMatch('rm.recursive-force-home-cwd', REASON_RM_HOME_CWD);
    case 'cwd_self_target':
      return destructiveCommandMatch('rm.recursive-force-cwd-self', REASON_RM_RF);
    case 'within_anchored_cwd':
      if (destructiveCommandRuleIsEnabled(policy, 'rm.recursive-force-paranoid', ctx.paranoid)) {
        return destructiveCommandMatch('rm.recursive-force-paranoid', REASON_RM_RF_POLICY);
      }
      return null;
    case 'outside_anchored_cwd':
      return destructiveCommandMatch('rm.recursive-force-outside-cwd', REASON_RM_RF);
  }
}
