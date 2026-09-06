import { describe, expect, test } from 'bun:test';
import { renderPages, sliceBlock } from '../helpers/gui-page';

/**
 * The activity feed marks the denials worth a second look: anything that failed inside the gate,
 * and anything one session hit twice on the same command signature. Both halves — the signature from
 * the shared display helper, the rule from the page script — are pinned by their recorded snapshot,
 * and the pair is then run over fresh entries.
 */

// Token-shaped, assembled here rather than written out, and fixed so the slice is deterministic.
const TOKEN = Buffer.from('cc-safety-net gui suspect fixture').toString('base64url');

type Entry = {
  command: string;
  decision: string;
  sessionId?: string;
  segment?: string;
  failureStage?: string;
};

const pages = renderPages(TOKEN);
// The signature helper is the last thing in its own bundled module, so the next module label ends
// the slice.
const block = (page: string) =>
  [
    sliceBlock(page, 'var commandSignature = (source) => {', '\n// '),
    sliceBlock(page, 'var findSuspects = (entries) => {', 'var clearCommandFilter'),
  ].join('\n');

const findSuspects = new Function(
  'entries',
  `${block(pages.ported)}\nreturn findSuspects(entries);`,
) as (entries: readonly Entry[]) => Set<Entry>;

const suspectCommands = (entries: readonly Entry[]) =>
  [...findSuspects(entries)].map((entry) => entry.command);

describe('the suspect block on the served page', () => {
  test('is the shipped block byte for byte', () => {
    expect(block(pages.ported)).toMatchSnapshot();
  });

  test('flags a denial that failed inside the gate on its own', () => {
    const entries: Entry[] = [
      { command: 'terraform destroy', decision: 'deny', sessionId: 's1', failureStage: 'analysis' },
      { command: 'terraform plan', decision: 'deny', sessionId: 's1' },
    ];

    expect(suspectCommands(entries)).toStrictEqual(['terraform destroy']);
  });

  test('flags a signature one session was denied twice for, reading the segment first', () => {
    const entries: Entry[] = [
      {
        command: 'cd /srv && git push --force origin main',
        segment: 'git push --force origin main',
        decision: 'deny',
        sessionId: 's1',
      },
      {
        command: 'FOO=1 git push --force',
        segment: 'git push --force',
        decision: 'deny',
        sessionId: 's1',
      },
    ];

    // Two different command lines, one signature: both are the repeat the feed points at.
    expect(findSuspects(entries).size).toBe(2);
  });

  test('leaves one denial per session and every allow alone', () => {
    const entries: Entry[] = [
      { command: 'git push --force', decision: 'deny', sessionId: 's1' },
      { command: 'git push --force', decision: 'deny', sessionId: 's2' },
      { command: 'git status', decision: 'allow', sessionId: 's3', failureStage: 'analysis' },
      { command: 'git status', decision: 'allow', sessionId: 's3' },
      // No session to attribute the repeat to, so it never counts as one.
      { command: 'git push --force', decision: 'deny' },
      { command: 'git push --force', decision: 'deny' },
    ];

    expect(suspectCommands(entries)).toStrictEqual([]);
  });
});
