import { describe, expect, test } from 'bun:test';
import {
  AWK_EXECUTABLE_SOURCE_SELECTORS,
  analyzeAwkSystemCallMatch,
  extractAwkExecutableSources,
  extractAwkSystemCommands,
  parseAwkArgv,
} from '@next/gate/analyzer/awk';
import {
  analyzeAwkSystemCallMatch as shippedAnalyzeAwkSystemCallMatch,
  extractAwkExecutableSources as shippedExtractSources,
  extractAwkSystemCommands as shippedExtractSystemCommands,
  parseAwkArgv as shippedParseAwkArgv,
  AWK_EXECUTABLE_SOURCE_SELECTORS as shippedSelectors,
} from '@/analyzer/awk';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * The awk port answers with the shipped module for every program the two corpora carry, a seeded
 * fuzz, and a table that walks each executable-source form the argv scanner knows.
 */

const AWK_PROGRAMS: readonly string[] = [
  '',
  '{ print }',
  'BEGIN { system("rm -rf /tmp/x") }',
  "BEGIN { system('rm -rf /tmp/x') }",
  'BEGIN { system("echo " $1) }',
  'BEGIN { system($0) }',
  'BEGIN { system() }',
  '{ system("echo hi"); system("echo there") }',
  'BEGIN { system ( "spaced" ) }',
  'BEGIN { system("a" "b") }',
  'BEGIN { system("unterminated }',
  'BEGIN { system("esc\\"aped") }',
  'BEGIN { system("tab\\there \\x41 \\101 \\q") }',
  'BEGIN { mysystem("id") }',
  'BEGIN { system2("id") }',
  'function f() { system("id") } BEGIN { f() }',
  '# comment with system("rm -rf /")\n{ print }',
  '{ print "system(\\"rm\\")" }',
  '/system\\(/ { print }',
  'BEGIN { if (x ~ /a|b/) system("id") }',
  'BEGIN { system("rm -rf {}") }',
  'BEGIN { system("echo $HOME") }',
  'BEGIN { system("echo `id`") }',
  '{ print $0 | "sh" }',
  '{ print $0 | "sh -c \'rm -rf /\'" }',
  '{ print | cmd }',
  '{ print "x" | "cat" ; print "y" }',
  '{ printf "%s\\n", $0 | "cat" }',
  '{ print "x" |& "cat" }',
  '{ "date" | getline d }',
  '{ cmd | getline line }',
  '{ "echo " $1 | getline out }',
  '{ "id" |& getline out }',
  '{ getline line < "file" }',
  'BEGIN { print > "file" }',
  'BEGIN { x = 1 || 2 }',
  '{ print $1 } # trailing\n{ "id" | getline }',
  'BEGIN { system("one"); print "two" | "three" }',
];

const AWK_ARGVS: readonly (readonly string[])[] = [
  ['awk'],
  ['awk', '{ print }', 'file'],
  ['awk', '-f', 'prog.awk', 'file'],
  ['awk', '-fprog.awk', 'file'],
  ['awk', '--file', 'prog.awk'],
  ['awk', '--file=prog.awk'],
  ['awk', '-e', 'BEGIN{system("id")}'],
  ['awk', '-eBEGIN{system("id")}'],
  ['awk', '--source', 'BEGIN{system("id")}'],
  ['awk', '--source=BEGIN{system("id")}'],
  ['awk', '-F', ':', '{print $1}'],
  ['awk', '-F:', '{print $1}'],
  ['awk', '-v', 'x=1', '{print x}'],
  ['awk', '-vx=1', '{print x}'],
  ['awk', '-v', '{print}'],
  ['awk', '--assign=x=1', '{print}'],
  ['awk', '--field-separator=:', '{print}'],
  ['awk', '--'],
  ['awk', '--', '{print}'],
  ['awk', '-'],
  ['awk', '-f'],
  ['awk', '-e'],
  ['awk', '--file'],
  ['awk', '-W', 'interactive', '{print}'],
  ['awk', '--unknown', '{print}'],
  ['gawk', '-e', 'BEGIN{system("a")}', '-e', 'BEGIN{system("b")}'],
  ['mawk', '-f', 'a.awk', '-e', 'BEGIN{}'],
  ['nawk', '{ "id" | getline }', 'data'],
  ['awk', '-f', 'a.awk', '{ print }'],
  ['awk', '--', '-f', 'a.awk'],
];

