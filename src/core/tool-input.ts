import { types as utilTypes } from 'node:util';

/** The non-shell routes a host tool input can take; the shell route carries a command instead. */
export type NonCommandToolInputKind = 'patch' | 'path' | 'grep' | 'glob' | 'unknown';

const PATCH_TOOL_NAMES = new Set(['applypatch', 'patch']);
const PATH_TOOL_NAMES = new Set([
  'create',
  'edit',
  'listdir',
  'listpermissions',
  'ls',
  'multiedit',
  'multireplacefilecontent',
  'notebookedit',
  'read',
  'readfile',
  'readurlcontent',
  'replacefilecontent',
  'searchweb',
  'strreplaceeditor',
  'view',
  'viewfile',
  'write',
  'writefile',
  'writetofile',
]);
const GREP_TOOL_NAMES = new Set(['grep', 'grepsearch', 'rg']);
const GLOB_TOOL_NAMES = new Set(['find', 'findbyname', 'glob']);
const READ_ONLY_TOOL_NAMES = new Set([
  'find',
  'findbyname',
  'glob',
  'grep',
  'grepsearch',
  'listdir',
  'listpermissions',
  'ls',
  'read',
  'readfile',
  'readurlcontent',
  'searchweb',
  'view',
  'viewfile',
]);
const PATCH_TEXT_KEYS = new Set(['command', 'diff', 'input', 'patch', 'patchtext']);
const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();
const JS_WHITESPACE = /\s/;
const MAX_GIT_DIFF_FALLBACK_CANDIDATES = 64;

export class ToolInputLimitError extends Error {
  override readonly name = 'ToolInputLimitError';

  constructor() {
    super('tool input traversal limit exceeded');
  }
}

/** @internal Generous fail-closed bounds for untrusted recursive tool input. */
export const TOOL_INPUT_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 10_000,
  maxKeys: 10_000,
  maxStringBytes: 1024 * 1024,
  maxAggregateStringBytes: 4 * 1024 * 1024,
});

type ToolInputTraversalState = {
  nodes: number;
  keys: number;
  stringBytes: number;
  ancestors: Set<object>;
};

type ToolInputObjectSnapshot = {
  object: object;
  array: boolean;
  entries: readonly (readonly [string, unknown])[];
};

/** @internal */
export function normalizeToolName(toolName: string): string {
  return toolName.replace(/[-_\s]/g, '').toLowerCase();
}

export function isReadOnlyTool(toolName: string): boolean {
  return READ_ONLY_TOOL_NAMES.has(normalizeToolName(toolName));
}

export function getNonCommandToolInputKind(toolName: string): NonCommandToolInputKind {
  const normalized = normalizeToolName(toolName);
  if (PATCH_TOOL_NAMES.has(normalized)) return 'patch';
  if (GREP_TOOL_NAMES.has(normalized)) return 'grep';
  if (GLOB_TOOL_NAMES.has(normalized)) return 'glob';
  if (PATH_TOOL_NAMES.has(normalized)) return 'path';
  return 'unknown';
}

export function getCommandFromToolInput(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  assertSafeToolInputObject(input);
  const descriptor = Object.getOwnPropertyDescriptor(input, 'command');
  if (!descriptor) {
    if ('command' in input) throwToolInputLimit();
    return undefined;
  }
  if (descriptor.get || descriptor.set) throwToolInputLimit();
  const command = descriptor.value;
  return typeof command === 'string' && command !== '' ? command : undefined;
}

export function extractPathLikeToolValues(
  input: unknown,
  pathLikeKeys: ReadonlySet<string>,
): string[] {
  return extractPathLikeToolValuesAt(
    input,
    pathLikeKeys,
    { nodes: 0, keys: 0, stringBytes: 0, ancestors: new Set() },
    1,
  );
}

function extractPathLikeToolValuesAt(
  input: unknown,
  pathLikeKeys: ReadonlySet<string>,
  state: ToolInputTraversalState,
  depth: number,
): string[] {
  const snapshot = snapshotToolInputObject(input, state, depth);
  if (!snapshot) return [];
  const values = snapshot.entries.flatMap(([key, value]) => {
    const nested = extractPathLikeToolValuesAt(value, pathLikeKeys, state, depth + 1);
    return typeof value === 'string' && pathLikeKeys.has(normalizeToolInputKey(key))
      ? [value]
      : nested;
  });
  state.ancestors.delete(snapshot.object);
  return values;
}

function normalizeToolInputKey(key: string): string {
  return key.replace(/-/g, '_').toLowerCase();
}

export function extractPatchTargetsFromToolInput(input: unknown): string[] {
  return extractPatchTexts(
    input,
    true,
    { nodes: 0, keys: 0, stringBytes: 0, ancestors: new Set() },
    1,
  ).flatMap(extractPatchTargetsFromText);
}

