import { describe, expect, test } from 'bun:test';
import { getCalledCommandName, isDynamicExecutable } from '@next/core/shell/model';
import { projectCommandViews } from '@next/core/shell/traversal';
import {
  getCalledCommandName as getCalledCommandNameWithSrc,
  isDynamicExecutable as isDynamicExecutableWithSrc,
} from '@/ir/command';
import { projectCommandViews as projectCommandViewsWithSrc } from '@/parser/traversal';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { differentialProgramPairs } from '../../helpers/shell-inputs';

describe('next/core/shell/model against src/ir/command', () => {
  test('names the called command and detects dynamic executables identically for every view', () => {
    const recorded: (readonly [string, unknown])[] = [];
    for (const pair of differentialProgramPairs()) {
      const srcViews = projectCommandViewsWithSrc(pair.src);
      const views = projectCommandViews(pair.next).map((view) => ({
        called: getCalledCommandName(view),
        dynamic: isDynamicExecutable(view.dialect, view.words),
      }));
      expect({ source: pair.source, dialect: pair.dialect, views }).toStrictEqual({
        source: pair.source,
        dialect: pair.dialect,
        views: srcViews.map((view) => ({
          called: getCalledCommandNameWithSrc(view),
          dynamic: isDynamicExecutableWithSrc(view.dialect, view.words),
        })),
      });
      recorded.push([`${pair.dialect} ${pair.source}`, views]);
    }
    expectRecordedDigest('core-shell-model/command-views', recorded);
  });
});
