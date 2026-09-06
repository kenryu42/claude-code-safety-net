import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findMatchingBracket as findBracketWithNext,
  findJsonArrayProperty,
  findJsonStringItems,
  getLineIndent as indentWithNext,
  removeArrayRangeItem as removeWithNext,
  stripJsonComments as stripWithNext,
} from '@next/core/io/jsonc';
import {
  findMatchingBracket as findBracketWithSrc,
  getLineIndent as indentWithSrc,
  removeArrayRangeItem as removeWithSrc,
} from '@/integrations/install/config-edit';
import { stripJsonComments as stripWithSrc } from '@/integrations/jsonc';
import { uninstallOpenCode } from '@/integrations/opencode/install';
import { withEnv } from '../../../helpers';
import { describeOutcome } from '../../helpers/fixture-tree';
import { expectRecordedDigest } from '../../helpers/gate-differential';
import { corpusStrings, seededRandom } from '../differential-inputs';

const ERRORS = { stringError: 'unterminated string', bracketError: 'unmatched bracket' };

const JSONC_DOCUMENTS: readonly string[] = [
  '',
  '{}',
  '{"a":1}',
  '// only a comment',
  '/* only a block */',
  '{\n  // leading comment\n  "a": 1, // trailing comment\n  "b": [1, 2, 3,],\n}\n',
  '{"url": "http://example.com/path", "glob": "/* not a comment */"}',
  '{"escaped": "a \\" // still in string", "next": true}',
  '{"a": 1,}',
  '[1, 2, /* gap */ 3, ]',
  '{"nested": {"deep": [ { "x": 1, }, ], }, }',
  '{\r\n  "crlf": true, // comment\r\n}\r\n',
  '{"unterminated": "string // no end',
  '{"a": 1} /* unterminated block',
  '/*',
  '/',
  '{"a": "b"} // end',
  '{"a":\n// between key and value\n[ "v" ]}',
  '{"trailing": [1,\n\n  ]\n}',
  '{"back\\\\slash": "x", "tab":\t"y"}',
  '{ "a" : 1 , "b" : 2 , }',
  '[[[]]]',
  '{"emoji": "😀 // not a comment", "k": 1}',
];

const BRACKET_FRAGMENTS: readonly string[] = [
  '{',
  '}',
  '[',
  ']',
  '"',
  '\\',
  '\\"',
  '//',
  '/*',
  '*/',
  '#',
  ',',
  ':',
  '\n',
  ' ',
  '  ',
  'a',
  '1',
  'true',
  '"k"',
  '"v v"',
  '"]"',
  '"}"',
  '/',
  '*',
];

function fuzzDocuments(count: number, seed: number): readonly string[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () =>
    Array.from(
      { length: 1 + Math.floor(random() * 24) },
      () => BRACKET_FRAGMENTS[Math.floor(random() * BRACKET_FRAGMENTS.length)] ?? '',
    ).join(''),
  );
}

function allDocuments(): readonly string[] {
  return [...JSONC_DOCUMENTS, ...corpusStrings(), ...fuzzDocuments(1_500, 0x5afe_0001)];
}

describe('jsonc comment stripping', () => {
  test('matches the shipped stripper on fixed, corpus, and fuzzed documents', () => {
    for (const document of allDocuments()) {
      const stripped = stripWithNext(document);
      expect(stripped).toBe(stripWithSrc(document));
      expect(stripped).toMatchSnapshot();
    }
  });
});

