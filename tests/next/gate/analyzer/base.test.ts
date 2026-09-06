import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createBudget } from '@next/core/budget';
import { processPathResolver } from '@next/core/environment';
import { parseCommand } from '@next/core/shell/parse';
import { projectCommandViews } from '@next/core/shell/traversal';
import {
  analysisWordText,
  analyzedViewWords,
  isLiteralExecutionSourceWord,
  textCommandWords,
} from '@next/gate/analyzer/command-words';
import { isDataOnlyQuotedAssignment } from '@next/gate/analyzer/deferred-assignment';
import { analyzeDeviceCommandMatch } from '@next/gate/analyzer/device';
import {
  getGitEnvValue,
  hasConfigAffectingEnvAssignment,
  hasGitSshEnvAssignment,
  isGitContextEnvOverrideName,
  isTrackedGitEnvName,
  parseGitContextAppendEnvAssignment,
  resolveGitConfigCount,
} from '@next/gate/analyzer/git/env';
import {
  extractGitSubcommandAndRest,
  hasGitCommandLineSshCommandConfig,
  splitAtDoubleDash,
} from '@next/gate/analyzer/git/parse';
import {
  isPersistentHeredocFilePath,
  resolveTrackedHeredocPath,
} from '@next/gate/analyzer/heredoc-files';
import { hasRecursiveForceFlags, hasRecursiveOption } from '@next/gate/analyzer/rm-flags';
import {
  chargeNativeLinearPass,
  chargeScan,
  fixedAt,
  hasWordBoundaryAfter,
  isAsciiWord,
  isEcmaWhitespace,
  isJsLineTerminator,
  isPipeSemicolonStop,
  isRawStop,
  scanChar,
  scanLength,
  scannedText,
  wordAt,
} from '@next/gate/analyzer/text-scanner';
import {
  analysisWordText as shippedAnalysisWordText,
  analyzedViewWords as shippedAnalyzedViewWords,
  isLiteralExecutionSourceWord as shippedIsLiteralExecutionSourceWord,
  textCommandWords as shippedTextCommandWords,
} from '@/analyzer/command-words';
import { isDataOnlyQuotedAssignment as shippedIsDataOnlyQuotedAssignment } from '@/analyzer/deferred-assignment';
import { analyzeDeviceCommandMatch as shippedAnalyzeDeviceCommandMatch } from '@/analyzer/device';
import {
  getGitEnvValue as shippedGetGitEnvValue,
  hasConfigAffectingEnvAssignment as shippedHasConfigAffecting,
  hasGitSshEnvAssignment as shippedHasGitSshEnvAssignment,
  isGitContextEnvOverrideName as shippedIsGitContextEnvOverrideName,
  isTrackedGitEnvName as shippedIsTrackedGitEnvName,
  parseGitContextAppendEnvAssignment as shippedParseAppendAssignment,
  resolveGitConfigCount as shippedResolveGitConfigCount,
} from '@/analyzer/git/env';
import {
  extractGitSubcommandAndRest as shippedExtractSubcommand,
  hasGitCommandLineSshCommandConfig as shippedHasSshCommandConfig,
  splitAtDoubleDash as shippedSplitAtDoubleDash,
} from '@/analyzer/git/parse';
import {
  isPersistentHeredocFilePath as shippedIsPersistentHeredocFilePath,
  resolveTrackedHeredocPath as shippedResolveTrackedHeredocPath,
} from '@/analyzer/heredoc-files';
import {
  hasRecursiveForceFlags as shippedHasRecursiveForceFlags,
  hasRecursiveOption as shippedHasRecursiveOption,
} from '@/analyzer/rm-flags';
import {
  chargeNativeLinearPass as shippedChargeNativeLinearPass,
  chargeScan as shippedChargeScan,
  fixedAt as shippedFixedAt,
  hasWordBoundaryAfter as shippedHasWordBoundaryAfter,
  isAsciiWord as shippedIsAsciiWord,
  isEcmaWhitespace as shippedIsEcmaWhitespace,
  isJsLineTerminator as shippedIsJsLineTerminator,
  isPipeSemicolonStop as shippedIsPipeSemicolonStop,
  isRawStop as shippedIsRawStop,
  scanChar as shippedScanChar,
  scanLength as shippedScanLength,
  scannedText as shippedScannedText,
  wordAt as shippedWordAt,
} from '@/analyzer/text-scanner';
import { processPathResolver as shippedPathResolver } from '@/ir/environment';
import { parseCommand as shippedParseCommand } from '@/parser/command';
import { projectCommandViews as shippedProjectCommandViews } from '@/parser/traversal';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, fuzzShellSources } from '../../helpers/shell-inputs';
import { normalize, rootFolds } from '../../helpers/temp-home';

