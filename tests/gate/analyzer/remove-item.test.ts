import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProtectedGitMetadata } from '@/core/git/metadata';
import type { ShellKind } from '@/core/shell/model';
import { parseCommand } from '@/core/shell/parse';
import { projectCommandViews } from '@/core/shell/traversal';
import { analyzePowerShellCommandViewMatch } from '@/gate/analyzer/powershell/remove-item';
import { createRecursiveDeleteTargetContext } from '@/gate/analyzer/recursive-delete-targets';
import { pairedEnvironments } from '../../core/differential-inputs';
import { describeOutcome, writeTree } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, FIXED_COMMANDS, SHELL_DIALECTS } from '../../helpers/shell-inputs';

/**
 * PowerShell deletion is a parameter language: abbreviated switches, `-Path:` values, array
 * commas, `--`, `-WhatIf` and pipeline input all decide whether a target is even seen. Every
 * spelling is parsed in all three dialects and recorded.
 */

let root = '';
let home = '';
let workspace = '';
let repoMetadata: ProtectedGitMetadata | null = null;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'next-remove-item-')));
  home = join(root, 'home');
  workspace = join(root, 'work');
  writeTree(root, {
    'home/Documents': null,
    'work/build': null,
    'work/.git/hooks': null,
    temp: null,
  });
  const dotGit = join(workspace, '.git');
  repoMetadata = {
    entries: [dotGit],
    markerFiles: [join(dotGit, 'HEAD')],
    directories: [dotGit],
    hooksDirectories: [join(dotGit, 'hooks')],
  };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const REMOVE_ITEM_COMMANDS: readonly string[] = [
  'Remove-Item build',
  'Remove-Item -Recurse -Force build',
  'Remove-Item -Recurse -Force ..',
  'Remove-Item -Recurse -Force .',
  'Remove-Item -Recurse -Force /',
  'Remove-Item /',
  'Remove-Item -Force ~',
  'Remove-Item -Recurse -Force C:\\',
  'Remove-Item -Recurse -Force $env:USERPROFILE',
  'Remove-Item -Recurse -Force $env:USERPROFILE\\Documents',
  'Remove-Item -Recurse -Force $env:HOME',
  'Remove-Item -Recurse -Force ~',
  'Remove-Item -Recurse -Force $HOME',
  'Remove-Item -Recurse -Force $target',
  'Remove-Item -Recurse -Force',
  'Remove-Item -Recurse',
  'Remove-Item -Force build',
  'Remove-Item -Rec -Fo build',
  'Remove-Item -r -f build',
  'Remove-Item -Recurse:$true -Force:$true build',
  'Remove-Item -Recurse -Force -WhatIf build',
  'Remove-Item -Recurse -Force -WhatIf:$false build',
  'Remove-Item -Recurse -Force -wi build',
  'Remove-Item -Path build -Recurse -Force',
  'Remove-Item -Path:build -Recurse -Force',
  'Remove-Item -LiteralPath build -Recurse -Force',
  'Remove-Item -p build -Recurse -Force',
  'Remove-Item -Path -Recurse -Force',
  'Remove-Item -Recurse -Force ./build -Path',
  'Remove-Item -Recurse -Force -- -weird',
  'Remove-Item -Recurse -Force a, b',
  'Remove-Item -Recurse -Force a,b',
  'Remove-Item -Recurse -Force .git',
  'Remove-Item -Recurse -Force .git\\hooks',
  'Remove-Item -Force .git\\HEAD',
  'Remove-Item .git\\hooks\\pre-commit',
  'Remove-Item -Recurse -Force \\\\?\\C:\\Temp',
  'ri -Recurse -Force build',
  'del -Recurse -Force build',
  'erase -Recurse -Force build',
  'rd -Recurse -Force build',
  'rm -Recurse -Force build',
  'rmdir -Recurse -Force build',
  '& Remove-Item -Recurse -Force build',
  '. Remove-Item -Recurse -Force build',
  '& Remove-Item',
  'Get-ChildItem | Remove-Item -Recurse -Force',
  'Get-ChildItem | Remove-Item build',
  'Get-ChildItem | Remove-Item -Recurse -Force build',
  'Remove-Item -Recurse -Force $env:TEMP\\x',
  'Remove-Item -Recurse -Force "quoted dir"',
  "Remove-Item -Recurse -Force 'quoted dir'",
  'Write-Output x',
];

type RemoveItemCase = {
  readonly label: string;
  readonly cwd?: string;
  readonly strict?: boolean;
  readonly paranoid?: boolean;
  readonly metadata?: boolean;
  readonly disablePipelineRule?: boolean;
};

function removeItemCases(): readonly RemoveItemCase[] {
  return [
    { label: 'workspace', cwd: workspace },
    { label: 'workspace, strict', cwd: workspace, strict: true },
    { label: 'workspace, paranoid', cwd: workspace, paranoid: true },
    { label: 'workspace, strict with metadata', cwd: workspace, strict: true, metadata: true },
    { label: 'home as cwd', cwd: home, strict: true },
    { label: 'no cwd', strict: true },
    {
      label: 'pipeline rule disabled by policy',
      cwd: workspace,
      strict: true,
      disablePipelineRule: true,
    },
  ];
}

