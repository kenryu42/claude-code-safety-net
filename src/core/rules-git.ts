import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { extractShortOpts, getBasename } from '@/core/shell';
import {
  GIT_CONFIG_AFFECTING_ENV_NAMES,
  GIT_GLOBAL_OPTS_WITH_VALUE,
  getGitExecutionContext,
  hasGitContextEnvOverride,
  isLinkedWorktree,
} from '@/core/worktree';

const REASON_CHECKOUT_DOUBLE_DASH =
  "git checkout -- discards uncommitted changes permanently. Use 'git stash' first.";
const REASON_CHECKOUT_FORCE =
  "git checkout --force discards uncommitted changes. Use 'git stash' first.";
const REASON_CHECKOUT_REF_PATH =
  "git checkout <ref> -- <path> overwrites working tree with ref version. Use 'git stash' first.";
const REASON_CHECKOUT_PATHSPEC_FROM_FILE =
  "git checkout --pathspec-from-file can overwrite multiple files. Use 'git stash' first.";
const REASON_CHECKOUT_AMBIGUOUS =
  "git checkout with multiple positional args may overwrite files. Use 'git switch' for branches or 'git restore' for files.";
const REASON_SWITCH_DISCARD_CHANGES =
  "git switch --discard-changes discards uncommitted changes. Use 'git stash' first.";
const REASON_SWITCH_FORCE =
  "git switch --force discards uncommitted changes. Use 'git stash' first.";
const REASON_RESTORE =
  "git restore discards uncommitted changes. Use 'git stash' first, or use --staged to only unstage.";
const REASON_RESTORE_WORKTREE =
  "git restore --worktree explicitly discards working tree changes. Use 'git stash' first.";
const REASON_RESET_HARD =
  "git reset --hard destroys all uncommitted changes permanently. Use 'git stash' first.";
const REASON_RESET_MERGE = "git reset --merge can lose uncommitted changes. Use 'git stash' first.";
const REASON_CLEAN =
  "git clean -f removes untracked files permanently. Use 'git clean -n' to preview first.";
const REASON_PUSH_FORCE =
  'git push --force destroys remote history. Use --force-with-lease for safer force push.';
const REASON_BRANCH_DELETE =
  'git branch -D force-deletes without merge check. Use -d for safe delete.';
const REASON_STASH_DROP =
  "git stash drop permanently deletes stashed changes. Consider 'git stash list' first.";
const REASON_STASH_CLEAR = 'git stash clear deletes ALL stashed changes permanently.';
const REASON_WORKTREE_REMOVE_FORCE =
  'git worktree remove --force can delete uncommitted changes. Remove --force flag.';

const CHECKOUT_OPTS_WITH_VALUE = new Set([
  '-b',
  '-B',
  '--orphan',
  '--conflict',
  '--inter-hunk-context',
  '--pathspec-from-file',
  '--unified',
]);

const CHECKOUT_OPTS_WITH_OPTIONAL_VALUE = new Set(['--recurse-submodules', '--track', '-t']);
const CHECKOUT_SHORT_OPTS_WITH_VALUE = new Set(['-b', '-B', '-U']);
const SWITCH_SHORT_OPTS_WITH_VALUE = new Set(['-c', '-C']);
const TRUSTED_GIT_BINARIES = [
  '/usr/bin/git',
  '/usr/local/bin/git',
  '/opt/homebrew/bin/git',
  'C:\\Program Files\\Git\\cmd\\git.exe',
  'C:\\Program Files\\Git\\bin\\git.exe',
] as const;

const CHECKOUT_KNOWN_OPTS_NO_VALUE = new Set([
  '-q',
  '--quiet',
  '--no-quiet',
  '-f',
  '--force',
  '--no-force',
  '-d',
  '--detach',
  '--no-detach',
  '-m',
  '--merge',
  '--no-merge',
  '-p',
  '--patch',
  '--no-patch',
  '--guess',
  '--no-guess',
  '--overlay',
  '--no-overlay',
  '--ours',
  '--theirs',
  '--ignore-skip-worktree-bits',
  '--no-ignore-skip-worktree-bits',
  '--no-track',
  '--overwrite-ignore',
  '--no-overwrite-ignore',
  '--ignore-other-worktrees',
  '--no-ignore-other-worktrees',
  '--progress',
  '--no-progress',
  '--pathspec-file-nul',
  '--no-pathspec-file-nul',
  '--no-recurse-submodules',
]);

