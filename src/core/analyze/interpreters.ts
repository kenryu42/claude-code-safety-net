import { DANGEROUS_PATTERNS } from '@/types';

export function extractInterpreterCodeArg(tokens: readonly string[]): string | null {
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if ((token === '-c' || token === '-e') && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }
  }
  return null;
}

export function containsDangerousCode(code: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      return true;
    }
  }
  return false;
}