describe('text-range primitives', () => {
  test('match brackets, indents, and item removal like the shipped config editor', () => {
    const random = seededRandom(0x5afe_0002);
    const recorded: (readonly [string, unknown])[] = [];
    for (const [row, document] of allDocuments().entries()) {
      const openIndex = document.search(/[[{]/);
      if (openIndex !== -1) {
        const bracket = describeOutcome(() => findBracketWithNext(document, openIndex, ERRORS));
        expect(bracket).toEqual(
          describeOutcome(() => findBracketWithSrc(document, openIndex, ERRORS)),
        );
        recorded.push([`${row} bracket`, bracket]);
      }
      const index = Math.floor(random() * (document.length + 1));
      const indent = indentWithNext(document, index);
      expect(indent).toBe(indentWithSrc(document, index));
      recorded.push([`${row} indent`, indent]);
      const start = Math.floor(random() * (document.length + 1));
      const end = start + Math.floor(random() * (document.length - start + 1));
      const removed = removeWithNext(document, { start, end });
      expect(removed).toBe(removeWithSrc(document, { start, end }));
      recorded.push([`${row} removal`, removed]);
    }
    expectRecordedDigest('core-jsonc/text-ranges', recorded);
  });

  test('skips comments only when asked, so a TOML-style caller can supply its own', () => {
    const document = '[ "a", # ]\n "b" ]';
    const bracket = describeOutcome(() => findBracketWithNext(document, 0, ERRORS));
    expect(bracket).toEqual(describeOutcome(() => findBracketWithSrc(document, 0, ERRORS)));
    expect(bracket).toMatchSnapshot();
    const skipHash = (content: string, index: number) =>
      content[index] === '#' ? content.indexOf('\n', index) + 1 : index;
    const skipped = findBracketWithNext(document, 0, { ...ERRORS, skipComment: skipHash });
    expect(skipped).toBe(findBracketWithSrc(document, 0, { ...ERRORS, skipComment: skipHash }));
    expect(skipped).toMatchSnapshot();
  });
});

const MANAGED = 'cc-safety-net';

const OPENCODE_CONFIGS: readonly string[] = [
  '{\n  "plugin": ["cc-safety-net"]\n}\n',
  '{\n  // keep me\n  "plugin": [\n    "other-plugin", // first\n    "cc-safety-net", /* managed */\n    "last-plugin"\n  ],\n  "theme": "dark"\n}\n',
  '{\n  "plugin": [\n    "cc-safety-net@latest",\n    "other"\n  ]\n}\n',
  '{\n  "plugin": [\n    "other",\n    "cc-safety-net"\n  ]\n}\n',
  '{\n  "plugin": [\n    "other",\n    "cc-safety-net",\n  ]\n}\n',
  '{"plugin":["a","cc-safety-net","b"],"x":{"plugin":["cc-safety-net"]}}\n',
  '{\n  "x": { "plugin": ["cc-safety-net"] },\n  "plugin": [ "cc-safety-net", "other" ]\n}\n',
  '{\n  "plugin": [\n    // "cc-safety-net" mentioned in a comment stays\n    "other",\n    "cc-safety-net"\n  ]\n}\n',
  '{\n  "note": "cc-safety-net inside a string value stays",\n  "plugin": ["cc-safety-net", "keep"]\n}\n',
  '{\n  "plugin": [\n    "quote \\" ] cc-safety-net",\n    "other"\n  ]\n}\n',
  '{\n  "plugin": /* between */ [ // after\n    "cc-safety-net"\n  ]\n}\n',
  '{\n  "plugin": ["untouched"]\n}\n',
  '{\n  "plugin": []\n}\n',
  '{\r\n  "plugin": [\r\n    "cc-safety-net",\r\n    "other"\r\n  ]\r\n}\r\n',
  '{\n\t"plugin": [\n\t\t"one",\n\t\t"cc-safety-net",\n\t\t"three"\n\t]\n}\n',
];

/** The shipped OpenCode uninstall flow rebuilt over the core primitives. */
function removeManagedWithNext(content: string) {
  const array = findJsonArrayProperty(content, 'plugin', ERRORS);
  if (!array) throw new Error('plugin array not found');
  return {
    array,
    updated: findJsonStringItems(content, array, ERRORS.stringError)
      .filter((item) => item.value.includes(MANAGED))
      .map((item) => item.range)
      .reverse()
      .reduce(removeWithNext, content),
  };
}

let home = '';

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'next-jsonc-'));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('jsonc surgical edit', () => {
  test('removes the managed entries byte for byte like the shipped OpenCode uninstall', () => {
    for (const [index, content] of OPENCODE_CONFIGS.entries()) {
      const configDir = join(home, `case-${index}`, '.config', 'opencode');
      mkdirSync(configDir, { recursive: true });
      const configPath = join(configDir, index % 2 === 0 ? 'opencode.json' : 'opencode.jsonc');
      writeFileSync(configPath, content);
      withEnv(
        {
          XDG_CONFIG_HOME: join(home, `case-${index}`, '.config'),
          XDG_CACHE_HOME: join(home, `case-${index}`, '.cache'),
        },
        () => uninstallOpenCode(join(home, `case-${index}`)),
      );
      const shipped = readFileSync(configPath, 'utf-8');
      const result = removeManagedWithNext(content);
      expect(result.updated).toBe(shipped);
      expect(result.updated).toMatchSnapshot();
      // Everything outside the located array, comments and formatting included, is untouched.
      expect(result.updated.startsWith(content.slice(0, result.array.start + 1))).toBe(true);
      expect(result.updated.endsWith(content.slice(result.array.end))).toBe(true);
      const parsed = JSON.parse(stripWithNext(result.updated));
      expect(parsed).toEqual(JSON.parse(stripWithSrc(shipped)));
      expect(parsed).toMatchSnapshot();
    }
  });

  test('reports the caller diagnostics for an unterminated string or array', () => {
    expect(() => findJsonArrayProperty('{"plugin": ["open', 'plugin', ERRORS)).toThrow(
      ERRORS.stringError,
    );
    expect(() => findJsonArrayProperty('{"plugin": ["open"', 'plugin', ERRORS)).toThrow(
      ERRORS.bracketError,
    );
    expect(findJsonArrayProperty('{"plugin": {"not": "array"}}', 'plugin', ERRORS)).toBeUndefined();
    expect(findJsonArrayProperty('{"other": ["x"]}', 'plugin', ERRORS)).toBeUndefined();
  });
});