function splitAtDoubleDash(tokens: readonly string[]): {
  index: number;
  before: readonly string[];
  after: readonly string[];
} {
  const index = tokens.indexOf('--');
  if (index === -1) {
    return { index: -1, before: tokens, after: [] };
  }
  return {
    index,
    before: tokens.slice(0, index),
    after: tokens.slice(index + 1),
  };
}

export interface GitAnalyzeOptions {
  cwd?: string;
  envAssignments?: ReadonlyMap<string, string>;
  worktreeMode?: boolean;
}

export interface GitWorktreeRelaxation {
  originalReason: string;
  gitCwd: string;
}

interface GitRuleMatch {
  reason: string;
  localDiscard: boolean;
}

export function analyzeGit(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): string | null {
  const match = analyzeGitRule(tokens);

  if (!match) {
    return null;
  }

  if (getGitWorktreeRelaxationForMatch(tokens, match, options)) {
    return null;
  }

  return match.reason;
}

export function getGitWorktreeRelaxation(
  tokens: readonly string[],
  options: GitAnalyzeOptions = {},
): GitWorktreeRelaxation | null {
  const match = analyzeGitRule(tokens);
  if (!match) {
    return null;
  }
  return getGitWorktreeRelaxationForMatch(tokens, match, options);
}

function analyzeGitRule(tokens: readonly string[]): GitRuleMatch | null {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);

  if (!subcommand) {
    return null;
  }

  switch (subcommand.toLowerCase()) {
    case 'checkout':
      return localDiscard(analyzeGitCheckout(rest));
    case 'switch':
      return localDiscard(analyzeGitSwitch(rest));
    case 'restore':
      return localDiscard(analyzeGitRestore(rest));
    case 'reset':
      return analyzeGitReset(rest);
    case 'clean':
      return localDiscard(analyzeGitClean(rest));
    case 'push':
      return sharedState(analyzeGitPush(rest));
    case 'branch':
      return sharedState(analyzeGitBranch(rest));
    case 'stash':
      return sharedState(analyzeGitStash(rest));
    case 'worktree':
      return sharedState(analyzeGitWorktree(rest));
    default:
      return null;
  }
}

function localDiscard(reason: string | null): GitRuleMatch | null {
  return reason ? { reason, localDiscard: true } : null;
}

function sharedState(reason: string | null): GitRuleMatch | null {
  return reason ? { reason, localDiscard: false } : null;
}

function getGitWorktreeRelaxationForMatch(
  tokens: readonly string[],
  match: GitRuleMatch,
  options: GitAnalyzeOptions,
): GitWorktreeRelaxation | null {
  if (
    !match.localDiscard ||
    !options.worktreeMode ||
    hasGitContextEnvOverride(options.envAssignments)
  ) {
    return null;
  }

  const context = getGitExecutionContext(tokens, options.cwd);
  if (!context.gitCwd || context.hasExplicitGitContext) {
    return null;
  }

  if (!isLinkedWorktree(context.gitCwd)) {
    return null;
  }

  if (isNonRelaxableLocalDiscard(tokens, options, context.gitCwd)) {
    return null;
  }

  return {
    originalReason: match.reason,
    gitCwd: context.gitCwd,
  };
}