function extractPatchTexts(
  input: unknown,
  allowString: boolean,
  state: ToolInputTraversalState,
  depth: number,
): string[] {
  const snapshot = snapshotToolInputObject(input, state, depth);
  if (typeof input === 'string') return allowString ? [input] : [];
  if (!snapshot) return [];
  const texts = snapshot.entries.flatMap(([key, value]) =>
    extractPatchTexts(
      value,
      snapshot.array ? allowString : PATCH_TEXT_KEYS.has(normalizeToolInputKey(key)),
      state,
      depth + 1,
    ),
  );
  state.ancestors.delete(snapshot.object);
  return texts;
}

function enterToolInputValue(input: unknown, state: ToolInputTraversalState, depth: number): void {
  state.nodes++;
  if (
    (input !== null && typeof input === 'object' && depth > TOOL_INPUT_LIMITS.maxDepth) ||
    state.nodes > TOOL_INPUT_LIMITS.maxNodes
  ) {
    throwToolInputLimit();
  }
  if (typeof input !== 'string') return;
  const bytes = Buffer.byteLength(input);
  state.stringBytes += bytes;
  if (
    bytes > TOOL_INPUT_LIMITS.maxStringBytes ||
    state.stringBytes > TOOL_INPUT_LIMITS.maxAggregateStringBytes
  ) {
    throwToolInputLimit();
  }
}

function snapshotToolInputObject(
  input: unknown,
  state: ToolInputTraversalState,
  depth: number,
): ToolInputObjectSnapshot | null {
  enterToolInputValue(input, state, depth);
  if (!input || typeof input !== 'object') return null;
  const array = assertSafeToolInputObject(input);
  if (state.ancestors.has(input)) throwToolInputLimit();
  const keys = Reflect.ownKeys(input);
  state.keys += keys.length;
  if (state.keys > TOOL_INPUT_LIMITS.maxKeys) throwToolInputLimit();
  const entries = keys.flatMap((key): (readonly [string, unknown])[] => {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || descriptor.get || descriptor.set) throwToolInputLimit();
    return typeof key === 'string' && descriptor.enumerable ? [[key, descriptor.value]] : [];
  });
  state.ancestors.add(input);
  return { object: input, array, entries };
}

function assertSafeToolInputObject(input: object): boolean {
  if (utilTypes.isProxy(input)) throwToolInputLimit();
  const array = Array.isArray(input);
  const prototype = Object.getPrototypeOf(input);
  if (
    (array && prototype !== Array.prototype) ||
    (!array && prototype !== Object.prototype && prototype !== null)
  ) {
    throwToolInputLimit();
  }
  return array;
}

function throwToolInputLimit(): never {
  throw new ToolInputLimitError();
}

function extractPatchTargetsFromText(text: string): string[] {
  const targets: string[] = [];
  const lines = text.split(/\r?\n/);
  let inApplyPatch = false;
  let inHunk = false;
  let oldHunkLinesRemaining: number | null = null;
  let newHunkLinesRemaining: number | null = null;
  const resetHunk = () => {
    inHunk = false;
    oldHunkLinesRemaining = null;
    newHunkLinesRemaining = null;
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line === '*** Begin Patch') {
      inApplyPatch = true;
      resetHunk();
      continue;
    }
    if (line === '*** End Patch') {
      inApplyPatch = false;
      resetHunk();
      continue;
    }
    if (line.startsWith('@@')) {
      const counts = parseUnifiedHunkLineCounts(line);
      inHunk = true;
      oldHunkLinesRemaining = counts?.oldLines ?? null;
      newHunkLinesRemaining = counts?.newLines ?? null;
      if (oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0) resetHunk();
      continue;
    }

    if (inHunk && oldHunkLinesRemaining !== null && newHunkLinesRemaining !== null) {
      const oldLineCount = line.startsWith(' ') || line.startsWith('-') ? 1 : 0;
      const newLineCount = line.startsWith(' ') || line.startsWith('+') ? 1 : 0;
      oldHunkLinesRemaining = Math.max(0, oldHunkLinesRemaining - oldLineCount);
      newHunkLinesRemaining = Math.max(0, newHunkLinesRemaining - newLineCount);
      if (oldHunkLinesRemaining === 0 && newHunkLinesRemaining === 0) resetHunk();
      continue;
    }

    if (line.startsWith('*** ')) {
      resetHunk();
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (inHunk) continue;

    if (line.startsWith('diff --git ')) {
      targets.push(...extractPatchTargetsFromMetadataLine(line));
      continue;
    }
    if (line.startsWith('--- ')) {
      const nextLine = lines[index + 1] ?? '';
      if (!nextLine.startsWith('+++ ')) continue;
      targets.push(
        ...cleanGitTargetPair(
          decodeGitMetadataTarget(line.slice(4), true),
          decodeGitMetadataTarget(nextLine.slice(4), true),
        ),
      );
      index++;
      continue;
    }
    if (!inApplyPatch) targets.push(...extractPatchTargetsFromMetadataLine(line));
  }
  return targets;
}

