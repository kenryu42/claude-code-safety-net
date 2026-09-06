import { GIT_GLOBAL_OPTS_WITH_VALUE } from '@/core/rules/constants';
import {
  fixedAt,
  hasWordBoundaryAfter,
  isAsciiWord,
  isEcmaWhitespace,
  isJsLineTerminator,
  isPipeSemicolonStop,
  isRawStop,
  type ScannedText,
  scanChar,
  scanLength,
  scannedText,
  wordAt,
} from './text-scanner';

export function hasLinearInterpreterDanger(
  code: string,
  kind: 'rm' | 'dd' | 'find',
  work?: { units: number },
): boolean {
  const text = scannedText(code, work);
  if (kind === 'rm') return hasInterpreterRm(text);
  if (kind === 'dd') return hasInterpreterDd(text);
  return hasFindDelete(text, true);
}

export function hasLinearDangerousText(
  text: string,
  kind:
    | 'rm'
    | 'reset-hard'
    | 'reset-merge'
    | 'clean'
    | 'checkout'
    | 'push-force'
    | 'push-refspec'
    | 'push-delete'
    | 'branch'
    | 'tag'
    | 'restore'
    | 'find',
  work?: { units: number },
): boolean {
  const scanned = scannedText(text, work);
  if (kind === 'rm') return hasRawRm(scanned);
  if (kind === 'reset-hard') return hasResetOption(scanned, '--ha', 'rd');
  if (kind === 'reset-merge') return hasResetOption(scanned, '--me', 'rge');
  if (kind === 'clean') return hasCleanForce(scanned);
  if (kind === 'checkout') return hasCheckoutForce(scanned);
  if (kind === 'push-force') return hasPushForce(scanned);
  if (kind === 'push-refspec') return hasPushForcedRefspec(scanned);
  if (kind === 'push-delete') return hasPushDelete(scanned);
  if (kind === 'branch') return hasBranchDeleteForce(scanned);
  if (kind === 'tag') return hasTagDelete(scanned);
  if (kind === 'restore') return hasRestoreWithoutExclusion(scanned);
  return hasFindDelete(scanned, false);
}

function hasInterpreterRm(text: ScannedText): boolean {
  let active = false;
  let recursive = false;
  let force = false;
  let tokenStart = -1;
  for (let i = 0; i <= scanLength(text); i++) {
    const char = scanChar(text, i);
    if (!active) {
      const afterRm = scanChar(text, i + 2);
      if (wordAt(text, i, 'rm') && isEcmaWhitespace(afterRm) && afterRm !== '\n') {
        active = true;
        i++;
      }
      continue;
    }
    const escapedLineFeedEnd = getInterpreterEscapedLineFeedEnd(text, i);
    if (char === '\n' || escapedLineFeedEnd !== -1) {
      active = false;
      recursive = false;
      force = false;
      tokenStart = -1;
      if (escapedLineFeedEnd !== -1) i = escapedLineFeedEnd - 1;
      continue;
    }
    if (char === ';' || char === '&' || char === '|' || i === scanLength(text)) {
      if (tokenStart >= 0) {
        const flags = interpreterRmFlags(text, tokenStart, i);
        recursive ||= flags.recursive;
        force ||= flags.force;
      }
      if (recursive && force) return true;
      active = false;
      recursive = false;
      force = false;
      tokenStart = -1;
      continue;
    }
    if (isEcmaWhitespace(char)) {
      if (tokenStart < 0) continue;
      if (fixedAt(text, tokenStart, '--') && i - tokenStart === 2) {
        active = false;
        recursive = false;
        force = false;
        tokenStart = -1;
        continue;
      }
      const flags = interpreterRmFlags(text, tokenStart, i);
      recursive ||= flags.recursive;
      force ||= flags.force;
      if (recursive && force) return true;
      tokenStart = -1;
      continue;
    }
    if (tokenStart < 0) tokenStart = i;
  }
  return false;
}