function extractGitSubcommandAndRest(tokens: readonly string[]): {
  subcommand: string | null;
  rest: string[];
} {
  if (tokens.length === 0) {
    return { subcommand: null, rest: [] };
  }

  const firstToken = tokens[0];
  const command = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command !== 'git') {
    return { subcommand: null, rest: [] };
  }

  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return { subcommand: nextToken, rest: tokens.slice(i + 2) };
      }
      return { subcommand: null, rest: tokens.slice(i + 1) };
    }

    if (token.startsWith('-')) {
      if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith('-c') && token.length > 2) {
        i++;
      } else if (token.startsWith('-C') && token.length > 2) {
        i++;
      } else {
        i++;
      }
    } else {
      return { subcommand: token, rest: tokens.slice(i + 1) };
    }
  }

  return { subcommand: null, rest: [] };
}

function analyzeGitCheckout(tokens: readonly string[]): string | null {
  const { index: doubleDashIdx, before: beforeDash } = splitAtDoubleDash(tokens);
  const shortOpts = extractShortOpts(beforeDash, {
    shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE,
  });

  if (beforeDash.includes('--force') || shortOpts.has('-f')) {
    return REASON_CHECKOUT_FORCE;
  }

  for (const token of tokens) {
    if (token === '-b' || token === '-B' || token === '--orphan') {
      return null;
    }
    if (token === '--pathspec-from-file') {
      return REASON_CHECKOUT_PATHSPEC_FROM_FILE;
    }
    if (token.startsWith('--pathspec-from-file=')) {
      return REASON_CHECKOUT_PATHSPEC_FROM_FILE;
    }
  }

  if (doubleDashIdx !== -1) {
    const hasRefBeforeDash = beforeDash.some((t) => !t.startsWith('-'));

    if (hasRefBeforeDash) {
      return REASON_CHECKOUT_REF_PATH;
    }
    return REASON_CHECKOUT_DOUBLE_DASH;
  }

  const positionalArgs = getCheckoutPositionalArgs(tokens);
  if (positionalArgs.length >= 2) {
    return REASON_CHECKOUT_AMBIGUOUS;
  }

  return null;
}

function analyzeGitSwitch(tokens: readonly string[]): string | null {
  const { before } = splitAtDoubleDash(tokens);

  if (before.includes('--discard-changes')) {
    return REASON_SWITCH_DISCARD_CHANGES;
  }

  const shortOpts = extractShortOpts(before, {
    shortOptsWithValue: SWITCH_SHORT_OPTS_WITH_VALUE,
  });
  if (before.includes('--force') || shortOpts.has('-f')) {
    return REASON_SWITCH_FORCE;
  }

  return null;
}

function getCheckoutPositionalArgs(tokens: readonly string[]): string[] {
  const positional: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      break;
    }

    if (token.startsWith('-')) {
      if (CHECKOUT_OPTS_WITH_VALUE.has(token)) {
        i += 2;
      } else if (token.startsWith('--') && token.includes('=')) {
        i++;
      } else if (CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)) {
        const nextToken = tokens[i + 1];
        if (
          nextToken &&
          !nextToken.startsWith('-') &&
          (token === '--recurse-submodules' || token === '--track' || token === '-t')
        ) {
          const validModes =
            token === '--recurse-submodules' ? ['checkout', 'on-demand'] : ['direct', 'inherit'];
          if (validModes.includes(nextToken)) {
            i += 2;
          } else {
            i++;
          }
        } else {
          i++;
        }
      } else if (
        token.startsWith('--') &&
        !CHECKOUT_KNOWN_OPTS_NO_VALUE.has(token) &&
        !CHECKOUT_OPTS_WITH_VALUE.has(token) &&
        !CHECKOUT_OPTS_WITH_OPTIONAL_VALUE.has(token)
      ) {
        // Fail safe: unknown checkout long options must not hide the next token
        // from ambiguous ref/path detection.
        i++;
      } else {
        i++;
      }
    } else {
      positional.push(token);
      i++;
    }
  }

  return positional;
}

function analyzeGitRestore(tokens: readonly string[]): string | null {
  let hasStaged = false;
  for (const token of tokens) {
    if (token === '--help' || token === '--version') {
      return null;
    }
    // --worktree explicitly discards working tree changes, even with --staged
    if (token === '--worktree' || token === '-W') {
      return REASON_RESTORE_WORKTREE;
    }
    if (token === '--staged' || token === '-S') {
      hasStaged = true;
    }
  }
  // Only safe if --staged is present (and --worktree is not)
  return hasStaged ? null : REASON_RESTORE;
}

