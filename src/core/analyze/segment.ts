import { DISPLAY_COMMANDS } from '@/core/analyze/constants';
import { analyzeFind } from '@/core/analyze/find';
import { containsDangerousCode, extractInterpreterCodeArg } from '@/core/analyze/interpreters';
import { analyzeParallel } from '@/core/analyze/parallel';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { isTmpdirOverriddenToNonTemp } from '@/core/analyze/tmpdir';
import { analyzeXargs } from '@/core/analyze/xargs';
import { checkCustomRules } from '@/core/rules-custom';
import { analyzeGit } from '@/core/rules-git';
import { analyzeRm, isHomeDirectory } from '@/core/rules-rm';
import {
  getBasename,
  normalizeCommandToken,
  stripEnvAssignmentsWithInfo,
  stripWrappers,
  stripWrappersWithInfo,
} from '@/core/shell';
import {
  type AnalyzeOptions,
  type Config,
  INTERPRETERS,
  PARANOID_INTERPRETERS_SUFFIX,
  SHELL_WRAPPERS,
} from '@/types';

export const REASON_INTERPRETER_DANGEROUS =
  'Detected potentially dangerous command in interpreter code.';
export const REASON_INTERPRETER_BLOCKED = 'Interpreter one-liners are blocked in paranoid mode.';
const REASON_RM_HOME_CWD =
  'rm -rf in home directory is dangerous. Change to a project directory first.';

export type InternalOptions = AnalyzeOptions & {
  config: Config;
  effectiveCwd: string | null | undefined;
  analyzeNested: (command: string) => string | null;
};

function deriveCwdContext(options: Pick<InternalOptions, 'cwd' | 'effectiveCwd'>): {
  cwdUnknown: boolean;
  cwdForRm: string | undefined;
  originalCwd: string | undefined;
} {
  const cwdUnknown = options.effectiveCwd === null;
  const cwdForRm = cwdUnknown ? undefined : (options.effectiveCwd ?? options.cwd);
  const originalCwd = cwdUnknown ? undefined : options.cwd;
  return { cwdUnknown, cwdForRm, originalCwd };
}

