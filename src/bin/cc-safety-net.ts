#!/usr/bin/env node
import { quote } from 'shell-quote';
import { runClaudeCodeHook } from '@/bin/claude-code';
import { findCommand } from '@/bin/commands';
import { runCopilotCliHook } from './copilot-cli.ts';
import { CUSTOM_RULES_DOC } from '@/bin/custom-rules-doc';
import { runDoctor } from '@/bin/doctor/index';
import { explainCommand, formatTraceHuman, formatTraceJson } from '@/bin/explain/index';
import { runGeminiCLIHook } from '@/bin/gemini-cli';
import { printHelp, printVersion, showCommandHelp } from '@/bin/help';
import { printStatusline } from '@/bin/statusline';
import { verifyConfig } from '@/bin/verify-config';

function printCustomRulesDoc(): void {
  console.log(CUSTOM_RULES_DOC);
}

type HookMode = 'claude-code' | 'copilot-cli' | 'gemini-cli' | 'statusline' | 'doctor' | 'explain';

interface DoctorFlags {
  json: boolean;
  skipUpdateCheck: boolean;
}

interface ExplainFlags {
  json: boolean;
  cwd?: string;
  command: string;
}

/**
 * Check if --help or -h is present in args (but not as a quoted command argument).
 */
function hasHelpFlag(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

/**
 * Handle "help <command>" pattern.
 * Returns true if handled (printed help or error), false if not the help command.
 */
function handleHelpCommand(args: readonly string[]): boolean {
  if (args[0] !== 'help') {
    return false;
  }

  const commandName = args[1];
  if (!commandName) {
    // Just "help" with no argument - show main help
    printHelp();
    process.exit(0);
  }

  if (showCommandHelp(commandName)) {
    process.exit(0);
  }

  console.error(`Unknown command: ${commandName}`);
  console.error("Run 'cc-safety-net --help' for available commands.");
  process.exit(1);
}

/**
 * Handle "<command> --help" pattern for subcommands.
 * Returns true if handled, false otherwise.
 */
function handleCommandHelp(args: readonly string[]): boolean {
  if (!hasHelpFlag(args)) {
    return false;
  }

  const commandName = args[0];
  if (!commandName || commandName.startsWith('-')) {
    // Not a subcommand, will be handled by global help
    return false;
  }

  // Check if this is a known command
  const command = findCommand(commandName);
  if (command) {
    showCommandHelp(commandName);
    process.exit(0);
  }

  return false;
}

function parseExplainFlags(args: string[]): ExplainFlags | null {
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

function handleCliFlags(): HookMode | null {
  const args = process.argv.slice(2);

  // Handle "help <command>" pattern first
  if (handleHelpCommand(args)) {
    return null;
  }

  // Handle "<command> --help" pattern
  if (handleCommandHelp(args)) {
    return null;
  }

  if (args[0] === 'explain') {
    return 'explain';
  }

  if (args.length === 0 || hasHelpFlag(args)) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-V')) {
    printVersion();
    process.exit(0);
  }

  if (args.includes('--verify-config') || args.includes('-vc')) {
    process.exit(verifyConfig());
  }

  if (args.includes('--custom-rules-doc')) {
    printCustomRulesDoc();
    process.exit(0);
  }

  if (args.includes('doctor') || args.includes('--doctor')) {
    return 'doctor';
  }

  if (args.includes('--statusline')) {
    return 'statusline';
  }

  if (args.includes('--claude-code') || args.includes('-cc')) {
    return 'claude-code';
  }

  if (args.includes('--copilot-cli') || args.includes('-cp')) {
    return 'copilot-cli';
  }

  if (args.includes('--gemini-cli') || args.includes('-gc')) {
    return 'gemini-cli';
  }

  console.error(`Unknown option: ${args[0]}`);
  console.error("Run 'cc-safety-net --help' for usage.");
  process.exit(1);
}

function getDoctorFlags(): DoctorFlags {
  const args = process.argv.slice(2);
  return {
    json: args.includes('--json'),
    skipUpdateCheck: args.includes('--skip-update-check'),
  };
}

async function main(): Promise<void> {
  const mode = handleCliFlags();
  if (mode === 'claude-code') {
    await runClaudeCodeHook();
  } else if (mode === 'copilot-cli') {
    await runCopilotCliHook();
  } else if (mode === 'gemini-cli') {
    await runGeminiCLIHook();
  } else if (mode === 'statusline') {
    await printStatusline();
  } else if (mode === 'doctor') {
    const flags = getDoctorFlags();
    const exitCode = await runDoctor({
      json: flags.json,
      skipUpdateCheck: flags.skipUpdateCheck,
    });
    process.exit(exitCode);
  } else if (mode === 'explain') {
    const args = process.argv.slice(3);

    // Check for --help in explain args
    if (hasHelpFlag(args) || args.length === 0) {
      showCommandHelp('explain');
      process.exit(0);
    }

    const flags = parseExplainFlags(args);
    if (!flags) {
      process.exit(1);
    }

    const result = explainCommand(flags.command, { cwd: flags.cwd });
    const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;

    if (flags.json) {
      console.log(formatTraceJson(result));
    } else {
      console.log(formatTraceHuman(result, { asciiOnly }));
    }
    process.exit(0);
  }
}

main().catch((error: unknown) => {
  console.error('Safety Net error:', error);
  process.exit(1);
});