/** The leaf analyzer modules that carry no dispatch of their own, each against its shipped twin. */

function argvOf(line: string): string[] {
  return line.split(/\s+/).filter((word) => word.length > 0);
}

describe('text scanner', () => {
  const texts = ['', 'rm -rf /', 'a_b9 c\td\ne', 'söme text more', '|;&x', 'systemd'];

  test('character classification agrees for every code point in the sample texts', () => {
    const recorded: [string, unknown][] = [];
    for (const text of [...texts, fuzzShellSources(120, 0x0075_c001).join(' ')]) {
      for (const char of [...text, undefined]) {
        const classified = {
          ascii: isAsciiWord(char),
          whitespace: isEcmaWhitespace(char),
          terminator: isJsLineTerminator(char),
          raw: isRawStop(char),
          pipe: isPipeSemicolonStop(char),
        };
        expect(classified.ascii).toBe(shippedIsAsciiWord(char));
        expect(classified.whitespace).toBe(shippedIsEcmaWhitespace(char));
        expect(classified.terminator).toBe(shippedIsJsLineTerminator(char));
        expect(classified.raw).toBe(shippedIsRawStop(char));
        expect(classified.pipe).toBe(shippedIsPipeSemicolonStop(char));
        recorded.push([String(char), classified]);
      }
    }
    expectRecordedDigest('analyzer-base/character-classes', recorded);
  });

  test('the scanned-text readers agree and charge the same units', () => {
    const recorded: [string, unknown][] = [];
    for (const text of texts) {
      const work = { units: 0 };
      const shippedWork = { units: 0 };
      const scanned = scannedText(text, work);
      const shippedScanned = shippedScannedText(text, shippedWork);
      expect(scanned).toStrictEqual(shippedScanned);
      const length = scanLength(scanned);
      expect(length).toBe(shippedScanLength(shippedScanned));
      recorded.push([text, { scanned, length }]);
      for (let index = -1; index <= text.length; index++) {
        const read = {
          char: scanChar(scanned, index),
          fixed: fixedAt(scanned, index, 'rm'),
          word: wordAt(scanned, index, 'system'),
          boundary: hasWordBoundaryAfter(scanned, index),
        };
        expect(read.char).toBe(shippedScanChar(shippedScanned, index));
        expect(read.fixed).toBe(shippedFixedAt(shippedScanned, index, 'rm'));
        expect(read.word).toBe(shippedWordAt(shippedScanned, index, 'system'));
        expect(read.boundary).toBe(shippedHasWordBoundaryAfter(shippedScanned, index));
        recorded.push([`${text}@${index}`, read]);
      }
      expect(work).toStrictEqual(shippedWork);
      recorded.push([`${text} work`, work]);
    }
    expectRecordedDigest('analyzer-base/scanned-text', recorded);
  });

  test('the charge helpers agree, including saturation and the missing counter', () => {
    const recorded: [string, unknown][] = [];
    for (const text of texts) {
      for (const passes of [1, 3]) {
        const work = { units: Number.MAX_SAFE_INTEGER - 4 };
        const shippedWork = { units: Number.MAX_SAFE_INTEGER - 4 };
        chargeScan(work, text, passes);
        shippedChargeScan(shippedWork, text, passes);
        expect(work).toStrictEqual(shippedWork);
        recorded.push([`${text} x${passes}`, work]);
      }
      const linear = { units: 7 };
      const shippedLinear = { units: 7 };
      chargeNativeLinearPass(linear, text);
      shippedChargeNativeLinearPass(shippedLinear, text);
      expect(linear).toStrictEqual(shippedLinear);
      const uncounted = chargeScan(undefined, text);
      expect(uncounted).toBe(shippedChargeScan(undefined, text));
      recorded.push([`${text} linear`, { linear, uncounted }]);
    }
    expectRecordedDigest('analyzer-base/charge-helpers', recorded);
  });
});

