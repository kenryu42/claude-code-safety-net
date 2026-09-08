type ScanWork = { units: number } | undefined;

export interface ScannedText {
  value: string;
  work: ScanWork;
}

export function scannedText(value: string, work: ScanWork): ScannedText {
  return { value, work };
}

export function scanChar(text: ScannedText, index: number): string | undefined {
  if (text.work) text.work.units = Math.min(Number.MAX_SAFE_INTEGER, text.work.units + 1);
  return text.value[index];
}

export function scanLength(text: ScannedText): number {
  return text.value.length;
}

export function chargeScan(work: ScanWork, text: string, passes = 1): void {
  if (work) {
    work.units = Math.min(Number.MAX_SAFE_INTEGER, work.units + text.length * passes);
  }
}

export function chargeNativeLinearPass(work: ScanWork, text: string): void {
  chargeScan(work, text);
}

export function isAsciiWord(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  );
}

export function isEcmaWhitespace(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (
    code === 9 ||
    code === 10 ||
    code === 11 ||
    code === 12 ||
    code === 13 ||
    code === 32 ||
    code === 160 ||
    code === 0xfeff ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

export function isJsLineTerminator(char: string | undefined): boolean {
  return char === '\n' || char === '\r' || char === '\u2028' || char === '\u2029';
}

export function fixedAt(text: ScannedText, index: number, expected: string): boolean {
  if (index + expected.length > scanLength(text)) return false;
  for (let offset = 0; offset < expected.length; offset++) {
    if (scanChar(text, index + offset) !== expected[offset]) return false;
  }
  return true;
}

export function wordAt(text: ScannedText, index: number, word: string): boolean {
  return (
    !isAsciiWord(scanChar(text, index - 1)) &&
    fixedAt(text, index, word) &&
    !isAsciiWord(scanChar(text, index + word.length))
  );
}

export function hasWordBoundaryAfter(text: ScannedText, end: number): boolean {
  return isAsciiWord(scanChar(text, end - 1)) !== isAsciiWord(scanChar(text, end));
}

export function isRawStop(char: string | undefined): boolean {
  return char === '\n' || char === ';' || char === '&' || char === '|';
}

export function isPipeSemicolonStop(char: string | undefined): boolean {
  return char === '|' || char === ';';
}
