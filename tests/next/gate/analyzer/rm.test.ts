import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { EffectiveDestructiveCommandRuleState } from '@next/core/policy/types';
import { parseCommand } from '@next/core/shell/parse';
import { projectCommandViews } from '@next/core/shell/traversal';
import { type AnalyzeRmOptions, analyzeRmMatch } from '@next/gate/analyzer/rm';
import { analyzeRmMatch as shippedAnalyzeRmMatch } from '@/analyzer/rm';
import type { ProtectedGitMetadata } from '@/ir/analysis';
import { parseCommand as shippedParseCommand } from '@/parser/command';
import { projectCommandViews as shippedProjectCommandViews } from '@/parser/traversal';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import {
  corpusCommands,
  FIXED_COMMANDS,
  FUZZ_SEED,
  fuzzShellSources,
} from '../../helpers/shell-inputs';

/**
 * `rm` is the rule set with the most gates in front of it — recursion, force, brace expansion,
 * the Git control plane, allow paths, the temp roots and the paranoid tier — so every spelling
 * runs through the shipped analyzer and the ported one under the same process state.
 */

let root = '';
let home = '';
let workspace = '';
let gitMetadata: ProtectedGitMetadata = {
  entries: [],
  markerFiles: [],
  directories: [],
  hooksDirectories: [],
};

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-rm-')));
  home = join(root, 'home');
  workspace = join(root, 'work');
  writeTree(root, {
    'home/keep': null,
    'work/src': null,
    'work/.git/hooks': null,
    'work/.git/HEAD': 'ref: refs/heads/main\n',
    allowed: null,
    scratch: null,
  });
  gitMetadata = {
    entries: [join(workspace, '.git')],
    markerFiles: [join(workspace, '.git', 'HEAD')],
    directories: [join(workspace, '.git')],
    hooksDirectories: [join(workspace, '.git', 'hooks')],
  };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** A rule state as the policy loader resolves it, used to force one rule off or on. */
function ruleState(enabled: boolean): EffectiveDestructiveCommandRuleState {
  return { enabled, inheritedEnabled: !enabled, changesInherited: true, source: 'rule_override' };
}

type OptionCase = {
  readonly label: string;
  readonly env?: Record<string, string>;
  readonly options: Omit<AnalyzeRmOptions, 'environment' | 'protectedGitMetadata'> & {
    protectedGitMetadata?: ProtectedGitMetadata | null;
  };
};

function optionCases(): readonly OptionCase[] {
  return [
    { label: 'plain workspace', options: { cwd: workspace, originalCwd: workspace } },
    {
      label: 'strict',
      options: { cwd: workspace, originalCwd: workspace, strict: true },
    },
    {
      label: 'paranoid rm',
      options: { cwd: workspace, originalCwd: workspace, paranoid: true },
    },
    {
      label: 'paranoid rm disabled by policy',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        paranoid: true,
        policy: {
          destructiveCommandProtectionEnabled: true,
          effectiveDestructiveCommandRules: { 'rm.recursive-force-paranoid': ruleState(false) },
        },
      },
    },
    {
      label: 'destructive protection disabled',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        policy: {
          destructiveCommandProtectionEnabled: false,
          effectiveDestructiveCommandRules: {},
        },
      },
    },
    {
      label: 'allow paths cover a sibling directory',
      options: {
        cwd: workspace,
        originalCwd: workspace,
        policy: {
          destructiveCommandProtectionEnabled: true,
          effectiveDestructiveCommandRules: {},
          destructiveCommandAllowPaths: [join(root, 'allowed')],
        },
      },
    },
    {
      label: 'git metadata resolved',
      options: { cwd: workspace, originalCwd: workspace, protectedGitMetadata: gitMetadata },
    },
    {
      label: 'strict inside a nested directory',
      options: {
        cwd: join(workspace, 'src'),
        originalCwd: workspace,
        strict: true,
        protectedGitMetadata: gitMetadata,
      },
    },
    {
      label: 'home is the cwd',
      options: { cwd: home, originalCwd: home },
    },
    {
      label: 'no cwd at all',
      options: {},
    },
    {
      label: 'tmpdir trusted',
      env: { TMPDIR: join(root, 'scratch') },
      options: {
        cwd: workspace,
        originalCwd: workspace,
        allowTmpdirVar: true,
        trustedTmpdirValue: true,
      },
    },
    {
      label: 'tmpdir word splitting unsafe',
      env: { TMPDIR: join(root, 'scratch') },
      options: {
        cwd: workspace,
        originalCwd: workspace,
        allowTmpdirVar: true,
        trustedTmpdirValue: true,
        tmpdirWordSplittingUnsafe: true,
      },
    },
  ];
}

const RM_COMMANDS: readonly string[] = [
  'rm',
  'rm -rf',
  'rm --',
  'rm -rf --',
  'rm file.txt',
  'rm -r src',
  'rm -rf src',
  'rm -rf ./src',
  'rm -fr src',
  'rm -r -f src',
  'rm --recursive --force src',
  'rm --recursive src',
  'rm -rf src other',
  'rm -rf -- -weird-name',
  'rm -rf -- ../outside',
  'rm -rf ..',
  'rm -rf .',
  'rm -rf ./',
  'rm -rf *',
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'rm -rf ~/keep',
  'rm -rf $HOME',
  'rm -rf "$HOME"',
  'rm -rf ${HOME}/keep',
  'rm -rf $UNKNOWN/x',
  'rm -rf "$UNKNOWN"',
  'rm -rf $TMPDIR',
  'rm -rf $TMPDIR/build',
  'rm -rf "$TMPDIR"/build',
  'rm -rf ${TMPDIR}/build',
  'rm -rf /tmp/scratch-dir',
  'rm -rf /var/tmp/scratch-dir',
  'rm -rf {a,b}',
  'rm -rf {a,b}/{c,d}',
  'rm -rf x{1..3}',
  'rm -rf {a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}',
  'rm -rf "quoted dir"',
  "rm -rf 'quoted dir'",
  'rm -rf escaped\\ dir',
  'rm .git',
  'rm .git/HEAD',
  'rm -f .git/hooks/pre-commit',
  'rm -rf .git',
  'rm -rf .git/hooks',
  'rm -rf .git/*',
  'rm -r .git',
  'rm -rf ../work',
  'rm -rf /nonexistent/elsewhere',
  'rm -rf -- "$(pwd)"',
  'rm -rf `pwd`',
  'rmdir src',
  'rm -rf allowed',
  'rm -rf allowed/inner',
];

