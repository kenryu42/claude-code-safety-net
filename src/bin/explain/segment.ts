/**
 * Segment analysis logic for the explain command.
 * Handles recursive analysis of shell command segments.
 */

import {
  redactEnvAssignmentsInString,
  redactEnvAssignmentTokens,
  redactEnvVars,
} from '@/bin/explain/redact';
import { REASON_RECURSION_LIMIT } from '@/core/analyze/analyze-command';
import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import { dangerousInText } from '@/core/analyze/dangerous-text';
import { analyzeFind } from '@/core/analyze/find';
import { containsDangerousCode, extractInterpreterCodeArg } from '@/core/analyze/interpreters';
import { analyzeParallel } from '@/core/analyze/parallel';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import {
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
  segmentChangesCwd,
} from '@/core/analyze/segment';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';
import { analyzeXargs } from '@/core/analyze/xargs';
import { checkCustomRules } from '@/core/rules-custom';
import { analyzeGit } from '@/core/rules-git';
import { analyzeRm, isHomeDirectory } from '@/core/rules-rm';
import {
  normalizeCommandToken,
  splitShellCommands,
  stripEnvAssignmentsWithInfo,
  stripWrappersWithInfo,
} from '@/core/shell';
import type { AnalyzeOptions, TraceStep } from '@/types';
import {
  INTERPRETERS,
  MAX_RECURSION_DEPTH,
  PARANOID_INTERPRETERS_SUFFIX,
  SHELL_WRAPPERS,
} from '@/types';

export const REASON_STRICT_UNPARSEABLE =
  'Command could not be safely analyzed (strict mode). Verify manually.';

export interface SegmentResult {
  reason: string;
}

export function isUnparseableCommand(command: string, segments: string[][]): boolean {
  return (
    segments.length === 1 &&
    segments[0]?.length === 1 &&
    segments[0][0] === command &&
    command.includes(' ')
  );
}

function explainInnerSegments(
  innerCmd: string,
  depth: number,
  options: AnalyzeOptions,
  steps: TraceStep[],
): SegmentResult | null {
  // Check recursion depth BEFORE parsing - matches guard behavior in analyzeCommandInternal
  // This ensures unparseable nested commands at depth limit are blocked consistently
  if (depth + 1 >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: 'error',
      message: REASON_RECURSION_LIMIT,
    });
    return { reason: REASON_RECURSION_LIMIT };
  }

  const innerSegments = splitShellCommands(innerCmd);

  if (options.strict && isUnparseableCommand(innerCmd, innerSegments)) {
    steps.push({
      type: 'strict-unparseable',
      rawCommand: redactEnvAssignmentsInString(innerCmd),
      reason: REASON_STRICT_UNPARSEABLE,
    });
    return { reason: REASON_STRICT_UNPARSEABLE };
  }

  // Track effectiveCwd through nested segments (mirrors guard behavior)
  // Inherit unknown CWD state from caller (e.g., after cd/pushd in prior segment)
  // Preserve null (unknown CWD after cd/pushd) - only fall back to cwd when undefined
  let effectiveCwd: string | null | undefined =
    options.effectiveCwd === undefined ? options.cwd : options.effectiveCwd;

  for (const segment of innerSegments) {
    // Check for unparseable segment (single token with spaces) - matches guard behavior
    if (segment.length === 1 && segment[0]?.includes(' ')) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        steps.push({
          type: 'dangerous-text',
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason,
        });
        return { reason: textReason };
      }
      steps.push({
        type: 'dangerous-text',
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false,
      });
      if (segmentChangesCwd(segment)) {
        steps.push({
          type: 'cwd-change',
          segment: redactEnvAssignmentsInString(segment.join(' ')),
          effectiveCwdNowUnknown: true,
        });
        effectiveCwd = null;
      }
      continue;
    }

    const result = explainSegment(segment, depth + 1, { ...options, effectiveCwd }, steps);
    if (result) return result;

    if (segmentChangesCwd(segment)) {
      steps.push({
        type: 'cwd-change',
        segment: redactEnvAssignmentsInString(segment.join(' ')),
        effectiveCwdNowUnknown: true,
      });
      effectiveCwd = null;
    }
  }

  return null;
}