describe('rm flags', () => {
  const flagCases: readonly (readonly string[])[] = [
    [],
    ['rm'],
    ['rm', '-rf', '/tmp/x'],
    ['rm', '-fr', '/tmp/x'],
    ['rm', '-r', '-f', '/tmp/x'],
    ['rm', '-R', '--force', '/tmp/x'],
    ['rm', '--recursive', '--force'],
    ['rm', '--rec', '--for'],
    ['rm', '--r', '--f'],
    ['rm', '-r'],
    ['rm', '-f'],
    ['rm', '--', '-rf'],
    ['rm', '-rf', '--', '-r'],
    ['rm', '-i', '-rf'],
    ['rm', '--recursiv', 'x'],
    ['rm', '--recursively', 'x'],
    ['rm', '-vRf', 'x'],
    ['rm', '-Rv', 'x'],
    ['chmod', '-R', '777', '/'],
  ];

  test('both flag readers agree over the table and the corpus argv', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of [...flagCases, ...corpusCommands().map(argvOf)]) {
      const flags = {
        recursiveForce: hasRecursiveForceFlags(argv),
        recursive: hasRecursiveOption(argv),
      };
      expect(flags.recursiveForce).toBe(shippedHasRecursiveForceFlags(argv));
      expect(flags.recursive).toBe(shippedHasRecursiveOption(argv));
      recorded.push([argv.join(' '), flags]);
    }
    expectRecordedDigest('analyzer-base/rm-flags', recorded);
  });
});

describe('command words', () => {
  const sources = [
    'echo one two',
    'echo "$(id)" `hostname` $HOME',
    'echo \'literal\' "double"',
    'Remove-Item -Recurse $env:TEMP\\x',
    'rm -rf $(cat list)',
  ];

  test('the word projections agree for parsed and text-only words', () => {
    const recorded: [string, unknown][] = [];
    for (const source of sources) {
      for (const dialect of ['posix', 'powershell'] as const) {
        const views = projectCommandViews(parseCommand(source, dialect));
        const shippedViews = shippedProjectCommandViews(shippedParseCommand(source, dialect));
        expect(views.length).toBe(shippedViews.length);
        views.forEach((view, index) => {
          const shippedView = shippedViews[index];
          if (!shippedView) throw new Error('missing shipped view');
          const texts = view.words.map(analysisWordText);
          expect(texts).toStrictEqual(shippedView.words.map(shippedAnalysisWordText));
          const analyzed = analyzedViewWords(view.dialect, view.words);
          expect(analyzed).toStrictEqual(
            shippedAnalyzedViewWords(shippedView.dialect, shippedView.words),
          );
          recorded.push([`${source} ${dialect} [${index}]`, { texts, analyzed }]);
          view.words.forEach((word, wordIndex) => {
            const literal = isLiteralExecutionSourceWord(word, word.text);
            expect(literal).toBe(
              shippedIsLiteralExecutionSourceWord(shippedView.words[wordIndex], word.text),
            );
            recorded.push([`${source} ${dialect} [${index}][${wordIndex}]`, literal]);
          });
        });
      }
    }
    expectRecordedDigest('analyzer-base/word-projections', recorded);
  });

  test('text-only stand-ins carry no parser facts on either side', () => {
    const recorded: [string, unknown][] = [];
    for (const source of sources) {
      const tokens = source.split(' ');
      const words = textCommandWords(tokens);
      expect(words).toStrictEqual(shippedTextCommandWords(tokens));
      const literal = isLiteralExecutionSourceWord(undefined, source);
      expect(literal).toBe(shippedIsLiteralExecutionSourceWord(undefined, source));
      recorded.push([source, { words, literal }]);
    }
    expectRecordedDigest('analyzer-base/text-only-words', recorded);
  });
});

