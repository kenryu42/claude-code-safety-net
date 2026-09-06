import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/rules/constants';
import { getBasename } from '@/core/shell/tokens';
import { parseSimpleWords } from '@/core/shell/traversal';
import { getGitEnvValue, resolveGitConfigCount } from './env';

const MAX_GIT_ALIAS_EXPANSION_DEPTH = 5;

export interface GitAliasResolution {
  blockedReason: string | null;
  expanded: boolean;
  tokens: readonly string[];
}

interface GitConfigEntry {
  key: string;
  value: string | undefined;
}

interface GitConfigEntriesResolution {
  blockedReason: string | null;
  entries: GitConfigEntry[];
}

const REASON_GIT_ALIAS_CONFIG =
  'Git aliases supplied through command-line or environment config can hide or execute commands. Run git without Git alias overrides, or ask the user to run it manually.';

export function splitAtDoubleDash(tokens: readonly string[]): {
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

export function resolveGitCommandLineAliases(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitAliasResolution {
  const configEntries = getGitConfigEntries(tokens, env, envAssignments);
  const aliases = getGitConfigAliases(configEntries.entries);
  if (aliases.size === 0) {
    return { blockedReason: configEntries.blockedReason, expanded: false, tokens };
  }

  let currentTokens = tokens;
  let expanded = false;
  for (let depth = 0; depth < MAX_GIT_ALIAS_EXPANSION_DEPTH; depth++) {
    const { subcommand, rest } = extractGitSubcommandAndRest(currentTokens);
    const aliasName = subcommand?.toLowerCase();
    if (!aliasName || !aliases.has(aliasName)) {
      return { blockedReason: configEntries.blockedReason, expanded, tokens: currentTokens };
    }

    const aliasValue = aliases.get(aliasName);
    const aliasTokens = parseGitAliasValue(aliasValue);
    if (aliasTokens === null || aliasTokens.length === 0) {
      return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: true, tokens: currentTokens };
    }

    currentTokens = ['git', ...aliasTokens, ...rest];
    expanded = true;
  }

  return { blockedReason: REASON_GIT_ALIAS_CONFIG, expanded: true, tokens: currentTokens };
}

export function hasGitCommandLineSshCommandConfig(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): boolean {
  return getGitConfigEntries(tokens, env, envAssignments).entries.some(
    (entry) => entry.key.toLowerCase() === 'core.sshcommand',
  );
}

export function extractGitSubcommandAndRest(tokens: readonly string[]): {
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

    if (!token.startsWith('-')) {
      return { subcommand: token, rest: tokens.slice(i + 1) };
    }
    i += GIT_GLOBAL_OPTS_WITH_VALUE.has(token) ? 2 : 1;
  }

  return { subcommand: null, rest: [] };
}

function getGitConfigAliases(entries: readonly GitConfigEntry[]): Map<string, string | undefined> {
  const aliases = new Map<string, string | undefined>();
  for (const entry of entries) {
    const key = entry.key.toLowerCase();
    if (!key.startsWith('alias.')) {
      continue;
    }
    const name = key.slice('alias.'.length);
    if (name !== '') {
      aliases.set(name, entry.value);
    }
  }
  return aliases;
}

