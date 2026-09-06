import { describe, expect, test } from 'bun:test';
import {
  findJsonArrayProperty,
  findJsonStringItems,
  findMatchingBracket,
  getLineIndent,
  removeArrayRangeItem,
  stripJsonComments,
} from '@/core/io/jsonc';
import { describeOutcome } from '../../helpers/fixture-tree';
import { corpusStrings, seededRandom } from '../differential-inputs';

/**
 * The JSONC editor's contract: comments are stripped only to parse, and an edit splices the
 * original text so every byte outside the edited range survives. Each row below names the
 * behavior it pins; the generated documents at the end pin the properties that must hold for
 * every input, well-formed or not.
 */

const ERRORS = { stringError: 'unterminated string', bracketError: 'unmatched bracket' };

const MANAGED = 'cc-safety-net';

/** Whether `part` can be read off `whole` in order: what a stripper that only deletes produces. */
function isSubsequence(part: string, whole: string): boolean {
  return (
    [...whole].reduce((matched, char) => {
      return matched < part.length && part[matched] === char ? matched + 1 : matched;
    }, 0) === part.length
  );
}

describe('stripJsonComments', () => {
  const rows: readonly (readonly [string, string, string])[] = [
    [
      'drops a line comment and keeps the newline that ended it',
      '{"a": 1} // end\n',
      '{"a": 1} \n',
    ],
    ['drops a whole-line comment, keeping the newline it ended on', '// only a comment\n', '\n'],
    ['drops a line comment that runs to the end of the document', '{"a": 1} // end', '{"a": 1} '],
    ['drops a block comment', '/* only a block */', ''],
    ['drops a block comment sitting between two values', '[1, 2, /* gap */ 3, ]', '[1, 2,  3 ]'],
    [
      'keeps a comment opener that lives inside a string',
      '{"url": "http://example.com/path", "glob": "/* not a comment */"}',
      '{"url": "http://example.com/path", "glob": "/* not a comment */"}',
    ],
    [
      'keeps a comment opener after an escaped quote inside a string',
      '{"escaped": "a \\" // still in string", "next": true}',
      '{"escaped": "a \\" // still in string", "next": true}',
    ],
    [
      'keeps a comment opener inside a string that also carries an emoji',
      '{"emoji": "😀 // not a comment", "k": 1}',
      '{"emoji": "😀 // not a comment", "k": 1}',
    ],
    [
      'keeps a TOML-style hash, which is not a JSONC comment',
      '{"hash": "#no comment"}',
      '{"hash": "#no comment"}',
    ],
    [
      'ends a string on the quote that follows an escaped backslash',
      '{"a": "ends in a backslash \\\\"} // c',
      '{"a": "ends in a backslash \\\\"} ',
    ],
    ['drops a trailing comma before a closing brace', '{"a": 1,}', '{"a": 1}'],
    [
      'drops a trailing comma separated from its closer by blank lines',
      '{"trailing": [1,\n\n  ]\n}',
      '{"trailing": [1\n\n  ]\n}',
    ],
    [
      'drops a trailing comma at every nesting depth',
      '{"nested": {"deep": [ { "x": 1, }, ], }, }',
      '{"nested": {"deep": [ { "x": 1 } ] } }',
    ],
    [
      'keeps a comma that still separates two values',
      '{ "a" : 1 , "b" : 2 , }',
      '{ "a" : 1 , "b" : 2  }',
    ],
    [
      'strips the comments of a document that mixes both kinds',
      '{\n  // leading comment\n  "a": 1, // trailing comment\n  "b": [1, 2, 3,],\n}\n',
      '{\n  \n  "a": 1, \n  "b": [1, 2, 3]\n}\n',
    ],
    [
      'strips a comment ended by CRLF and the trailing comma it hid',
      '{\r\n  "crlf": true, // comment\r\n}\r\n',
      '{\r\n  "crlf": true \n}\r\n',
    ],
    [
      'strips a comment standing between a key and its value',
      '{"a":\n// between key and value\n[ "v" ]}',
      '{"a":\n\n[ "v" ]}',
    ],
    [
      'leaves an unterminated string, and everything in it, alone',
      '{"unterminated": "string // no end',
      '{"unterminated": "string // no end',
    ],
    ['leaves a lone slash alone', '{"a": 1} / x', '{"a": 1} / x'],
    ['leaves a document without comments byte for byte', '{"a":1}', '{"a":1}'],
    ['leaves an empty document empty', '', ''],
  ];

  for (const [name, document, expected] of rows) {
    test(name, () => {
      expect(stripJsonComments(document)).toBe(expected);
    });
  }

  test('keeps the document before an unterminated block comment and drops the comment body', () => {
    const stripped = stripJsonComments('{"a": 1} /* unterminated block');
    expect(stripped.startsWith('{"a": 1} ')).toBe(true);
    expect(stripped).not.toContain('unterminated');
  });
});

