import { createHash } from 'node:crypto';

/**
 * The documents a rulebook-manager row seeds: rule configs, rulebooks in both schema versions, a
 * version 0 inline config and the lock and cache a version 2 install left behind. Each builder
 * returns file bytes, so a row spells the tree it wants and no comparison has to normalize
 * formatting afterwards.
 */

export type SeedRule = {
  name: string;
  command: string;
  subcommand?: string;
  block_args: string[];
  reason: string;
};

export type SeedMatchRule = {
  name: string;
  command: string;
  match: Record<string, unknown>;
  reason: string;
};

export type SeedFixture = { command: string; expect: 'blocked' | 'allowed'; rule?: string };

/** The v2 lock rows the migration reads: the spec, its digest and the slug fields. */
export type SeedLockEntry = {
  spec: string;
  digest: string;
  name: string;
  owner: string;
  repo: string;
  display_ref: string;
};

const DOCKER_PRUNE_RULE: SeedRule = {
  name: 'block-docker-system-prune',
  command: 'docker',
  subcommand: 'system',
  block_args: ['prune'],
  reason: 'Use targeted cleanup instead.',
};

/** What the atomic writer leaves behind: two-space JSON with a closing newline. */
export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function rulesConfig(rules: string[], extra: Record<string, unknown> = {}): string {
  return json({ version: 1, rules, overrides: {}, transparent_wrappers: [], ...extra });
}

export function v1Rulebook(name: string, rules: readonly SeedRule[] = [DOCKER_PRUNE_RULE]): string {
  return json({
    rulebook_version: 1,
    name,
    version: '1.0.0',
    allowed_commands: allowedCommands(rules),
    rules,
  });
}

export function v2Rulebook(
  name: string,
  rules: readonly SeedMatchRule[],
  tests: readonly SeedFixture[],
): string {
  return json({
    rulebook_version: 2,
    name,
    version: '1.0.0',
    allowed_commands: allowedCommands(rules),
    rules,
    tests,
  });
}

/** A version 0 inline config, the shape `rule migrate` converts and `doctor` reports. */
export function legacyConfig(rules: readonly SeedRule[]): string {
  return json({ version: 1, rules });
}

/** One rule past the 1,024-rule acceptance limit, so the rulebook is refused whole. */
export function oversizedRulebook(name: string): string {
  return v1Rulebook(
    name,
    Array.from({ length: 1_025 }, (_unused, index) => ({
      name: `block-${index}`,
      command: 'docker',
      block_args: [`arg-${index}`],
      reason: 'Too many rules to accept.',
    })),
  );
}

export function v2Lock(entries: readonly SeedLockEntry[]): string {
  return json({ version: 2, rulebooks: entries });
}

/** The directory a v2 install cached one entry in, under the scope's `cache/rulebooks`. */
export function v2CacheDir(entry: SeedLockEntry): string {
  const slug = `${entry.owner}/${entry.repo}#${entry.display_ref}/${entry.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug}--${entry.digest.replace('sha256:', '').slice(0, 12)}`;
}

export function sha256Digest(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function allowedCommands(rules: readonly { command: string }[]): string[] {
  return [...new Set(rules.map((rule) => rule.command))];
}