export function explainSegment(
  tokens: string[],
  depth: number,
  options: AnalyzeOptions,
  steps: TraceStep[],
): SegmentResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    steps.push({
      type: 'error',
      message: REASON_RECURSION_LIMIT,
    });
    return { reason: REASON_RECURSION_LIMIT };
  }

  const envResult = stripEnvAssignmentsWithInfo(tokens);
  if (envResult.envAssignments.size > 0) {
    steps.push({
      type: 'env-strip',
      input: redactEnvAssignmentTokens(tokens),
      envVars: redactEnvVars(envResult.envAssignments),
      output: envResult.tokens,
    });
  }

  const wrapperResult = stripWrappersWithInfo(envResult.tokens);
  const removed = envResult.tokens.slice(0, envResult.tokens.length - wrapperResult.tokens.length);
  if (removed.length > 0) {
    steps.push({
      type: 'leading-tokens-stripped',
      input: redactEnvAssignmentTokens(envResult.tokens),
      removed: redactEnvAssignmentTokens(removed),
      output: wrapperResult.tokens,
    });
  }

  const strippedTokens = wrapperResult.tokens;
  if (strippedTokens.length === 0) {
    return null;
  }

  const head = strippedTokens[0];
  if (!head) return null;

  // Derive baseName case-sensitively (matches guard behavior)
  // Only lowercase for git/wrappers/interpreters
  const baseName = head.split('/').pop() ?? head;
  const baseNameLower = baseName.toLowerCase();

  if (SHELL_WRAPPERS.has(baseNameLower)) {
    const innerCmd = extractDashCArg(strippedTokens);
    if (innerCmd) {
      const redactedInnerCmd = redactEnvAssignmentsInString(innerCmd);
      steps.push({
        type: 'shell-wrapper',
        wrapper: baseNameLower,
        innerCommand: redactedInnerCmd,
      });
      steps.push({
        type: 'recurse',
        reason: 'shell-wrapper',
        innerCommand: redactedInnerCmd,
        depth: depth + 1,
      });

      return explainInnerSegments(innerCmd, depth, options, steps);
    }
  }

  if (INTERPRETERS.has(baseNameLower)) {
    const codeArg = extractInterpreterCodeArg(strippedTokens);
    if (codeArg) {
      const paranoidBlocked = !!options.paranoidInterpreters;
      const redactedCodeArg = redactEnvAssignmentsInString(codeArg);
      steps.push({
        type: 'interpreter',
        interpreter: baseNameLower,
        codeArg: redactedCodeArg,
        paranoidBlocked,
      });

      if (paranoidBlocked) {
        return { reason: REASON_INTERPRETER_BLOCKED + PARANOID_INTERPRETERS_SUFFIX };
      }

      steps.push({
        type: 'recurse',
        reason: 'interpreter',
        innerCommand: redactedCodeArg,
        depth: depth + 1,
      });

      const nestedResult = explainInnerSegments(codeArg, depth, options, steps);
      if (nestedResult) return nestedResult;

      if (containsDangerousCode(codeArg)) {
        steps.push({
          type: 'dangerous-text',
          token: redactedCodeArg,
          matched: true,
          reason: REASON_INTERPRETER_DANGEROUS,
        });
        return { reason: REASON_INTERPRETER_DANGEROUS };
      }
      return null;
    }
  }

  if (baseNameLower === 'busybox' && strippedTokens.length > 1) {
    const subcommand = strippedTokens[1] ?? 'unknown';
    steps.push({
      type: 'busybox',
      subcommand,
    });
    const busyboxInnerCmd = strippedTokens.slice(1).join(' ');
    steps.push({
      type: 'recurse',
      reason: 'busybox',
      innerCommand: redactEnvAssignmentsInString(busyboxInnerCmd),
      depth: depth + 1,
    });
    return explainSegment(strippedTokens.slice(1), depth + 1, options, steps);
  }

  const envAssignments = new Map(envResult.envAssignments);
  for (const [k, v] of wrapperResult.envAssignments) {
    envAssignments.set(k, v);
  }
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);
  // Use command-scoped TMPDIR if set, otherwise fall back to process.env
  const tmpdirValue = envAssignments.get('TMPDIR') ?? process.env.TMPDIR ?? null;
  // Preserve null (unknown CWD after cd/pushd) - only fall back to cwd when undefined
  const effectiveCwd = options.effectiveCwd === undefined ? options.cwd : options.effectiveCwd;

  // Derive CWD context matching guard behavior: when CWD is unknown, both become undefined
  const cwdUnknown = effectiveCwd === null;
  const cwdForRm = cwdUnknown ? undefined : (effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;

  // git uses case-insensitive matching (matches guard: basename.toLowerCase() === 'git')
  // rm/find/xargs/parallel use case-sensitive matching (matches guard)
  const isGit = baseNameLower === 'git';
  const isRm = baseName === 'rm';
  const isFind = baseName === 'find';
  const isXargs = baseName === 'xargs';
  const isParallel = baseName === 'parallel';

  if (isRm || isXargs || isParallel) {
    steps.push({
      type: 'tmpdir-check',
      tmpdirValue,
      isOverriddenToNonTemp: !allowTmpdirVar,
      allowTmpdirVar,
    });
  }

  if (isGit) {
    const reason = analyzeGit(strippedTokens);
    steps.push({
      type: 'rule-check',
      ruleModule: 'rules-git.ts',
      ruleFunction: 'analyzeGit',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  if (isRm) {
    if (effectiveCwd && isHomeDirectory(effectiveCwd) && hasRecursiveForceFlags(strippedTokens)) {
      const reason = 'rm -rf in home directory is dangerous. Change to a project directory first.';
      steps.push({
        type: 'rule-check',
        ruleModule: 'rules-rm.ts',
        ruleFunction: 'isHomeDirectory',
        matched: true,
        reason,
      });
      return { reason };
    }
    const reason = analyzeRm(strippedTokens, {
      cwd: effectiveCwd ?? undefined,
      paranoid: options.paranoidRm,
      allowTmpdirVar,
    });
    steps.push({
      type: 'rule-check',
      ruleModule: 'rules-rm.ts',
      ruleFunction: 'analyzeRm',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  if (isFind) {
    const reason = analyzeFind(strippedTokens);
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/find.ts',
      ruleFunction: 'analyzeFind',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  if (isXargs) {
    const reason = analyzeXargs(strippedTokens, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar,
    });
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/xargs.ts',
      ruleFunction: 'analyzeXargs',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  if (isParallel) {
    const analyzeNested = (cmd: string): string | null => {
      const result = explainInnerSegments(cmd, depth, options, steps);
      return result?.reason ?? null;
    };
    const reason = analyzeParallel(strippedTokens, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar,
      analyzeNested,
    });
    steps.push({
      type: 'rule-check',
      ruleModule: 'analyze/parallel.ts',
      ruleFunction: 'analyzeParallel',
      matched: !!reason,
      reason: reason ?? undefined,
    });
    if (reason) return { reason };
  }

  const matchedKnown = isGit || isRm || isFind || isXargs || isParallel;
  const tokensScanned: string[] = [];
  let fallbackReason: string | null = null;
  let embeddedCommandFound: string | undefined;

  if (!matchedKnown && !DISPLAY_COMMANDS.has(normalizeCommandToken(head))) {
    for (let i = 1; i < strippedTokens.length && !fallbackReason; i++) {
      const token = strippedTokens[i];
      if (!token) continue;
      tokensScanned.push(token);

      const cmd = normalizeCommandToken(token);
      if (cmd === 'rm') {
        embeddedCommandFound = 'rm';
        const rmTokens = ['rm', ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeRm(rmTokens, {
          cwd: cwdForRm,
          originalCwd,
          paranoid: options.paranoidRm,
          allowTmpdirVar,
        });
      }
      if (!fallbackReason && cmd === 'git') {
        embeddedCommandFound = 'git';
        const gitTokens = ['git', ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeGit(gitTokens);
      }
      if (!fallbackReason && cmd === 'find') {
        embeddedCommandFound = 'find';
        const findTokens = ['find', ...strippedTokens.slice(i + 1)];
        fallbackReason = analyzeFind(findTokens);
      }
    }
  }
  steps.push({
    type: 'fallback-scan',
    tokensScanned,
    embeddedCommandFound,
  });
  if (fallbackReason) return { reason: fallbackReason };

  const shouldCheckCustomRules = depth === 0 || !matchedKnown;
  const hasRules = options.config?.rules && options.config.rules.length > 0;
  if (shouldCheckCustomRules && hasRules && options.config) {
    const customResult = checkCustomRules(strippedTokens, options.config.rules);
    steps.push({
      type: 'custom-rules-check',
      rulesChecked: true,
      matched: !!customResult,
      reason: customResult ?? undefined,
    });
    if (customResult) return { reason: customResult };
  } else {
    steps.push({
      type: 'custom-rules-check',
      rulesChecked: false,
      matched: false,
    });
  }

  return null;
}
