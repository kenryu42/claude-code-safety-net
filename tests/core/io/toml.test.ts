import { describe, expect, test } from 'bun:test';
import {
  appendTomlArrayItem,
  findTopLevelTomlArray,
  removeTomlArrayItem,
  removeTomlTableBlocks,
  removeTopLevelEmptyTomlArray,
} from '@/core/io/toml';

/**
 * The Kimi Code installer is the caller this TOML editor serves, so the rows below are the config
 * files it meets and the exact bytes each edit must leave behind. Its hook strings are restated
 * here because they are the host's artifact, not part of the core edit.
 */
const COMMAND = 'npx -y cc-safety-net hook --kimi-code';
const INLINE_ITEM = `{ event = "PreToolUse", command = "${COMMAND}" }`;
const TABLE_BLOCK = `[[hooks]]\nevent = "PreToolUse"\ncommand = "${COMMAND}"`;
const ERRORS = {
  stringError: 'Unterminated string in Kimi Code config',
  bracketError: 'Unmatched hooks array in Kimi Code config',
};

const OTHER_ITEM = '{ event = "Stop", command = ".kimi/hooks/check.sh" }';

/** The decision `installKimiCode` makes, rebuilt over the core primitives. */
function install(content: string | undefined) {
  if (content === undefined) return `${TABLE_BLOCK}\n`;
  if (content.includes(COMMAND)) return content;
  const array = findTopLevelTomlArray(content, 'hooks', ERRORS);
  if (array && content.slice(array.start + 1, array.end).trim()) {
    return appendTomlArrayItem(content, array, INLINE_ITEM);
  }
  const trimmed = removeTopLevelEmptyTomlArray(content, 'hooks').trimEnd();
  return trimmed === '' ? `${TABLE_BLOCK}\n` : `${trimmed}\n\n${TABLE_BLOCK}\n`;
}

/** The decision `uninstallKimiCode` makes, rebuilt over the core primitives. */
function uninstall(content: string | undefined) {
  if (content === undefined || !content.includes(COMMAND)) return content;
  const array = findTopLevelTomlArray(content, 'hooks', ERRORS);
  return array
    ? removeTomlArrayItem(content, array, INLINE_ITEM)
    : `${removeTomlTableBlocks(content, 'hooks', COMMAND)}\n`;
}

