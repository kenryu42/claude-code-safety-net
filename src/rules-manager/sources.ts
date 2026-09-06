import type { RulesConfig } from '@/core/policy/rules-config';
import {
  isGitHubRef,
  isGitHubRepositorySource,
  parseGitHubSource,
} from '@/core/policy/source-syntax';
import type { SyncRulesConfigResult } from './types';

type RulebookMatchResult =
  | { ok: true; specs: string[] }
  | { ok: false; result: SyncRulesConfigResult };
type ConfiguredGitHubSource = { owner: string; repo: string; ref: string; name: string };

const GITHUB_REPOSITORY_REF_SOURCE_RE = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)#(.+)$/;

/** A source is selected by its exact spec or by the rulebook name that spec carries. */
export function getSelectedUpdateSpecs(config: RulesConfig, match: string): RulebookMatchResult {
  const exactMatches = getExactSpecMatches(config.rules, match);
  if (exactMatches.length > 0) {
    return { ok: true, specs: exactMatches };
  }
  return getRulebookNameMatch(config.rules, match);
}

export function getRemoveMatches(rules: string[], match: string): RulebookMatchResult {
  const exactMatches = getExactSpecMatches(rules, match);
  if (exactMatches.length > 0) return { ok: true, specs: exactMatches };

  const githubRefMatches = getGitHubRepositoryRefMatches(rules, match);
  if (githubRefMatches.length > 0) return { ok: true, specs: githubRefMatches };

  const githubRepositoryMatches = getGitHubRepositoryMatches(rules, match);
  if (!githubRepositoryMatches.ok) return githubRepositoryMatches;
  if (githubRepositoryMatches.specs.length > 0) {
    return { ok: true, specs: githubRepositoryMatches.specs };
  }

  return getRulebookNameMatch(rules, match);
}

/** With no lockfile the name a spec carries is the only name a source has. */
function getRulebookNameMatch(rules: string[], match: string): RulebookMatchResult {
  const nameMatches = rules.filter((spec) => getConfiguredGitHubSource(spec)?.name === match);
  if (nameMatches.length === 1) return { ok: true, specs: nameMatches };
  return noRulebookMatch(match, nameMatches);
}

function noRulebookMatch(
  match: string,
  nameMatches: string[],
): Extract<RulebookMatchResult, { ok: false }> {
  return {
    ok: false,
    result: {
      ok: false,
      errors:
        nameMatches.length === 0
          ? [`No configured rulebook matches ${match}`]
          : [`Ambiguous rulebook match ${match}: ${nameMatches.join(', ')}`],
      entries: [],
    },
  };
}

function getExactSpecMatches(rules: string[], match: string): string[] {
  return rules.filter((spec) => spec === match);
}

function getGitHubRepositoryRefMatches(rules: string[], match: string): string[] {
  const parsed = match.match(GITHUB_REPOSITORY_REF_SOURCE_RE);
  const owner = parsed?.[1];
  const repo = parsed?.[2];
  const ref = parsed?.[3];
  if (!owner || !repo || !ref || !isGitHubRef(ref)) return [];
  return getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo && source.ref === ref;
  });
}

function getGitHubRepositoryMatches(rules: string[], match: string): RulebookMatchResult {
  if (!isGitHubRepositorySource(match)) return { ok: true, specs: [] };

  const [owner, repo] = match.split('/');
  const specs = getConfiguredGitHubSourceMatches(rules, (source) => {
    return source.owner === owner && source.repo === repo;
  });
  const refs = new Set(
    specs.map((spec) => getConfiguredGitHubSource(spec)?.ref).filter((ref): ref is string => !!ref),
  );
  if (refs.size < 2) return { ok: true, specs };

  return {
    ok: false,
    result: {
      ok: false,
      errors: [
        `Multiple refs are configured for ${match}. Use an explicit ref:`,
        `  cc-safety-net rule remove ${match}#<ref>`,
      ],
      entries: [],
    },
  };
}

function getConfiguredGitHubSource(spec: string): ConfiguredGitHubSource | null {
  try {
    return parseGitHubSource(spec);
  } catch {
    return null;
  }
}

function getConfiguredGitHubSourceMatches(
  rules: string[],
  matches: (source: ConfiguredGitHubSource) => boolean,
): string[] {
  return rules.filter((spec) => {
    const source = getConfiguredGitHubSource(spec);
    return source ? matches(source) : false;
  });
}