function getInterpreterEscapedLineFeedEnd(text: ScannedText, index: number): number {
  if (scanChar(text, index) !== '\\' || scanChar(text, index - 1) === '\\') return -1;
  if (fixedAt(text, index, String.raw`\n`)) return index + 2;
  if (fixedAt(text, index, String.raw`\x0a`) || fixedAt(text, index, String.raw`\x0A`)) {
    return index + 5;
  }
  if (fixedAt(text, index, String.raw`\u000a`) || fixedAt(text, index, String.raw`\u000A`)) {
    return index + 7;
  }
  return fixedAt(text, index, String.raw`\012`) ? index + 4 : -1;
}

function interpreterRmFlags(text: ScannedText, start: number, end: number) {
  if (isScannedLongOptionAbbreviation(text, start, end, 'recursive')) {
    return { recursive: true, force: false };
  }
  if (isScannedLongOptionAbbreviation(text, start, end, 'force')) {
    return { recursive: false, force: true };
  }
  if (scanChar(text, start) !== '-' || scanChar(text, start + 1) === '-') {
    return { recursive: false, force: false };
  }
  let recursive = false;
  let force = false;
  for (let i = start + 1; i < end; i++) {
    const char = scanChar(text, i);
    recursive ||= char === 'r' || char === 'R';
    force ||= char === 'f' || char === 'F';
  }
  return { recursive, force };
}

function isScannedLongOptionAbbreviation(
  text: ScannedText,
  start: number,
  end: number,
  option: string,
): boolean {
  const length = end - start - 2;
  if (length < 1 || length > option.length || !fixedAt(text, start, '--')) return false;
  for (let i = 0; i < length; i++) {
    if (scanChar(text, start + i + 2) !== option[i]) return false;
  }
  return true;
}

function hasInterpreterDd(text: ScannedText): boolean {
  let active = false;
  for (let i = 0; i < scanLength(text); i++) {
    if (isRawStop(scanChar(text, i))) {
      active = false;
      continue;
    }
    if (wordAt(text, i, 'dd')) {
      active = true;
      i++;
      continue;
    }
    if (!active || !wordAt(text, i, 'of') || !fixedAt(text, i, 'of=/dev/')) continue;
    const valueStart = i + 8;
    if (
      valueStart < scanLength(text) &&
      !isEcmaWhitespace(scanChar(text, valueStart)) &&
      scanChar(text, valueStart) !== "'" &&
      scanChar(text, valueStart) !== '"'
    ) {
      return true;
    }
  }
  return false;
}

function hasRawRm(text: ScannedText): boolean {
  let active = false;
  let recursiveLong = false;
  let forceLong = false;
  for (let i = 0; i <= scanLength(text); ) {
    const char = scanChar(text, i);
    if (i === scanLength(text) || isRawStop(char)) {
      active = false;
      recursiveLong = false;
      forceLong = false;
      i++;
      continue;
    }
    const start = rawRmAt(text, i);
    if (start >= 0) {
      if (rawRmShortMatch(text, start)) return true;
      let bodyStart = start;
      let crossedLf = false;
      while (isEcmaWhitespace(scanChar(text, bodyStart))) {
        crossedLf ||= scanChar(text, bodyStart) === '\n';
        bodyStart++;
      }
      if (crossedLf) {
        recursiveLong = false;
        forceLong = false;
      }
      active = true;
      i = bodyStart;
      continue;
    }
    if (!active) {
      i++;
      continue;
    }
    if (
      fixedAt(text, i, '--') &&
      (i === 0 || isEcmaWhitespace(scanChar(text, i - 1))) &&
      (!scanChar(text, i + 2) ||
        isEcmaWhitespace(scanChar(text, i + 2)) ||
        isRawStop(scanChar(text, i + 2)))
    ) {
      active = false;
      recursiveLong = false;
      forceLong = false;
      i += 2;
      continue;
    }
    recursiveLong ||=
      (fixedAt(text, i, '--recursive') && hasWordBoundaryAfter(text, i + 11)) ||
      hasRawLongOptionPrefix(text, i, 'recursive');
    forceLong ||=
      (fixedAt(text, i, '--force') && hasWordBoundaryAfter(text, i + 7)) ||
      hasRawLongOptionPrefix(text, i, 'force');
    if (recursiveLong && forceLong) return true;
    i++;
  }
  return false;
}

