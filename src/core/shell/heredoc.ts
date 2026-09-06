import type { CommandHeredoc, CommandIssue, CommandSpan } from './model';

export type HeredocDelimiter = {
  readonly delimiter: string;
  readonly quoted: boolean;
  readonly next: number;
  readonly span: CommandSpan;
  readonly ambiguous: boolean;
};

export type PendingHeredoc = {
  readonly delimiter: string;
  readonly quotedDelimiter: boolean;
  readonly stripTabs: boolean;
  readonly declarationSpan: CommandSpan;
  attach(heredoc: CommandHeredoc): void;
};

export function readHeredocDelimiter(
  source: string,
  start: number,
  end: number,
): HeredocDelimiter | null {
  if (start >= end || isBoundary(source[start] ?? '')) return null;
  let delimiter = '';
  let quoted = false;
  let ambiguous = false;
  let i = start;
  while (i < end && !isBoundary(source[i] ?? '')) {
    const char = source[i] ?? '';
    if (char === "'") {
      quoted = true;
      const result = readQuotedDelimiter(source, i + 1, end, "'");
      delimiter += result.text;
      ambiguous ||= !result.closed;
      i = result.next;
      continue;
    }
    if (char === '"') {
      quoted = true;
      const result = readQuotedDelimiter(source, i + 1, end, '"');
      delimiter += result.text;
      ambiguous ||= !result.closed;
      i = result.next;
      continue;
    }
    if (char === '\\') {
      quoted = true;
      const next = source[i + 1];
      if (!next || next === '\n' || next === '\r') {
        ambiguous = true;
        break;
      }
      delimiter += next;
      i += 2;
      continue;
    }
    if (
      char === '`' ||
      source.startsWith('$(', i) ||
      source.startsWith('${', i) ||
      source.startsWith('<(', i) ||
      source.startsWith('>(', i)
    ) {
      ambiguous = true;
    }
    delimiter += char;
    i++;
  }
  return { delimiter, quoted, next: i, span: { start, end: i }, ambiguous };
}

export function consumeHeredocBodies(
  source: string,
  start: number,
  end: number,
  pending: readonly PendingHeredoc[],
) {
  const issues: CommandIssue[] = [];
  let cursor = start;
  for (const declaration of pending) {
    const bodyStart = cursor;
    let terminated = false;
    while (cursor < end) {
      const line = readLine(source, cursor, end);
      const comparison = declaration.stripTabs ? line.text.replace(/^\t+/, '') : line.text;
      if (comparison === declaration.delimiter) {
        declaration.attach({
          body: declaration.stripTabs
            ? stripLeadingTabs(source.slice(bodyStart, cursor))
            : source.slice(bodyStart, cursor),
          delimiter: declaration.delimiter,
          quotedDelimiter: declaration.quotedDelimiter,
          bodySpan: { start: bodyStart, end: cursor },
          terminatorSpan: { start: cursor, end: line.contentEnd },
        });
        cursor = line.next;
        terminated = true;
        break;
      }
      if (line.next <= cursor) break;
      cursor = line.next;
    }
    if (terminated) continue;
    issues.push({
      code: 'unterminated-heredoc',
      message: `heredoc delimiter ${declaration.delimiter} was not found`,
      span: declaration.declarationSpan,
    });
    return { next: end, issues, terminated: false };
  }
  return { next: cursor, issues, terminated: true };
}

function readQuotedDelimiter(source: string, start: number, end: number, quote: "'" | '"') {
  let text = '';
  let i = start;
  while (i < end && source[i] !== '\n' && source[i] !== '\r') {
    const char = source[i] ?? '';
    if (char === quote) return { text, next: i + 1, closed: true };
    if (quote === '"' && char === '\\' && source[i + 1]) {
      const next = source[i + 1] ?? '';
      text += ['$', '`', '"', '\\'].includes(next) ? next : `\\${next}`;
      i += 2;
      continue;
    }
    text += char;
    i++;
  }
  return { text, next: i, closed: false };
}

function isBoundary(char: string): boolean {
  return /[\s;&|<>)]/u.test(char) || char === '`';
}

function readLine(source: string, start: number, end: number) {
  let contentEnd = start;
  while (contentEnd < end && source[contentEnd] !== '\n' && source[contentEnd] !== '\r') {
    contentEnd++;
  }
  const next =
    contentEnd >= end
      ? end
      : source[contentEnd] === '\r' && source[contentEnd + 1] === '\n'
        ? contentEnd + 2
        : contentEnd + 1;
  return { text: source.slice(start, contentEnd), contentEnd, next };
}

function stripLeadingTabs(body: string): string {
  return body.replace(/(^|\r\n?|\n)\t+/g, '$1');
}
