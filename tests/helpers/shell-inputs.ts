import type { CommandProgram, ShellKind } from '@/core/shell/model';
import { parseCommand } from '@/core/shell/parse';
import { getCommandFromToolInput } from '@/core/tool-input';
import { behavioralContractCases } from '../gate/behavioral-contract-cases';
import { pipelineContractCases } from '../gate/pipeline-contract-cases';

/**
 * Shared inputs for the corpus tests: the corpus commands, a fixed table of parser-shaped commands,
 * and a seeded fuzz over a shell-like alphabet. Every test file feeds the same inputs to the parser
 * and records what comes back.
 */

export const SHELL_DIALECTS: readonly ShellKind[] = ['posix', 'powershell', 'auto'];

export const FUZZ_SEED = 0x9e37_79b9;

export const FUZZ_SAMPLE_COUNT = 2_000;

const PIPELINE_PATHS = {
  workspace: '/work/project',
  repo: '/work/project/repo',
  home: '/home/agent',
  userPolicyPath: '/home/agent/.cc-safety-net/policy.json',
  userPolicyDir: '/home/agent/.cc-safety-net',
};

export function corpusToolInputs(): readonly { toolName: string; input: unknown }[] {
  return pipelineContractCases(PIPELINE_PATHS).map((row) => ({
    toolName: row.toolName,
    input: row.input,
  }));
}

export function corpusCommands(): readonly string[] {
  const analyzerCommands = behavioralContractCases({
    cwd: PIPELINE_PATHS.workspace,
    home: PIPELINE_PATHS.home,
  }).map((row) => row.command);
  const pipelineCommands = corpusToolInputs().flatMap((row) => {
    const command = getCommandFromToolInput(row.input);
    return command === undefined ? [] : [command];
  });
  return [...new Set([...analyzerCommands, ...pipelineCommands])];
}