describe('findMatchingBracket', () => {
  const rows: readonly (readonly [string, string, number, number])[] = [
    ['closes a flat array', '[1, 2]', 0, 5],
    ['closes an object', '{ }', 0, 2],
    ['closes the outer array of a nested pair', '[[1], [2]]', 0, 9],
    ['closes the array a key holds', '{"a": [1]}', 6, 8],
    ['ignores a closing bracket inside a string', '[ "]" , 1 ]', 0, 10],
    ['ignores a closing bracket inside an escaped string', '[ "\\"]" , 1 ]', 0, 12],
  ];

  for (const [name, document, open, expected] of rows) {
    test(name, () => {
      expect(findMatchingBracket(document, open, ERRORS)).toBe(expected);
    });
  }

  test('reports the caller bracket message when nothing closes the opener', () => {
    expect(() => findMatchingBracket('[1, 2', 0, ERRORS)).toThrow(ERRORS.bracketError);
  });

  test('reports the caller string message when a string never ends', () => {
    expect(() => findMatchingBracket('[ "open ]', 0, ERRORS)).toThrow(ERRORS.stringError);
  });

  test('counts a bracket inside a comment when no comment skipper is supplied', () => {
    // The primitive is format-agnostic: only a caller that knows its comment syntax skips one.
    expect(findMatchingBracket('[ // ]\n 1 ]', 0, ERRORS)).toBe(5);
  });

  test('skips a bracket inside a comment the caller teaches it to recognise', () => {
    const document = '[ "a", # ]\n "b" ]';
    const skipHash = (content: string, index: number) =>
      content[index] === '#' ? content.indexOf('\n', index) + 1 : index;
    expect(findMatchingBracket(document, 0, { ...ERRORS, skipComment: skipHash })).toBe(16);
    expect(document[16]).toBe(']');
  });
});

describe('getLineIndent', () => {
  const rows: readonly (readonly [string, string, number, string])[] = [
    ['returns the spaces the line starts with', '  "a": 1', 3, '  '],
    ['returns the tab the line starts with', '{\n\t"a": 1\n}', 5, '\t'],
    ['returns the indent of the line the index falls on', 'x\n   y', 6, '   '],
    ['returns nothing for an unindented line', 'no indent', 0, ''],
    ['returns nothing at the start of an empty line', '\n', 0, ''],
  ];

  for (const [name, content, index, expected] of rows) {
    test(name, () => {
      expect(getLineIndent(content, index)).toBe(expected);
    });
  }
});

