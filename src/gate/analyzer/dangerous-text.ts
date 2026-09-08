import { destructiveCommandMatch } from '@/core/rules/destructive';
import type { DestructiveCommandRuleMatch } from '@/core/rules/types';
import { hasLinearDangerousText } from './linear-danger-scanner';
import { chargeNativeLinearPass, chargeScan } from './text-scanner';

export function dangerousInTextMatch(
  text: string,
  scanWork?: { units: number },
): DestructiveCommandRuleMatch | null {
  chargeScan(scanWork, text, 2);
  const lower = text.toLowerCase();
  const stripped = lower.trimStart();
  const isEchoOrRg = stripped.startsWith('echo ') || stripped.startsWith('rg ');
  const patterns: Array<{
    regex?: RegExp;
    scan?: Parameters<typeof hasLinearDangerousText>[1];
    label: string;
    skipForEchoRg?: boolean;
    caseSensitive?: boolean;
  }> = [
    { scan: 'rm', label: 'rm -rf' },
    { scan: 'reset-hard', label: 'git reset --hard' },
    { scan: 'reset-merge', label: 'git reset --merge' },
    { scan: 'clean', label: 'git clean -f' },
    { scan: 'checkout', label: 'git checkout --force' },
    { scan: 'push-force', label: 'git push --force' },
    { scan: 'push-refspec', label: 'git push --force' },
    { scan: 'push-delete', label: 'git push delete' },
    { scan: 'branch', label: 'git branch -D', caseSensitive: true },
    { scan: 'tag', label: 'git tag -d' },
    { regex: /\bgit\s+stash\s+(drop|clear)\b/, label: 'git stash drop/clear' },
    { regex: /\bgit\s+checkout\s+--\s/, label: 'git checkout --' },
    { scan: 'restore', label: 'git restore without --staged' },
    { scan: 'find', label: 'find -delete', skipForEchoRg: true },
    { regex: /\bdd\b[^\n|;&]*\bof=\/dev\/\S/, label: 'dd of=/dev/', skipForEchoRg: true },
    { regex: /\bmkfs(?:\.[a-z0-9_-]+)?\s+\/dev\/\S/, label: 'mkfs /dev/', skipForEchoRg: true },
    { regex: /\bshred\b\s+\S/, label: 'shred', skipForEchoRg: true },
    {
      // The optional wrapper before the shell mirrors STANDARD_COMMAND_WRAPPERS in
      // transparent-wrappers.ts (sudo|env|command|builtin), the set the structural
      // analyzer treats as transparent; keep the two in sync. Other wrappers stay the
      // structural dynamic-shell-source rule's job — this text scan is a best-effort
      // backstop for bodies the parser does not descend into.
      regex:
        /\b(?:curl|wget|fetch|aria2c|https?|xhs?|ncat|netcat|nc)\b(?:[^\n|;&]|\\\n)*\|(?:\s|\\\n)*(?:(?:sudo|env|command|builtin)(?:\s+(?:-\S+|\w+=\S*))*\s+)?(?:[^\s|;&]*\/)?(?:ba|da|z|k)?sh(?![^\s;&|])/,
      label: 'download piped to shell',
      skipForEchoRg: true,
    },
  ];

  for (const pattern of patterns) {
    if (pattern.skipForEchoRg && isEchoOrRg) continue;
    const target = pattern.caseSensitive ? text : lower;
    if (pattern.regex) chargeNativeLinearPass(scanWork, target);
    if (
      (pattern.regex?.test(target) ?? false) ||
      (pattern.scan && hasLinearDangerousText(target, pattern.scan, scanWork))
    ) {
      return destructiveCommandMatch(
        'raw-text.dangerous-command',
        `Unparseable command text contains a destructive pattern (${pattern.label}). Rewrite as a plain, parseable command so it can be analyzed.`,
      );
    }
  }
  return null;
}
