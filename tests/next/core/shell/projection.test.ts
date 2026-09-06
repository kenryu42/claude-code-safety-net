import { describe, expect, test } from 'bun:test';
import { projectShellSyntax } from '@next/core/shell/projection';
import { projectShellSyntax as projectWithSrc } from '@/parser/shell/entry-projection';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { differentialProgramPairs } from '../../helpers/shell-inputs';

describe('next/core/shell/projection against src/parser/shell/entry-projection', () => {
  test('projects every parsed program onto the same entry stream', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const pair of differentialProgramPairs()) {
      const facts = projectShellSyntax(pair.source, pair.next);
      expect({ source: pair.source, dialect: pair.dialect, facts }).toStrictEqual({
        source: pair.source,
        dialect: pair.dialect,
        facts: projectWithSrc(pair.source, pair.src),
      });
      recorded.push([`${pair.dialect} ${pair.source}`, facts]);
    }
    expectRecordedDigest('core-shell-projection/entry-stream', recorded);
  });
});