function optionsFor(row: RemoveItemCase) {
  return {
    cwd: row.cwd ?? workspace,
    originalCwd: row.cwd ?? workspace,
    strict: row.strict,
    paranoid: row.paranoid,
    protectedGitMetadata: row.metadata ? repoMetadata : null,
    policy: row.disablePipelineRule
      ? {
          destructiveCommandProtectionEnabled: true,
          effectiveDestructiveCommandRules: {
            'powershell.remove-item-pipeline-dynamic-target': {
              enabled: false,
              inheritedEnabled: true,
              changesInherited: true,
              source: 'rule_override' as const,
            },
          },
        }
      : undefined,
  };
}

/** Every command view the dialect yields. */
function viewPairs(source: string, dialect: ShellKind) {
  return projectCommandViews(parseCommand(source, dialect));
}

/** Every match reached since the last digest; each test drains it. */
const recorded: [string, unknown][] = [];

function comparePair(source: string, dialect: ShellKind, row: RemoveItemCase) {
  const paired = pairedEnvironments({ HOME: home, TMPDIR: join(root, 'temp') }, home);
  const options = optionsFor(row);
  for (const view of viewPairs(source, dialect)) {
    for (const hasPipelineInput of [false, true]) {
      const label = `${dialect}/${row.label}${hasPipelineInput ? ' piped' : ''}: ${source}`;
      const match = describeOutcome(() =>
        analyzePowerShellCommandViewMatch(view, hasPipelineInput, {
          ...options,
          environment: paired,
        }),
      );
      recorded.push([label, match]);
    }
  }
}

describe('powershell Remove-Item', () => {
  test('every spelling matches the shipped analyzer in all three dialects', () => {
    for (const dialect of SHELL_DIALECTS) {
      for (const row of removeItemCases()) {
        for (const source of REMOVE_ITEM_COMMANDS) {
          comparePair(source, dialect, row);
        }
      }
    }
    expectRecordedDigest('analyzer-remove-item/spellings', recorded.splice(0), root);
  });

  test('the table reaches every Remove-Item rule', () => {
    const reported = new Set(
      removeItemCases().flatMap((row) => {
        const paired = pairedEnvironments({ HOME: home }, home);
        const options = { ...optionsFor(row), environment: paired };
        return REMOVE_ITEM_COMMANDS.flatMap((source) =>
          viewPairs(source, 'powershell').flatMap((view) =>
            [false, true].flatMap((hasPipelineInput) => {
              const match = analyzePowerShellCommandViewMatch(view, hasPipelineInput, options);
              return match ? [match.id] : [];
            }),
          ),
        );
      }),
    );
    expect([...reported].sort()).toStrictEqual([
      'powershell.remove-item-git-metadata',
      'powershell.remove-item-pipeline-dynamic-target',
      'powershell.remove-item-recursive-force-cwd-self',
      'powershell.remove-item-recursive-force-dynamic-target',
      'powershell.remove-item-recursive-force-home-cwd',
      'powershell.remove-item-recursive-force-outside-cwd',
      'powershell.remove-item-recursive-force-paranoid',
      'powershell.remove-item-recursive-force-root-or-home',
      'powershell.remove-item-root-or-home',
    ]);
  });

  test('a caller-supplied delete-target context overrides the one built from the options', () => {
    const paired = pairedEnvironments({ HOME: home }, home);
    const anchoredAtHome = { cwd: home, originalCwd: home, protectedGitMetadata: null };
    const options = { cwd: workspace, originalCwd: workspace, protectedGitMetadata: null };
    for (const view of viewPairs('Remove-Item -Recurse -Force build', 'powershell')) {
      const next = analyzePowerShellCommandViewMatch(
        view,
        false,
        { ...options, environment: paired },
        createRecursiveDeleteTargetContext({ ...anchoredAtHome, environment: paired }),
      );
      recorded.push(['supplied context', next]);
      // The context decides, so the home anchor wins over the workspace in the options.
      expect(next?.id).toBe('powershell.remove-item-recursive-force-home-cwd');
      expect(
        analyzePowerShellCommandViewMatch(view, false, {
          ...options,
          environment: paired,
        }),
      ).toBeNull();
    }
    expectRecordedDigest('analyzer-remove-item/supplied-context', recorded.splice(0), root);
  });

  test('-WhatIf disarms the command and an unabbreviated alias is still recognized', () => {
    const paired = pairedEnvironments({ HOME: home }, home);
    const options = {
      cwd: workspace,
      originalCwd: workspace,
      protectedGitMetadata: null,
      environment: paired,
    };
    const analyze = (source: string, piped = false) =>
      viewPairs(source, 'powershell').map(
        (view) => analyzePowerShellCommandViewMatch(view, piped, options)?.id ?? null,
      );
    expect(analyze('Remove-Item -Recurse -Force ..')).toStrictEqual([
      'powershell.remove-item-recursive-force-outside-cwd',
    ]);
    expect(analyze('Remove-Item -Recurse -Force -WhatIf ..')).toStrictEqual([null]);
    expect(analyze('rd -Recurse -Force ..')).toStrictEqual([
      'powershell.remove-item-recursive-force-outside-cwd',
    ]);
    expect(analyze('Write-Output ..')).toStrictEqual([null]);
  });

  test('the corpus and the fixed parser table agree in every dialect', () => {
    const row = removeItemCases()[1];
    if (!row) throw new Error('missing case');
    for (const dialect of SHELL_DIALECTS) {
      for (const source of [...corpusCommands(), ...FIXED_COMMANDS]) {
        comparePair(source, dialect, row);
      }
    }
    expectRecordedDigest('analyzer-remove-item/corpus', recorded.splice(0), root);
  });
});