describe('removeArrayRangeItem', () => {
  const rows: readonly (readonly [string, string, number, number, string])[] = [
    ['takes the comma that followed the item', '[ "a", "b" ]', 2, 5, '[  "b" ]'],
    ['takes the comma that preceded the last item', '[ "a", "b" ]', 7, 10, '[ "a" ]'],
    [
      'takes the newline after the comma, so no blank line is left',
      '[\n  "a",\n  "b"\n]',
      4,
      7,
      '[\n    "b"\n]',
    ],
    ['takes the line the last item sat alone on', '[\n  "a",\n  "b"\n]', 11, 14, '[\n  "a"\n]'],
    ['takes only the item when it is the only one', '[ "only" ]', 2, 8, '[  ]'],
    ['takes only the item when nothing separates it', '[\n  "a"\n]', 4, 7, '[\n  \n]'],
    ['takes the comma of a middle item on a single line', '["a","b","c"]', 5, 8, '["a","c"]'],
  ];

  for (const [name, content, start, end, expected] of rows) {
    test(name, () => {
      expect(removeArrayRangeItem(content, { start, end })).toBe(expected);
    });
  }
});

describe('findJsonArrayProperty and findJsonStringItems', () => {
  test('locates the array a root key holds', () => {
    const document = '{"plugin": ["a"]}';
    const array = findJsonArrayProperty(document, 'plugin', ERRORS);
    expect(array).toEqual({ start: 11, end: 15 });
    expect(findJsonStringItems(document, { start: 11, end: 15 }, ERRORS.stringError)).toEqual([
      { range: { start: 12, end: 15 }, value: 'a' },
    ]);
  });

  test('walks past a nested key of the same name to the root one', () => {
    const document = '{"x": {"plugin": ["nested"]}, "plugin": ["real"]}';
    const array = findJsonArrayProperty(document, 'plugin', ERRORS);
    expect(document.slice(array?.start, (array?.end ?? 0) + 1)).toBe('["real"]');
  });

  test('matches a key written with an escape, because the key is parsed', () => {
    const document = '{"plu\\u0067in": ["escaped key"]}';
    const array = findJsonArrayProperty(document, 'plugin', ERRORS);
    expect(document.slice(array?.start, (array?.end ?? 0) + 1)).toBe('["escaped key"]');
  });

  test('reaches the array across comments between key, colon and bracket', () => {
    const document = '{ /* c */ "plugin" /* c */ : /* c */ ["v"] }';
    const array = findJsonArrayProperty(document, 'plugin', ERRORS);
    expect(document.slice(array?.start, (array?.end ?? 0) + 1)).toBe('["v"]');
  });

  test('returns undefined when the key holds something other than an array', () => {
    expect(findJsonArrayProperty('{"plugin": {"not": "array"}}', 'plugin', ERRORS)).toBeUndefined();
  });

  test('returns undefined when the key is absent', () => {
    expect(findJsonArrayProperty('{"other": ["x"]}', 'plugin', ERRORS)).toBeUndefined();
  });

  test('reports the caller string message for an unterminated string', () => {
    expect(() => findJsonArrayProperty('{"plugin": ["open', 'plugin', ERRORS)).toThrow(
      ERRORS.stringError,
    );
  });

  test('reports the caller bracket message for an unterminated array', () => {
    expect(() => findJsonArrayProperty('{"plugin": ["open"', 'plugin', ERRORS)).toThrow(
      ERRORS.bracketError,
    );
  });

  test('reports only the string items of an array that mixes types', () => {
    const document = '{"plugin": [1, "a", true, null, "d"]}';
    const array = findJsonArrayProperty(document, 'plugin', ERRORS);
    expect(
      findJsonStringItems(document, array ?? { start: 0, end: 0 }, ERRORS.stringError).map(
        (item) => item.value,
      ),
    ).toEqual(['a', 'd']);
  });
});

/** The OpenCode uninstall flow rebuilt over the core primitives. */
function removeManaged(content: string) {
  const array = findJsonArrayProperty(content, 'plugin', ERRORS);
  if (!array) throw new Error('plugin array not found');
  return {
    array,
    updated: findJsonStringItems(content, array, ERRORS.stringError)
      .filter((item) => item.value.includes(MANAGED))
      .map((item) => item.range)
      .reverse()
      .reduce(removeArrayRangeItem, content),
  };
}

