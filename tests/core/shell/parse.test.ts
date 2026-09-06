import { describe, expect, test } from 'bun:test';
import type { CommandParserLimits, ShellKind } from '@/core/shell/model';
import { DEFAULT_COMMAND_PARSER_LIMITS, parseCommand } from '@/core/shell/parse';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import {
  differentialProgramPairs,
  differentialSources,
  SHELL_DIALECTS,
} from '../../helpers/shell-inputs';

const STATUSES = ['complete', 'partial', 'invalid', 'limited'];

describe('next/core/shell/parse against src/parser/command', () => {
  const pairs = differentialProgramPairs();

  test('ships the same default limits', () => {
    expect(DEFAULT_COMMAND_PARSER_LIMITS).toMatchSnapshot();
  });

  test('parses the corpus, the fixed table and the seeded fuzz identically in every dialect', () => {
    expect(pairs.length).toBeGreaterThan(6_000);
    expectRecordedDigest(
      'core-shell-parse/program-pairs',
      pairs.map((pair) => [`${pair.dialect} ${pair.source}`, pair.program] as const),
    );
  });

  test('every source under the caps yields one of the four statuses and never throws', () => {
    for (const source of differentialSources()) {
      for (const dialect of SHELL_DIALECTS) {
        expect(() => parseCommand(source, dialect)).not.toThrow();
        const program = parseCommand(source, dialect);
        expect(STATUSES).toContain(program.status);
        expect(program.span).toStrictEqual({ start: 0, end: source.length });
        if (dialect !== 'auto') expect(program.dialect).toBe(dialect);
      }
    }
  });

  test('defaults the dialect to auto exactly as src does', () => {
    for (const source of ['rm -rf x', 'Remove-Item x', 'cat $env:TEMP\\x', '']) {
      expect(parseCommand(source)).toMatchSnapshot();
    }
  });
});

describe('parser caps yield status limited without throwing', () => {
  const small: CommandParserLimits = { maxInputLength: 40, maxWords: 6, maxDepth: 2 };
  const overCap: readonly { readonly source: string; readonly dialects: readonly ShellKind[] }[] = [
    { source: 'x'.repeat(41), dialects: ['posix', 'powershell'] },
    { source: 'a b c d e f g', dialects: ['posix', 'powershell'] },
    { source: 'echo $($($(deep)))', dialects: ['posix', 'powershell'] },
    { source: '( ( ( echo ) ) )', dialects: ['posix'] },
    { source: 'f() { g() { h() { :; }; }; }', dialects: ['posix'] },
    { source: 'echo "$($($(deep)))"', dialects: ['posix'] },
    { source: 'echo $((1+$((2+$((3))))))', dialects: ['posix'] },
    { source: '{a,b}{c,d}{e,f}', dialects: ['posix'] },
    { source: '{a,b,c,d,e,f,g}', dialects: ['posix'] },
    { source: '{aaaaaaaa,bbbbbbbb}{cccccccc,dddddddd}', dialects: ['posix'] },
    { source: 'echo >$($($(deep)))', dialects: ['posix'] },
    { source: '{ { { echo; }; }; }', dialects: ['posix', 'powershell'] },
    { source: '<# <# <# deep #> #> #>', dialects: ['powershell'] },
    { source: 'Remove-Item "$($($(deep)))"', dialects: ['powershell'] },
    { source: 'Remove-Item > $($($(deep)))', dialects: ['powershell'] },
    { source: `echo ${'y'.repeat(36)}\nRemove-Item -Recurse x`, dialects: ['auto'] },
  ];

  test('with small custom limits, both implementations agree and report limited', () => {
    for (const row of overCap) {
      for (const dialect of row.dialects) {
        const program = parseCommand(row.source, dialect, small);
        expect(program).toMatchSnapshot();
        expect(program.status).toBe('limited');
      }
    }
  });

  test('a heredoc body substitution over the depth cap limits only the nested program', () => {
    const source = 'cat <<EOF\n$($($(deep)))\nEOF';
    const program = parseCommand(source, 'posix', small);
    expect(program).toMatchSnapshot();
    expect(program.status).toBe('complete');
    const command = program.nodes[0];
    expect(command?.kind === 'command' && command.nested[0]?.status).toBe('limited');
  });

  test('with the default caps, both implementations agree and report limited', () => {
    const sources = [
      `printf ${'y'.repeat(DEFAULT_COMMAND_PARSER_LIMITS.maxInputLength)}`,
      Array.from({ length: DEFAULT_COMMAND_PARSER_LIMITS.maxWords + 1 }, () => 'w').join(' '),
      `${'$('.repeat(DEFAULT_COMMAND_PARSER_LIMITS.maxDepth + 1)}echo${')'.repeat(
        DEFAULT_COMMAND_PARSER_LIMITS.maxDepth + 1,
      )}`,
    ];
    const recorded: (readonly [string, unknown])[] = [];
    for (const source of sources) {
      for (const dialect of SHELL_DIALECTS) {
        const program = parseCommand(source, dialect);
        expect(program.status).toBe('limited');
        recorded.push([`${dialect} ${source}`, program]);
      }
    }
    expectRecordedDigest('core-shell-parse/default-caps', recorded);
  });
});