function getGitConfigEntries(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigEntriesResolution {
  if (tokens.length === 0) {
    return { blockedReason: null, entries: [] };
  }

  const firstToken = tokens[0];
  const command = firstToken ? getBasename(firstToken).toLowerCase() : null;
  if (command !== 'git') {
    return { blockedReason: null, entries: [] };
  }

  const envEntries = getGitEnvConfigEntries(env, envAssignments);
  return {
    blockedReason: envEntries.blockedReason,
    entries: [
      ...envEntries.entries,
      ...getGitCommandLineConfigEntries(tokens, env, envAssignments),
    ],
  };
}

function getGitCommandLineConfigEntries(
  tokens: readonly string[],
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigEntry[] {
  const entries: GitConfigEntry[] = [];
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token || token === '--' || !token.startsWith('-')) {
      return entries;
    }

    if (token === '-c') {
      const entry = parseGitConfigEntry(tokens[i + 1]);
      if (entry) {
        entries.push(entry);
      }
      i += 2;
      continue;
    }

    if (token.startsWith('-c') && token.length > 2) {
      const entry = parseGitConfigEntry(token.slice(2));
      if (entry) {
        entries.push(entry);
      }
      i++;
      continue;
    }

    if (token === '--config-env') {
      const entry = parseGitConfigEnvEntry(tokens[i + 1], env, envAssignments);
      if (entry) {
        entries.push(entry);
      }
      i += 2;
      continue;
    }

    if (token.startsWith('--config-env=')) {
      const entry = parseGitConfigEnvEntry(
        token.slice('--config-env='.length),
        env,
        envAssignments,
      );
      if (entry) {
        entries.push(entry);
      }
      i++;
      continue;
    }

    if (GIT_GLOBAL_OPTS_WITH_VALUE.has(token)) {
      i += 2;
      continue;
    }

    i++;
  }

  return entries;
}

function getGitEnvConfigEntries(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigEntriesResolution {
  const parameterEntries = getGitConfigParameterEntries(env, envAssignments);
  const countEntries = getGitConfigCountEntries(env, envAssignments);
  return {
    blockedReason:
      parameterEntries === null || countEntries === null ? REASON_GIT_ALIAS_CONFIG : null,
    entries: [...(parameterEntries ?? []), ...(countEntries ?? [])],
  };
}

function getGitConfigParameterEntries(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigEntry[] | null {
  const parameters = getGitEnvValue('GIT_CONFIG_PARAMETERS', env, envAssignments);
  if (parameters === undefined) {
    return [];
  }
  const entries: GitConfigEntry[] = [];
  const parsed = parseSimpleWords(parameters);
  if (!parsed) return null;
  for (const token of parsed) {
    const configEntry = parseGitConfigEntry(token);
    if (!configEntry) {
      return null;
    }
    entries.push(configEntry);
  }
  return entries;
}

function getGitConfigCountEntries(
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigEntry[] | null {
  const resolution = resolveGitConfigCount(env, envAssignments);
  if (resolution.state === 'absent') {
    return [];
  }
  if (resolution.state === 'invalid') {
    return null;
  }

  const entries: GitConfigEntry[] = [];
  for (let i = 0; i < resolution.count; i++) {
    const key = getGitEnvValue(`GIT_CONFIG_KEY_${i}`, env, envAssignments)?.trim();
    const value = getGitEnvValue(`GIT_CONFIG_VALUE_${i}`, env, envAssignments);
    if (!key || value === undefined) {
      return null;
    }
    entries.push({ key, value });
  }
  return entries;
}

function parseGitConfigEntry(config: string | undefined): GitConfigEntry | null {
  if (!config) {
    return null;
  }
  const eqIdx = config.indexOf('=');
  return {
    key: (eqIdx === -1 ? config : config.slice(0, eqIdx)).trim(),
    value: eqIdx === -1 ? undefined : config.slice(eqIdx + 1),
  };
}

function parseGitConfigEnvEntry(
  configEnv: string | undefined,
  env: ReadonlyMap<string, string>,
  envAssignments?: ReadonlyMap<string, string>,
): GitConfigEntry | null {
  const eqIdx = configEnv?.indexOf('=') ?? -1;
  if (!configEnv || eqIdx === -1) {
    return null;
  }
  return {
    key: configEnv.slice(0, eqIdx).trim(),
    value: getGitEnvValue(configEnv.slice(eqIdx + 1), env, envAssignments),
  };
}

function parseGitAliasValue(value: string | undefined): string[] | null {
  const trimmedValue = value?.trimStart();
  if (!trimmedValue || trimmedValue.startsWith('!')) {
    return null;
  }
  return parseSimpleWords(trimmedValue);
}
