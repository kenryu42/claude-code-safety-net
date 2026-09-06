import { describe, expect, test } from 'bun:test';
import { isInterpreterCommand } from '@/core/policy/transparent-wrappers';
import {
  containsDangerousCode,
  extractInterpreterCodeArg,
  extractInterpreterExecutableSources,
  getInterpreterExecutableSourceSelectors,
  isInterpreterDisplayOnly,
  parseInterpreterArgv,
  REASON_INTERPRETER_BLOCKED,
  REASON_INTERPRETER_DANGEROUS,
} from '@/gate/analyzer/interpreters';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * The interpreter argv scanner and its code detector are recorded over the corpus commands, a
 * seeded fuzz, and a table that walks each `-c`/`-e` form the four interpreters accept, including
 * the encoded payloads a one-liner hides a command in. The two reasons are the strings the
 * paranoid-interpreter and dangerous-code denials render, so they are recorded as values, not
 * re-typed.
 */

const INTERPRETER_ARGVS: readonly (readonly string[])[] = [
  ['python3', '-c', 'import os; os.system("rm -rf /tmp/x")'],
  ['python3', '-cimport os'],
  ['python', '-c'],
  ['python2', '-Wignore', '-c', 'print(1)'],
  ['python3', '-X', 'dev', '-c', 'print(1)'],
  ['python3', '-Xdev', '-c', 'print(1)'],
  ['python3', '-u', '-c', 'print(1)'],
  ['python3', '-uc', 'print(1)'],
  ['python3', '-m', 'http.server'],
  ['python3', '-mhttp.server'],
  ['python3', '-m'],
  ['python3', '--check-hash-based-pycs', 'always', '-c', 'print(1)'],
  ['python3', '--check-hash-based-pycs', 'sometimes', '-c', 'print(1)'],
  ['python3', '--check-hash-based-pycs=always', '-c', 'print(1)'],
  ['python3', 'script.py', '-c', 'print(1)'],
  ['python3', '--', 'script.py'],
  ['python3', '--'],
  ['python3.12', '-c', 'print(1)'],
  ['/usr/bin/python3', '-c', 'print(1)'],
  ['python3', '-', 'arg'],
  ['python3', ''],
  ['python3'],
  [
    'python3',
    '-c',
    'import base64,os; os.system(base64.b64decode("cm0gLXJmIC90bXAveA==").decode())',
  ],
  ['node', '-e', 'require("child_process").execSync("rm -rf /tmp/x")'],
  ['node', '-e'],
  ['node', '--eval', 'console.log(1)'],
  ['node', '--eval=console.log(1)'],
  ['node', '--eval='],
  ['node', '-p', 'process.env.HOME'],
  ['node', '--print', '1+1'],
  ['node', '-p', '-e', 'console.log(1)'],
  ['node', '-e', 'a', '-e', 'b'],
  ['node', '-r', 'preload.js', '-e', 'console.log(1)'],
  ['node', '-r'],
  ['node', '-r', '-e'],
  ['node', '-rpreload.js', '-e', 'x'],
  ['node', '--require', 'preload.js', '-e', 'x'],
  ['node', '--require=preload.js', '-e', 'x'],
  ['node', '--require=', '-e', 'x'],
  ['node', '--import', 'loader.mjs', 'main.mjs'],
  ['node', '--loader=./loader.mjs', 'main.mjs'],
  ['node', '--experimental-loader', './loader.mjs', 'main.mjs'],
  ['node', '--title', 'worker', '-e', 'x'],
  ['node', '--title=worker', '-e', 'x'],
  ['node', '--conditions=', '-e', 'x'],
  ['node', '--max-old-space-size=64', '-e', 'x'],
  ['node', '--unknown-flag', '-e', 'x'],
  ['node', 'main.js'],
  ['node', '-e', 'Buffer.from("cm0gLXJmIC8=", "base64").toString()'],
  ['node', '-e', 'console.log("hello")'],
  ['node', '-e', "console.info('hi');"],
  ['node', '-e', 'console.log(x)'],
  ['ruby', '-e', 'system("rm -rf /tmp/x")'],
  ['ruby', '-esystem("id")'],
  ['ruby', '-e'],
  ['ruby', '-rjson', '-e', 'puts 1'],
  ['ruby', '-r', 'json', '-e', 'puts 1'],
  ['ruby', '-r'],
  ['ruby', '-Ilib', '-e', 'puts 1'],
  ['ruby', '-I', 'lib', '-e', 'puts 1'],
  ['ruby', '-W2', '-e', 'puts 1'],
  ['ruby', '-0777', '-e', 'puts 1'],
  ['ruby', '--disable', 'gems', '-e', 'puts 1'],
  ['ruby', '--disable=gems', '-e', 'puts 1'],
  ['ruby', '--enable', '-e', 'puts 1'],
  ['ruby', '--encoding', 'utf-8', '-e', 'puts 1'],
  ['ruby', '-e', 'puts %x{id}'],
  ['ruby', 'script.rb'],
  ['perl', '-e', 'system("rm -rf /tmp/x")'],
  ['perl', '-esystem("id")'],
  ['perl', '-E', 'say 1'],
  ['perl', '-Esay 1'],
  ['perl', '-MData::Dumper', '-e', 'print 1'],
  ['perl', '-M', '-e', 'print 1'],
  ['perl', '-mstrict', '-e', 'print 1'],
  ['perl', '-m'],
  ['perl', '-Ilib', '-e', 'print 1'],
  ['perl', '-I', 'lib', '-e', 'print 1'],
  ['perl', '-ne', 'print'],
  ['perl', '-lne', 'print'],
  ['perl', '-i.bak', '-pe', 's/a/b/'],
  ['perl', '-0777', '-e', 'print 1'],
  ['perl', 'script.pl'],
  ['awk', '-e', 'BEGIN{system("id")}'],
  ['bash', '-c', 'rm -rf /tmp/x'],
  ['rm', '-rf', '/tmp/x'],
  [''],
  [],
];

