import { afterEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runRulesMigrate as portedRulesMigrate } from '@/cli/rule/migrate';
import { captureConsole } from '../../helpers/console-capture';
import type { TreeSpec } from '../../helpers/fixture-tree';
import {
  json,
  legacyConfig,
  rulesConfig,
  type SeedRule,
  v1Rulebook,
} from '../../helpers/rulebook-seeds';
import { runManagerDifferential } from '../../helpers/rules-manager-differential';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * `rule migrate` converts a version 0 inline config into a rulebook and lists it, in both scopes,
 * and every one of its outcomes is a pair: what the two implementations printed and what they left
 * on disk. A failed scope has to leave the tree exactly as it found it, so the seeded files are
 * part of the comparison rather than a setup detail.
 */

const PROJECT_LEGACY = 'project/.safety-net.json';
const PROJECT_CONFIG = 'project/.cc-safety-net/rules/rule.json';
const USER_LEGACY = 'home/.cc-safety-net/config.json';
const USER_CONFIG = 'home/.cc-safety-net/rules/rule.json';

const NO_FORCE_PUSH: SeedRule = {
  name: 'no-force-push',
  command: 'git',
  subcommand: 'push',
  block_args: ['--force'],
  reason: 'Force pushing rewrites history other clones already have.',
};
const NO_CURL_PIPE: SeedRule = {
  name: 'no-curl-pipe',
  command: 'curl',
  block_args: ['|'],
  reason: 'Piping a download into a shell runs whatever the server sent.',
};

const PUSH_FIXTURE = { command: 'git push --force', expect: 'blocked', rule: 'no-force-push' };
const CURL_FIXTURE = { command: 'curl |', expect: 'blocked', rule: 'no-curl-pipe' };

/** The rulebook a migration writes, spelled out rather than recomputed: the commands it collects
 *  and the fixture it derives per rule are the parts a silent change would move. */
const migratedRulebook = (fields: {
  name: string;
  from: string;
  commands: string[];
  rules: readonly SeedRule[];
  fixtures: readonly { command: string; expect: string; rule: string }[];
}) =>
  json({
    rulebook_version: 1,
    name: fields.name,
    version: '1.0.0',
    description: 'Migrated CC Safety Net rules.',
    author: 'project',
    migrated_from: fields.from,
    allowed_commands: fields.commands,
    rules: fields.rules,
    tests: fields.fixtures,
  });

const PROJECT_MIGRATED = (name: string) =>
  migratedRulebook({
    name,
    from: '.safety-net.json',
    commands: ['git'],
    rules: [NO_FORCE_PUSH],
    fixtures: [PUSH_FIXTURE],
  });

async function runMigrate(spec: TreeSpec, cleanup = false) {
  return runManagerDifferential(spec, (side, environment) =>
    captureConsole(() => portedRulesMigrate(environment, { cleanup, cwd: side.project })),
  );
}

const content = (tree: { path: string; content?: string }[], path: string) =>
  tree.find((entry) => entry.path === path)?.content;

afterEach(removeTempRoots);