function hasRawLongOptionPrefix(text: ScannedText, start: number, option: string): boolean {
  if (!fixedAt(text, start, '--')) return false;
  let length = 0;
  while (length <= option.length) {
    const char = scanChar(text, start + length + 2);
    if (!char || isEcmaWhitespace(char) || isRawStop(char)) break;
    if (char !== option[length]) return false;
    length++;
  }
  return length > 0 && hasWordBoundaryAfter(text, start + length + 2);
}

function rawRmShortMatch(text: ScannedText, start: number): boolean {
  let cursor = start;
  let recursive = false;
  let force = false;
  while (cursor < scanLength(text)) {
    while (isEcmaWhitespace(scanChar(text, cursor))) cursor++;
    const tokenStart = cursor;
    while (cursor < scanLength(text) && !isEcmaWhitespace(scanChar(text, cursor))) cursor++;
    if (
      scanChar(text, tokenStart) !== '-' ||
      (cursor - tokenStart === 2 && fixedAt(text, tokenStart, '--'))
    ) {
      return false;
    }
    const recursiveLong = hasRawLongOptionAt(text, tokenStart, 'recursive');
    const forceLong = hasRawLongOptionAt(text, tokenStart, 'force');
    if ((recursive && forceLong) || (force && recursiveLong)) return true;
    recursive ||= recursiveLong;
    force ||= forceLong;
    if (scanChar(text, tokenStart + 1) === '-') continue;
    const flags = summarizeRawShortToken(text, tokenStart, cursor);
    if (
      flags.combined ||
      (recursive && flags.forceAtBoundary) ||
      (force && flags.recursiveAtBoundary)
    ) {
      return true;
    }
    recursive ||= flags.recursive;
    force ||= flags.force;
  }
  return false;
}

function hasRawLongOptionAt(text: ScannedText, start: number, option: string): boolean {
  return (
    (fixedAt(text, start, `--${option}`) &&
      hasWordBoundaryAfter(text, start + option.length + 2)) ||
    hasRawLongOptionPrefix(text, start, option)
  );
}

function rawRmAt(text: ScannedText, index: number): number {
  if (index > 0 && isAsciiWord(scanChar(text, index - 1))) return -1;
  let cursor = index;
  if (scanChar(text, cursor) === '\\') cursor++;
  if (scanChar(text, cursor) !== 'r') return -1;
  cursor++;
  if (scanChar(text, cursor) === '\\') cursor++;
  if (scanChar(text, cursor) !== 'm' || !isEcmaWhitespace(scanChar(text, cursor + 1))) return -1;
  return cursor + 1;
}

function summarizeRawShortToken(text: ScannedText, start: number, end: number) {
  let recursive = false;
  let force = false;
  let recursiveAtBoundary = false;
  let forceAtBoundary = false;
  let combined = false;
  if (scanChar(text, start) !== '-') {
    return { recursive, force, recursiveAtBoundary, forceAtBoundary, combined };
  }
  let previous = '';
  for (let i = start + 1; i < end; i++) {
    const char = scanChar(text, i) ?? '';
    const boundary = (char === 'r' || char === 'f') && hasWordBoundaryAfter(text, i + 1);
    recursive ||= char === 'r';
    force ||= char === 'f';
    recursiveAtBoundary ||= char === 'r' && boundary;
    forceAtBoundary ||= char === 'f' && boundary;
    combined ||=
      ((previous === 'r' && char === 'f') || (previous === 'f' && char === 'r')) && boundary;
    previous = char;
  }
  return { recursive, force, recursiveAtBoundary, forceAtBoundary, combined };
}

function hasResetOption(text: ScannedText, prefix: string, optional: string): boolean {
  return scanGitSuffix(text, 'reset', isPipeSemicolonStop, true, (index) =>
    scanChar(text, index) === '-' && isPartialLongOption(text, index, prefix, optional)
      ? true
      : index,
  );
}

function hasCleanForce(text: ScannedText): boolean {
  return scanGitSuffix(text, 'clean', isPipeSemicolonStop, true, (index) => {
    if (scanChar(text, index) !== '-') return index;
    if (isPartialLongOption(text, index, '--fo', 'rce')) return true;
    const end = tokenEnd(text, index, isPipeSemicolonStop);
    for (let cursor = index + 1; cursor < end; cursor++) {
      if (scanChar(text, cursor) === 'f') return true;
    }
    return end - 1;
  });
}

