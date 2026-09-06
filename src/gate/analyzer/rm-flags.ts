export function hasRecursiveForceFlags(tokens: readonly string[]): boolean {
  let hasRecursive = false;
  let hasForce = false;

  for (const token of tokens) {
    if (token === '--') break;

    if (token === '-r' || token === '-R' || isLongOptionAbbreviation(token, 'recursive')) {
      hasRecursive = true;
      continue;
    }
    if (token === '-f' || isLongOptionAbbreviation(token, 'force')) {
      hasForce = true;
      continue;
    }
    if (token.startsWith('-') && !token.startsWith('--')) {
      if (token.includes('r') || token.includes('R')) hasRecursive = true;
      if (token.includes('f')) hasForce = true;
    }
  }

  return hasRecursive && hasForce;
}

export function hasRecursiveOption(tokens: readonly string[]): boolean {
  const separator = tokens.indexOf('--');
  return tokens
    .slice(1, separator === -1 ? undefined : separator)
    .some(
      (token) =>
        isLongOptionAbbreviation(token, 'recursive') ||
        (/^-[A-Za-z]+$/.test(token) && /[rR]/.test(token.slice(1))),
    );
}

function isLongOptionAbbreviation(token: string, option: string): boolean {
  return token.length > 2 && token.startsWith('--') && option.startsWith(token.slice(2));
}