describe('rule migrate over both scopes', () => {
  test('a workspace with no legacy file reports both scopes and changes nothing', async () => {
    const agreed = await runMigrate({});
    expect(agreed.results.returned).toBe(0);
    expect(agreed.results.log).toEqual(
      [join('<root>', PROJECT_LEGACY), join('<root>', USER_LEGACY)].map(
        (path) => `No legacy config found at ${path}`,
      ),
    );
    expect(agreed.results.error).toEqual([]);
    expect(agreed.tree.map((entry) => entry.path)).toEqual(['home', 'home/tmp', 'project']);
  });

  test('a project legacy file becomes a listed rulebook and is kept', async () => {
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH, NO_CURL_PIPE]),
    });
    expect(agreed.results.returned).toBe(0);
    expect(agreed.results.log).toContain(
      `Migrated legacy config at ${join('<root>', PROJECT_LEGACY)}. Legacy file is no longer used.`,
    );
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe(rulesConfig(['project-rules']));
    expect(content(agreed.tree, 'project/.cc-safety-net/rules/project-rules/rulebook.json')).toBe(
      migratedRulebook({
        name: 'project-rules',
        from: '.safety-net.json',
        commands: ['git', 'curl'],
        rules: [NO_FORCE_PUSH, NO_CURL_PIPE],
        fixtures: [PUSH_FIXTURE, CURL_FIXTURE],
      }),
    );
    expect(content(agreed.tree, PROJECT_LEGACY)).toBe(legacyConfig([NO_FORCE_PUSH, NO_CURL_PIPE]));
  });

  test('--cleanup deletes the legacy file once the migrated pair verifies', async () => {
    const agreed = await runMigrate({ [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]) }, true);
    expect(agreed.results.returned).toBe(0);
    expect(agreed.results.log).toContain(
      `Deleted legacy config at ${join('<root>', PROJECT_LEGACY)}`,
    );
    expect(content(agreed.tree, PROJECT_LEGACY)).toBeUndefined();
    expect(content(agreed.tree, 'project/.cc-safety-net/rules/project-rules/rulebook.json')).toBe(
      PROJECT_MIGRATED('project-rules'),
    );
  });

  test('a user legacy file lands under the user rules directory', async () => {
    const agreed = await runMigrate({ [USER_LEGACY]: legacyConfig([NO_CURL_PIPE]) });
    expect(agreed.results.returned).toBe(0);
    expect(agreed.results.log).toContain(
      `Migrated legacy config at ${join('<root>', USER_LEGACY)}. Legacy file is no longer used.`,
    );
    expect(content(agreed.tree, USER_CONFIG)).toBe(rulesConfig(['user-rules']));
    expect(content(agreed.tree, 'home/.cc-safety-net/rules/user-rules/rulebook.json')).toBe(
      migratedRulebook({
        name: 'user-rules',
        from: '~/.cc-safety-net/config.json',
        commands: ['curl'],
        rules: [NO_CURL_PIPE],
        fixtures: [CURL_FIXTURE],
      }),
    );
  });

  test('both legacy files migrate in one run', async () => {
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]),
      [USER_LEGACY]: legacyConfig([NO_CURL_PIPE]),
    });
    expect(agreed.results.returned).toBe(0);
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe(rulesConfig(['project-rules']));
    expect(content(agreed.tree, USER_CONFIG)).toBe(rulesConfig(['user-rules']));
  });

  test('a legacy file the schema rejects fails its scope and leaves the other one reported', async () => {
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: json({ version: 1, rules: [{ name: 'no-command' }] }),
    });
    expect(agreed.results.returned).toBe(1);
    expect(agreed.results.log).toEqual([
      `No legacy config found at ${join('<root>', USER_LEGACY)}`,
    ]);
    expect(agreed.results.error.length).toBeGreaterThan(0);
    expect(agreed.tree.map((entry) => entry.path)).toEqual([
      'home',
      'home/tmp',
      'project',
      PROJECT_LEGACY,
    ]);
  });

  test('a second run reuses the rulebook the first one wrote', async () => {
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]),
      [PROJECT_CONFIG]: rulesConfig(['project-rules']),
      'project/.cc-safety-net/rules/project-rules/rulebook.json': migratedRulebook({
        name: 'project-rules',
        from: '.safety-net.json',
        commands: ['curl'],
        rules: [NO_CURL_PIPE],
        fixtures: [CURL_FIXTURE],
      }),
    });
    expect(agreed.results.returned).toBe(0);
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe(rulesConfig(['project-rules']));
    expect(content(agreed.tree, 'project/.cc-safety-net/rules/project-rules/rulebook.json')).toBe(
      PROJECT_MIGRATED('project-rules'),
    );
    expect(agreed.tree.some((entry) => entry.path.includes('project-rules-2'))).toBeFalse();
  });

  test('a rulebook converted from another tool is listed past, not overwritten', async () => {
    const imported = migratedRulebook({
      name: 'imported-rules',
      from: 'other-tool.json',
      commands: ['curl'],
      rules: [NO_CURL_PIPE],
      fixtures: [CURL_FIXTURE],
    });
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]),
      [PROJECT_CONFIG]: rulesConfig(['imported-rules']),
      'project/.cc-safety-net/rules/imported-rules/rulebook.json': imported,
    });
    expect(agreed.results.returned).toBe(0);
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe(
      rulesConfig(['imported-rules', 'project-rules']),
    );
    expect(content(agreed.tree, 'project/.cc-safety-net/rules/imported-rules/rulebook.json')).toBe(
      imported,
    );
    expect(content(agreed.tree, 'project/.cc-safety-net/rules/project-rules/rulebook.json')).toBe(
      PROJECT_MIGRATED('project-rules'),
    );
  });

  test('an unrelated rulebook holding the default name pushes the migration to the next one', async () => {
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]),
      [PROJECT_CONFIG]: rulesConfig(['project-rules']),
      'project/.cc-safety-net/rules/project-rules/rulebook.json': v1Rulebook('project-rules'),
    });
    expect(agreed.results.returned).toBe(0);
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe(
      rulesConfig(['project-rules', 'project-rules-2']),
    );
    expect(content(agreed.tree, 'project/.cc-safety-net/rules/project-rules-2/rulebook.json')).toBe(
      PROJECT_MIGRATED('project-rules-2'),
    );
  });

  test('a scope the reload refuses is restored to what it held before the write', async () => {
    const seeded = rulesConfig([], { overrides: { 'ghost-rules/ghost-rule': 'off' } });
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]),
      [PROJECT_CONFIG]: seeded,
    });
    expect(agreed.results.returned).toBe(1);
    expect(agreed.results.error.join('\n')).toContain('ghost-rules/ghost-rule');
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe(seeded);
    expect(
      content(agreed.tree, 'project/.cc-safety-net/rules/project-rules/rulebook.json'),
    ).toBeUndefined();
    expect(content(agreed.tree, PROJECT_LEGACY)).toBe(legacyConfig([NO_FORCE_PUSH]));
  });

  test('a rule config that cannot be read stops its scope before anything is written', async () => {
    const agreed = await runMigrate({
      [PROJECT_LEGACY]: legacyConfig([NO_FORCE_PUSH]),
      [PROJECT_CONFIG]: '{ not json',
    });
    expect(agreed.results.returned).toBe(1);
    expect(agreed.results.error).toEqual(['Invalid JSON']);
    expect(content(agreed.tree, PROJECT_CONFIG)).toBe('{ not json');
    expect(agreed.tree.some((entry) => entry.path.includes('project-rules'))).toBeFalse();
  });
});