/**
 * Each row is a host config file and the exact bytes the uninstall must leave behind. Where the
 * removal merges the indentation of the line it emptied into the next one, the row spells that
 * out: the document still parses to the intended plugin list.
 */
const OPENCODE_ROWS: readonly {
  name: string;
  content: string;
  expected: string;
  plugins: string[];
}[] = [
  {
    name: 'empties an array that held only the managed entry',
    content: '{\n  "plugin": ["cc-safety-net"]\n}\n',
    expected: '{\n  "plugin": []\n}\n',
    plugins: [],
  },
  {
    name: 'keeps every comment and key around the entry it removes',
    content:
      '{\n  // keep me\n  "plugin": [\n    "other-plugin", // first\n    "cc-safety-net", /* managed */\n    "last-plugin"\n  ],\n  "theme": "dark"\n}\n',
    expected:
      '{\n  // keep me\n  "plugin": [\n    "other-plugin", // first\n     /* managed */\n    "last-plugin"\n  ],\n  "theme": "dark"\n}\n',
    plugins: ['other-plugin', 'last-plugin'],
  },
  {
    name: 'removes a versioned entry, which carries the managed name as a prefix',
    content: '{\n  "plugin": [\n    "cc-safety-net@latest",\n    "other"\n  ]\n}\n',
    expected: '{\n  "plugin": [\n        "other"\n  ]\n}\n',
    plugins: ['other'],
  },
  {
    name: 'removes the last entry together with the comma before it',
    content: '{\n  "plugin": [\n    "other",\n    "cc-safety-net"\n  ]\n}\n',
    expected: '{\n  "plugin": [\n    "other"\n  ]\n}\n',
    plugins: ['other'],
  },
  {
    name: 'removes the last entry of an array that already ended with a trailing comma',
    content: '{\n  "plugin": [\n    "other",\n    "cc-safety-net",\n  ]\n}\n',
    expected: '{\n  "plugin": [\n    "other",\n      ]\n}\n',
    plugins: ['other'],
  },
  {
    name: 'leaves a nested plugin array of the same name untouched',
    content: '{"plugin":["a","cc-safety-net","b"],"x":{"plugin":["cc-safety-net"]}}\n',
    expected: '{"plugin":["a","b"],"x":{"plugin":["cc-safety-net"]}}\n',
    plugins: ['a', 'b'],
  },
  {
    name: 'edits the root array even when a nested one is written first',
    content:
      '{\n  "x": { "plugin": ["cc-safety-net"] },\n  "plugin": [ "cc-safety-net", "other" ]\n}\n',
    expected: '{\n  "x": { "plugin": ["cc-safety-net"] },\n  "plugin": [  "other" ]\n}\n',
    plugins: ['other'],
  },
  {
    name: 'leaves the managed name mentioned in a comment in place',
    content:
      '{\n  "plugin": [\n    // "cc-safety-net" mentioned in a comment stays\n    "other"\n  ]\n}\n',
    expected:
      '{\n  "plugin": [\n    // "cc-safety-net" mentioned in a comment stays\n    "other"\n  ]\n}\n',
    plugins: ['other'],
  },
  {
    name: 'leaves the managed name inside another key’s string value in place',
    content:
      '{\n  "note": "cc-safety-net inside a string value stays",\n  "plugin": ["cc-safety-net", "keep"]\n}\n',
    expected:
      '{\n  "note": "cc-safety-net inside a string value stays",\n  "plugin": [ "keep"]\n}\n',
    plugins: ['keep'],
  },
  {
    name: 'removes an entry whose text carries an escaped quote and a bracket',
    content: '{\n  "plugin": [\n    "quote \\" ] cc-safety-net",\n    "other"\n  ]\n}\n',
    expected: '{\n  "plugin": [\n        "other"\n  ]\n}\n',
    plugins: ['other'],
  },
  {
    name: 'keeps the comments written around the array brackets',
    content: '{\n  "plugin": /* between */ [ // after\n    "cc-safety-net"\n  ]\n}\n',
    expected: '{\n  "plugin": /* between */ [ // after\n    \n  ]\n}\n',
    plugins: [],
  },
  {
    name: 'leaves a config with no managed entry byte for byte',
    content: '{\n  "plugin": ["untouched"]\n}\n',
    expected: '{\n  "plugin": ["untouched"]\n}\n',
    plugins: ['untouched'],
  },
  {
    name: 'leaves an already empty array byte for byte',
    content: '{\n  "plugin": []\n}\n',
    expected: '{\n  "plugin": []\n}\n',
    plugins: [],
  },
  {
    name: 'keeps CRLF line endings when removing an entry',
    content: '{\r\n  "plugin": [\r\n    "cc-safety-net",\r\n    "other"\r\n  ]\r\n}\r\n',
    expected: '{\r\n  "plugin": [\r\n    \r\n    "other"\r\n  ]\r\n}\r\n',
    plugins: ['other'],
  },
  {
    name: 'keeps tab indentation when removing an entry',
    content: '{\n\t"plugin": [\n\t\t"one",\n\t\t"cc-safety-net",\n\t\t"three"\n\t]\n}\n',
    expected: '{\n\t"plugin": [\n\t\t"one",\n\t\t\t\t"three"\n\t]\n}\n',
    plugins: ['one', 'three'],
  },
];