export const FIXED_COMMANDS: readonly string[] = [
  '',
  ' ',
  'git status',
  'rm -rf ./build && echo done',
  'echo a; echo b | tee out.txt || false & wait',
  'cat <<EOF > file\nline $(rm -rf /tmp/x) `echo y`\nEOF\necho after',
  "cat <<'EOF' > file\nline $(rm -rf /tmp/x)\nEOF",
  'cat <<-\tEOF\n\t\tindented $HOME\n\tEOF',
  'cat <<-EOF\r\tone\r\ttwo\r\tEOF',
  'cat <<"E O F"\nbody\nE O F\n',
  'cat <<EOF\nunterminated body',
  'cat << \necho x',
  'cat <<$(x)\nbody\n$(x)',
  'python3 - <<EOF\nimport os\nEOF',
  'git commit -F- <<EOF\nmessage with rm -rf /\nEOF',
  "gh pr create --body-file - <<'EOF'\nbody\nEOF",
  'f() { rm -rf "$1"; }; f /tmp/x',
  'function g { echo hi; }\ng',
  'a() { a; a; }; a',
  '( cd /tmp && rm -rf build )',
  '{ echo one; echo two; } > out',
  '{ echo unclosed',
  '( echo unclosed',
  'echo )',
  'echo $(cat <<EOF\ninner\nEOF\n)',
  'echo `cat <<EOF\ninner\nEOF\n`',
  'echo <(cat <<EOF\ninner\nEOF\n)',
  'echo $((1 + $(printf 2)))',
  'echo "$(( 3 * 4 ))"',
  "echo \"$HOME/$USER/${PATH:-x}\" '$notavar' $'\\tab\\x41\\u00e9\\U0001F600'",
  "echo $'\\U110000'",
  'echo "unclosed',
  "echo 'unclosed",
  'echo trailing\\',
  'echo line\\\ncontinued',
  'echo "line\\\ncontinued"',
  'echo *.txt ?.md [abc]',
  'rm -rf {a,b}/{c,d} x{1..3} y{,z} {}',
  'FOO=bar BAZ={x,y} echo {p,q}',
  'env -u X -C /tmp -S "a b" echo {p,q}',
  'sudo -u root -- rm -rf {a,b}',
  'command -p -v echo {a,b}',
  'command -v echo {a,b}',
  'time -p -- ! X=1 git status',
  'time rm -rf x',
  '"time" git status',
  '$(which git) status',
  'X=1 $(cmd) arg',
  'echo 2>&1 >/dev/null 1>&2 <input <>rw >|clobber >>append <&3 3<&- <<<here',
  'echo > # comment',
  'echo >',
  'echo <',
  'ls # trailing comment\nrm -rf /tmp/x # another',
  '# only a comment',
  '&& echo',
  'echo &&',
  'echo || \n echo next',
  'echo | \n | echo',
  'echo ;; echo',
  'echo & & echo',
  'echo a\r\necho b\recho c',
  'echo 😀 é 日本語 \u00a0 ß',
  'echo \ud800 \udc00',
  'Remove-Item -Recurse -Force C:\\Temp\\x',
  "Remove-Item -LiteralPath 'C:\\Temp;still-path' -WhatIf",
  'rm -rec -for $env:TEMP\\x',
  'rm -rf $HOME/x',
  'cat $env:USERPROFILE\\.ssh\\config',
  'gc ~\\secrets.txt',
  'cat ~\\.aws\\credentials | Select-String key',
  'del "C:\\x y\\z"',
  '& $cmd arg',
  '. $script',
  '& "quoted" arg',
  "Get-Content 'it''s' `\"escaped`\" $(Get-Location) @args, second",
  'Get-Content "$(hostname)\\file" > out.txt >> append 2> err',
  'Write-Output x <# block\ncomment #> Remove-Item y',
  '<# unclosed comment Remove-Item y',
  '<# <# nested #> #> Remove-Item y',
  'Remove-Item { nested }',
  'Remove-Item { unclosed',
  'Remove-Item } stray',
  'Remove-Item x`',
  'Remove-Item "unclosed $var',
  "Remove-Item 'unclosed",
  'Remove-Item $(unclosed',
  'Remove-Item ${env:TEMP}\\x @{a=1}',
  'ForEach-Object { Remove-Item $_ } ; echo done',
  'bash -c "rm -rf /tmp/x" && sh -c \'echo $HOME\'',
  'xargs -0 rm -rf < list',
  'find . -name "*.log" -exec rm -rf {} +',
  'git -c core.hooksPath=/tmp/hooks status',
  'echo ${VAR:=fallback value} ${OTHER:-"quoted default"}',
  'echo ${unclosed',
  'echo "${nested${deep}}"',
  'echo $',
  'echo $$ $! $? $# $* $@ $- $_',
  'echo a\\ b c\\*d',
  'echo "a\\$b \\"c\\" \\n"',
  "echo 'a\\'",
  'echo $(echo $(echo $(echo deep)))',
  'echo `echo \\` escaped`',
  'echo "nested `backtick`" "and $(sub)"',
  'echo >(cat) <(cat) | tee >(wc)',
  'cat <<EOF | bash\nrm -rf /tmp/x\nEOF',
  'cat <<EOF <<EOF2\none\nEOF\ntwo\nEOF2',
  'cat <<EOF; echo after\nbody\nEOF\necho next',
  'f() { cat <<EOF\nbody\nEOF\n}',
  '( cat <<EOF\nbody\nEOF\n)',
  'cat <<EOF >(cat)\nbody\nEOF',
  'cat 3<<EOF\nbody\nEOF',
  'tee out <<EOF\nbody\nEOF',
  "tee >(bash) <<'EOF'\nrm -rf /\nEOF",
  'open(".env")',
  'echo "(paren)" (paren)',
  'X=$(echo 1) Y=`echo 2` Z=${A} env',
  'echo $VAR/${VAR}/$VAR$VAR/"$VAR"/\'$VAR\'',
];

