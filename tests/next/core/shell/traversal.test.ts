import { describe, expect, test } from 'bun:test';
import { parseSimpleWords, projectSegmentWords } from '@next/core/shell/traversal';
import {
  parseSimpleWords as parseSimpleWordsWithSrc,
  projectSegmentWords as projectSegmentWordsWithSrc,
} from '@/parser/traversal';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { differentialProgramPairs, differentialSources } from '../../helpers/shell-inputs';

describe('next/core/shell/traversal against src/parser/traversal', () => {
  test('projects the same segment word lists from every parsed program', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const pair of differentialProgramPairs()) {
      const words = projectSegmentWords(pair.next);
      expect({ source: pair.source, dialect: pair.dialect, words }).toStrictEqual({
        source: pair.source,
        dialect: pair.dialect,
        words: projectSegmentWordsWithSrc(pair.src),
      });
      recorded.push([`${pair.dialect} ${pair.source}`, words]);
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
      const words = parseSimpleWords(source);
      expect({ source, words }).toStrictEqual({ source, words: parseSimpleWordsWithSrc(source) });
      recorded.push([source, words]);
    }
    expectRecordedDigest('core-shell-traversal/simple-words', recorded);
  });
});
