import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { getBasename, stripWrappers } from '@/core/shell';

const REASON_FIND_DELETE = 'find -delete permanently removes files. Use -print first to preview.';

export function analyzeFind(tokens: readonly string[]): string | null {
  // Check for -delete outside of -exec/-execdir blocks
  if (findHasDelete(tokens.slice(1))) {
    return REASON_FIND_DELETE;
  }

  // Check all -exec and -execdir blocks for dangerous commands
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '-exec' || token === '-execdir') {
      const execTokens = tokens.slice(i + 1);
      const semicolonIdx = execTokens.indexOf(';');
      const plusIdx = execTokens.indexOf('+');
      // If no terminator found, shell-quote may have parsed it as an operator
      // In that case, treat the rest of the tokens as the exec command
      const endIdx =
        semicolonIdx !== -1 && plusIdx !== -1
          ? Math.min(semicolonIdx, plusIdx)
          : semicolonIdx !== -1
            ? semicolonIdx
            : plusIdx !== -1
              ? plusIdx
              : execTokens.length; // No terminator - use all remaining tokens

      let execCommand = execTokens.slice(0, endIdx);
      // Strip wrappers (env, sudo, command)
      execCommand = stripWrappers(execCommand);
      if (execCommand.length > 0) {
        let head = getBasename(execCommand[0] ?? '');
        // Handle busybox wrapper
        if (head === 'busybox' && execCommand.length > 1) {
          execCommand = execCommand.slice(1);
          head = getBasename(execCommand[0] ?? '');
        }
        if (head === 'rm' && hasRecursiveForceFlags(execCommand)) {
          return 'find -exec rm -rf is dangerous. Use explicit file list instead.';
        }
      }
    }
  }

  return null;
}

/**
 * Check if find command has -delete action (not as argument to another option).
 * Handles cases like "find -name -delete" where -delete is a filename pattern.
 */
export function findHasDelete(tokens: readonly string[]): boolean {
  let i = 0;
  let insideExec = false;
  let execDepth = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i++;
      continue;
    }

    // Track -exec/-execdir blocks
    if (token === '-exec' || token === '-execdir') {
      insideExec = true;
      execDepth++;
      i++;
      continue;
    }

    // End of -exec block
    if (insideExec && (token === ';' || token === '+')) {
      execDepth--;
      if (execDepth === 0) {
        insideExec = false;
      }
      i++;
      continue;
    }

    // Skip -delete inside -exec blocks
    if (insideExec) {
      i++;
      continue;
    }

    // Options that take an argument - skip the next token
    if (
      token === '-name' ||
      token === '-iname' ||
      token === '-path' ||
      token === '-ipath' ||
      token === '-regex' ||
      token === '-iregex' ||
      token === '-type' ||
      token === '-user' ||
      token === '-group' ||
      token === '-perm' ||
      token === '-size' ||
      token === '-mtime' ||
      token === '-ctime' ||
      token === '-atime' ||
      token === '-newer' ||
      token === '-printf' ||
      token === '-fprint' ||
      token === '-fprintf'
    ) {
      i += 2; // Skip option and its argument
      continue;
    }

    // Found -delete outside of -exec and not as an argument
    if (token === '-delete') {
      return true;
    }

    i++;
  }

  return false;
}
