import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { atomicWriteFile as writeWithNext } from '@/core/io/atomic-write';
import { describeOutcome, snapshotTree } from '../../helpers/fixture-tree';
import { recordPorted } from '../../helpers/temp-home';

const WRITERS = [['next', writeWithNext]] as const;

const CONTENTS: readonly (string | Buffer)[] = [
  '',
  'plain\n',
  'no trailing newline',
  'ünïcödé 😀 日本語\n',
  'crlf\r\nlines\r\n',
  'x'.repeat(70_000),
  Buffer.from([0, 1, 2, 254, 255]),
  Buffer.from('{"hooks":[]}\n'),
];

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'next-atomic-write-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root);
});

describe('atomic write', () => {
  test('leaves the same bytes and nothing else behind, over a fresh or existing destination', () => {
    for (const [index, content] of CONTENTS.entries()) {
      const results = WRITERS.map(([name, write]) => {
        const dir = join(root, `${name}-${index}`);
        mkdirSync(dir);
        const dest = join(dir, 'config.json');
        write(dest, content);
        const fresh = readFileSync(dest);
        writeFileSync(dest, 'previous');
        write(dest, content);
        return { fresh, replaced: readFileSync(dest), listing: readdirSync(dir) };
      });
      expect(results[0]?.fresh).toEqual(Buffer.from(content));
      expect(results[0]?.listing).toEqual(['config.json']);
    }
  });

  test('stages the content in a sibling temp file and only then renames it into place', () => {
    const captures = WRITERS.map(([name, write]) => {
      const dir = join(root, name);
      mkdirSync(dir);
      const dest = join(dir, 'settings.json');
      writeFileSync(dest, 'old\n');
      const seen: Record<string, unknown>[] = [];
      const spy = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
        seen.push({
          sameDirectory: dirname(String(from)) === dir && String(to) === dest,
          listing: readdirSync(dir).sort(),
          staged: readFileSync(String(from), 'utf-8'),
          destination: readFileSync(dest, 'utf-8'),
        });
        throw new Error('rename refused');
      });
      const outcome = describeOutcome(() => write(dest, 'new\n'));
      spy.mockRestore();
      return { seen, outcome, after: snapshotTree(dir) };
    });

    recordPorted(captures[0], [[`.${process.pid}.tmp`, '.<pid>.tmp']]);
    expect(captures[0]?.seen).toEqual([
      {
        sameDirectory: true,
        listing: ['settings.json', `settings.json.${process.pid}.tmp`],
        staged: 'new\n',
        destination: 'old\n',
      },
    ]);
    expect(captures[0]?.outcome).toEqual({
      ok: false,
      error: { name: 'Error', message: 'rename refused' },
    });
    // The destination is untouched by a failed rename; the staged file is the only residue.
    expect(captures[0]?.after.map((entry) => [entry.path, entry.content])).toEqual([
      ['settings.json', 'old\n'],
      [`settings.json.${process.pid}.tmp`, 'new\n'],
    ]);
  });
});
