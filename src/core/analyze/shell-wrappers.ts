export function extractDashCArg(tokens: readonly string[]): string | null {
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    if (token === '-c' && tokens[i + 1]) {
      return tokens[i + 1] ?? null;
    }

    if (token.startsWith('-') && token.includes('c') && !token.startsWith('--')) {
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        return nextToken;
      }
    }
  }
  return null;
}
