import type { WorktreeFacts } from '@/core/git/worktree';
import type { DestructiveCommandRulePolicy } from '@/core/policy/effective-rules';
import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/rules/constants';
import { extractShortOpts } from '@/core/shell/tokens';
import type { EnvironmentContext } from '@/gate/analysis';
import { getGitEnvValue, hasConfigAffectingEnvAssignment, resolveGitConfigCount } from './env';
import { extractGitSubcommandAndRest, splitAtDoubleDash } from './parse';
import {
  CHECKOUT_SHORT_OPTS_WITH_VALUE,
  type GitRuleMatch,
  matchesGitLongOption,
  SWITCH_SHORT_OPTS_WITH_VALUE,
} from './rules';
import { getGitExecutionContext, hasGitContextEnvOverride } from './worktree';

export interface GitAnalyzeOptions {
  /** Process state the Git context resolution reads: the inherited environment and path facts. */
  environment: EnvironmentContext;
  cwd?: string;
  envAssignments?: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
  dynamicArguments?: boolean;
  policy?: DestructiveCommandRulePolicy;
}

export interface GitWorktreeRelaxation {
  originalReason: string;
  gitCwd: string;
}

export function getGitWorktreeRelaxationForMatch(
  tokens: readonly string[],
  match: GitRuleMatch,
  options: GitAnalyzeOptions,
): GitWorktreeRelaxation | null {
  if (
    !match.localDiscard ||
    !options.worktreeMode ||
    hasGitContextEnvOverride(options.environment.env, options.envAssignments)
  ) {
    return null;
  }

  const context = getGitExecutionContext(tokens, options.cwd, options.environment.paths);
  if (!context.gitCwd || context.hasExplicitGitContext) {
    return null;
  }

  // One seam call for what the shipped code read from disk in two places: null means the
  // directory is not a verified linked worktree, or its effective Git config could not be read,
  // and both of those refused the relaxation before.
  const facts = options.environment.worktreeFacts(context.gitCwd);
  if (!facts) {
    return null;
  }

  if (isNonRelaxableLocalDiscard(tokens, options, facts)) {
    return null;
  }

  return {
    originalReason: match.reason,
    gitCwd: context.gitCwd,
  };
}

function isNonRelaxableLocalDiscard(
  tokens: readonly string[],
  options: GitAnalyzeOptions,
  facts: WorktreeFacts,
): boolean {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  const normalizedSubcommand = subcommand?.toLowerCase();

  if (
    options.dynamicArguments ||
    hasDynamicGitArgument(rest) ||
    hasRecursiveSubmoduleConfig(tokens, options.environment.env, options.envAssignments, facts) ||
    hasRecurseSubmodulesOption(rest) ||
    isForcedBranchReset(normalizedSubcommand, rest)
  ) {
    return true;
  }

  return normalizedSubcommand === 'clean' && countCleanForceFlags(rest) > 1;
}

