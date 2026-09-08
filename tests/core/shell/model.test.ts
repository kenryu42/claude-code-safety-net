import { describe, test } from 'bun:test';
import { getCalledCommandName, isDynamicExecutable } from '@/core/shell/model';
import { projectCommandViews } from '@/core/shell/traversal';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { differentialProgramPairs } from '../../helpers/shell-inputs';

describe('next/core/shell/model against src/ir/command', () => {
  test('names the called command and detects dynamic executables identically for every view', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const pair of differentialProgramPairs()) {
      const views = projectCommandViews(pair.program).map((view) => ({
        called: getCalledCommandName(view),
        dynamic: isDynamicExecutable(view.dialect, view.words),
      }));
      recorded.push([`${pair.dialect} ${pair.source}`, views]);
    }
    expectRecordedDigest('core-shell-model/command-views', recorded);
  });
});
