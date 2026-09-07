import { afterEach, describe, expect, test } from 'bun:test';
import { posix } from 'node:path';
import { RULE_DOC } from '@/cli/rule/doc';
import { type CliOutcome, runCliDifferential, seedFiles } from '../../helpers/cli-differential';
import type { TreeSpec } from '../../helpers/fixture-tree';
import {
  json,
  legacyConfig,
  oversizedRulebook,
  rulesConfig,
  sha256Digest,
  v1Rulebook,
  v2CacheDir,
  v2Lock,
  v2Rulebook,
} from '../../helpers/rulebook-seeds';
import { removeTempRoots } from '../../helpers/temp-home';

/**
 * The whole `rule` verb through both bins. Every row is one argument vector over one seeded scope,
 * and what is compared is what a user and their editor see: the stdout bytes, the stderr bytes,
 * the exit code and the tree the run left behind. The pin behind each row names the line or the
 * file that carries the meaning, so a run where both bins go silent together still fails.
 *
 * No row reaches the network: `rule add owner/repo` would fetch, so the repository forms live in
 * the in-process differential under tests/rules-manager instead, and only the flag errors
 * that are decided before any request appear here.
 */

afterEach(() => {
  removeTempRoots();
});

const P = 'project/.cc-safety-net/rules';
const U = 'home/.cc-safety-net/rules';

/** The update check is off for every row: `rule doc` would otherwise probe the registry. */
const rule = async (args: readonly string[], files: TreeSpec = {}) =>
  await runCliDifferential({
    args: ['rule', ...args],
    seed: (side) => seedFiles(side, files),
    env: { CC_SAFETY_NET_NO_UPDATE_CHECK: '1' },
  });

const fileAt = (outcome: CliOutcome, path: string) =>
  outcome.tree.find((entry) => entry.path === path)?.content;

const holds = (outcome: CliOutcome, fragment: string) =>
  outcome.tree.some((entry) => entry.path.includes(fragment));

const TEAM = v1Rulebook('team');
const OTHER = v1Rulebook('other');
const VENDORED_X = v1Rulebook('x');
const VENDORED_Y = v1Rulebook('y');
const USER_BOOK = v1Rulebook('userbook');
const SUMMARY = ['', 'Active rulebooks (1):', '  - team 1.0.0 (1 rule)', '    Source: team', ''];

describe('help', () => {
  test('`rule` alone prints the tree on stderr and fails', async () => {
    const outcome = await rule([]);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toStartWith('cc-safety-net rule\n');
  }, 60_000);

  for (const flag of ['--help', '-h']) {
    test(`\`rule ${flag}\` prints the tree on stdout`, async () => {
      const outcome = await rule([flag]);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toStartWith('cc-safety-net rule\n');
      expect(outcome.stderr).toBe('');
    }, 60_000);
  }

  for (const leaf of [
    'init',
    'add',
    'remove',
    'update',
    'sync',
    'list',
    'migrate',
    'doc',
    'verify',
  ]) {
    test(`\`rule ${leaf} --help\` describes that leaf alone`, async () => {
      const outcome = await rule([leaf, '--help']);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout.split('\n')[0]).toBe(`cc-safety-net rule ${leaf}`);
      expect(outcome.stderr).toBe('');
    }, 60_000);
  }

  test('`rule add --help` carries the source options and every example', async () => {
    const outcome = await rule(['add', '--help']);
    expect(outcome.stdout).toContain('  --ref <ref>           Use a branch, tag, or commit');
    expect(outcome.stdout).toContain('  --only <rulebook...>  Add only these repository rulebooks');
    expect(outcome.stdout.split('EXAMPLES:\n')[1]).toBe(
      [
        '  cc-safety-net rule add project-rules',
        '  cc-safety-net rule add acme/safety-rules',
        '  cc-safety-net rule add acme/safety-rules --only aws gcloud',
        '  cc-safety-net rule add acme/safety-rules --ref v2 --only aws',
        '  cc-safety-net rule add --only terraform aws',
        '',
      ].join('\n'),
    );
  }, 60_000);

  test('`rule wrapper --help` lists all three actions instead of picking one', async () => {
    const outcome = await rule(['wrapper', '--help']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('  wrapper add <command>     Trust a transparent command');
    expect(outcome.stdout).toContain('  wrapper remove <command>  Remove a transparent command');
    expect(outcome.stdout).toContain('  wrapper list              List transparent command');
  }, 60_000);

  for (const action of ['add', 'remove', 'list']) {
    test(`\`rule wrapper ${action} --help\` describes that action`, async () => {
      const outcome = await rule(['wrapper', action, '--help']);
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout.split('\n')[0]).toBe('cc-safety-net rule wrapper');
      expect(outcome.stdout).toContain(`  cc-safety-net rule wrapper ${action}`);
    }, 60_000);
  }

  test('`rule bogus --help` stays a typo rather than becoming a help request', async () => {
    const outcome = await rule(['bogus', '--help']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('Unknown rule subcommand: bogus\n');
  }, 60_000);
});

