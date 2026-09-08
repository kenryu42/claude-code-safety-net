import type { CommandView, CommandWord } from '@/core/shell/model';

/**
 * Text a word contributes to command analysis. Command substitutions expand to unknown
 * output, so their raw source is analyzed instead of their (empty) expansion text.
 */
export function analysisWordText(word: CommandWord): string {
  return word.provenance === 'command-substitution' ? word.raw : word.text;
}

/**
 * Words a parsed command view is analyzed with. POSIX words keep a command substitution's
 * source in `raw`, so they analyze as parsed; PowerShell words already carry it in `text`
 * and analyze as text-only stand-ins, exactly as the token projection did.
 */
export function analyzedViewWords(
  dialect: CommandView['dialect'],
  words: readonly CommandWord[],
): readonly CommandWord[] {
  return dialect === 'posix' ? words : textCommandWords(words.map((word) => word.text));
}

/**
 * Whether the word an execution source came from is a literal. Parsed words answer from
 * provenance; text-only stand-ins carry none, so they keep the text test the token path used.
 */
export function isLiteralExecutionSourceWord(word: CommandWord | undefined, text: string): boolean {
  return word && word.provenance !== 'unknown'
    ? word.provenance === 'literal'
    : !/[$`*?[\]]/.test(text);
}

/**
 * Words for a command that is only known as text (derived child commands, expanded
 * templates). They carry no parser facts, so every fact-driven check treats them as
 * unverified exactly as the token-only path did.
 */
export function textCommandWords(tokens: readonly string[]): readonly CommandWord[] {
  return tokens.map((text) => ({
    kind: 'word' as const,
    text,
    raw: text,
    span: { start: 0, end: 0 },
    provenance: 'unknown' as const,
    quoted: false,
    parts: [],
  }));
}