describe('deferred assignment', () => {
  const assignments = [
    "W='rm -rf ~'",
    "W='rm -rf ~'; echo $W",
    'W=\'rm -rf ~\'; echo "$W"',
    "W='rm -rf ~'; echo '$W'",
    "W='rm -rf ~'; $W",
    "W='rm -rf ~'; eval $W",
    "W='rm -rf ~'; echo ${W}",
    "W='rm -rf ~'; echo $WORD",
    "W='rm -rf ~'; echo \\$W",
    "W='rm -rf ~'; echo $(echo $W)",
    "W='rm -rf ~'; f() { echo $W; }; f",
    'W=\'rm -rf ~\'; { echo "$W"; }',
    "W='rm -rf ~' > out",
    "W='rm -rf ~'; cat > $W",
    "W='rm -rf ~'; cat <<EOF\n$W\nEOF",
    "W='rm -rf ~'; cat <<'EOF'\n$W\nEOF",
    'W="rm -rf ~"; echo "$W"',
    "W='rm -rf ~' X='echo'",
    "1W='rm -rf ~'; echo $1W",
  ];

  test('the data-only decision and its scan work agree over assignments and corpus commands', () => {
    const recorded: [string, unknown][] = [];
    for (const source of [...assignments, ...corpusCommands()]) {
      const program = parseCommand(source, 'posix');
      const shippedProgram = shippedParseCommand(source, 'posix');
      const views = projectCommandViews(program);
      const shippedViews = shippedProjectCommandViews(shippedProgram);
      expect(views.length).toBe(shippedViews.length);
      views.forEach((view, index) => {
        const shippedView = shippedViews[index];
        if (!shippedView) throw new Error('missing shipped view');
        const work = { units: 0 };
        const shippedWork = { units: 0 };
        const dataOnly = isDataOnlyQuotedAssignment(view, program, work);
        expect(dataOnly).toBe(
          shippedIsDataOnlyQuotedAssignment(shippedView, shippedProgram, shippedWork),
        );
        expect(work).toStrictEqual(shippedWork);
        const withoutProgram = isDataOnlyQuotedAssignment(view, undefined);
        expect(withoutProgram).toBe(shippedIsDataOnlyQuotedAssignment(shippedView, undefined));
        recorded.push([`${source} [${index}]`, { dataOnly, work, withoutProgram }]);
      });
    }
    expectRecordedDigest('analyzer-base/deferred-assignment', recorded);
  });
});

describe('heredoc files', () => {
  let root = '';

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'next-heredoc-'));
    mkdirSync(join(root, 'dir'));
    writeFileSync(join(root, 'dir', 'file'), 'x');
    symlinkSync(join(root, 'dir'), join(root, 'link'));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('the tracked-path resolution agrees for absolute, relative and unknown cwd sources', () => {
    // `../escape` resolves out of the fixture, so the directory holding it is folded as well.
    const recordFolds = () => [...rootFolds(root), [dirname(root), '<tmpdir>'] as const];
    const recorded: [string, unknown][] = [];
    for (const source of ['dir/file', 'link/file', 'missing/deep/file', './dir', '../escape', '']) {
      for (const cwd of [root, join(root, 'dir'), null, undefined]) {
        const resolved = resolveTrackedHeredocPath(
          source,
          cwd,
          processPathResolver,
          createBudget(),
        );
        expect(resolved).toStrictEqual(
          shippedResolveTrackedHeredocPath(source, cwd, shippedPathResolver),
        );
        recorded.push([
          normalize(`${source} @ ${cwd}`, recordFolds()),
          normalize(resolved, recordFolds()),
        ]);
      }
      const absolute = join(root, source);
      const resolved = resolveTrackedHeredocPath(
        absolute,
        null,
        processPathResolver,
        createBudget(),
      );
      expect(resolved).toStrictEqual(
        shippedResolveTrackedHeredocPath(absolute, null, shippedPathResolver),
      );
      recorded.push([`absolute ${source}`, normalize(resolved, recordFolds())]);
    }
    expectRecordedDigest('analyzer-base/heredoc-paths', recorded);
  });

  test('the persistence test is the shipped one', () => {
    const recorded: [string, unknown][] = [];
    for (const path of ['/dev', '/dev/null', '/devices/x', '/proc/1/fd/2', '/sys', '/tmp/out']) {
      const persistent = isPersistentHeredocFilePath(path);
      expect(persistent).toBe(shippedIsPersistentHeredocFilePath(path));
      recorded.push([path, persistent]);
    }
    expectRecordedDigest('analyzer-base/heredoc-persistence', recorded);
  });
});