/** Every rejection `validateRuleFlags` and the two argument guards produce, with its exact line. */
const usageErrors: [readonly string[], string][] = [
  [['bogus'], 'Unknown rule subcommand: bogus'],
  [['--delete-source'], "--delete-source is only valid with 'rule remove'"],
  [['init', '--delete-source'], 'Unknown option for rule init: --delete-source'],
  [['update', '--check'], 'Unknown option for rule update: --check'],
  [['init', '--cleanup'], 'Unknown option for rule init: --cleanup'],
  [['add', '--example'], 'Unknown option for rule add: --example'],
  [['list', '--ref', 'v1'], 'Unknown option for rule list: --ref'],
  [['list', '--only', 'a'], 'Unknown option for rule list: --only'],
  [['add', 'team', '--ref', 'v1'], '--ref can only select a ref for an owner/repo source: team'],
  [['add', 'team', '--only', 'a'], '--only can only select rulebooks from an owner/repo source'],
  [['add', 'acme/repo', '--ref', 'bad ref'], '--ref must use valid path segments: bad ref'],
  [['add', 'acme/repo', '--only', 'bad name'], 'Invalid rulebook names: bad name'],
  [['add', '--only', 'bad name'], 'Invalid rulebook names: bad name'],
  [['migrate', '--global'], 'Unknown option for rule migrate: --global'],
  [['migrate', 'extra'], 'Unexpected rule migrate argument: extra'],
  [['wrapper'], 'rule wrapper requires add, remove, or list'],
  [['wrapper', 'bogus'], 'Unknown rule wrapper action: bogus'],
  [['wrapper', 'list', 'extra'], 'Unexpected rule wrapper argument: extra'],
  [['wrapper', 'add'], 'rule wrapper add requires a command'],
  [['wrapper', 'add', 'a', 'b', 'c'], 'Unexpected rule wrapper argument: b'],
  [['init', 'a', 'b'], 'Unexpected rule argument: b'],
  [['list', '--global'], 'Unknown option for rule list: --global'],
  [
    ['add'],
    'rule add requires a source (pass --only <rulebook...> to select from cc-safety-net/rulebooks)',
  ],
  [['remove'], 'rule remove requires a source'],
  [['--nope'], 'Unknown option for rule: --nope'],
  [['--ref'], '--ref requires a value'],
  [
    ['init', '--delete-source', '--cleanup'],
    'Unknown option for rule init: --delete-source\nUnknown option for rule init: --cleanup',
  ],
];

describe('usage errors', () => {
  for (const [args, message] of usageErrors) {
    test(`\`rule ${args.join(' ')}\` is refused before anything is written`, async () => {
      const outcome = await rule(args);
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stdout).toBe('');
      expect(outcome.stderr).toBe(`${message}\n`);
      expect(holds(outcome, 'rule.json')).toBeFalse();
    }, 60_000);
  }

  // The one flag error that has no subcommand to name: the help stands in for the message.
  test('`rule --check` with no subcommand answers with the tree', async () => {
    const outcome = await rule(['--check']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toStartWith('cc-safety-net rule\n');
  }, 60_000);
});