const INSTALL_ROWS: readonly (readonly [string, string | undefined, string])[] = [
  ['writes a table block when the config file does not exist', undefined, `${TABLE_BLOCK}\n`],
  ['writes a table block into an empty file', '', `${TABLE_BLOCK}\n`],
  ['writes a table block into a blank-line-only file', '\n\n', `${TABLE_BLOCK}\n`],
  [
    'appends a table block under the keys a config already carries',
    'model = "kimi-k2"\n',
    `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
  ],
  [
    'appends a table block to a config with no trailing newline',
    'model = "kimi-k2"',
    `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
  ],
  [
    'replaces an empty top-level hooks array with a table block',
    'hooks = []\n',
    `${TABLE_BLOCK}\n`,
  ],
  [
    'drops an empty hooks array written with a comment and keeps the other keys',
    'hooks = [ ]  # nothing yet\nmodel = "kimi-k2"\n',
    `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
  ],
  [
    'appends the hook as the last item of a non-empty array',
    `hooks = [\n  ${OTHER_ITEM}\n]\n`,
    `hooks = [\n  ${OTHER_ITEM},\n     ${INLINE_ITEM}]\n`,
  ],
  [
    'writes no second comma when the array already ended with one',
    `hooks = [\n  ${OTHER_ITEM},\n]\n`,
    `hooks = [\n  ${OTHER_ITEM},\n     ${INLINE_ITEM}]\n`,
  ],
  [
    'appends to an array written on one line',
    `hooks = [ ${OTHER_ITEM} ]\n`,
    `hooks = [ ${OTHER_ITEM},\n     ${INLINE_ITEM}]\n`,
  ],
  [
    'appends into a CRLF config, keeping its line endings around the edit',
    `hooks = [\r\n  ${OTHER_ITEM}\r\n]\r\n`,
    `hooks = [\r\n  ${OTHER_ITEM},\n     ${INLINE_ITEM}]\r\n`,
  ],
  [
    'leaves a config without a trailing newline without one',
    `hooks = [${OTHER_ITEM}]`,
    `hooks = [${OTHER_ITEM},\n     ${INLINE_ITEM}]`,
  ],
  [
    'indents the new item to match the closing bracket',
    `  hooks = [\n    ${OTHER_ITEM}\n  ]\nmodel = "kimi-k2"\n`,
    `  hooks = [\n    ${OTHER_ITEM},\n    ${INLINE_ITEM}]\nmodel = "kimi-k2"\n`,
  ],
  [
    'is not fooled by brackets and escaped quotes inside a string value',
    `hooks = [\n  { event = "Stop", command = "echo ] } \\" ]" }\n]\nmodel = "kimi-k2"\n`,
    `hooks = [\n  { event = "Stop", command = "echo ] } \\" ]" },\n     ${INLINE_ITEM}]\nmodel = "kimi-k2"\n`,
  ],
  [
    'appends a table block when the only hooks array belongs to a table',
    `model = "kimi-k2"\n\n[agent.hooks_config]\nhooks = [\n  ${OTHER_ITEM}\n]\n`,
    `model = "kimi-k2"\n\n[agent.hooks_config]\nhooks = [\n  ${OTHER_ITEM}\n]\n\n${TABLE_BLOCK}\n`,
  ],
  [
    'leaves a hooks array named only in a comment alone',
    '# hooks = [] in a comment\nmodel = "kimi-k2"\n',
    `# hooks = [] in a comment\nmodel = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
  ],
  [
    'leaves a config that already carries the inline hook byte for byte',
    `hooks = [\n  ${INLINE_ITEM},\n  ${OTHER_ITEM}\n]\n`,
    `hooks = [\n  ${INLINE_ITEM},\n  ${OTHER_ITEM}\n]\n`,
  ],
  [
    'leaves a config that already carries the hook as a table block byte for byte',
    `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
    `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
  ],
];

describe('the Kimi Code install edit', () => {
  for (const [name, content, expected] of INSTALL_ROWS) {
    test(name, () => {
      expect(install(content)).toBe(expected);
    });
  }

  test('raises the caller bracket message for an array that never closes', () => {
    expect(() => install(`hooks = [\n  ${OTHER_ITEM}\n`)).toThrow(ERRORS.bracketError);
  });

  test('raises the caller string message for an item whose string never closes', () => {
    expect(() => install('hooks = [ { command = "oops')).toThrow(ERRORS.stringError);
  });

  test('keeps every byte outside the array it appends into', () => {
    const leaked = INSTALL_ROWS.filter(([, content]) => content !== undefined)
      .map(([name, content]) => ({
        name,
        content: content ?? '',
        array: findTopLevelTomlArray(content ?? '', 'hooks', ERRORS),
        updated: install(content),
      }))
      .filter(
        (row) => row.array && row.updated !== row.content && row.updated.includes(INLINE_ITEM),
      )
      .filter(
        (row) =>
          !row.updated.startsWith(row.content.slice(0, (row.array?.start ?? 0) + 1)) ||
          !row.updated.endsWith(row.content.slice(row.array?.end ?? 0)),
      )
      .map((row) => row.name);
    expect(leaked).toEqual([]);
  });

  test('installs the command exactly once, and installing again changes nothing', () => {
    const wrong = INSTALL_ROWS.map(([name, content]) => ({
      name,
      once: install(content),
    })).filter((row) => row.once.split(COMMAND).length !== 2 || install(row.once) !== row.once);
    expect(wrong.map((row) => row.name)).toEqual([]);
  });
});

const UNINSTALL_ROWS: readonly (readonly [string, string | undefined, string | undefined])[] = [
  ['leaves a missing config missing', undefined, undefined],
  [
    'leaves a config that never carried the hook byte for byte',
    `hooks = [\n  ${OTHER_ITEM}\n]\n`,
    `hooks = [\n  ${OTHER_ITEM}\n]\n`,
  ],
  [
    'removes the inline hook and the comma before it, keeping the other item',
    `hooks = [\n  ${OTHER_ITEM},\n  ${INLINE_ITEM}\n]\n`,
    `hooks = [\n  ${OTHER_ITEM}\n]\n`,
  ],
  [
    'removes the inline hook and the comma after it when it comes first',
    `hooks = [\n  ${INLINE_ITEM},\n  ${OTHER_ITEM}\n]\n`,
    `hooks = [\n    ${OTHER_ITEM}\n]\n`,
  ],
  [
    'empties an array that held only the inline hook',
    `hooks = [\n  ${INLINE_ITEM}\n]\n`,
    'hooks = [\n  \n]\n',
  ],
  [
    'empties a one-line array that held only the inline hook',
    `hooks = [ ${INLINE_ITEM} ]\n`,
    'hooks = [  ]\n',
  ],
  [
    'removes the managed table block and keeps the keys above it',
    `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
    'model = "kimi-k2"\n',
  ],
  [
    'removes the managed table block and keeps the unrelated table after it',
    `${TABLE_BLOCK}\n\n[other]\nkey = "value"\n`,
    '\n[other]\nkey = "value"\n',
  ],
  [
    'removes only the managed block from a file of hook blocks',
    `[[hooks]]\nevent = "Stop"\ncommand = "unmanaged"\n\n${TABLE_BLOCK}\n\n[[hooks]]\nevent = "Stop"\ncommand = "also unmanaged"\n`,
    '[[hooks]]\nevent = "Stop"\ncommand = "unmanaged"\n\n\n[[hooks]]\nevent = "Stop"\ncommand = "also unmanaged"\n',
  ],
];

describe('the Kimi Code uninstall edit', () => {
  for (const [name, content, expected] of UNINSTALL_ROWS) {
    test(name, () => {
      expect(uninstall(content)).toBe(expected);
    });
  }

  test('leaves the array alone when the item text sits after the array closes', () => {
    const content = `hooks = [ ${OTHER_ITEM} ]\n\n[notes]\ntext = "${INLINE_ITEM}"\n`;
    expect(uninstall(content)).toBe(content);
  });

  test('undoes every install: no installed config keeps the command', () => {
    const remaining = INSTALL_ROWS.map(([name, content]) => ({
      name,
      undone: uninstall(install(content)),
    })).filter((row) => row.undone?.includes(COMMAND));
    expect(remaining.map((row) => row.name)).toEqual([]);
  });

  test('leaves no trace of the command behind', () => {
    const remaining = UNINSTALL_ROWS.filter(([, , expected]) => expected?.includes(COMMAND)).map(
      ([name]) => name,
    );
    expect(remaining).toEqual([]);
  });
});

describe('the top-level array locator', () => {
  test('ignores a hooks array that belongs to a table', () => {
    expect(findTopLevelTomlArray('[t]\nhooks = [ ]\n', 'hooks', ERRORS)).toBeUndefined();
  });

  test('finds the array after other top-level keys', () => {
    expect(findTopLevelTomlArray('other = [1]\nhooks = [ ]\n', 'hooks', ERRORS)).toEqual({
      start: 20,
      end: 22,
    });
  });

  test('closes on the real bracket, not one written inside a comment', () => {
    const content = `hooks = [\n  ${OTHER_ITEM} # ] not a close\n]\n`;
    const array = findTopLevelTomlArray(content, 'hooks', ERRORS);
    expect(array?.start).toBe(content.indexOf('['));
    expect(array?.end).toBe(content.lastIndexOf(']'));
  });
});

describe('the empty-array and table-block removers', () => {
  test('drops only the top-level empty array, leaving a table one in place', () => {
    expect(removeTopLevelEmptyTomlArray('a = 1\nhooks = []\n[t]\nhooks = []\n', 'hooks')).toBe(
      'a = 1\n[t]\nhooks = []\n',
    );
  });

  test('keeps an empty array that still holds an item', () => {
    expect(removeTopLevelEmptyTomlArray(`hooks = [ ${OTHER_ITEM} ]\n`, 'hooks')).toBe(
      `hooks = [ ${OTHER_ITEM} ]\n`,
    );
  });

  test('drops only the block carrying the marker, keeping the others and trimming the tail', () => {
    expect(
      removeTomlTableBlocks(
        `[[hooks]]\ncommand = "keep"\n\n[[hooks]]\ncommand = "${COMMAND}"\n\n[after]\nx = 1\n`,
        'hooks',
        COMMAND,
      ),
    ).toBe('[[hooks]]\ncommand = "keep"\n\n\n[after]\nx = 1');
  });

  test('empties a file whose only block carried the marker', () => {
    expect(removeTomlTableBlocks(`${TABLE_BLOCK}\n`, 'hooks', COMMAND)).toBe('');
  });

  test('leaves the content alone when the item to remove is not in the array', () => {
    expect(removeTomlArrayItem('hooks = [ { a = 1 } ]', { start: 8, end: 20 }, INLINE_ITEM)).toBe(
      'hooks = [ { a = 1 } ]',
    );
  });
});
