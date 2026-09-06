import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import * as fs from 'node:fs';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { atomicWriteFile } from '@/core/io/atomic-write';

/**
 * The contract of `atomicWriteFile`: the destination ends up holding exactly the bytes handed in,
 * the staging file is a sibling of the destination, and an interrupted rename leaves the previous
 * destination intact.
 */

const CONTENTS: readonly (readonly [string, string | Buffer])[] = [
  ['an empty file', ''],
  ['a single line', 'plain\n'],
  ['text with no trailing newline', 'no trailing newline'],
  ['multi-byte text', 'ünïcödé 😀 日本語\n'],
  ['CRLF line endings', 'crlf\r\nlines\r\n'],
  ['content far past one page', 'x'.repeat(70_000)],
  ['raw bytes including NUL and 0xff', Buffer.from([0, 1, 2, 254, 255])],
  ['a JSON buffer', Buffer.from('{"hooks":[]}\n')],
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

function freshDirectory(name: string) {
  const dir = join(root, name);
  mkdirSync(dir);
  return dir;
}

describe('atomic write', () => {
  for (const [index, [name, content]] of CONTENTS.entries()) {
    for (const previous of [undefined, 'previous']) {
      const destination =
        previous === undefined ? 'a fresh destination' : 'an existing destination';
      test(`writes ${name} to ${destination} byte for byte, with no temp file left`, () => {
        const dir = freshDirectory(`${previous === undefined ? 'fresh' : 'replace'}-${index}`);
        if (previous !== undefined) writeFileSync(join(dir, 'config.json'), previous);
        atomicWriteFile(join(dir, 'config.json'), content);
        expect(readFileSync(join(dir, 'config.json'))).toEqual(Buffer.from(content));
        expect(readdirSync(dir)).toEqual(['config.json']);
      });
    }
  }

  test('stages the content in a sibling temp file the destination directory holds', () => {
    const dir = freshDirectory('staging');
    const dest = join(dir, 'settings.json');
    writeFileSync(dest, 'old\n');
    const staged: { from: string; to: string; listing: string[]; destination: string }[] = [];
    const spy = spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      staged.push({
        from: String(from),
        to: String(to),
        listing: readdirSync(dir).sort(),
        destination: readFileSync(dest, 'utf-8'),
      });
    });
    atomicWriteFile(dest, 'new\n');
    spy.mockRestore();

    expect(staged).toHaveLength(1);
    expect(staged[0]?.from).toBe(`${dest}.${process.pid}.tmp`);
    expect(dirname(staged[0]?.from ?? '')).toBe(dir);
    expect(staged[0]?.to).toBe(dest);
    expect(staged[0]?.listing).toEqual(['settings.json', `settings.json.${process.pid}.tmp`]);
    // The bytes are complete in the temp file and the destination is still the previous file.
    expect(readFileSync(staged[0]?.from ?? '', 'utf-8')).toBe('new\n');
    expect(staged[0]?.destination).toBe('old\n');
  });

  test('leaves the previous destination intact when the rename fails', () => {
    const dir = freshDirectory('failed-rename');
    const dest = join(dir, 'settings.json');
    writeFileSync(dest, 'old\n');
    const spy = spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('rename refused');
    });
    expect(() => atomicWriteFile(dest, 'new\n')).toThrow('rename refused');
    spy.mockRestore();

    expect(readFileSync(dest, 'utf-8')).toBe('old\n');
    // The staged file is the only residue of the failed write.
    expect(readdirSync(dir).sort()).toEqual(['settings.json', `settings.json.${process.pid}.tmp`]);
    expect(readFileSync(`${dest}.${process.pid}.tmp`, 'utf-8')).toBe('new\n');
  });
});
