import { describe, test } from 'bun:test';
import { projectShellSyntax } from '@/core/shell/projection';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { differentialProgramPairs } from '../../helpers/shell-inputs';

describe('next/core/shell/projection against src/parser/shell/entry-projection', () => {
  test('projects every parsed program onto the same entry stream', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const pair of differentialProgramPairs()) {
      recorded.push([
        `${pair.dialect} ${pair.source}`,
        projectShellSyntax(pair.source, pair.program),
      ]);
    }
    expectRecordedDigest('core-shell-projection/entry-stream', recorded);
  });
});