function parseUnifiedHunkLineCounts(line: string) {
  const hunkHeader = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(line);
  if (!hunkHeader) return null;
  return {
    oldLines: Number(hunkHeader[1] ?? 1),
    newLines: Number(hunkHeader[2] ?? 1),
  };
}

function extractPatchTargetsFromMetadataLine(line: string): string[] {
  const applyPatchTarget = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
  if (applyPatchTarget?.[1]) return cleanPatchTarget(applyPatchTarget[1]);

  const moveTarget = /^\*\*\* Move to: (.+)$/.exec(line);
  if (moveTarget?.[1]) return cleanPatchTarget(moveTarget[1]);

  if (line.startsWith('diff --git ')) return extractGitDiffTargets(line.slice(11));

  const oldTarget = /^--- (.+)$/.exec(line);
  if (oldTarget?.[1]) return cleanUnifiedDiffTarget(oldTarget[1]);

  const newTarget = /^\+\+\+ (.+)$/.exec(line);
  if (newTarget?.[1]) return cleanUnifiedDiffTarget(newTarget[1]);

  const extendedTarget = /^(?:rename|copy) (?:from|to) (.+)$/.exec(line);
  if (extendedTarget?.[1]) return cleanExtendedGitTarget(extendedTarget[1]);

  return [];
}

function extractGitDiffTargets(header: string): string[] {
  const fields = parseGitDiffFields(header);
  if (fields.length === 2 && fields[0] && fields[1]) {
    return cleanGitTargetPair(fields[0], fields[1]);
  }

  const matchingPair = findGitDiffFallbackPair(header);
  return matchingPair
    ? cleanGitTargetPair(
        header.slice(matchingPair.oldStart, matchingPair.oldEnd),
        header.slice(matchingPair.newStart, matchingPair.newEnd),
      )
    : [];
}

function parseGitDiffFields(header: string): string[] {
  const fields: string[] = [];
  let index = 0;
  while (index < header.length && fields.length < 2) {
    while (isJsWhitespace(header[index])) index++;
    if (index >= header.length) break;

    const quote = header[index] === '"' || header[index] === "'" ? header[index] : undefined;
    if (!quote) {
      const start = index;
      while (index < header.length && !isJsWhitespace(header[index])) index++;
      fields.push(header.slice(start, index));
      continue;
    }

    const field = parseQuotedGitDiffField(header, index, quote);
    if (!field) return [];
    fields.push(field.value);
    index = field.end;
  }
  while (isJsWhitespace(header[index])) index++;
  return index === header.length ? fields : [];
}

function findGitDiffFallbackPair(header: string) {
  let start = 0;
  while (start < header.length && isJsWhitespace(header[start])) start++;
  let end = header.length;
  while (end > start && isJsWhitespace(header[end - 1])) end--;

  let candidates = 0;
  let index = start;
  while (index < end) {
    if (!isJsWhitespace(header[index])) {
      index++;
      continue;
    }

    const oldEnd = index;
    while (index < end && isJsWhitespace(header[index])) index++;
    if (oldEnd === start || index === end) continue;
    candidates++;
    if (candidates > MAX_GIT_DIFF_FALLBACK_CANDIDATES) throwToolInputLimit();
    if (gitDiffFallbackRangesMatch(header, start, oldEnd, index, end)) {
      return { oldStart: start, oldEnd, newStart: index, newEnd: end };
    }
  }
  return null;
}

function gitDiffFallbackRangesMatch(
  header: string,
  oldStart: number,
  oldEnd: number,
  newStart: number,
  newEnd: number,
): boolean {
  if (rangesEqual(header, oldStart, oldEnd, newStart, newEnd)) return true;
  const oldSlash = findCharacterInRange(header, '/', oldStart, oldEnd);
  const newSlash = findCharacterInRange(header, '/', newStart, newEnd);
  if (oldSlash <= oldStart || newSlash <= newStart) return false;
  if (rangesEqual(header, oldStart, oldSlash, newStart, newSlash)) return false;
  return rangesEqual(header, oldSlash + 1, oldEnd, newSlash + 1, newEnd);
}

function rangesEqual(
  value: string,
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  if (leftEnd - leftStart !== rightEnd - rightStart) return false;
  for (let offset = 0; offset < leftEnd - leftStart; offset++) {
    if (value[leftStart + offset] !== value[rightStart + offset]) return false;
  }
  return true;
}