describe('init', () => {
  test('a fresh project scope gets the inert config', async () => {
    const outcome = await rule(['init']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Rule config initialized.\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('a compact existing config is rewritten in the four-key shape', async () => {
    const outcome = await rule(['init'], { [`${P}/rule.json`]: '{"version":1,"rules":[]}' });
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('--example writes the starter rulebook without listing it as a source', async () => {
    const outcome = await rule(['init', '--example']);
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
    expect(fileAt(outcome, `${P}/example-rules/rulebook.json`)).toContain(
      '"name": "example-rules"',
    );
  }, 60_000);

  test('--example over an example that is already there keeps the edited file', async () => {
    const edited = json({ rulebook_version: 1, name: 'example-rules', version: '9.9.9' });
    const outcome = await rule(['init', '--example'], {
      [`${P}/rule.json`]: rulesConfig([]),
      [`${P}/example-rules/rulebook.json`]: edited,
    });
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${P}/example-rules/rulebook.json`)).toBe(edited);
  }, 60_000);

  test('--global initializes the user scope instead', async () => {
    const outcome = await rule(['init', '--global']);
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${U}/rule.json`)).toBe(rulesConfig([]));
    expect(holds(outcome, 'project/.cc-safety-net')).toBeFalse();
  }, 60_000);

  // Pinned as found: `ensureRulesConfig` returns on a config it cannot parse and the runtime
  // check finds no config to complain about, so the malformed file survives a reported success.
  test('a malformed config is left as it is and still reported as initialized', async () => {
    const outcome = await rule(['init'], { [`${P}/rule.json`]: 'not json' });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Rule config initialized.\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe('not json');
  }, 60_000);
});

describe('add of a local source', () => {
  test('a present rulebook is listed, and the scope it landed in is named', async () => {
    const outcome = await rule(['add', 'team'], {
      [`${P}/rule.json`]: rulesConfig([]),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        'Scope: project (<root>/project/.cc-safety-net/rules)',
        'Added rulebook source: team',
        ...SUMMARY,
      ].join('\n'),
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['team']));
  }, 60_000);

  test('a source with no rulebook file is refused and the config is untouched', async () => {
    const outcome = await rule(['add', 'team'], { [`${P}/rule.json`]: rulesConfig([]) });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('Rulebook source not found: team\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('a rulebook whose name is not the directory name is refused', async () => {
    const outcome = await rule(['add', 'team'], {
      [`${P}/rule.json`]: rulesConfig([]),
      [`${P}/team/rulebook.json`]: OTHER,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('rulebook name "other" must match local source "team"\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('a rulebook whose own fixture does not hold is refused at author time', async () => {
    const outcome = await rule(['add', 'team'], {
      [`${P}/rule.json`]: rulesConfig([]),
      [`${P}/team/rulebook.json`]: v2Rulebook(
        'team',
        [
          {
            name: 'block-compose',
            command: 'docker',
            match: { command_path: ['compose'] },
            reason: 'Never compose.',
          },
        ],
        [{ command: 'docker system prune', expect: 'blocked', rule: 'block-compose' }],
      ),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'tests[0]: expected "block-compose" to block "docker system prune" but no rule matched\n',
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('a rulebook past the acceptance limits is refused whole', async () => {
    const outcome = await rule(['add', 'team'], {
      [`${P}/rule.json`]: rulesConfig([]),
      [`${P}/team/rulebook.json`]: oversizedRulebook('team'),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe("Rulebook exceeds CC Safety Net's safe validation limits.\n");
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('a source that is already configured is not listed twice', async () => {
    const outcome = await rule(['add', 'team'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('Added rulebook source: team');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['team']));
  }, 60_000);

  test('--global names the user scope and writes there', async () => {
    const outcome = await rule(['add', 'team', '--global'], {
      [`${U}/rule.json`]: rulesConfig([]),
      [`${U}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout.split('\n')[0]).toBe(
      `Scope: user (${posix.join('<root>', 'home', '.cc-safety-net', 'rules')})`,
    );
    expect(fileAt(outcome, `${U}/rule.json`)).toBe(rulesConfig(['team']));
  }, 60_000);

  // Pinned as found: only `rule update` reloads the scope the way the guard does, so an add over
  // a config with a stale override key succeeds and leaves the key for the next update to report.
  test('a stale override key does not stop the add that would surface it', async () => {
    const config = rulesConfig([], { overrides: { 'team/nope': 'off' } });
    const outcome = await rule(['add', 'team'], {
      [`${P}/rule.json`]: config,
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stderr).toBe('');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(
      rulesConfig(['team'], { overrides: { 'team/nope': 'off' } }),
    );
  }, 60_000);

  test('a scope with no config at all is created by the add that succeeds', async () => {
    const outcome = await rule(['add', 'team'], { [`${P}/team/rulebook.json`]: TEAM });
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['team']));
  }, 60_000);

  test('a scope with no config keeps none when the add fails', async () => {
    const outcome = await rule(['add', 'team']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('Rulebook source not found: team\n');
    expect(holds(outcome, 'rule.json')).toBeFalse();
  }, 60_000);
});

describe('remove', () => {
  test('an exact local spec is dropped and the scope is re-reported', async () => {
    const outcome = await rule(['remove', 'team'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Removed rulebook source: team\n\nActive rulebooks: (none)\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
    expect(fileAt(outcome, `${P}/team/rulebook.json`)).toBe(TEAM);
  }, 60_000);

  test('--delete-source deletes a directory that holds nothing else', async () => {
    const outcome = await rule(['remove', 'team', '--delete-source'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
    expect(holds(outcome, 'rules/team')).toBeFalse();
  }, 60_000);

  test('--delete-source refuses a directory that holds anything else', async () => {
    const outcome = await rule(['remove', 'team', '--delete-source'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
      [`${P}/team/notes.md`]: 'kept by hand\n',
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'Local rulebook source directory contains extra files: <root>/project/.cc-safety-net/rules/team. delete manually if you really want to remove the directory.\n',
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['team']));
    expect(fileAt(outcome, `${P}/team/notes.md`)).toBe('kept by hand\n');
  }, 60_000);

  test('--delete-source refuses a directory with no rulebook in it', async () => {
    const outcome = await rule(['remove', 'team', '--delete-source'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/notes.md`]: 'kept by hand\n',
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'Local rulebook source directory is missing rulebook.json: <root>/project/.cc-safety-net/rules/team\n',
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['team']));
  }, 60_000);

  test('--delete-source refuses a vendored GitHub spec outright', async () => {
    const outcome = await rule(['remove', 'acme/repo#main/x', '--delete-source'], {
      [`${P}/rule.json`]: rulesConfig(['acme/repo#main/x']),
      [`${P}/x/rulebook.json`]: VENDORED_X,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('--delete-source can only delete local rulebook sources\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['acme/repo#main/x']));
  }, 60_000);

  test('a rulebook name resolves to the vendored spec that published it', async () => {
    const outcome = await rule(['remove', 'x'], {
      [`${P}/rule.json`]: rulesConfig(['acme/repo#main/x']),
      [`${P}/x/rulebook.json`]: VENDORED_X,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toStartWith('Removed rulebook source: x\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
    expect(fileAt(outcome, `${P}/x/rulebook.json`)).toBe(VENDORED_X);
  }, 60_000);

  test('owner/repo removes the one ref that is configured for it', async () => {
    const outcome = await rule(['remove', 'acme/repo'], {
      [`${P}/rule.json`]: rulesConfig(['acme/repo#main/x']),
      [`${P}/x/rulebook.json`]: VENDORED_X,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toStartWith('Removed rulebook source: acme/repo\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  test('owner/repo with two configured refs asks which one', async () => {
    const outcome = await rule(['remove', 'acme/repo'], {
      [`${P}/rule.json`]: rulesConfig(['acme/repo#main/x', 'acme/repo#v2/y']),
      [`${P}/x/rulebook.json`]: VENDORED_X,
      [`${P}/y/rulebook.json`]: VENDORED_Y,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'Multiple refs are configured for acme/repo. Use an explicit ref:\n  cc-safety-net rule remove acme/repo#<ref>\n',
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(
      rulesConfig(['acme/repo#main/x', 'acme/repo#v2/y']),
    );
  }, 60_000);

  test('owner/repo#ref removes that ref and leaves its sibling active', async () => {
    const outcome = await rule(['remove', 'acme/repo#v2'], {
      [`${P}/rule.json`]: rulesConfig(['acme/repo#main/x', 'acme/repo#v2/y']),
      [`${P}/x/rulebook.json`]: VENDORED_X,
      [`${P}/y/rulebook.json`]: VENDORED_Y,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        'Removed rulebook source: acme/repo#v2',
        '',
        'Active rulebooks (1):',
        '  - x 1.0.0 (1 rule)',
        '    Source: acme/repo#main/x',
        '',
      ].join('\n'),
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['acme/repo#main/x']));
  }, 60_000);

  test('--global drops the source from the user scope and never touches the project', async () => {
    const outcome = await rule(['remove', 'team', '--global'], {
      [`${U}/rule.json`]: rulesConfig(['team']),
      [`${U}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toStartWith('Removed rulebook source: team\n');
    expect(fileAt(outcome, `${U}/rule.json`)).toBe(rulesConfig([]));
    expect(holds(outcome, 'project/.cc-safety-net')).toBeFalse();
  }, 60_000);

  test('a match nothing answers to is named as such', async () => {
    const outcome = await rule(['remove', 'nope'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('No configured rulebook matches nope\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['team']));
  }, 60_000);

  test('a scope with no config names the file it looked for', async () => {
    const outcome = await rule(['remove', 'team']);
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe(
      'No config found at <root>/project/.cc-safety-net/rules/rule.json\n',
    );
  }, 60_000);

  test('a config that does not parse is reported instead of overwritten', async () => {
    const outcome = await rule(['remove', 'team'], { [`${P}/rule.json`]: 'not json' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('Invalid JSON\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe('not json');
  }, 60_000);
});

describe('update', () => {
  test('a local-only scope is re-read and reported', async () => {
    const outcome = await rule(['update'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(['Rule config updated.', ...SUMMARY].join('\n'));
  }, 60_000);

  test('--global re-reads the user scope, which the project scope could not stand in for', async () => {
    const outcome = await rule(['update', '--global'], {
      [`${U}/rule.json`]: rulesConfig(['team']),
      [`${U}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(['Rule config updated.', ...SUMMARY].join('\n'));
    expect(holds(outcome, 'project/.cc-safety-net')).toBeFalse();
  }, 60_000);

  test('a selective name that matches nothing updates nothing', async () => {
    const outcome = await rule(['update', 'nope'], {
      [`${P}/rule.json`]: rulesConfig(['team']),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe('No configured rulebook matches nope\n');
  }, 60_000);

  test('a selective local name still reports the whole scope', async () => {
    const outcome = await rule(['update', 'team'], {
      [`${P}/rule.json`]: rulesConfig(['team', 'other']),
      [`${P}/team/rulebook.json`]: TEAM,
      [`${P}/other/rulebook.json`]: OTHER,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('Active rulebooks (2):');
    expect(outcome.stdout).toContain('  - other 1.0.0 (1 rule)');
  }, 60_000);

  test('a config that does not parse stops the update', async () => {
    const outcome = await rule(['update'], { [`${P}/rule.json`]: 'not json' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('Invalid JSON\n');
  }, 60_000);

  // The reload the change ends with: the scope loads the way the guard loads it, and what that
  // finds decides the exit code even though every rulebook resolved.
  test('a stale override key fails the update that reloads the scope', async () => {
    const config = rulesConfig(['team'], { overrides: { 'team/nope': 'off' } });
    const outcome = await rule(['update'], {
      [`${P}/rule.json`]: config,
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toBe(
      'unknown override key "team/nope" in <root>/project/.cc-safety-net/rules/rule.json; only that override is ignored and other overrides and rules keep their configured state; correct or remove it in that file\n',
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(config);
  }, 60_000);

  test('a config listing more sources than the limit is refused before any read', async () => {
    const names = Array.from({ length: 65 }, (_unused, index) => `rb${index + 10}`);
    const outcome = await rule(['update'], {
      [`${P}/rule.json`]: rulesConfig(names),
      ...Object.fromEntries(names.map((name) => [`${P}/${name}/rulebook.json`, v1Rulebook(name)])),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe("Rule config exceeds CC Safety Net's safe source limit.\n");
  }, 60_000);
});

describe('list', () => {
  test('a machine with no rule config at all reports every section empty', async () => {
    const outcome = await rule(['list']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        'Active sources: (none)',
        'Active rules: (none)',
        'Disabled rules: (none)',
        'Reason overrides: (none)',
        'Transparent wrappers: (none)',
        'Issues: (none)',
        'Warnings: (none)',
        '',
      ].join('\n'),
    );
  }, 60_000);

  test('both scopes are rendered in load order, with every section that has content', async () => {
    const outcome = await rule(['list'], {
      [`${U}/rule.json`]: rulesConfig(['userbook'], {
        overrides: { 'userbook/block-docker-system-prune': { reason: 'User says no.' } },
        transparent_wrappers: ['rtk'],
      }),
      [`${U}/userbook/rulebook.json`]: USER_BOOK,
      [`${P}/rule.json`]: rulesConfig(['team'], {
        overrides: { 'team/block-tf-apply': 'off' },
        transparent_wrappers: ['doit'],
      }),
      [`${P}/team/rulebook.json`]: v2Rulebook(
        'team',
        [
          {
            name: 'block-tf-destroy',
            command: 'terraform',
            match: {
              command_path: ['destroy'],
              any_args: ['-auto-approve'],
              exclude_args: ['-target'],
            },
            reason: 'Destroys infrastructure.',
          },
          {
            name: 'block-tf-apply',
            command: 'terraform',
            match: { command_path: ['apply'] },
            reason: 'Apply from CI only.',
          },
        ],
        [
          {
            command: 'terraform destroy -auto-approve',
            expect: 'blocked',
            rule: 'block-tf-destroy',
          },
        ],
      ),
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        'Active sources (2):',
        '  - [user] userbook 1.0.0',
        '      Source: userbook',
        '  - [project] team 1.0.0',
        '      Source: team',
        'Active rules (2):',
        '  - [user] userbook/block-docker-system-prune',
        '      Command: docker system',
        '      Block args: prune',
        '      Reason: User says no.',
        '  - [project] team/block-tf-destroy',
        '      Command: terraform destroy',
        '      Any args: -auto-approve',
        '      Exclude args: -target',
        '      Reason: Destroys infrastructure.',
        'Disabled rules (1):',
        '  - team/block-tf-apply',
        'Reason overrides (1):',
        '  - userbook/block-docker-system-prune',
        '      Reason: User says no.',
        'Transparent wrappers (2):',
        '  - rtk',
        '  - doit',
        'Issues: (none)',
        'Warnings: (none)',
        '',
      ].join('\n'),
    );
  }, 60_000);

  test('a warning alone is reported and still exits 0', async () => {
    const outcome = await rule(['list'], {
      [`${P}/rule.json`]: rulesConfig(['team'], { overrides: { 'team/nope': 'off' } }),
      [`${P}/team/rulebook.json`]: TEAM,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('Warnings (1):');
    expect(outcome.stdout).toContain('  - unknown override key "team/nope" in <root>/project');
  }, 60_000);

  test('a missing rulebook file is an issue and exits 1', async () => {
    const outcome = await rule(['list'], { [`${P}/rule.json`]: rulesConfig(['team']) });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toContain(
      '  - missing rulebook file <root>/project/.cc-safety-net/rules/team/rulebook.json for team;',
    );
  }, 60_000);

  test('a user config that does not parse is an issue and exits 1', async () => {
    const outcome = await rule(['list'], { [`${U}/rule.json`]: 'not json' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toContain(
      '  - <root>/home/.cc-safety-net/rules/rule.json: Invalid JSON',
    );
  }, 60_000);

  test('a project override aimed at a user rule is two warnings, not a failure', async () => {
    const outcome = await rule(['list'], {
      [`${U}/rule.json`]: rulesConfig(['userbook']),
      [`${U}/userbook/rulebook.json`]: USER_BOOK,
      [`${P}/rule.json`]: rulesConfig([], {
        overrides: { 'userbook/block-docker-system-prune': 'off' },
      }),
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('Warnings (2):');
    expect(outcome.stdout).toContain(
      '  - project override cannot target user-scoped rule "userbook/block-docker-system-prune"',
    );
  }, 60_000);
});

describe('wrapper', () => {
  test('add records the command', async () => {
    const outcome = await rule(['wrapper', 'add', 'rtk'], { [`${P}/rule.json`]: rulesConfig([]) });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Added transparent wrapper: rtk\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(
      rulesConfig([], { transparent_wrappers: ['rtk'] }),
    );
  }, 60_000);

  test('adding the same command twice leaves one entry', async () => {
    const configured = rulesConfig([], { transparent_wrappers: ['rtk'] });
    const outcome = await rule(['wrapper', 'add', 'rtk'], { [`${P}/rule.json`]: configured });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Added transparent wrapper: rtk\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(configured);
  }, 60_000);

  // The removal is reported either way, and either way the config is rewritten without it.
  for (const [name, configured] of [
    ['remove drops the command', rulesConfig([], { transparent_wrappers: ['rtk'] })],
    ['removing a command that was never there still reports the removal', rulesConfig([])],
  ] as const) {
    test(name, async () => {
      const outcome = await rule(['wrapper', 'remove', 'rtk'], {
        [`${P}/rule.json`]: configured,
      });
      expect(outcome.exitCode).toBe(0);
      expect(outcome.stdout).toBe('Removed transparent wrapper: rtk\n');
      expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
    }, 60_000);
  }

  test('list says so when nothing is trusted', async () => {
    const outcome = await rule(['wrapper', 'list'], { [`${P}/rule.json`]: rulesConfig([]) });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Transparent wrappers: (none)\n');
  }, 60_000);

  test('list keeps the configured order', async () => {
    const outcome = await rule(['wrapper', 'list'], {
      [`${P}/rule.json`]: rulesConfig([], { transparent_wrappers: ['rtk', 'doit'] }),
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe('Transparent wrappers (2):\n  - rtk\n  - doit\n');
  }, 60_000);

  test('a command name that is not a command is refused', async () => {
    const outcome = await rule(['wrapper', 'add', 'bad name!'], {
      [`${P}/rule.json`]: rulesConfig([]),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('transparent wrapper must match command pattern\n');
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
  }, 60_000);

  for (const reserved of ['git', 'python3']) {
    test(`the analyzed command ${reserved} cannot be trusted away`, async () => {
      const outcome = await rule(['wrapper', 'add', reserved], {
        [`${P}/rule.json`]: rulesConfig([]),
      });
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toBe(`reserved command "${reserved}" cannot be a wrapper\n`);
      expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig([]));
    }, 60_000);
  }

  for (const action of [['add', 'rtk'], ['list']]) {
    test(`\`wrapper ${action.join(' ')}\` over a config that does not parse writes nothing`, async () => {
      const outcome = await rule(['wrapper', ...action], { [`${P}/rule.json`]: 'not json' });
      expect(outcome.exitCode).toBe(1);
      expect(outcome.stderr).toBe('Invalid JSON\n');
      expect(fileAt(outcome, `${P}/rule.json`)).toBe('not json');
    }, 60_000);
  }

  test('--global writes the user config the scope had never created', async () => {
    const outcome = await rule(['wrapper', 'add', 'rtk', '--global']);
    expect(outcome.exitCode).toBe(0);
    expect(fileAt(outcome, `${U}/rule.json`)).toBe(
      rulesConfig([], { transparent_wrappers: ['rtk'] }),
    );
  }, 60_000);
});

describe('migrate', () => {
  test('a machine with no legacy files names both places it looked', async () => {
    const outcome = await rule(['migrate']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        'No legacy config found at <root>/project/.safety-net.json',
        'No legacy config found at <root>/home/.cc-safety-net/config.json',
        '',
      ].join('\n'),
    );
  }, 60_000);

  test('a project legacy config becomes a rulebook and --cleanup deletes the original', async () => {
    const outcome = await rule(['migrate', '--cleanup'], {
      'project/.safety-net.json': legacyConfig([
        {
          name: 'block-docker-system-prune',
          command: 'docker',
          subcommand: 'system',
          block_args: ['prune'],
          reason: 'Use targeted cleanup instead.',
        },
      ]),
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout.split('\n')[0]).toBe(
      'Deleted legacy config at <root>/project/.safety-net.json',
    );
    expect(fileAt(outcome, `${P}/rule.json`)).toBe(rulesConfig(['project-rules']));
    expect(fileAt(outcome, `${P}/project-rules/rulebook.json`)).toContain(
      '"name": "project-rules"',
    );
    expect(holds(outcome, '.safety-net.json')).toBeFalse();
  }, 60_000);

  test('a legacy file that does not parse fails and leaves it in place', async () => {
    const outcome = await rule(['migrate'], { 'project/.safety-net.json': 'not json' });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stderr).toBe('Invalid JSON\n');
    expect(fileAt(outcome, 'project/.safety-net.json')).toBe('not json');
    expect(holds(outcome, 'rule.json')).toBeFalse();
  }, 60_000);
});

const LOCK_ENTRY = {
  spec: 'acme/repo#main/x',
  digest: sha256Digest(VENDORED_X),
  name: 'x',
  owner: 'acme',
  repo: 'repo',
  display_ref: 'main',
};
const DEPRECATION =
  '`cc-safety-net rule sync` is deprecated: rulebooks are live files that need no synchronization. This run only migrates the lock and cache an earlier version left behind.';

describe('sync', () => {
  test('a scope with nothing left behind says so', async () => {
    const outcome = await rule(['sync'], { [`${P}/rule.json`]: rulesConfig([]) });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        DEPRECATION,
        'No v2 lock or cache leftovers found in <root>/project/.cc-safety-net; nothing to migrate.',
        '',
      ].join('\n'),
    );
  }, 60_000);

  test('a cached copy that still matches its digest is vendored and the leftovers go', async () => {
    const outcome = await rule(['sync'], {
      [`${P}/rule.json`]: rulesConfig([LOCK_ENTRY.spec]),
      [`${P}/rule.lock`]: v2Lock([LOCK_ENTRY]),
      [`project/.cc-safety-net/cache/rulebooks/${v2CacheDir(LOCK_ENTRY)}/rulebook.json`]:
        VENDORED_X,
    });
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(
      [
        DEPRECATION,
        `Vendored ${LOCK_ENTRY.spec} from the v2 cache.`,
        'Removed the v2 lock and cache under <root>/project/.cc-safety-net.',
        '',
      ].join('\n'),
    );
    expect(fileAt(outcome, `${P}/x/rulebook.json`)).toBe(VENDORED_X);
    expect(holds(outcome, 'rule.lock')).toBeFalse();
    expect(holds(outcome, 'cache')).toBeFalse();
  }, 60_000);

  test('a config that cannot be read keeps the leftovers it cannot interpret', async () => {
    const outcome = await rule(['sync'], {
      [`${P}/rule.json`]: '{ not json',
      [`${P}/rule.lock`]: v2Lock([LOCK_ENTRY]),
    });
    expect(outcome.exitCode).toBe(1);
    expect(outcome.stdout).toBe(`${DEPRECATION}\n`);
    expect(outcome.stderr).toBe(
      'Cannot migrate: the rules config in <root>/project/.cc-safety-net is missing or unreadable while v2 leftovers remain. Restore rule.json, then re-run rule sync.\n',
    );
    expect(fileAt(outcome, `${P}/rule.lock`)).toBe(v2Lock([LOCK_ENTRY]));
  }, 60_000);
});

describe('verify and doc', () => {
  test('verify over a machine with no config reports the built-in rules', async () => {
    const outcome = await rule(['verify']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toContain('No config files found. Using built-in rules only.');
  }, 60_000);

  test('doc prints the authoring guide and nothing else', async () => {
    const outcome = await rule(['doc']);
    expect(outcome.exitCode).toBe(0);
    expect(outcome.stdout).toBe(`${RULE_DOC}\n`);
    expect(outcome.stderr).toBe('');
  }, 60_000);
});