function analyzeGitReset(tokens: readonly string[]): GitRuleMatch | null {
  let reason: string | null = null;

  for (const token of tokens) {
    if (token === '--hard') {
      reason = REASON_RESET_HARD;
      break;
    }
    if (token === '--merge') {
      reason = REASON_RESET_MERGE;
      break;
    }
  }

  if (!reason) {
    return null;
  }

  return resetHasRef(tokens) ? sharedState(reason) : localDiscard(reason);
}

function resetHasRef(tokens: readonly string[]): boolean {
  for (const token of tokens) {
    if (token === '--') {
      return false;
    }
    if (!token.startsWith('-')) {
      return true;
    }
  }
  return false;
}

function analyzeGitClean(tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if (token === '-n' || token === '--dry-run') {
      return null;
    }
  }

  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (tokens.includes('--force') || shortOpts.has('-f')) {
    return REASON_CLEAN;
  }

  return null;
}

function isNonRelaxableLocalDiscard(
  tokens: readonly string[],
  options: GitAnalyzeOptions,
  gitCwd: string,
): boolean {
  const { subcommand, rest } = extractGitSubcommandAndRest(tokens);
  const normalizedSubcommand = subcommand?.toLowerCase();

  if (
    hasDynamicGitArgument(rest) ||
    hasRecursiveSubmoduleConfig(tokens, options, gitCwd) ||
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

function hasRecursiveSubmoduleConfig(
  tokens: readonly string[],
  options: GitAnalyzeOptions,
  gitCwd: string,
): boolean {
  const commandLineConfig = commandLineRecursiveSubmoduleConfig(tokens, options.envAssignments);
  if (commandLineConfig !== null) {
    return commandLineConfig;
  }
  const envConfig = envRecursiveSubmoduleConfig(options.envAssignments);
  if (envConfig !== null) {
    return envConfig;
  }
  if (hasConfigAffectingEnvAssignment(options.envAssignments)) {
    return true;
  }
  return effectiveGitConfigEnablesRecursiveSubmodules(gitCwd);
}

function commandLineRecursiveSubmoduleConfig(
  tokens: readonly string[],
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
      const configValue = recursiveSubmoduleConfigEnvValue(tokens[i + 1], envAssignments);
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i += 2;
      continue;
    }

    if (token.startsWith('--config-env=')) {
      const configValue = recursiveSubmoduleConfigEnvValue(
        token.slice('--config-env='.length),
        envAssignments,
      );
      if (configValue !== null) {
        recursiveSubmoduleConfig = configValue;
      }
      i++;
      continue;
    }

    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
    } else {
      i++;
    }
  }
  return recursiveSubmoduleConfig;
}

function envRecursiveSubmoduleConfig(envAssignments?: ReadonlyMap<string, string>): boolean | null {
  if (getEnvConfigValue('GIT_CONFIG_PARAMETERS', envAssignments) !== undefined) {
    return true;
  }

  const countValue = getEnvConfigValue('GIT_CONFIG_COUNT', envAssignments);
  if (countValue === undefined) {
    return null;
  }

  const count = Number.parseInt(countValue, 10);
  if (!Number.isInteger(count) || count < 0) {
    return true;
  }

  let recursiveSubmoduleConfig: boolean | null = null;
  for (let i = 0; i < count; i++) {
    const key = getEnvConfigValue(`GIT_CONFIG_KEY_${i}`, envAssignments);
    if (key?.toLowerCase() !== 'submodule.recurse') {
      continue;
    }
    const value = getEnvConfigValue(`GIT_CONFIG_VALUE_${i}`, envAssignments);
    recursiveSubmoduleConfig =
      value === undefined || gitConfigValueEnablesRecursiveSubmodules(value);
  }

  return recursiveSubmoduleConfig;
}

