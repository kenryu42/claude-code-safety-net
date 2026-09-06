import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRuleSyncMigration } from '@/cli/rule/sync-migrate';
import { RULE_SOURCE_LIMIT, RULE_SOURCE_LIMIT_ERROR } from '@/core/policy/resource-limits';
import { writeStarterRulebook } from '@/rules-manager/config-file';
import { GITHUB_FETCH_LIMITS } from '@/rules-manager/resolver';
import {
  isRuleSyncResourceLimitError,
  RULE_SYNC_RESOURCE_LIMITS,
} from '@/rules-manager/resource-limits';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
} from '../helpers/temp-home';

/**
 * The manager's differentials all end when `src/` is deleted, and these values would then have
 * nothing holding them: the fetch bounds a user is promised, the refusal wording a script may
 * match on, and the starter file `rule init` writes. Each is asserted against a literal here, so
 * a later edit to any of them fails a test rather than shipping quietly.
 */

const STARTER_PROJECT_RULEBOOK = `{
  "rulebook_version": 1,
  "name": "project-rules",
  "version": "1.0.0",
  "description": "Project-specific CC Safety Net rules.",
  "author": "project",
  "allowed_commands": [
    "docker"
  ],
  "rules": [
    {
      "name": "block-docker-system-prune",
      "command": "docker",
      "subcommand": "system",
      "block_args": [
        "prune"
      ],
      "reason": "Use targeted cleanup instead."
    }
  ],
  "tests": [
    {
      "command": "docker system prune",
      "expect": "blocked",
      "rule": "block-docker-system-prune"
    }
  ]
}
`;

const STARTER_EXAMPLE_RULEBOOK = `{
  "rulebook_version": 1,
  "name": "example-rules",
  "version": "1.0.0",
  "description": "User-specific CC Safety Net rules.",
  "author": "user",
  "allowed_commands": [
    "docker"
  ],
  "rules": [
    {
      "name": "block-docker-system-prune",
      "command": "docker",
      "subcommand": "system",
      "block_args": [
        "prune"
      ],
      "reason": "Use targeted cleanup instead."
    }
  ],
  "tests": [
    {
      "command": "docker system prune",
      "expect": "blocked",
      "rule": "block-docker-system-prune"
    }
  ]
}
`;

afterEach(removeTempRoots);

describe('the manager limits that outlive the differentials', () => {
  test('one operation may spend 131 requests and 64 MiB over 4 connections', () => {
    expect({ ...RULE_SYNC_RESOURCE_LIMITS }).toEqual({
      maxSources: 64,
      concurrency: 4,
      maxRequests: 131,
      maxResponseBytes: 67_108_864,
    });
  });

  test('one GitHub response may take 15 s and its kind of body has its own cap', () => {
    expect({ ...GITHUB_FETCH_LIMITS }).toEqual({
      timeoutMs: 15_000,
      metadataBytes: 524_288,
      commitBytes: 262_144,
      treeBytes: 16_777_216,
      rawBytes: 4_194_304,
    });
  });

  test('a scope may list 64 sources, and the refusal names the limit', () => {
    expect(RULE_SOURCE_LIMIT).toBe(64);
    expect(RULE_SOURCE_LIMIT_ERROR).toBe("Rule config exceeds CC Safety Net's safe source limit.");
  });

  test('only the budget message classifies as a resource-limit failure', () => {
    expect(
      isRuleSyncResourceLimitError(
        new Error("Rule synchronization exceeds CC Safety Net's safe resource limits."),
      ),
    ).toBeTrue();
    expect(isRuleSyncResourceLimitError(new Error('fetch failed'))).toBeFalse();
    expect(
      isRuleSyncResourceLimitError(
        new Error("rule synchronization exceeds CC Safety Net's safe resource limits."),
      ),
    ).toBeFalse();
    expect(
      isRuleSyncResourceLimitError(
        "Rule synchronization exceeds CC Safety Net's safe resource limits.",
      ),
    ).toBeFalse();
  });
});

describe('the starter rulebook bytes', () => {
  test.each([
    ['the project starter', (path: string) => writeStarterRulebook(path), STARTER_PROJECT_RULEBOOK],
    [
      'the example starter',
      (path: string) => writeStarterRulebook(path, 'example-rules'),
      STARTER_EXAMPLE_RULEBOOK,
    ],
  ] as const)('%s is written verbatim', (_label, write, expected) => {
    const path = join(createTempRoot('starter-rulebook-'), 'rules', 'rulebook.json');
    write(path);
    expect(readFileSync(path, 'utf-8')).toBe(expected);
  });
});

describe('the wording a deprecated command opens with', () => {
  test('`rule sync` says what it no longer does before it says what it did', () => {
    const root = createTempRoot('rule-sync-notice-');
    const home = join(root, 'home');
    const opening: string[] = [];
    const spy = spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
      opening.push(parts.map(String).join(' '));
    });
    try {
      runRuleSyncMigration(environmentFor(home, isolationEnv(home)), {
        cwd: join(root, 'project'),
      });
    } finally {
      spy.mockRestore();
    }
    expect(opening[0]).toBe(
      '`cc-safety-net rule sync` is deprecated: rulebooks are live files that need no synchronization. This run only migrates the lock and cache an earlier version left behind.',
    );
  });
});
