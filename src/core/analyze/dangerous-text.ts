export function dangerousInText(text: string): string | null {
  const t = text.toLowerCase();
  const stripped = t.trimStart();
  const isEchoOrRg = stripped.startsWith('echo ') || stripped.startsWith('rg ');

  const patterns: Array<{
    regex: RegExp;
    reason: string;
    skipForEchoRg?: boolean;
    caseSensitive?: boolean;
  }> = [
    {
      regex: /\brm\s+(-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r|-[^\s]*rf|-[^\s]*fr)\b/,
      reason: 'rm -rf',
    },
    {
      regex: /\bgit\s+reset\s+--hard\b/,
      reason: 'git reset --hard',
    },
    {
      regex: /\bgit\s+reset\s+--merge\b/,
      reason: 'git reset --merge',
    },
    {
      regex: /\bgit\s+clean\s+(-[^\s]*f|-f)\b/,
      reason: 'git clean -f',
    },
    {
      regex: /\bgit\s+push\s+[^|;]*(-f\b|--force\b)(?!-with-lease)/,
      reason: 'git push --force (use --force-with-lease instead)',
    },
    {
      regex: /\bgit\s+branch\s+-D\b/,
      reason: 'git branch -D',
      caseSensitive: true,
    },
    {
      regex: /\bgit\s+stash\s+(drop|clear)\b/,
      reason: 'git stash drop/clear',
    },
    {
      regex: /\bgit\s+checkout\s+--\s/,
      reason: 'git checkout --',
    },
    {
      regex: /\bgit\s+restore\b(?!.*--(staged|help))/,
      reason: 'git restore (without --staged)',
    },
    {
      regex: /\bfind\b[^\n;|&]*\s-delete\b/,
      reason: 'find -delete',
      skipForEchoRg: true,
    },
  ];

  for (const { regex, reason, skipForEchoRg, caseSensitive } of patterns) {
    if (skipForEchoRg && isEchoOrRg) continue;
    const target = caseSensitive ? text : t;
    if (regex.test(target)) {
      return reason;
    }
  }
  return null;
}