describe('device commands', () => {
  test('the device rules agree over the table', () => {
    const commands: readonly (readonly string[])[] = [
      ['dd', 'if=/dev/zero', 'of=/dev/sda'],
      ['dd', 'if=/dev/zero', 'of=/tmp/x'],
      ['dd', 'of=/dev/'],
      ['dd'],
      ['mkfs', '/dev/sda1'],
      ['mkfs.ext4', '/dev/sda1'],
      ['mkfs.ext4', 'image.img'],
      ['mkfsx', '/dev/sda1'],
      ['shred', 'secret'],
      ['shred'],
      ['rm', '-rf', '/dev/sda'],
    ];
    const recorded: [string, unknown][] = [];
    for (const argv of commands) {
      const head = argv[0] ?? '';
      const match = analyzeDeviceCommandMatch(head, argv);
      expect(match).toStrictEqual(shippedAnalyzeDeviceCommandMatch(head, argv));
      recorded.push([argv.join(' '), match]);
    }
    expectRecordedDigest('analyzer-base/device-commands', recorded);
  });
});

describe('git environment', () => {
  test('the GIT_CONFIG_COUNT resolution agrees, cap included', () => {
    const counts = ['', '0', '1', '7', '1024', '1025', '9007199254740993', 'x', '-1', ' 1', '01'];
    const recorded: [string, unknown][] = [];
    for (const value of counts) {
      const env = new Map([['GIT_CONFIG_COUNT', value]]);
      const fromEnv = resolveGitConfigCount(env);
      expect(fromEnv).toStrictEqual(shippedResolveGitConfigCount(env));
      const fromOverride = resolveGitConfigCount(new Map(), env);
      expect(fromOverride).toStrictEqual(shippedResolveGitConfigCount(new Map(), env));
      recorded.push([value, { fromEnv, fromOverride }]);
    }
    const withoutCount = resolveGitConfigCount(new Map());
    expect(withoutCount).toStrictEqual(shippedResolveGitConfigCount(new Map()));
    recorded.push(['<unset>', withoutCount]);
    expectRecordedDigest('analyzer-base/git-config-count', recorded);
    expect(resolveGitConfigCount(new Map([['GIT_CONFIG_COUNT', '1025']])).state).toBe('invalid');
  });

  test('the tracked-name tests and value reads agree', () => {
    const names = [
      'GIT_DIR',
      'GIT_WORK_TREE',
      'GIT_COMMON_DIR',
      'GIT_INDEX_FILE',
      'GIT_CONFIG_COUNT',
      'GIT_CONFIG_PARAMETERS',
      'GIT_CONFIG_KEY_0',
      'GIT_CONFIG_VALUE_12',
      'GIT_CONFIG_KEY_X',
      'GIT_CONFIG_GLOBAL',
      'GIT_CONFIG_NOSYSTEM',
      'GIT_CONFIG_SYSTEM',
      'GIT_SSH',
      'GIT_SSH_COMMAND',
      'GIT_SSH_VARIANT',
      'HOME',
      'XDG_CONFIG_HOME',
      'PATH',
      '',
    ];
    const env = new Map([
      ['GIT_DIR', '/env/git'],
      ['HOME', '/env/home'],
    ]);
    const assignments = new Map([
      ['GIT_DIR', '/assigned/git'],
      ['GIT_SSH_COMMAND', 'ssh -o X'],
    ]);
    const recorded: [string, unknown][] = [];
    for (const name of names) {
      const facts = {
        override: isGitContextEnvOverrideName(name),
        tracked: isTrackedGitEnvName(name),
        assigned: getGitEnvValue(name, env, assignments),
        plain: getGitEnvValue(name, env),
      };
      expect(facts.override).toBe(shippedIsGitContextEnvOverrideName(name));
      expect(facts.tracked).toBe(shippedIsTrackedGitEnvName(name));
      expect(facts.assigned).toBe(shippedGetGitEnvValue(name, env, assignments));
      expect(facts.plain).toBe(shippedGetGitEnvValue(name, env));
      recorded.push([name, facts]);
    }
    for (const [index, candidate] of [
      undefined,
      new Map<string, string>(),
      assignments,
      env,
    ].entries()) {
      const ssh = hasGitSshEnvAssignment(candidate);
      const config = hasConfigAffectingEnvAssignment(candidate);
      expect(ssh).toBe(shippedHasGitSshEnvAssignment(candidate));
      expect(config).toBe(shippedHasConfigAffecting(candidate));
      recorded.push([`candidate ${index}`, { ssh, config }]);
    }
    expectRecordedDigest('analyzer-base/git-env-names', recorded);
  });

  test('append assignments agree for tracked and untracked names', () => {
    const tokens = [
      'GIT_DIR+=/extra',
      'GIT_CONFIG_COUNT+=2',
      'HOME+=/extra',
      'PATH+=:/extra',
      'TMPDIR+=/extra',
      'GIT_DIR=/plain',
      '+=/extra',
      '1BAD+=x',
      'GIT_DIR+=',
    ];
    const env = new Map([['GIT_DIR', '/env/git']]);
    const assignments = new Map([['GIT_DIR', '/assigned/git']]);
    const recorded: [string, unknown][] = [];
    for (const token of tokens) {
      const assigned = parseGitContextAppendEnvAssignment(token, env, assignments);
      expect(assigned).toStrictEqual(shippedParseAppendAssignment(token, env, assignments));
      const plain = parseGitContextAppendEnvAssignment(token, env);
      expect(plain).toStrictEqual(shippedParseAppendAssignment(token, env));
      recorded.push([token, { assigned, plain }]);
    }
    expectRecordedDigest('analyzer-base/git-append-assignments', recorded);
  });
});