const INTERPRETER_COMMANDS: readonly string[] = [
  'python',
  'python2',
  'python3',
  'python3.11',
  'python3.11.4',
  'Python3',
  '/usr/local/bin/python3',
  'pypy3',
  'node',
  'nodejs',
  '/usr/bin/node',
  'ruby',
  'ruby3.2',
  'perl',
  'perl5',
  'awk',
  'bash',
  'rm',
  '',
];

/** Code bodies the dangerous-code detector must judge, literals and exec sinks alike. */
const INTERPRETER_CODE: readonly string[] = [
  '',
  'print(1)',
  'os.system("rm -rf /tmp/x")',
  "os.system('rm -rf /tmp/x')",
  'print("rm -rf /tmp/x")',
  'x = "rm -rf /tmp/x"',
  'x = "rm -rf /tmp/x"; os.system(x)',
  'x = "rm -rf /tmp/x"; print(x)',
  'x = """rm -rf /tmp/x"""',
  "x = '''rm -rf /tmp/x''' ; subprocess.run(x, shell=True)",
  'x = "unterminated rm -rf /tmp/x',
  'x = "escaped \\" rm -rf /tmp/x"',
  'require("child_process").execSync("rm -rf /tmp/x")',
  'exec("rm -rf /tmp/x")',
  'spawn("rm", ["-rf", "/tmp/x"])',
  'popen("rm -rf /tmp/x")',
  'Open3.capture2("rm -rf /tmp/x")',
  'puts %x{rm -rf /tmp/x}',
  'puts `rm -rf /tmp/x`',
  'qx(rm -rf /tmp/x)',
  'eval("rm -rf /tmp/x")',
  'fork { system("rm -rf /tmp/x") }',
  'os.system("git reset --hard")',
  'os.system("git clean -fd")',
  'os.system("git push --force origin main")',
  'os.system("git checkout -- .")',
  'os.system("git stash drop")',
  'os.system("git branch -D feature")',
  'os.system("git restore .")',
  'os.system("git restore --staged .")',
  'os.system("find . -delete")',
  'os.system("dd if=/dev/zero of=/dev/sda")',
  'os.system("mkfs.ext4 /dev/sda1")',
  'os.system("shred secret")',
  'os.system("rm \\\n-rf /tmp/x")',
  'os.system("rm -r" "\\n" "-f")',
  'os.system("rm -r\\n-f /tmp/x")',
  'os.system("rm -r\\x0a-f /tmp/x")',
  'os.system("rm -r\\u000a-f /tmp/x")',
  'os.system("rm -r\\012-f /tmp/x")',
  'os.system("rm -r -f /tmp/x")',
  'import os\nos.system("rm -rf /tmp/x")',
  'console.log("hello")',
  "console.error('bye');",
  'console.log(variable)',
  'console.log("a", "b")',
  'import base64,os; os.system(base64.b64decode("cm0gLXJmIC90bXAveA==").decode())',
  'Buffer.from("cm0gLXJmIC90bXAveA==", "base64").toString()',
  'eval(Buffer.from("cm0gLXJmIC90bXAveA==", "base64").toString())',
  'x = 1 # rm -rf /tmp/x',
  'system(ARGV[0])',
];

