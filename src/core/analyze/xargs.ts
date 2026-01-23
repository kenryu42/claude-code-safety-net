import { analyzeFind } from '@/core/analyze/find';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { analyzeGit } from '@/core/rules-git';
import { analyzeRm } from '@/core/rules-rm';
import { getBasename, stripWrappers } from '@/core/shell';
import { SHELL_WRAPPERS } from '@/types';

const REASON_XARGS_RM =
  'xargs rm -rf with dynamic input is dangerous. Use explicit file list instead.';
const REASON_XARGS_SHELL = 'xargs with shell -c can execute arbitrary commands from dynamic input.';

export interface XargsAnalyzeContext {
  cwd: string | undefined;
  originalCwd: string | undefined;
  paranoidRm: boolean | undefined;
  allowTmpdirVar: boolean;
}

export function analyzeXargs(
  tokens: readonly string[],
  context: XargsAnalyzeContext,
): string | null {
  const { childTokens: rawChildTokens } = extractXargsChildCommandWithInfo(tokens);

  let childTokens = stripWrappers(rawChildTokens);

  if (childTokens.length === 0) {
    return null;
  }

  let head = getBasename(childTokens[0] ?? '').toLowerCase();

  if (head === 'busybox' && childTokens.length > 1) {
    childTokens = childTokens.slice(1);
    head = getBasename(childTokens[0] ?? '').toLowerCase();
  }

  // Check for shell wrapper with -c
  if (SHELL_WRAPPERS.has(head)) {
    // xargs bash -c is always dangerous - stdin feeds into the shell execution
    // Either no script arg (stdin IS the script) or script with dynamic input
    return REASON_XARGS_SHELL;
  }

  if (head === 'rm' && hasRecursiveForceFlags(childTokens)) {
    const rmResult = analyzeRm(childTokens, {
      cwd: context.cwd,
      originalCwd: context.originalCwd,
      paranoid: context.paranoidRm,
      allowTmpdirVar: context.allowTmpdirVar,
    });
    if (rmResult) {
      return rmResult;
    }
    // Even if analyzeRm passes (e.g., temp paths), xargs rm -rf is still dangerous
    // because stdin provides dynamic input
    return REASON_XARGS_RM;
  }

  if (head === 'find') {
    const findResult = analyzeFind(childTokens);
    if (findResult) {
      return findResult;
    }
  }

  if (head === 'git') {
    const gitResult = analyzeGit(childTokens);
    if (gitResult) {
      return gitResult;
    }
  }

  return null;
}

interface XargsParseResult {
  childTokens: string[];
  replacementToken: string | null;
}

export function extractXargsChildCommandWithInfo(tokens: readonly string[]): XargsParseResult {
  // Options that take a value as the next token
  const xargsOptsWithValue = new Set([
    '-L',
    '-n',
    '-P',
    '-s',
    '-a',
    '-E',
    '-e',
    '-d',
    '-J',
    '--max-args',
    '--max-procs',
    '--max-chars',
    '--arg-file',
    '--eof',
    '--delimiter',
    '--max-lines',
  ]);

  let replacementToken: string | null = null;
  let i = 1;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === '--') {
      return { childTokens: [...tokens.slice(i + 1)], replacementToken };
    }

    if (token.startsWith('-')) {
      // Handle -I (replacement option)
      if (token === '-I') {
        // -I TOKEN - next arg is the token
        replacementToken = (tokens[i + 1] as string | undefined) ?? '{}';
        i += 2;
        continue;
      }
      if (token.startsWith('-I') && token.length > 2) {
        // -ITOKEN - token is attached
        replacementToken = token.slice(2);
        i++;
        continue;
      }

      // Handle --replace option
      // In GNU xargs, --replace takes an optional argument via =
      // --replace alone uses {}, --replace=FOO uses FOO
      if (token === '--replace') {
        // --replace (defaults to {})
        replacementToken = '{}';
        i++;
        continue;
      }
      if (token.startsWith('--replace=')) {
        // --replace=TOKEN or --replace= (empty defaults to {})
        const value = token.slice('--replace='.length);
        replacementToken = value === '' ? '{}' : value;
        i++;
        continue;
      }

      // Handle -J (macOS xargs replacement, consumes value)
      if (token === '-J') {
        // -J just consumes its value, doesn't enable placeholder mode for analysis
        i += 2;
        continue;
      }

      if (xargsOptsWithValue.has(token)) {
        i += 2;
      } else if (token.startsWith('--') && token.includes('=')) {
        i++;
      } else if (
        token.startsWith('-L') ||
        token.startsWith('-n') ||
        token.startsWith('-P') ||
        token.startsWith('-s')
      ) {
        // These can have attached values like -n5
        i++;
      } else {
        // Unknown option, skip it
        i++;
      }
    } else {
      return { childTokens: [...tokens.slice(i)], replacementToken };
    }
  }

  return { childTokens: [], replacementToken };
}

export function extractXargsChildCommand(tokens: readonly string[]): string[] {
  return extractXargsChildCommandWithInfo(tokens).childTokens;
}