export function analyzeSegment(
  tokens: string[],
  depth: number,
  options: InternalOptions,
): string | null {
  if (tokens.length === 0) {
    return null;
  }

  const { tokens: strippedEnv, envAssignments: leadingEnvAssignments } =
    stripEnvAssignmentsWithInfo(tokens);
  const { tokens: stripped, envAssignments: wrapperEnvAssignments } =
    stripWrappersWithInfo(strippedEnv);

  const envAssignments = new Map(leadingEnvAssignments);
  for (const [k, v] of wrapperEnvAssignments) {
    envAssignments.set(k, v);
  }

  if (stripped.length === 0) {
    return null;
  }

  const head = stripped[0];
  if (!head) {
    return null;
  }

  const normalizedHead = normalizeCommandToken(head);
  const basename = getBasename(head);
  const { cwdForRm, originalCwd } = deriveCwdContext(options);
  const allowTmpdirVar = !isTmpdirOverriddenToNonTemp(envAssignments);

  if (SHELL_WRAPPERS.has(normalizedHead)) {
    const dashCArg = extractDashCArg(stripped);
    if (dashCArg) {
      return options.analyzeNested(dashCArg);
    }
  }

  if (INTERPRETERS.has(normalizedHead)) {
    const codeArg = extractInterpreterCodeArg(stripped);
    if (codeArg) {
      if (options.paranoidInterpreters) {
        return REASON_INTERPRETER_BLOCKED + PARANOID_INTERPRETERS_SUFFIX;
      }

      const innerReason = options.analyzeNested(codeArg);
      if (innerReason) {
        return innerReason;
      }

      if (containsDangerousCode(codeArg)) {
        return REASON_INTERPRETER_DANGEROUS;
      }
    }
  }

  if (normalizedHead === 'busybox' && stripped.length > 1) {
    return analyzeSegment(stripped.slice(1), depth, options);
  }

  const isGit = basename.toLowerCase() === 'git';
  const isRm = basename === 'rm';
  const isFind = basename === 'find';
  const isXargs = basename === 'xargs';
  const isParallel = basename === 'parallel';

  if (isGit) {
    const gitResult = analyzeGit(stripped);
    if (gitResult) {
      return gitResult;
    }
  }

  if (isRm) {
    if (cwdForRm && isHomeDirectory(cwdForRm)) {
      if (hasRecursiveForceFlags(stripped)) {
        return REASON_RM_HOME_CWD;
      }
    }
    const rmResult = analyzeRm(stripped, {
      cwd: cwdForRm,
      originalCwd,
      paranoid: options.paranoidRm,
      allowTmpdirVar,
    });
    if (rmResult) {
      return rmResult;
    }
  }

  if (isFind) {
    const findResult = analyzeFind(stripped);
    if (findResult) {
      return findResult;
    }
  }

  if (isXargs) {
    const xargsResult = analyzeXargs(stripped, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar,
    });
    if (xargsResult) {
      return xargsResult;
    }
  }

  if (isParallel) {
    const parallelResult = analyzeParallel(stripped, {
      cwd: cwdForRm,
      originalCwd,
      paranoidRm: options.paranoidRm,
      allowTmpdirVar,
      analyzeNested: options.analyzeNested,
    });
    if (parallelResult) {
      return parallelResult;
    }
  }

  const matchedKnown = isGit || isRm || isFind || isXargs || isParallel;

  if (!matchedKnown) {
    // Fallback: scan tokens for embedded git/rm/find commands
    // This catches cases like "command -px git reset --hard" where the head
    // token is not a known command but contains dangerous commands later
    // Skip for display-only commands that don't execute their arguments
    if (!DISPLAY_COMMANDS.has(normalizedHead)) {
      for (let i = 1; i < stripped.length; i++) {
        const token = stripped[i];
        if (!token) continue;

        const cmd = normalizeCommandToken(token);
        if (cmd === 'rm') {
          const rmTokens = ['rm', ...stripped.slice(i + 1)];
          const reason = analyzeRm(rmTokens, {
            cwd: cwdForRm,
            originalCwd,
            paranoid: options.paranoidRm,
            allowTmpdirVar,
          });
          if (reason) {
            return reason;
          }
        }
        if (cmd === 'git') {
          const gitTokens = ['git', ...stripped.slice(i + 1)];
          const reason = analyzeGit(gitTokens);
          if (reason) {
            return reason;
          }
        }
        if (cmd === 'find') {
          const findTokens = ['find', ...stripped.slice(i + 1)];
          const reason = analyzeFind(findTokens);
          if (reason) {
            return reason;
          }
        }
      }
    }
  }

  const customRulesTopLevelOnly = isGit || isRm || isFind || isXargs || isParallel;
  if (depth === 0 || !customRulesTopLevelOnly) {
    const customResult = checkCustomRules(stripped, options.config.rules);
    if (customResult) {
      return customResult;
    }
  }

  return null;
}

const CWD_CHANGE_REGEX =
  /^\s*(?:\$\(\s*)?[({]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)/;

export function segmentChangesCwd(segment: readonly string[]): boolean {
  const stripped = stripLeadingGrouping(segment);
  const unwrapped = stripWrappers([...stripped]);

  if (unwrapped.length === 0) {
    return false;
  }

  let head = unwrapped[0] ?? '';
  if (head === 'builtin' && unwrapped.length > 1) {
    head = unwrapped[1] ?? '';
  }

  if (head === 'cd' || head === 'pushd' || head === 'popd') {
    return true;
  }

  const joined = segment.join(' ');
  return CWD_CHANGE_REGEX.test(joined);
}

function stripLeadingGrouping(tokens: readonly string[]): readonly string[] {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '{' || token === '(' || token === '$(') {
      i++;
    } else {
      break;
    }
  }
  return tokens.slice(i);
}
