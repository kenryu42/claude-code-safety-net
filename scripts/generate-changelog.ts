#!/usr/bin/env bun

import { $ } from 'bun';

export type CommandRunner = (
  strings: TemplateStringsArray,
  ...values: readonly string[]
) => { text: () => Promise<string> };

const DEFAULT_RUNNER: CommandRunner = $;

export const EXCLUDED_AUTHORS = ['actions-user', 'github-actions[bot]', 'kenryu42'];

/** Regex to match included commit types (with optional scope) */
export const INCLUDED_COMMIT_PATTERN = /^(feat|fix)(\([^)]+\))?:/i;

export const REPO = process.env.GITHUB_REPOSITORY ?? 'kenryu42/claude-code-safety-net';

/** Paths that indicate Claude Code plugin changes */
const CLAUDE_CODE_PATHS = ['commands/', 'hooks/', '.claude-plugin/'];

/** Paths that indicate OpenCode plugin changes */
const OPENCODE_PATHS = ['.opencode/'];

/**
 * Get the files changed in a commit.
 */
async function getChangedFiles(
  hash: string,
  runner: CommandRunner = DEFAULT_RUNNER,
): Promise<string[]> {
  try {
    const output = await runner`git diff-tree --no-commit-id --name-only -r ${hash}`.text();
    return output.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check if a file path belongs to Claude Code plugin.
 */
function isClaudeCodeFile(path: string): boolean {
  return CLAUDE_CODE_PATHS.some((prefix) => path.startsWith(prefix));
}

/**
 * Check if a file path belongs to OpenCode plugin.
 */
function isOpenCodeFile(path: string): boolean {
  return OPENCODE_PATHS.some((prefix) => path.startsWith(prefix));
}

/**
 * Classify a commit based on its changed files.
 * Priority: core > claude-code > opencode (higher priority wins ties).
 */
function classifyCommit(files: string[]): 'core' | 'claude-code' | 'opencode' {
  if (files.length === 0) return 'core';

  const hasCore = files.some((file) => !isClaudeCodeFile(file) && !isOpenCodeFile(file));
  if (hasCore) return 'core';

  const hasClaudeCode = files.some((file) => isClaudeCodeFile(file));
  if (hasClaudeCode) return 'claude-code';

  return 'opencode';
}

/**
 * Check if a commit message should be included in the changelog.
 * @param message - The commit message (can include hash prefix like "abc1234 feat: message")
 */
export function isIncludedCommit(message: string): boolean {
  // Remove optional hash prefix (e.g., "abc1234 " from git log output)
  const messageWithoutHash = message.replace(/^\w+\s+/, '');

  return INCLUDED_COMMIT_PATTERN.test(messageWithoutHash);
}

export async function getLatestReleasedTag(
  runner: CommandRunner = DEFAULT_RUNNER,
): Promise<string | null> {
  try {
    const tag =
      await runner`gh release list --exclude-drafts --exclude-pre-releases --limit 1 --json tagName --jq '.[0].tagName // empty'`.text();
    return tag.trim() || null;
  } catch {
    return null;
  }
}

interface CategorizedChangelog {
  core: string[];
  claudeCode: string[];
  openCode: string[];
}

/**
 * Format changelog and contributors into release notes.
 */
export function formatReleaseNotes(
  changelog: CategorizedChangelog,
  contributors: string[],
): string[] {
  const notes: string[] = [];

  // Core section
  notes.push('## Core');
  if (changelog.core.length > 0) {
    notes.push(...changelog.core);
  } else {
    notes.push('No changes in this release');
  }

  // Claude Code section
  notes.push('');
  notes.push('## Claude Code');
  if (changelog.claudeCode.length > 0) {
    notes.push(...changelog.claudeCode);
  } else {
    notes.push('No changes in this release');
  }

  // OpenCode section
  notes.push('');
  notes.push('## OpenCode');
  if (changelog.openCode.length > 0) {
    notes.push(...changelog.openCode);
  } else {
    notes.push('No changes in this release');
  }

  // Contributors section
  if (contributors.length > 0) {
    notes.push(...contributors);
  }

  return notes;
}

export async function generateChangelog(
  previousTag: string,
  runner: CommandRunner = DEFAULT_RUNNER,
): Promise<CategorizedChangelog> {
  const result: CategorizedChangelog = {
    core: [],
    claudeCode: [],
    openCode: [],
  };

  try {
    const log = await runner`git log ${previousTag}..HEAD --oneline --format="%h %s"`.text();
    const commits = log.split('\n').filter((line) => line && isIncludedCommit(line));

    for (const commit of commits) {
      const hash = commit.split(' ')[0];
      if (!hash) continue;

      const files = await getChangedFiles(hash, runner);
      const category = classifyCommit(files);

      if (category === 'core') {
        result.core.push(`- ${commit}`);
      } else if (category === 'claude-code') {
        result.claudeCode.push(`- ${commit}`);
      } else {
        result.openCode.push(`- ${commit}`);
      }
    }
  } catch {
    // No commits found
  }

  return result;
}

export async function getContributors(
  previousTag: string,
  runner: CommandRunner = DEFAULT_RUNNER,
): Promise<string[]> {
  return getContributorsForRepo(previousTag, REPO, runner);
}

export async function getContributorsForRepo(
  previousTag: string,
  repo: string,
  runner: CommandRunner = DEFAULT_RUNNER,
): Promise<string[]> {
  const notes: string[] = [];

  try {
    const compare =
      await runner`gh api "/repos/${repo}/compare/${previousTag}...HEAD" --jq '.commits[] | {login: .author.login, message: .commit.message}'`.text();
    const contributors = new Map<string, string[]>();

    for (const line of compare.split('\n').filter(Boolean)) {
      const { login, message } = JSON.parse(line) as {
        login: string | null;
        message: string;
      };
      const title = message.split('\n')[0] ?? '';
      if (!isIncludedCommit(title)) continue;

      if (login && !EXCLUDED_AUTHORS.includes(login)) {
        if (!contributors.has(login)) contributors.set(login, []);
        contributors.get(login)?.push(title);
      }
    }

    if (contributors.size > 0) {
      notes.push('');
      notes.push(
        `**Thank you to ${contributors.size} community contributor${contributors.size > 1 ? 's' : ''}:**`,
      );
      for (const [username, userCommits] of contributors) {
        notes.push(`- @${username}:`);
        for (const commit of userCommits) {
          notes.push(`  - ${commit}`);
        }
      }
    }
  } catch {
    // Failed to fetch contributors
  }

  return notes;
}

export type RunChangelogOptions = {
  runner?: CommandRunner;
  log?: (message: string) => void;
};

export async function runChangelog(options: RunChangelogOptions = {}): Promise<void> {
  const runner = options.runner ?? DEFAULT_RUNNER;
  const log = options.log ?? console.log;
  const previousTag = await getLatestReleasedTag(runner);

  if (!previousTag) {
    log('Initial release');
    return;
  }

  const changelog = await generateChangelog(previousTag, runner);
  const contributors = await getContributorsForRepo(previousTag, REPO, runner);
  const notes = formatReleaseNotes(changelog, contributors);

  log(notes.join('\n'));
}

if (import.meta.main) {
  runChangelog();
}