function scanGitCommandAt(
  text: ScannedText,
  index: number,
  command: string,
): { commandEnd: number; next: number } | null {
  if (!wordAt(text, index, 'git')) return null;
  let cursor = index + 3;
  if (!isEcmaWhitespace(scanChar(text, cursor))) {
    return { commandEnd: -1, next: cursor };
  }
  while (isEcmaWhitespace(scanChar(text, cursor))) cursor++;

  while (cursor < scanLength(text)) {
    if (isRawStop(scanChar(text, cursor))) {
      return { commandEnd: -1, next: cursor };
    }
    const end = tokenEnd(text, cursor, isRawStop);
    if (wordAt(text, cursor, command)) {
      return { commandEnd: cursor + command.length, next: end };
    }
    if (scanChar(text, cursor) !== '-') {
      return { commandEnd: -1, next: end };
    }

    const doubleDash = end - cursor === 2 && fixedAt(text, cursor, '--');
    const consumesValue = matchesGitGlobalOptionWithValue(text, cursor, end);
    cursor = end;
    while (isEcmaWhitespace(scanChar(text, cursor))) cursor++;
    if (doubleDash) {
      const commandEnd = wordAt(text, cursor, command) ? cursor + command.length : -1;
      return { commandEnd, next: tokenEnd(text, cursor, isRawStop) };
    }
    if (!consumesValue) continue;
    if (cursor >= scanLength(text) || isRawStop(scanChar(text, cursor))) {
      return { commandEnd: -1, next: cursor };
    }
    cursor = tokenEnd(text, cursor, isRawStop);
    while (isEcmaWhitespace(scanChar(text, cursor))) cursor++;
  }

  return { commandEnd: -1, next: cursor };
}

function matchesGitGlobalOptionWithValue(text: ScannedText, start: number, end: number): boolean {
  for (const option of GIT_GLOBAL_OPTS_WITH_VALUE) {
    if (end - start === option.length && fixedAt(text, start, option)) return true;
  }
  return false;
}

function hasCheckoutForce(text: ScannedText): boolean {
  return hasGitShortOption(text, {
    command: 'checkout',
    longPrefix: '--fo',
    longOptional: 'rce',
    shortFlag: 'f',
    excludedShortStarts: 'bBU',
  });
}

function hasPushForce(text: ScannedText): boolean {
  return scanGitSuffix(text, 'push', isPipeSemicolonStop, true, (i) => {
    if (scanChar(text, i) !== '-') return i;
    if (
      scanChar(text, i + 1) === 'f' &&
      !isAsciiWord(scanChar(text, i + 2)) &&
      !fixedAt(text, i + 2, '-with-lease')
    ) {
      return true;
    }
    const end = partialLongOptionEnd(text, i, '--fo', 'rce');
    if (end >= 0 && !fixedAt(text, end, '-with-lease')) return true;
    return i;
  });
}

function hasPushForcedRefspec(text: ScannedText): boolean {
  return scanGitSuffix(text, 'push', isRawStop, false, (i) => {
    if (
      isEcmaWhitespace(scanChar(text, i)) &&
      scanChar(text, i + 1) === '+' &&
      i + 2 < scanLength(text) &&
      !isRawStop(scanChar(text, i + 2)) &&
      !isEcmaWhitespace(scanChar(text, i + 2))
    )
      return true;
    if (scanChar(text, i) === ':' && scanChar(text, i + 1) === '+') return true;
    return i;
  });
}

function hasPushDelete(text: ScannedText): boolean {
  return scanGitSuffix(text, 'push', isRawStop, false, (i) => {
    if (scanChar(text, i) === '-' && isPartialLongOption(text, i, '--de', 'lete')) return true;
    if (
      isEcmaWhitespace(scanChar(text, i)) &&
      scanChar(text, i + 1) === ':' &&
      i + 2 < scanLength(text) &&
      !isEcmaWhitespace(scanChar(text, i + 2)) &&
      !isRawStop(scanChar(text, i + 2))
    )
      return true;
    return i;
  });
}