function findCharacterInRange(
  value: string,
  character: string,
  start: number,
  end: number,
): number {
  for (let index = start; index < end; index++) {
    if (value[index] === character) return index;
  }
  return -1;
}

function isJsWhitespace(character: string | undefined): boolean {
  return character !== undefined && JS_WHITESPACE.test(character);
}

function parseQuotedGitDiffField(header: string, start: number, quote: string) {
  const bytes: number[] = [];
  let index = start + 1;
  while (index < header.length) {
    const character = header[index] ?? '';
    if (character === quote) {
      return { value: UTF8_DECODER.decode(Uint8Array.from(bytes)), end: index + 1 };
    }
    if (character !== '\\' || quote === "'") {
      bytes.push(...UTF8_ENCODER.encode(character));
      index++;
      continue;
    }

    const escaped = header.slice(index + 1);
    const octal = /^[0-7]{1,3}/.exec(escaped)?.[0];
    if (octal) {
      bytes.push(Number.parseInt(octal, 8));
      index += octal.length + 1;
      continue;
    }
    bytes.push(...UTF8_ENCODER.encode(decodeGitDiffEscape(escaped[0] ?? '')));
    index += 2;
  }
  return null;
}

function decodeGitDiffEscape(character: string): string {
  return (
    {
      a: '\u0007',
      b: '\b',
      f: '\f',
      n: '\n',
      r: '\r',
      t: '\t',
      v: '\u000b',
    }[character] ?? character
  );
}

function cleanGitDiffTarget(target: string): string[] {
  return cleanExactPatchTarget(normalizeGitDiffTarget(target));
}

function cleanGitTargetPair(oldTarget: string, newTarget: string): string[] {
  if (oldTarget === '/dev/null') return cleanSingleGitTarget(newTarget);
  if (newTarget === '/dev/null') return cleanSingleGitTarget(oldTarget);

  if (oldTarget.startsWith('a/') && newTarget.startsWith('b/')) {
    return [oldTarget.slice(2), newTarget.slice(2)].flatMap(cleanExactPatchTarget);
  }

  const commonRemainder =
    getCommonGitPrefixRemainder(oldTarget, newTarget) ??
    (oldTarget === newTarget ? stripFirstGitPathComponent(oldTarget) : null);
  return [oldTarget, newTarget, ...(commonRemainder ? [commonRemainder] : [])].flatMap(
    cleanExactPatchTarget,
  );
}

function cleanSingleGitTarget(target: string): string[] {
  const stripped = stripFirstGitPathComponent(target);
  return [target, ...(stripped ? [stripped] : [])].flatMap(cleanExactPatchTarget);
}

function stripFirstGitPathComponent(target: string): string | null {
  const separator = target.indexOf('/');
  return separator > 0 && separator < target.length - 1 ? target.slice(separator + 1) : null;
}

function getCommonGitPrefixRemainder(oldTarget: string, newTarget: string): string | null {
  const oldSeparator = oldTarget.indexOf('/');
  const newSeparator = newTarget.indexOf('/');
  if (oldSeparator < 1 || newSeparator < 1) return null;
  if (oldTarget.slice(0, oldSeparator) === newTarget.slice(0, newSeparator)) return null;
  const oldRemainder = oldTarget.slice(oldSeparator + 1);
  return oldRemainder === newTarget.slice(newSeparator + 1) ? oldRemainder : null;
}

function cleanUnifiedDiffTarget(target: string): string[] {
  return cleanGitDiffTarget(decodeGitMetadataTarget(target, true));
}

function cleanExtendedGitTarget(target: string): string[] {
  return cleanExactPatchTarget(decodeGitMetadataTarget(target, false));
}

function decodeGitMetadataTarget(target: string, allowTrailingMetadata: boolean): string {
  const trimmed = target.trim();
  const quote = trimmed[0] === '"' || trimmed[0] === "'" ? trimmed[0] : undefined;
  if (quote) {
    const field = parseQuotedGitDiffField(trimmed, 0, quote);
    if (field && (allowTrailingMetadata || trimmed.slice(field.end).trim() === '')) {
      return field.value;
    }
  }
  return allowTrailingMetadata ? (trimmed.split('\t', 1)[0]?.trim() ?? '') : trimmed;
}

function normalizeGitDiffTarget(target: string): string {
  return target.startsWith('a/') || target.startsWith('b/') ? target.slice(2) : target;
}

function cleanExactPatchTarget(target: string): string[] {
  return target === '' || target === '/dev/null' ? [] : [target];
}

function cleanPatchTarget(target: string): string[] {
  const path =
    target
      .split('\t', 1)[0]
      ?.trim()
      .replace(/^['"]|['"]$/g, '') ?? '';
  return path === '' || path === '/dev/null' ? [] : [path];
}