describe('git command line parsing', () => {
  const lines = [
    'git',
    'git status',
    'git -C /tmp -c a.b=c checkout -- .',
    'git --git-dir=/tmp/x --work-tree /tmp status',
    'git -- checkout',
    'git -- -x',
    'git --config-env core.sshCommand=SSH fetch',
    'git --config-env=core.sshCommand=SSH fetch',
    'git -c core.sshCommand=ssh clone url',
    'git -ccore.sshCommand=ssh clone url',
    'git -c CORE.SSHCOMMAND=ssh clone url',
    'git clone url -- extra -- more',
    'not-git -c core.sshCommand=ssh clone url',
  ];

  test('subcommand extraction and double-dash splitting agree', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of [[], ...lines.map(argvOf), ...corpusCommands().map(argvOf)]) {
      const subcommand = extractGitSubcommandAndRest(argv);
      expect(subcommand).toStrictEqual(shippedExtractSubcommand(argv));
      const split = splitAtDoubleDash(argv);
      expect(split).toStrictEqual(shippedSplitAtDoubleDash(argv));
      recorded.push([argv.join(' '), { subcommand, split }]);
    }
    expectRecordedDigest('analyzer-base/git-subcommand-split', recorded);
  });

  test('the ssh-command config scan agrees for the command line and the environment', () => {
    const env = new Map([['SSH', 'ssh -o StrictHostKeyChecking=no']]);
    const assignments = new Map([['SSH', 'ssh -o X']]);
    const recorded: [string, unknown][] = [];
    for (const argv of lines.map(argvOf)) {
      const assigned = hasGitCommandLineSshCommandConfig(argv, env, assignments);
      expect(assigned).toBe(shippedHasSshCommandConfig(argv, env, assignments));
      const plain = hasGitCommandLineSshCommandConfig(argv, env);
      expect(plain).toBe(shippedHasSshCommandConfig(argv, env));
      recorded.push([argv.join(' '), { assigned, plain }]);
    }
    expectRecordedDigest('analyzer-base/git-ssh-command-config', recorded);
  });
});
