import { describe, expect, test } from 'bun:test';
import {
  appendTomlArrayItem,
  findTopLevelTomlArray,
  removeTomlArrayItem,
  removeTomlTableBlocks,
  removeTopLevelEmptyTomlArray,
} from '@/core/io/toml';
import { describeOutcome } from '../../helpers/fixture-tree';

/**
 * The Kimi Code installer is the caller this TOML editor serves. Its hook strings are restated
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

const CONFIGS: readonly (string | undefined)[] = [
  undefined,
  '',
  '\n\n',
  'model = "kimi-k2"\n',
  'model = "kimi-k2"',
  'hooks = []\n',
  'hooks = [ ]  # nothing yet\nmodel = "kimi-k2"\n',
  `hooks = [\n  ${OTHER_ITEM}\n]\n`,
  `hooks = [\n  ${OTHER_ITEM},\n]\n`,
  `hooks = [ ${OTHER_ITEM} ]\n`,
  `hooks = [${OTHER_ITEM}]`,
  `  hooks = [\n    ${OTHER_ITEM}\n  ]\nmodel = "kimi-k2"\n`,
  `hooks = [\n  { event = "Stop", command = "echo ] } \\" ]" }\n]\nmodel = "kimi-k2"\n`,
  `hooks = [\n  ${OTHER_ITEM} # ] not a close\n]\n`,
  `hooks = [\n  ${OTHER_ITEM},\n  ${INLINE_ITEM}\n]\n`,
  `hooks = [\n  ${INLINE_ITEM},\n  ${OTHER_ITEM}\n]\n`,
  `hooks = [\n  ${INLINE_ITEM}\n]\n`,
  `hooks = [ ${INLINE_ITEM} ]\n`,
  `model = "kimi-k2"\n\n[agent.hooks_config]\nhooks = [\n  ${OTHER_ITEM}\n]\n`,
  `model = "kimi-k2"\n\n${TABLE_BLOCK}\n`,
  `${TABLE_BLOCK}\n\n[other]\nkey = "value"\n`,
  `[[hooks]]\nevent = "Stop"\ncommand = "unmanaged"\n\n${TABLE_BLOCK}\n\n[[hooks]]\nevent = "Stop"\ncommand = "also unmanaged"\n`,
  `hooks = []\n\n${TABLE_BLOCK}\n`,
  'hooks = [\r\n  { event = "Stop", command = "x" }\r\n]\r\n',
  '[table]\nhooks = [\n',
  `hooks = [\n  ${OTHER_ITEM}\n`,
  'hooks = [ { command = "oops',
  '# hooks = [] in a comment\nmodel = "kimi-k2"\n',
];

/** The Kimi Code installer's decision rebuilt over the core primitives. */
function installWithNext(content: string | undefined) {
  if (content === undefined) return `${TABLE_BLOCK}\n`;
  if (content.includes(COMMAND)) return content;
  const array = findTopLevelTomlArray(content, 'hooks', ERRORS);
  if (array && content.slice(array.start + 1, array.end).trim()) {
    return appendTomlArrayItem(content, array, INLINE_ITEM);
  }
  const trimmed = removeTopLevelEmptyTomlArray(content, 'hooks').trimEnd();
  return trimmed === '' ? `${TABLE_BLOCK}\n` : `${trimmed}\n\n${TABLE_BLOCK}\n`;
}

function uninstallWithNext(content: string | undefined) {
  if (content === undefined || !content.includes(COMMAND)) return content;
  const array = findTopLevelTomlArray(content, 'hooks', ERRORS);
  return array
    ? removeTomlArrayItem(content, array, INLINE_ITEM)
    : `${removeTomlTableBlocks(content, 'hooks', COMMAND)}\n`;
}

describe('toml surgical edit', () => {
  test('appends the hook byte for byte like the shipped Kimi Code install', () => {
    let editedInline = 0;
    for (const content of CONFIGS) {
      const next = describeOutcome(() => installWithNext(content));
      if (!next.ok) {
        expect(next.error).toMatchSnapshot();
        continue;
      }
      expect(next.value).toMatchSnapshot();
      const array =
        content === undefined ? undefined : findTopLevelTomlArray(content, 'hooks', ERRORS);
      if (
        content !== undefined &&
        array &&
        next.value !== content &&
        next.value.includes(INLINE_ITEM)
      ) {
        // The inline edit stays inside the array: the bytes before its `[` and from its `]` on are intact.
        expect(next.value.startsWith(content.slice(0, array.start + 1))).toBe(true);
        expect(next.value.endsWith(content.slice(array.end))).toBe(true);
        editedInline++;
      }
    }
    expect(editedInline).toBeGreaterThanOrEqual(6);
  });

  test('removes the hook byte for byte like the shipped Kimi Code uninstall', () => {
    let removed = 0;
    for (const content of CONFIGS) {
      const installed = describeOutcome(() => installWithNext(content));
      for (const candidate of [content, installed.ok ? installed.value : undefined]) {
        const next = describeOutcome(() => uninstallWithNext(candidate));
        if (!next.ok) {
          expect(next.error).toMatchSnapshot();
          continue;
        }
        expect(next.value).toMatchSnapshot();
        if (candidate !== undefined && next.value !== candidate) removed++;
      }
    }
    expect(removed).toBeGreaterThanOrEqual(20);
  });

  test('locates only a top-level array and drops only the managed table blocks', () => {
    expect(findTopLevelTomlArray('[t]\nhooks = [ ]\n', 'hooks', ERRORS)).toBeUndefined();
    expect(findTopLevelTomlArray('other = [1]\nhooks = [ ]\n', 'hooks', ERRORS)).toEqual({
      start: 20,
      end: 22,
    });
    expect(removeTopLevelEmptyTomlArray('a = 1\nhooks = []\n[t]\nhooks = []\n', 'hooks')).toBe(
      'a = 1\n[t]\nhooks = []\n',
    );
    expect(
      removeTomlTableBlocks(
        `[[hooks]]\ncommand = "keep"\n\n[[hooks]]\ncommand = "${COMMAND}"\n\n[after]\nx = 1\n`,
        'hooks',
        COMMAND,
      ),
    ).toBe('[[hooks]]\ncommand = "keep"\n\n\n[after]\nx = 1');
    expect(removeTomlArrayItem('hooks = [ { a = 1 } ]', { start: 8, end: 20 }, INLINE_ITEM)).toBe(
      'hooks = [ { a = 1 } ]',
    );
  });
});
