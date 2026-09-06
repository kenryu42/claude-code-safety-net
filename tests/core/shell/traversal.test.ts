import { describe, test } from 'bun:test';
import { parseSimpleWords, projectSegmentWords } from '@/core/shell/traversal';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { differentialProgramPairs, differentialSources } from '../../helpers/shell-inputs';

describe('next/core/shell/traversal against src/parser/traversal', () => {
  test('projects the same segment word lists from every parsed program', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const pair of differentialProgramPairs()) {
      recorded.push([`${pair.dialect} ${pair.source}`, projectSegmentWords(pair.program)]);
    }
    expectRecordedDigest('core-shell-traversal/segment-words', recorded);
  });

  test('recognizes the same argv-like sources as one plain command', () => {
    const argvLike = [
      'log --oneline -n 5',
      'commit -m "msg"',
      'status $(pwd)',
      'echo one; echo two',
      'echo > out',
      'echo {}',
      '',
    ];
    const recorded: (readonly [string, unknown])[] = [];
    for (const source of [...differentialSources(), ...argvLike]) {
      recorded.push([source, parseSimpleWords(source)]);
    }
    expectRecordedDigest('core-shell-traversal/simple-words', recorded);
  });
});