function argvRows(): readonly (readonly string[])[] {
  return [
    ...INTERPRETER_ARGVS,
    ...corpusCommands().map((command) => command.split(/\s+/)),
    ...fuzzShellSources(300, 0x00b1_7e05).map((source) => source.split(/\s+/)),
  ];
}

describe('next/gate/analyzer/interpreters versus src/analyzer/interpreters', () => {
  test('the two denial reasons are the shipped strings', () => {
    expectRecordedDigest('analyzer-interpreters/reasons', [
      ['dangerous', REASON_INTERPRETER_DANGEROUS],
      ['blocked', REASON_INTERPRETER_BLOCKED],
    ]);
  });

  test('the argv scanner reports the same code, sources and open options', () => {
    const recorded: [string, unknown][] = [];
    let withCode = 0;
    let withSources = 0;
    for (const tokens of argvRows()) {
      const parsed = parseInterpreterArgv(tokens);
      const codeArg = extractInterpreterCodeArg(tokens);
      const sources = extractInterpreterExecutableSources(tokens);
      recorded.push([tokens.join(' '), { parsed, codeArg, sources }]);
      if (parsed.code !== null) withCode++;
      if (parsed.sources.length > 0) withSources++;
    }
    expect(withCode).toBeGreaterThan(30);
    expect(withSources).toBeGreaterThan(30);
    expectRecordedDigest('analyzer-interpreters/argv-scan', recorded);
  });

  test('the source selectors and the interpreter predicate match per command', () => {
    const recorded: [string, unknown][] = [];
    for (const command of [...INTERPRETER_COMMANDS, ...corpusCommands()]) {
      const selectors = getInterpreterExecutableSourceSelectors(command);
      // The gate module no longer carries `isInterpreterCommand`; core answers for it now.
      const isInterpreter = isInterpreterCommand(command);
      recorded.push([command, { selectors, isInterpreter }]);
    }
    expectRecordedDigest('analyzer-interpreters/selectors', recorded);
    expect(getInterpreterExecutableSourceSelectors('node').length).toBeGreaterThan(5);
    expect(INTERPRETER_COMMANDS.filter(isInterpreterCommand).length).toBeGreaterThan(8);
  });

  test('the display-only test agrees for every command and code pair', () => {
    const recorded: [string, unknown][] = [];
    let displayOnly = 0;
    for (const command of INTERPRETER_COMMANDS) {
      for (const code of INTERPRETER_CODE) {
        const answer = isInterpreterDisplayOnly(command, code);
        recorded.push([`${command} ${code}`, answer]);
        if (answer) displayOnly++;
      }
    }
    expect(displayOnly).toBeGreaterThan(0);
    expectRecordedDigest('analyzer-interpreters/display-only', recorded);
  });

  test('the dangerous-code detector agrees and charges the same work', () => {
    const recorded: [string, unknown][] = [];
    let dangerous = 0;
    for (const code of [
      ...INTERPRETER_CODE,
      ...corpusCommands(),
      ...fuzzShellSources(300, 0x00c2_84f1),
    ]) {
      const work = { units: 0 };
      const answer = containsDangerousCode(code, work);
      recorded.push([code, { answer, units: work.units }]);
      if (answer) dangerous++;
    }
    expect(dangerous).toBeGreaterThan(20);
    for (const code of INTERPRETER_CODE) {
      const uncounted = containsDangerousCode(code);
      recorded.push([`uncounted ${code}`, uncounted]);
    }
    expectRecordedDigest('analyzer-interpreters/dangerous-code', recorded);
  });
});