function hasDynamicGitArgument(tokens: readonly string[]): boolean {
  return tokens.some((token) => /[$*?[]/.test(token));
}

function isForcedBranchReset(subcommand: string | undefined, rest: readonly string[]): boolean {
  if (subcommand === 'checkout') {
    const { before } = splitAtDoubleDash(rest);
    const shortOpts = extractShortOpts(before, {
      shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE,
    });
    const hasForce =
      before.some((token) => matchesGitLongOption(token, '--force')) || shortOpts.has('-f');
    const hasBranchReset =
      shortOpts.has('-B') || before.some((token) => token === '-B' || token.startsWith('-B'));
    return hasForce && hasBranchReset;
  }

  if (subcommand === 'switch') {
    const { before } = splitAtDoubleDash(rest);
    const shortOpts = extractShortOpts(before, {
      shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE,
    });
    const hasForce =
      before.some((token) => matchesGitLongOption(token, '--force')) ||
      before.some((token) => matchesGitLongOption(token, '--discard-changes')) ||
      shortOpts.has('-f');
    const hasForceCreate =
      before.some(
        (token) => token === '-C' || token.startsWith('-C') || isForceCreateOption(token),
      ) || shortOpts.has('-C');
    return hasForce && hasForceCreate;
  }

  return false;
}

function isForceCreateOption(token: string): boolean {
  const optionName = token.split('=', 1)[0] ?? token;
  return (
    optionName === '--force-create' ||
    (optionName.length >= '--force-c'.length && '--force-create'.startsWith(optionName))
  );
}

function hasRecurseSubmodulesOption(tokens: readonly string[]): boolean {
  return tokens.some((token) => token.startsWith('--recurse-sub'));
}

function countCleanForceFlags(tokens: readonly string[]): number {
  let count = 0;

  for (const token of tokens) {
    if (token === '--force') {
      count++;
      continue;
    }
    if (token.startsWith('-') && !token.startsWith('--')) {
      for (const opt of token.slice(1)) {
        if (opt === 'f') {
          count++;
        }
      }
    }
  }

  return count;
}

/**
 * Whether `submodule.recurse` is on for this command: the command line wins over the
 * environment, which wins over the repository config the environment seam read. An override the
 * scan cannot resolve counts as on, so the relaxation fails closed.
 */
function hasRecursiveSubmoduleConfig(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments: ReadonlyMap<string, string> | undefined,
  facts: WorktreeFacts,
): boolean {
  const commandLineConfig = commandLineRecursiveSubmoduleConfig(tokens, env, envAssignments);
  if (commandLineConfig !== null) {
    return commandLineConfig;
  }
  const envConfig = envRecursiveSubmoduleConfig(env, envAssignments);
  if (envConfig !== null) {
    return envConfig;
  }
  if (hasConfigAffectingEnvAssignment(envAssignments)) {
    return true;
  }
  return facts.recursiveSubmodules;
}

function commandLineRecursiveSubmoduleConfig(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean | null {
  let recursiveSubmoduleConfig: boolean | null = null;
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token === '--') {
      return recursiveSubmoduleConfig;
    }
    if (!token.startsWith('-')) {
      return recursiveSubmoduleConfig;
    }

    if (token === '-c') {
      const configValue = recursiveSubmoduleConfigValue(tokens[i + 1]);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-c') && token.length > 2) {
      const configValue = recursiveSubmoduleConfigValue(token.slice(2));
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }

    if (token === '--config-env') {
      const configValue = recursiveSubmoduleConfigEnvValue(tokens[i + 1], env, envAssignments);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('--config-env=')) {
      const configValue = recursiveSubmoduleConfigEnvValue(
        token.slice('--config-env='.length),
        env,
        envAssignments,
      );
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }

    i += GIT_GLOBAL_OPTS_WITH_VALUE.has(token) ? 2 : 1;
  }
  return recursiveSubmoduleConfig;
}

function envRecursiveSubmoduleConfig(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean | null {
  if (getGitEnvValue('GIT_CONFIG_PARAMETERS', env, envAssignments) !== undefined) {
    return true;
  }

  const resolution = resolveGitConfigCount(env, envAssignments);
  if (resolution.state === 'absent') {
    return null;
  }
  if (resolution.state === 'invalid') {
    return true;
  }

  let recursiveSubmoduleConfig: boolean | null = null;
  for (let i = 0; i < resolution.count; i++) {
    const rawKey = getGitEnvValue(`GIT_CONFIG_KEY_${i}`, env, envAssignments);
    const value = getGitEnvValue(`GIT_CONFIG_VALUE_${i}`, env, envAssignments);
    if (!rawKey?.trim() || value === undefined) {
      return true;
    }
    const key = rawKey.trim().toLowerCase();
    if (isIncludeConfigKey(key)) {
      return true;
    }
    if (key !== 'submodule.recurse') {
      continue;
    }
    recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
  }

  return recursiveSubmoduleConfig;
}

function recursiveSubmoduleConfigValue(config: string | undefined): boolean | null {
  if (!config) {
    return null;
  }
  const eqIdx = config.indexOf('=');
  const key = (eqIdx === -1 ? config : config.slice(0, eqIdx)).toLowerCase();
  if (isIncludeConfigKey(key)) {
    return true;
  }
  if (key !== 'submodule.recurse') {
    return null;
  }
  const value = eqIdx === -1 ? 'true' : config.slice(eqIdx + 1).toLowerCase();
  return gitConfigValueEnablesRecursiveSubmodules(value);
}

function recursiveSubmoduleConfigEnvValue(
  configEnv: string | undefined,
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean | null {
  const eqIdx = configEnv?.indexOf('=') ?? -1;
  if (!configEnv || eqIdx === -1) {
    return null;
  }
  const key = configEnv.slice(0, eqIdx).toLowerCase();
  if (isIncludeConfigKey(key)) {
    return true;
  }
  if (key !== 'submodule.recurse') {
    return null;
  }
  const value = getGitEnvValue(configEnv.slice(eqIdx + 1), env, envAssignments);
  return value === undefined || gitConfigValueEnablesRecursiveSubmodules(value);
}

function gitConfigValueEnablesRecursiveSubmodules(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return (
    normalizedValue !== 'false' &&
    normalizedValue !== 'no' &&
    normalizedValue !== 'off' &&
    normalizedValue !== '0'
  );
}

function isIncludeConfigKey(key: string): boolean {
  return key === 'include.path' || (key.startsWith('includeif.') && key.endsWith('.path'));
}
