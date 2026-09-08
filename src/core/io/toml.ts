import { findMatchingBracket, getLineIndent, removeArrayRangeItem, type TextRange } from './jsonc';

/**
 * TOML surgery for a host config that keeps hooks either in a top-level `key = [ … ]` inline
 * array or in `[[key]]` table blocks. Edits splice the original text so everything outside the
 * touched array or block survives byte for byte. Keys are bare TOML keys used verbatim inside a
 * pattern; nothing dotted or quoted is expected.
 */

function skipTomlComment(content: string, index: number) {
  if (content[index] !== '#') return index;
  const newlineIndex = content.indexOf('\n', index + 1);
  return newlineIndex === -1 ? content.length : newlineIndex + 1;
}

/** The `[` … `]` of a top-level `key = [` array: one written before any table header. */
export function findTopLevelTomlArray(
  content: string,
  key: string,
  errors: { stringError: string; bracketError: string },
): TextRange | undefined {
  const opener = new RegExp(`^(\\s*)${key}\\s*=\\s*\\[`);
  let index = 0;

  for (const line of content.split('\n')) {
    if (/^\s*\[/.test(line)) return undefined;
    const match = opener.exec(line);
    if (match) {
      const arrayStart = index + match[0].lastIndexOf('[');
      return {
        start: arrayStart,
        end: findMatchingBracket(content, arrayStart, { skipComment: skipTomlComment, ...errors }),
      };
    }
    index += line.length + 1;
  }

  return undefined;
}

/** Appends `item` as the last entry of the inline array, on its own line under the last one. */
export function appendTomlArrayItem(content: string, array: TextRange, item: string): string {
  const beforeClose = content.slice(0, array.end).trimEnd();
  const closingIndent = getLineIndent(content, array.end);
  const itemIndent = closingIndent === '' ? '     ' : `${closingIndent}  `;
  const needsComma = !beforeClose.endsWith('[') && !beforeClose.endsWith(',');

  return `${beforeClose}${needsComma ? ',' : ''}\n${itemIndent}${item}${content.slice(array.end)}`;
}

/** Removes the entry whose text is exactly `item` from the inline array; unchanged when absent. */
export function removeTomlArrayItem(content: string, array: TextRange, item: string): string {
  const itemStart = content.indexOf(item, array.start);
  if (itemStart === -1 || itemStart > array.end) return content;

  return removeArrayRangeItem(content, { start: itemStart, end: itemStart + item.length });
}

/** Drops a top-level `key = []` line, so a table block can take the key over. */
export function removeTopLevelEmptyTomlArray(content: string, key: string): string {
  const emptyArray = new RegExp(`^\\s*${key}\\s*=\\s*\\[\\s*]\\s*(?:#.*)?$`);
  const lines = content.split('\n');
  const firstTable = lines.findIndex((line) => /^\s*\[/.test(line));
  const topLevel = firstTable === -1 ? lines : lines.slice(0, firstTable);
  const tables = firstTable === -1 ? [] : lines.slice(firstTable);

  return [...topLevel.filter((line) => !emptyArray.test(line)), ...tables].join('\n');
}

/** Drops every `[[key]]` table block that carries `marker`, and trims the trailing whitespace. */
export function removeTomlTableBlocks(content: string, key: string, marker: string): string {
  const header = new RegExp(`^\\s*\\[\\[${key}]]\\s*$`, 'm');
  // Split at every table header, not just [[key]]: a managed block ends where the
  // next table begins, so unrelated tables after it are not swallowed with it.
  return content
    .split(/(?=^\s*\[)/m)
    .filter((block) => !header.test(block) || !block.includes(marker))
    .join('')
    .trimEnd();
}
