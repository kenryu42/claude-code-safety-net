/**
 * CLI flag parsing for the explain command.
 */

import { quote } from 'shell-quote';

export interface ExplainFlags {
  json: boolean;
  cwd?: string;
  command: string;
}

export function parseExplainFlags(args: string[]): ExplainFlags | null {
  let json = false;
  let cwd: string | undefined;
  const remaining: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Skip --help as it's handled elsewhere
    if (arg === '--help' || arg === '-h') {
      i++;
      continue;
    }

    // Explicit separator: everything after is the command
    if (arg === '--') {
      remaining.push(...args.slice(i + 1));
      break;
    }

    // Once we hit a non-flag arg, everything else is the command
    if (!arg?.startsWith('--')) {
      remaining.push(...args.slice(i));
      break;
    }

    if (arg === '--json') {
      json = true;
      i++;
    } else if (arg === '--cwd') {
      i++;
      if (i >= args.length || args[i]?.startsWith('--')) {
        console.error('Error: --cwd requires a path');
        return null;
      }
      cwd = args[i];
      i++;
    } else {
      // Unknown flag - treat as start of command
      remaining.push(...args.slice(i));
      break;
    }
  }

  // When the user passes a full command as a single argument (e.g., explain "git status | rm -rf /"),
  // use it directly to preserve shell operators. Otherwise, use quote() to properly escape
  // multiple arguments containing spaces.
  const command = remaining.length === 1 ? remaining[0] : quote(remaining);
  if (!command) {
    console.error('Error: No command provided');
    console.error('Usage: cc-safety-net explain [--json] [--cwd <path>] <command>');
    return null;
  }

  return { json, cwd, command };
}