describe('the OpenCode plugin-array edit', () => {
  for (const row of OPENCODE_ROWS) {
    test(row.name, () => {
      expect(removeManaged(row.content).updated).toBe(row.expected);
    });
  }

  test('never touches a byte outside the array it edits', () => {
    const leaked = OPENCODE_ROWS.filter((row) => {
      const result = removeManaged(row.content);
      return (
        !result.updated.startsWith(row.content.slice(0, result.array.start + 1)) ||
        !result.updated.endsWith(row.content.slice(result.array.end))
      );
    }).map((row) => row.name);
    expect(leaked).toEqual([]);
  });

  test('leaves a document that parses to the intended plugin list', () => {
    const parsed = OPENCODE_ROWS.map((row) => {
      const document: unknown = JSON.parse(stripJsonComments(removeManaged(row.content).updated));
      return {
        name: row.name,
        plugins:
          typeof document === 'object' && document !== null && 'plugin' in document
            ? document.plugin
            : null,
      };
    });
    expect(parsed).toEqual(OPENCODE_ROWS.map((row) => ({ name: row.name, plugins: row.plugins })));
  });

  test('is idempotent: a second uninstall finds nothing left to remove', () => {
    const changed = OPENCODE_ROWS.filter((row) => {
      const once = removeManaged(row.content).updated;
      return removeManaged(once).updated !== once;
    }).map((row) => row.name);
    expect(changed).toEqual([]);
  });

  test('refuses a config whose plugin array is missing', () => {
    expect(() => removeManaged('{"other": []}')).toThrow('plugin array not found');
  });
});

/** Fragments that put brackets, quotes, escapes and comment openers next to each other. */
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

/** A JSON value of a few shapes, so the generated documents carry real content to preserve. */
function fuzzValue(random: () => number, depth: number): unknown {
  const choice = Math.floor(random() * (depth > 2 ? 5 : 7));
  if (choice === 0) return null;
  if (choice === 1) return random() < 0.5;
  if (choice === 2) return Math.floor(random() * 2000) - 1000;
  if (choice === 3)
    return ['plain', 'has // slashes', 'has /* block */', 'has "quote"', '😀 ]'][
      Math.floor(random() * 5)
    ];
  if (choice === 4) return {};
  if (choice === 5) {
    return Array.from({ length: 1 + Math.floor(random() * 3) }, () => fuzzValue(random, depth + 1));
  }
  return Object.fromEntries(
    Array.from({ length: 1 + Math.floor(random() * 3) }, (_, index) => [
      `key ${index}`,
      fuzzValue(random, depth + 1),
    ]),
  );
}