function hasConfigAffectingEnvAssignment(envAssignments?: ReadonlyMap<string, string>): boolean {
  if (!envAssignments) {
    return false;
  }
  for (const key of envAssignments.keys()) {
    if (GIT_CONFIG_AFFECTING_ENV_NAMES.has(key)) {
      return true;
    }
  }
  return false;
}

function getEnvConfigValue(
  name: string,
  envAssignments?: ReadonlyMap<string, string>,
): string | undefined {
  return envAssignments?.get(name) ?? process.env[name];
}

function effectiveGitConfigEnablesRecursiveSubmodules(
  cwd: string,
  gitBinary: string | null = getTrustedGitBinary(),
): boolean {
  const localConfigResult = localGitConfigEnablesRecursiveSubmodules(cwd);
  if (localConfigResult === null || localConfigResult) {
    return true;
  }

  if (gitBinary === null) {
    return true;
  }

  try {
    const value = execFileSync(gitBinary, ['config', '--get', 'submodule.recurse'], {
      cwd,
      encoding: 'utf8',
      env: withoutGitConfigEnv(process.env),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return gitConfigValueEnablesRecursiveSubmodules(value);
  } catch (error) {
    return !isGitConfigUnsetError(error);
  }
}

function localGitConfigEnablesRecursiveSubmodules(cwd: string): boolean | null {
  const configPaths = getLocalGitConfigPaths(cwd);
  if (configPaths === null) {
    return null;
  }

  for (const configPath of configPaths) {
    if (!existsSync(configPath)) {
      continue;
    }
    const result = gitConfigFileEnablesRecursiveSubmodules(configPath);
    if (result) {
      return true;
    }
  }

  return false;
}

function getTrustedGitBinary(): string | null {
  for (const gitBinary of TRUSTED_GIT_BINARIES) {
    if (existsSync(gitBinary)) {
      return gitBinary;
    }
  }
  return null;
}

function withoutGitConfigEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const nextEnv = { ...env };
  for (const key of Object.keys(nextEnv)) {
    if (
      key === 'GIT_CONFIG_COUNT' ||
      key === 'GIT_CONFIG_PARAMETERS' ||
      /^GIT_CONFIG_(KEY|VALUE)_\d+$/.test(key)
    ) {
      delete nextEnv[key];
    }
  }
  return nextEnv;
}

function isGitConfigUnsetError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status?: unknown }).status === 1
  );
}

function getLocalGitConfigPaths(cwd: string): string[] | null {
  const dotGitPath = findDotGitPath(cwd);
  if (dotGitPath === null) {
    return null;
  }

  const gitDir = resolveGitDirFromDotGit(dotGitPath);
  if (gitDir === null) {
    return null;
  }

  const commonDir = resolveCommonGitDir(gitDir);
  if (commonDir === null) {
    return null;
  }

  return [join(commonDir, 'config'), join(gitDir, 'config.worktree')];
}

function findDotGitPath(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const dotGitPath = join(current, '.git');
    if (existsSync(dotGitPath)) {
      return dotGitPath;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveGitDirFromDotGit(dotGitPath: string): string | null {
  try {
    const content = readFileSync(dotGitPath, 'utf-8');
    const firstLine = content.split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (!firstLine.startsWith('gitdir:')) {
      return dotGitPath;
    }

    const rawGitDir = firstLine.slice('gitdir:'.length).trim();
    if (rawGitDir === '') {
      return null;
    }
    return isAbsolute(rawGitDir) ? rawGitDir : resolve(dirname(dotGitPath), rawGitDir);
  } catch {
    return null;
  }
}

function resolveCommonGitDir(gitDir: string): string | null {
  const commonDirPath = join(gitDir, 'commondir');
  if (!existsSync(commonDirPath)) {
    return gitDir;
  }

  try {
    const rawCommonDir = readFileSync(commonDirPath, 'utf-8').split(/\r?\n/, 1)[0]?.trim() ?? '';
    if (rawCommonDir === '') {
      return null;
    }
    return isAbsolute(rawCommonDir) ? rawCommonDir : resolve(gitDir, rawCommonDir);
  } catch {
    return null;
  }
}

function gitConfigFileEnablesRecursiveSubmodules(configPath: string): boolean {
  let content: string;
  try {
    content = readFileSync(configPath, 'utf-8');
  } catch {
    return true;
  }

  let section = '';
  let recursiveSubmoduleConfig = false;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1]?.trim().toLowerCase() ?? '';
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    const key = (eqIdx === -1 ? trimmed : trimmed.slice(0, eqIdx)).trim().toLowerCase();
    const value = eqIdx === -1 ? 'true' : trimmed.slice(eqIdx + 1).trim();
    if (isIncludeConfigSection(section) && key === 'path') {
      return true;
    }
    if (section === 'submodule' && key === 'recurse') {
      recursiveSubmoduleConfig = gitConfigValueEnablesRecursiveSubmodules(value);
    }
  }

  return recursiveSubmoduleConfig;
}