function rmWords(source: string, shipped: boolean) {
  const views = shipped
    ? shippedProjectCommandViews(shippedParseCommand(source, 'posix'))
    : projectCommandViews(parseCommand(source, 'posix'));
  return views.flatMap((view) => (view.words[0]?.text === 'rm' ? [view.words] : []));
}

function runPair(source: string, row: OptionCase) {
  const paired = pairedEnvironments({ HOME: home, ...row.env }, home);
  const options = { protectedGitMetadata: null, ...row.options };
  return rmWords(source, false).map((words, index) => ({
    next: describeOutcome(() => analyzeRmMatch(words, { ...options, environment: paired.next })),
    shipped: describeOutcome(() => {
      const shippedWords = rmWords(source, true)[index];
      if (!shippedWords) throw new Error(`missing shipped command view for ${source}`);
      return shippedAnalyzeRmMatch(shippedWords, { ...options, environment: paired.shipped });
    }),
  }));
}

describe('rm rule set', () => {
  test('every rm spelling matches the shipped analyzer under every option set', () => {
    const recorded: [string, unknown][] = [];
    for (const row of optionCases()) {
      for (const source of RM_COMMANDS) {
        for (const pair of runPair(source, row)) {
          expect(pair.next, `${row.label}: ${source}`).toStrictEqual(pair.shipped);
          recorded.push([`${row.label}: ${source}`, pair.next]);
        }
      }
    }
    expectRecordedDigest('analyzer-rm/option-sets', recorded, root);
  });

  test('the table reaches every rm rule the analyzer can report', () => {
    const reported = new Set(
      optionCases().flatMap((row) =>
        RM_COMMANDS.flatMap((source) =>
          runPair(source, row).flatMap((pair) =>
            pair.next.ok && pair.next.value ? [pair.next.value.id] : [],
          ),
        ),
      ),
    );
    expect([...reported].sort()).toStrictEqual([
      'rm.git-metadata',
      'rm.recursive-force-cwd-self',
      'rm.recursive-force-dynamic-target',
      'rm.recursive-force-home-cwd',
      'rm.recursive-force-outside-cwd',
      'rm.recursive-force-paranoid',
      'rm.recursive-force-root-or-home',
    ]);
  });

  test('a brace expansion that overflows the limit is treated as outside the anchored cwd', () => {
    const paired = pairedEnvironments({ HOME: home }, home);
    const words = rmWords('rm -rf {a,b}{c,d}{e,f}{g,h}{i,j}{k,l}{m,n}', false)[0];
    if (!words) throw new Error('missing overflow command');
    expect(
      analyzeRmMatch(words, {
        environment: paired.next,
        protectedGitMetadata: null,
        cwd: workspace,
        originalCwd: workspace,
      })?.id,
    ).toBe('rm.recursive-force-outside-cwd');
  });

  test('a disabled rule and disabled protection both suppress the match', () => {
    const paired = pairedEnvironments({ HOME: home }, home);
    const words = rmWords('rm -rf src', false)[0];
    if (!words) throw new Error('missing paranoid command');
    const base = {
      environment: paired.next,
      protectedGitMetadata: null,
      cwd: workspace,
      originalCwd: workspace,
      paranoid: true,
    };
    expect(analyzeRmMatch(words, base)?.id).toBe('rm.recursive-force-paranoid');
    expect(
      analyzeRmMatch(words, {
        ...base,
        policy: {
          destructiveCommandProtectionEnabled: true,
          effectiveDestructiveCommandRules: { 'rm.recursive-force-paranoid': ruleState(false) },
        },
      }),
    ).toBeNull();
    // The root-or-home rule is catastrophic, so disabling protection cannot suppress it.
    const rootWords = rmWords('rm -rf /', false)[0];
    if (!rootWords) throw new Error('missing root command');
    expect(
      analyzeRmMatch(rootWords, {
        ...base,
        policy: {
          destructiveCommandProtectionEnabled: false,
          effectiveDestructiveCommandRules: {},
        },
      })?.id,
    ).toBe('rm.recursive-force-root-or-home');
  });

  test('the corpus commands and the seeded fuzz agree with the shipped analyzer', () => {
    const recorded: [string, unknown][] = [];
    const row = { label: 'corpus', options: { cwd: workspace, originalCwd: workspace } };
    for (const source of [
      ...corpusCommands(),
      ...FIXED_COMMANDS,
      ...fuzzShellSources(400, FUZZ_SEED),
    ]) {
      for (const pair of runPair(source, row)) {
        expect(pair.next, source).toStrictEqual(pair.shipped);
        recorded.push([source, pair.next]);
      }
    }
    expectRecordedDigest('analyzer-rm/corpus-and-fuzz', recorded, root);
  });
});