function argvOf(command: string): string[] {
  return command.split(/\s+/).filter((word) => word.length > 0);
}

function awkArgvs(): readonly (readonly string[])[] {
  return [
    ...AWK_ARGVS,
    ...corpusCommands().map(argvOf),
    ...AWK_PROGRAMS.map((code) => ['awk', code]),
  ];
}

/** A nested analyzer whose answer depends only on the recovered command text. */
function nestedAnalyzer(command: string) {
  return command.includes('rm -rf')
    ? { id: 'awk.system-dynamic', reason: `nested ${command}`, intent: 'manual_only' as const }
    : null;
}

describe('awk argv scanning', () => {
  test('the selector table is the shipped table', () => {
    expect(AWK_EXECUTABLE_SOURCE_SELECTORS).toStrictEqual(shippedSelectors);
    expectRecordedDigest('analyzer-awk/selectors', [
      ['selectors', AWK_EXECUTABLE_SOURCE_SELECTORS],
    ]);
  });

  test('parseAwkArgv and extractAwkExecutableSources agree with the shipped scanner', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of awkArgvs()) {
      const parsed = parseAwkArgv(argv);
      expect(parsed).toStrictEqual(shippedParseAwkArgv(argv));
      const sources = extractAwkExecutableSources(argv);
      expect(sources).toStrictEqual(shippedExtractSources(argv));
      recorded.push([argv.join(' '), { parsed, sources }]);
    }
    expectRecordedDigest('analyzer-awk/argv-scan', recorded);
  });
});

describe('awk program scanning', () => {
  test('extractAwkSystemCommands agrees over programs, corpus commands and fuzz', () => {
    const sources = [...AWK_PROGRAMS, ...corpusCommands(), ...fuzzShellSources(500, 0x00a4_2f19)];
    const recorded: [string, unknown][] = [];
    for (const code of sources) {
      const work = { units: 0 };
      const shippedWork = { units: 0 };
      const commands = extractAwkSystemCommands(code, work);
      expect(commands).toStrictEqual(shippedExtractSystemCommands(code, shippedWork));
      expect(work).toStrictEqual(shippedWork);
      recorded.push([code, { commands, work }]);
    }
    expectRecordedDigest('analyzer-awk/system-commands', recorded);
  });

  test('analyzeAwkSystemCallMatch agrees, charging the same scan work', () => {
    const recorded: [string, unknown][] = [];
    for (const argv of awkArgvs()) {
      const work = { units: 0 };
      const shippedWork = { units: 0 };
      const match = analyzeAwkSystemCallMatch(argv, nestedAnalyzer, work);
      expect(match).toStrictEqual(
        shippedAnalyzeAwkSystemCallMatch(argv, nestedAnalyzer, shippedWork),
      );
      expect(work).toStrictEqual(shippedWork);
      recorded.push([argv.join(' '), { match, work }]);
    }
    expectRecordedDigest('analyzer-awk/system-call', recorded);
  });

  test('analyzeAwkSystemCallMatch works without a scan-work counter', () => {
    const dynamic = ['awk', 'BEGIN { system($0) }'];
    const match = analyzeAwkSystemCallMatch(dynamic, nestedAnalyzer);
    expect(match).toStrictEqual(shippedAnalyzeAwkSystemCallMatch(dynamic, nestedAnalyzer));
    expectRecordedDigest('analyzer-awk/no-counter', [[dynamic.join(' '), match]]);
    expect(analyzeAwkSystemCallMatch(dynamic, nestedAnalyzer)?.id).toBe('awk.system-dynamic');
  });
});