function isIncludeConfigSection(section: string): boolean {
  return section === 'include' || section.startsWith('includeif ');
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

function gitConfigValueEnablesRecursiveSubmodules(value: string): boolean {
  const normalizedValue = value.toLowerCase();
  return (
    normalizedValue !== 'false' &&
    normalizedValue !== 'no' &&
    normalizedValue !== 'off' &&
    normalizedValue !== '0'
  );
}

function recursiveSubmoduleConfigEnvValue(
  configEnv: string | undefined,
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
  const value = getEnvConfigValue(configEnv.slice(eqIdx + 1), envAssignments);
  return value === undefined || gitConfigValueEnablesRecursiveSubmodules(value);
}

function isIncludeConfigKey(key: string): boolean {
  return key === 'include.path' || (key.startsWith('includeif.') && key.endsWith('.path'));
}

function isForcedBranchReset(subcommand: string | undefined, rest: readonly string[]): boolean {
  if (subcommand === 'checkout') {
    const { before } = splitAtDoubleDash(rest);
    const shortOpts = extractShortOpts(before, {
      shortOptsWithValue: CHECKOUT_SHORT_OPTS_WITH_VALUE,
    });
    const hasForce = before.includes('--force') || shortOpts.has('-f');
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
      before.includes('--force') || before.includes('--discard-changes') || shortOpts.has('-f');
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

function analyzeGitPush(tokens: readonly string[]): string | null {
  let hasForceWithLease = false;
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  const hasForce = tokens.includes('--force') || shortOpts.has('-f');

  for (const token of tokens) {
    if (token === '--force-with-lease' || token.startsWith('--force-with-lease=')) {
      hasForceWithLease = true;
    }
  }

  if (hasForce && !hasForceWithLease) {
    return REASON_PUSH_FORCE;
  }

  return null;
}

function analyzeGitBranch(tokens: readonly string[]): string | null {
  const shortOpts = extractShortOpts(tokens.filter((t) => t !== '--'));
  if (shortOpts.has('-D')) {
    return REASON_BRANCH_DELETE;
  }
  return null;
}

function analyzeGitStash(tokens: readonly string[]): string | null {
  for (const token of tokens) {
    if (token === 'drop') {
      return REASON_STASH_DROP;
    }
    if (token === 'clear') {
      return REASON_STASH_CLEAR;
    }
  }
  return null;
}

function analyzeGitWorktree(tokens: readonly string[]): string | null {
  const hasRemove = tokens.includes('remove');
  if (!hasRemove) return null;

  const { before } = splitAtDoubleDash(tokens);
  for (const token of before) {
    if (token === '--force' || token === '-f') {
      return REASON_WORKTREE_REMOVE_FORCE;
    }
  }

  return null;
}

/** @internal Exported for testing */
export {
  effectiveGitConfigEnablesRecursiveSubmodules as _effectiveGitConfigEnablesRecursiveSubmodules,
  extractGitSubcommandAndRest as _extractGitSubcommandAndRest,
  getCheckoutPositionalArgs as _getCheckoutPositionalArgs,
  TRUSTED_GIT_BINARIES as _TRUSTED_GIT_BINARIES,
};