function hasBranchDeleteForce(text: ScannedText): boolean {
  let active = false;
  let deletion = false;
  let force = false;
  for (let i = 0; i <= scanLength(text); i++) {
    if (i === scanLength(text) || isRawStop(scanChar(text, i))) {
      if (deletion && force) return true;
      active = false;
      deletion = false;
      force = false;
      continue;
    }
    if (!active) {
      const gitCommand = scanGitCommandAt(text, i, 'branch');
      if (gitCommand) {
        active = gitCommand.commandEnd >= 0;
        i = Math.max(i, (active ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (!active || scanChar(text, i) !== '-') continue;
    const end = tokenEnd(text, i, isRawStop);
    const flags = branchTokenFlags(text, i, end);
    deletion ||= flags.deletion;
    force ||= flags.force;
    if (deletion && force) return true;
    i = end - 1;
  }
  return false;
}

function branchTokenFlags(text: ScannedText, start: number, end: number) {
  let deletion = false;
  let force = false;
  for (let i = start; i < end; i++) {
    if (scanChar(text, i) !== '-') continue;
    if (isPartialLongOption(text, i, '--de', 'lete')) deletion = true;
    if (isPartialLongOption(text, i, '--fo', 'rce')) force = true;
    if (scanChar(text, i + 1) === '-') continue;
    let cursor = i + 1;
    let clusterDeletion = false;
    let clusterForce = false;
    let clusterUpperD = false;
    while (cursor < end && isAsciiLetter(scanChar(text, cursor))) {
      const char = scanChar(text, cursor);
      clusterDeletion ||= char === 'd' || char === 'D';
      clusterForce ||= char === 'f';
      clusterUpperD ||= char === 'D';
      cursor++;
    }
    if (!hasWordBoundaryAfter(text, cursor)) continue;
    deletion ||= clusterDeletion;
    force ||= clusterForce || clusterUpperD;
  }
  return { deletion, force };
}

function isAsciiLetter(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function hasTagDelete(text: ScannedText): boolean {
  return hasGitShortOption(text, {
    command: 'tag',
    longPrefix: '--de',
    longOptional: 'lete',
    shortFlag: 'd',
    excludedShortStarts: '',
  });
}

function hasGitShortOption(
  text: ScannedText,
  options: {
    command: string;
    longPrefix: string;
    longOptional: string;
    shortFlag: string;
    excludedShortStarts: string;
  },
): boolean {
  const contexts = [
    {
      outerActive: false,
      shortActive: false,
      hasShortFlag: false,
      depth: 0,
      quote: '' as string,
      escaped: false,
    },
  ];
  for (let i = 0; i < scanLength(text); i++) {
    const char = scanChar(text, i);
    const context = contexts[contexts.length - 1];
    if (!context) return false;
    const escaped = context.escaped;
    context.escaped = !escaped && context.quote !== "'" && char === '\\';
    if (!escaped && char === "'" && context.quote !== '"') {
      context.quote = context.quote === "'" ? '' : "'";
    }
    if (!escaped && char === '"' && context.quote !== "'") {
      context.quote = context.quote === '"' ? '' : '"';
    }
    if (
      char === '$' &&
      scanChar(text, i + 1) === '(' &&
      (contexts.length === 1 || (!escaped && context.quote !== "'"))
    ) {
      contexts.push({
        outerActive: false,
        shortActive: false,
        hasShortFlag: false,
        depth: 1,
        quote: '',
        escaped: false,
      });
      i++;
      continue;
    }
    if (!escaped && !context.quote && contexts.length > 1 && char === '(') {
      context.depth++;
      continue;
    }
    if (!escaped && !context.quote && contexts.length > 1 && char === ')') {
      context.depth--;
      if (context.depth === 0) contexts.pop();
      continue;
    }
    if (isEcmaWhitespace(char)) {
      context.shortActive = false;
      context.hasShortFlag = false;
    }

    if (!context.outerActive) {
      const gitCommand = scanGitCommandAt(text, i, options.command);
      if (gitCommand) {
        context.outerActive =
          gitCommand.commandEnd >= 0 && isEcmaWhitespace(scanChar(text, gitCommand.commandEnd));
        context.shortActive = false;
        context.hasShortFlag = false;
        i = Math.max(i, (context.outerActive ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }

    if (context.outerActive && char === '-') {
      if (isPartialLongOption(text, i, options.longPrefix, options.longOptional)) return true;
      context.shortActive ||= !options.excludedShortStarts.includes(scanChar(text, i + 1) ?? '');
    }
    context.hasShortFlag ||= context.shortActive && char === options.shortFlag;
    if (context.hasShortFlag && hasWordBoundaryAfter(text, i + 1)) return true;
    if (isPipeSemicolonStop(char)) context.outerActive = false;
  }
  return false;
}

function scanGitSuffix(
  text: ScannedText,
  command: string,
  stop: (char: string | undefined) => boolean,
  requireTrailingWhitespace: boolean,
  inspect: (index: number) => number | true,
): boolean {
  let active = false;
  for (let i = 0; i < scanLength(text); i++) {
    const char = scanChar(text, i);
    const stopped = stop(char);
    if (!active && !stopped) {
      const gitCommand = scanGitCommandAt(text, i, command);
      if (gitCommand) {
        active =
          gitCommand.commandEnd >= 0 &&
          (!requireTrailingWhitespace || isEcmaWhitespace(scanChar(text, gitCommand.commandEnd)));
        i = Math.max(i, (active ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (active) {
      const result = inspect(i);
      if (result === true) return true;
      for (let cursor = i; cursor <= result; cursor++) {
        if (stop(scanChar(text, cursor))) active = false;
      }
      i = result;
    }
    if (stopped) active = false;
  }
  return false;
}

function hasRestoreWithoutExclusion(text: ScannedText): boolean {
  let candidate = false;
  for (let i = 0; i < scanLength(text); i++) {
    if (isJsLineTerminator(scanChar(text, i))) {
      if (candidate) return true;
      candidate = false;
      continue;
    }
    if (!candidate) {
      const gitCommand = scanGitCommandAt(text, i, 'restore');
      if (gitCommand) {
        candidate = gitCommand.commandEnd >= 0;
        i = Math.max(i, (candidate ? gitCommand.commandEnd : gitCommand.next) - 1);
        continue;
      }
    }
    if (
      candidate &&
      scanChar(text, i) === '-' &&
      scanChar(text, i + 1) === '-' &&
      (fixedAt(text, i + 2, 'staged') || fixedAt(text, i + 2, 'help'))
    ) {
      candidate = false;
    }
  }
  return candidate;
}

function hasFindDelete(text: ScannedText, interpreter: boolean): boolean {
  let active = false;
  for (let i = 0; i < scanLength(text); i++) {
    const char = scanChar(text, i);
    const stopped = interpreter ? isJsLineTerminator(char) : isRawStop(char);
    if (
      active &&
      isEcmaWhitespace(char) &&
      scanChar(text, i + 1) === '-' &&
      wordAt(text, i + 2, 'delete')
    ) {
      return true;
    }
    if (stopped) {
      active = false;
      continue;
    }
    if (wordAt(text, i, 'find')) {
      active = true;
      i += 3;
    }
  }
  return false;
}

function tokenEnd(
  text: ScannedText,
  start: number,
  stop: (char: string | undefined) => boolean,
): number {
  let end = start;
  while (
    end < scanLength(text) &&
    !isEcmaWhitespace(scanChar(text, end)) &&
    !stop(scanChar(text, end))
  ) {
    end++;
  }
  return end;
}

function partialLongOptionEnd(
  text: ScannedText,
  start: number,
  prefix: string,
  optional: string,
): number {
  if (!fixedAt(text, start, prefix)) return -1;
  let end = start + prefix.length;
  for (let i = 0; i < optional.length && scanChar(text, end) === optional[i]; i++) end++;
  return hasWordBoundaryAfter(text, end) ? end : -1;
}

function isPartialLongOption(
  text: ScannedText,
  start: number,
  prefix: string,
  optional: string,
): boolean {
  return partialLongOptionEnd(text, start, prefix, optional) >= 0;
}