/** A small, fast PRNG (mulberry32) so the fuzz corpus is identical on every run. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b_79f5) >>> 0;
    const mixed = Math.imul(state ^ (state >>> 15), state | 1);
    const folded = mixed ^ (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61));
    return ((folded ^ (folded >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

const FUZZ_FRAGMENTS: readonly string[] = [
  "'",
  '"',
  '\\',
  '\\\\',
  '$(',
  ')',
  '(',
  '`',
  '${',
  '}',
  '{',
  '$((',
  '))',
  '<<EOF\n',
  "<<'EOF'\n",
  '<<"EOF"\n',
  '<<-EOF\n',
  '<<-\tEOF\n',
  '<< EOF\n',
  'EOF\n',
  '\tEOF\n',
  'EOF',
  '<<<',
  '<<',
  '|',
  '||',
  '&&',
  ';',
  '&',
  '|&',
  '\n',
  '\r\n',
  '\r',
  ' ',
  '\t',
  '>',
  '>>',
  '<',
  '2>&1',
  '>|',
  '<&',
  '<>',
  '>&',
  '<(',
  '>(',
  '1>',
  'echo',
  'rm -rf',
  'git status',
  'git commit -m',
  'gh pr create',
  'cat',
  'tee out.txt',
  'bash -c',
  'sudo',
  'env',
  'command',
  'time',
  '-p',
  '--',
  '!',
  'x=1',
  'FOO=bar',
  '$HOME',
  '$1',
  '$?',
  '$@',
  '${HOME:-/tmp}',
  '${X:=y z}',
  '$NAME',
  '~/.ssh/config',
  '/tmp/a',
  './b',
  '*',
  '?',
  '[ab]',
  '{a,b}',
  '{1..3}',
  '{,x}',
  'a,b',
  "$'\\n'",
  "$'\\x41'",
  "$'\\U110000'",
  "$'",
  '#',
  '# comment',
  '<#',
  '#>',
  'Remove-Item',
  '-Recurse',
  '-Force',
  'Get-Content',
  '$env:TEMP\\x',
  '$var',
  '@args',
  ',',
  'del',
  'rmdir',
  '-Path',
  'C:\\Temp\\x',
  '.',
  "''",
  '""',
  '`n',
  'f() {',
  'function g {',
  '{ ',
  ' }',
  'a() { a; a; }',
  'f',
  'g',
  '😀',
  'é',
  '日本語',
  '\u00a0',
  'ß',
  '\ud800',
];

const FUZZ_SEPARATORS: readonly string[] = ['', ' ', ' ', '\n'];

function pick<T>(random: () => number, values: readonly T[]): T {
  const value = values[Math.floor(random() * values.length)];
  if (value === undefined) throw new Error('empty fuzz alphabet');
  return value;
}

export function fuzzShellSources(count: number, seed: number): readonly string[] {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => {
    const length = 1 + Math.floor(random() * 14);
    const body = Array.from({ length }, () => pick(random, FUZZ_FRAGMENTS)).join(
      pick(random, FUZZ_SEPARATORS),
    );
    const wrap = Math.floor(random() * 8);
    if (wrap === 0) return `$(${body})`;
    if (wrap === 1) return `\`${body}\``;
    if (wrap === 2) return `"${body}"`;
    if (wrap === 3) return `cat <<EOF\n${body}\nEOF\n`;
    return body;
  });
}

export function differentialSources(): readonly string[] {
  return [
    ...corpusCommands(),
    ...FIXED_COMMANDS,
    ...fuzzShellSources(FUZZ_SAMPLE_COUNT, FUZZ_SEED),
  ];
}

export type ProgramPair = {
  readonly source: string;
  readonly dialect: ShellKind;
  readonly program: CommandProgram;
};

/** Every source parsed as every dialect. */
export function differentialProgramPairs(): readonly ProgramPair[] {
  return differentialSources().flatMap((source) =>
    SHELL_DIALECTS.map((dialect) => ({ source, dialect, program: parseCommand(source, dialect) })),
  );
}
