import { analyzeFind } from '@/core/analyze/find';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { extractDashCArg } from '@/core/analyze/shell-wrappers';
import { analyzeGit } from '@/core/rules-git';
import { analyzeRm } from '@/core/rules-rm';
import { getBasename, stripWrappers } from '@/core/shell';
import { SHELL_WRAPPERS } from '@/types';

const REASON_PARALLEL_RM =
  'parallel rm -rf with dynamic input is dangerous. Use explicit file list instead.';
const REASON_PARALLEL_SHELL =
  'parallel with shell -c can execute arbitrary commands from dynamic input.';

export interface ParallelAnalyzeContext {
  cwd: string | undefined;
  originalCwd: string | undefined;
  paranoidRm: boolean | undefined;
  allowTmpdirVar: boolean;
  analyzeNested: (command: string) => string | null;
}

export function analyzeParallel(
  tokens: readonly string[],
  context: ParallelAnalyzeContext,
): string | null {
  const parseResult = parseParallelCommand(tokens);

  if (!parseResult) {
    return null;
  }

  const { template, args, hasPlaceholder } = parseResult;

  if (template.length === 0) {
    // parallel ::: 'cmd1' 'cmd2' - commands mode
    // Analyze each arg as a command
    for (const arg of args) {
      const reason = context.analyzeNested(arg);
      if (reason) {
        return reason;
      }
    }
    return null;
  }

  let childTokens = stripWrappers([...template]);
  let head = getBasename(childTokens[0] ?? '').toLowerCase();

  if (head === 'busybox' && childTokens.length > 1) {
    childTokens = childTokens.slice(1);
    head = getBasename(childTokens[0] ?? '').toLowerCase();
  }

  // Check for shell wrapper with -c
  if (SHELL_WRAPPERS.has(head)) {
    const dashCArg = extractDashCArg(childTokens);
    if (dashCArg) {
      // If script IS just the placeholder, stdin provides entire script - dangerous
      if (dashCArg === '{}' || dashCArg === '{1}') {
        return REASON_PARALLEL_SHELL;
      }
      // If script contains placeholder
      if (dashCArg.includes('{}')) {
        if (args.length > 0) {
          // Expand with actual args and analyze
          for (const arg of args) {
            const expandedScript = dashCArg.replace(/{}/g, arg);
            const reason = context.analyzeNested(expandedScript);
            if (reason) {
              return reason;
            }
          }
          return null;
        }
        // Stdin mode with placeholder - analyze the script template
        // Check if the script pattern is dangerous (e.g., rm -rf {})
        const reason = context.analyzeNested(dashCArg);
        if (reason) {
          return reason;
        }
        return null;
      }
      // Script doesn't have placeholder - analyze it directly
      const reason = context.analyzeNested(dashCArg);
      if (reason) {
        return reason;
      }
      // If there's a placeholder in the shell wrapper args (not script),
      // it's still dangerous
      if (hasPlaceholder) {
        return REASON_PARALLEL_SHELL;
      }
      return null;
    }
    // bash -c without script argument
    // If there are args from :::, those become the scripts - dangerous pattern
    if (args.length > 0) {
      // The pattern of passing scripts via ::: to bash -c is inherently dangerous
      return REASON_PARALLEL_SHELL;
    }
    // Stdin provides the script - dangerous
    if (hasPlaceholder) {
      return REASON_PARALLEL_SHELL;
    }
    return null;
  }

  // For rm -rf, expand with actual args and analyze each expansion
  if (head === 'rm' && hasRecursiveForceFlags(childTokens)) {
    if (hasPlaceholder && args.length > 0) {
      // Expand template with each arg and analyze
      for (const arg of args) {
        const expandedTokens = childTokens.map((t) => t.replace(/{}/g, arg));
        const rmResult = analyzeRm(expandedTokens, {
          cwd: context.cwd,
          originalCwd: context.originalCwd,
          paranoid: context.paranoidRm,
          allowTmpdirVar: context.allowTmpdirVar,
        });
        if (rmResult) {
          return rmResult;
        }
      }
      return null;
    }
    // No placeholder or no args - analyze template as-is
    // If there are args (from :::), they get appended, analyze with first arg
    if (args.length > 0) {
      const expandedTokens = [...childTokens, args[0] ?? ''];
      const rmResult = analyzeRm(expandedTokens, {
        cwd: context.cwd,
        originalCwd: context.originalCwd,
        paranoid: context.paranoidRm,
        allowTmpdirVar: context.allowTmpdirVar,
      });
      if (rmResult) {
        return rmResult;
      }
      return null;
    }
    return REASON_PARALLEL_RM;
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

interface ParallelParseResult {
  template: string[];
  args: string[];
  hasPlaceholder: boolean;
}

function parseParallelCommand(tokens: readonly string[]): ParallelParseResult | null {
  // Options that take a value as the next token
  const parallelOptsWithValue = new Set([
    '-S',
    '--sshlogin',
    '--slf',
    '--sshloginfile',
    '-a',
    '--arg-file',
    '--colsep',
    '-I',
    '--replace',
    '--results',
    '--result',
    '--res',
  ]);

  let i = 1;
  const templateTokens: string[] = [];
  let markerIndex = -1;

  // First pass: find the ::: marker and extract template
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === ':::') {
      markerIndex = i;
      break;
    }

    if (token === '--') {
      // Everything after -- until ::: is the template
      i++;
      while (i < tokens.length) {
        const token = tokens[i];
        if (token === undefined || token === ':::') break;
        templateTokens.push(token);
        i++;
      }
      if (i < tokens.length && tokens[i] === ':::') {
        markerIndex = i;
      }
      break;
    }

    if (token.startsWith('-')) {
      // Handle -jN attached option
      if (token.startsWith('-j') && token.length > 2 && /^\d+$/.test(token.slice(2))) {
        i++;
        continue;
      }

      // Handle --option=value
      if (token.startsWith('--') && token.includes('=')) {
        i++;
        continue;
      }

      // Handle options that take a value
      if (parallelOptsWithValue.has(token)) {
        i += 2;
        continue;
      }

      // Handle -j as separate option
      if (token === '-j' || token === '--jobs') {
        i += 2;
        continue;
      }

      // Unknown option - skip it
      i++;
    } else {
      // Start of template
      while (i < tokens.length) {
        const token = tokens[i];
        if (token === undefined || token === ':::') break;
        templateTokens.push(token);
        i++;
      }
      if (i < tokens.length && tokens[i] === ':::') {
        markerIndex = i;
      }
      break;
    }
  }

  // Extract args after :::
  const args: string[] = [];
  if (markerIndex !== -1) {
    for (let j = markerIndex + 1; j < tokens.length; j++) {
      const token = tokens[j];
      if (token && token !== ':::') {
        args.push(token);
      }
    }
  }

  // Determine if template has placeholder
  const hasPlaceholder = templateTokens.some(
    (t) => t.includes('{}') || t.includes('{1}') || t.includes('{.}'),
  );

  // If no template and no marker, no valid parallel command
  if (templateTokens.length === 0 && markerIndex === -1) {
    return null;
  }

  return { template: templateTokens, args, hasPlaceholder };
}

export function extractParallelChildCommand(tokens: readonly string[]): string[] {
  // Legacy behavior: return everything after options until end
  // This includes ::: marker and args if present
  const parallelOptsWithValue = new Set([
    '-S',
    '--sshlogin',
    '--slf',
    '--sshloginfile',
    '-a',
    '--arg-file',
    '--colsep',
    '-I',
    '--replace',
    '--results',
    '--result',
    '--res',
  ]);

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) break;

    if (token === ':::') {
      // ::: as first non-option means no template
      return [];
    }

    if (token === '--') {
      return [...tokens.slice(i + 1)];
    }

    if (token.startsWith('-')) {
      if (token.startsWith('-j') && token.length > 2 && /^\d+$/.test(token.slice(2))) {
        i++;
        continue;
      }
      if (token.startsWith('--') && token.includes('=')) {
        i++;
        continue;
      }
      if (parallelOptsWithValue.has(token)) {
        i += 2;
        continue;
      }
      if (token === '-j' || token === '--jobs') {
        i += 2;
        continue;
      }
      i++;
    } else {
      // Return everything from here to end (including ::: and args)
      return [...tokens.slice(i)];
    }
  }

  return [];
}