/** Pretty JSON decorated with the comments and trailing commas a hand-edited config carries. */
function fuzzJsonc(count: number, seed: number): readonly { document: string; value: unknown }[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => {
    const value = fuzzValue(random, 0);
    const lines = JSON.stringify(value, null, 2).split('\n');
    const decorated = lines.flatMap((line, index) => {
      const next = lines[index + 1]?.trim() ?? '';
      const closes = next.startsWith('}') || next.startsWith(']');
      const comma = closes && !/[,[{]$/.test(line) && next !== '' ? ',' : '';
      const comment = random() < 0.4 ? ' // trailing } ] , " comment' : '';
      const block = random() < 0.2 ? ['/* leading } ] , " block */'] : [];
      return [...block, `${line}${comma}${comment}`];
    });
    return { document: decorated.join('\n'), value };
  });
}

describe('invariants over generated documents', () => {
  const hostile = [...corpusStrings(), ...fuzzDocuments(1_500, 0x5afe_0001)];

  test('stripping a decorated document yields the JSON it was built from', () => {
    const wrong = fuzzJsonc(400, 0x5afe_0004).filter(
      (row) =>
        JSON.stringify(
          describeOutcome(() => JSON.parse(stripJsonComments(row.document)) as unknown),
        ) !== JSON.stringify({ ok: true, value: row.value }),
    );
    expect(wrong.map((row) => row.document)).toEqual([]);
  });

  test('stripping a well-formed document twice changes nothing the second time', () => {
    const unstable = fuzzJsonc(400, 0x5afe_0005)
      .map((row) => stripJsonComments(row.document))
      .filter((stripped) => stripJsonComments(stripped) !== stripped);
    expect(unstable).toEqual([]);
  });

  test('stripping only ever deletes bytes, whatever the document', () => {
    const invented = hostile.filter(
      (document) => !isSubsequence(stripJsonComments(document), document),
    );
    expect(invented).toEqual([]);
  });

  test('bracket matching either lands on the closer or raises a caller message', () => {
    const wrong = hostile.flatMap((document) => {
      const open = document.search(/[[{]/);
      if (open === -1) return [];
      const outcome = describeOutcome(() => findMatchingBracket(document, open, ERRORS));
      if (!outcome.ok) {
        return [ERRORS.stringError, ERRORS.bracketError].includes(outcome.error.message)
          ? []
          : [`${document} -> ${outcome.error.message}`];
      }
      const closer = document[open] === '[' ? ']' : '}';
      return outcome.value > open && document[outcome.value] === closer
        ? []
        : [`${document} -> ${outcome.value}`];
    });
    expect(wrong).toEqual([]);
  });

  test('the indent reported is the whitespace that line really starts with', () => {
    const random = seededRandom(0x5afe_0002);
    const wrong = hostile.filter((document) => {
      const index = Math.floor(random() * (document.length + 1));
      const indent = getLineIndent(document, index);
      const lineStart = document.lastIndexOf('\n', index) + 1;
      return (
        !/^[ \t]*$/.test(indent) ||
        !document.startsWith(indent, lineStart) ||
        [' ', '\t'].includes(document[lineStart + indent.length] ?? '')
      );
    });
    expect(wrong).toEqual([]);
  });

  test('item removal deletes one run of bytes that covers the item, and never adds any', () => {
    const random = seededRandom(0x5afe_0003);
    const wrong = hostile.filter((document) => {
      const start = Math.floor(random() * (document.length + 1));
      const end = start + Math.floor(random() * (document.length - start + 1));
      const removed = removeArrayRangeItem(document, { start, end });
      const prefix = [...removed].findIndex((char, index) => char !== document[index]);
      const kept = prefix === -1 ? removed.length : prefix;
      return (
        removed.length > document.length - (end - start) ||
        !document.slice(end).endsWith(removed.slice(start)) ||
        removed !==
          document.slice(0, kept) + document.slice(document.length - (removed.length - kept))
      );
    });
    expect(wrong).toEqual([]);
  });
});
