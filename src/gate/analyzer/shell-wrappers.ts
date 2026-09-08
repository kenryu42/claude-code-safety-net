import { getBasename } from '@/core/shell/tokens';

const SHELL_SHORT_VALUE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  bash: ['O', 'o'],
  dash: ['o'],
  ksh: ['o'],
  sh: ['o'],
  zsh: ['o'],
};
const BASH_LONG_VALUE_OPTIONS = new Set(['--init-file', '--rcfile']);
const BASH_STARTUP_OPTIONS = ['--init-file', '--rcfile'] as const;

/** @internal */
export type ShellStartupEnvironmentName = 'BASH_ENV' | 'ENV';
/** @internal */
export type ShellStartupArgvSource =
  | { readonly kind: 'literal'; readonly value: string }
  | { readonly kind: 'absent' };
export type ShellStartupLoaderMetadata = {
  readonly argvSource: ShellStartupArgvSource | null;
  readonly argvSourceApplies: boolean;
  readonly envName: ShellStartupEnvironmentName | null;
  readonly envSourceApplies: boolean;
};

const SHELL_STARTUP_ENV_NAMES = new Map<string, ShellStartupEnvironmentName>([
  ['bash', 'BASH_ENV'],
  ['dash', 'ENV'],
  ['ksh', 'ENV'],
  ['sh', 'ENV'],
]);

export function extractDashCArg(tokens: readonly string[]): string | null {
  // Scan past "--" for compatibility with historical wrapper peeling behavior.
  // parseShellArgv() intentionally treats operands after "--" as script operands.
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    if (token === '-c') return getCommandStringAfterDashC(tokens, i, true);
    if (token.startsWith('-') && token.includes('c') && !token.startsWith('--')) {
      const command = getCommandStringAfterDashC(tokens, i, false);
      if (command !== null) return command;
    }
  }
  return null;
}

export function isShellSyntaxCheck(tokens: readonly string[]): boolean {
  // Prefer argv parser for shells that use -o option names (zsh/ksh), where a bare
  // "includes('n')" scan would misread -onotify as no-exec.
  const shell = getBasename(tokens[0] ?? '').toLowerCase();
  if (shell === 'zsh' || shell === 'ksh') return parseShellArgv(tokens).syntaxCheck;

  let enabled = false;
  for (const token of tokens.slice(1)) {
    if (token === '--') return enabled;
    if (token.startsWith('+') && !token.startsWith('++')) {
      if (token.slice(1).includes('n')) enabled = false;
      continue;
    }
    if (!token.startsWith('-') || token.startsWith('--')) return enabled;
    const flags = token.slice(1);
    if (flags.includes('n')) enabled = true;
    if (flags.includes('c')) return enabled;
  }
  return enabled;
}

function getCommandStringAfterDashC(
  tokens: readonly string[],
  dashCIndex: number,
  allowDashCommand: boolean,
): string | null {
  if (tokens[dashCIndex + 1] === '--') return tokens[dashCIndex + 2] || null;
  const commandString = tokens[dashCIndex + 1];
  if (!commandString || (!allowDashCommand && commandString.startsWith('-'))) return null;
  return commandString;
}

export function extractShellStartupLoaderMetadata(
  tokens: readonly string[],
): ShellStartupLoaderMetadata {
  const shell = getBasename(tokens[0] ?? '').toLowerCase();
  const parsed = parseShellStartupArgv(tokens, shell);
  const envName = SHELL_STARTUP_ENV_NAMES.get(shell) ?? null;
  const valid = parsed.argvSource?.kind !== 'absent';
  return {
    argvSource: shell === 'bash' ? parsed.argvSource : null,
    argvSourceApplies:
      shell === 'bash' && parsed.interactive && parsed.argvSource?.kind === 'literal',
    envName,
    envSourceApplies:
      valid &&
      (envName === 'BASH_ENV' ? !parsed.interactive : envName === 'ENV' && parsed.interactive),
  };
}

function parseShellStartupArgv(
  tokens: readonly string[],
  shell: string,
): { argvSource: ShellStartupArgvSource | null; interactive: boolean } {
  const parsed = parseShellArgv(tokens);
  const boundary = parsed.commandIndex ?? parsed.scriptIndex ?? tokens.length;
  const sources: ShellStartupArgvSource[] = [];
  let interactive = false;
  let bashLongOptionsOpen = true;

  for (let index = 1; index < boundary; index++) {
    const token = tokens[index];
    if (
      token === undefined ||
      token === '--' ||
      token === '-' ||
      (token[0] !== '-' && token[0] !== '+')
    ) {
      break;
    }

    if (token.startsWith('--')) {
      const option =
        shell === 'bash' && bashLongOptionsOpen
          ? BASH_STARTUP_OPTIONS.find((candidate) => token === candidate)
          : undefined;
      if (option) {
        const value = tokens[index + 1];
        sources.push(value === undefined ? { kind: 'absent' } : { kind: 'literal', value });
        index++;
        continue;
      }

      const longOption = token.split('=', 1)[0] ?? token;
      if (shell === 'bash' && BASH_LONG_VALUE_OPTIONS.has(longOption) && !token.includes('=')) {
        index++;
      }
      continue;
    }

    if (shell === 'bash') bashLongOptionsOpen = false;
    const shortScan = scanShellShortOptions(shell, token, tokens[index + 1], 'startup');
    if (shortScan.interactive) interactive = token[0] === '-';
    index += shortScan.followingValues;
  }

  return { argvSource: sources.at(-1) ?? null, interactive };
}

function scanShellShortOptions(
  shell: string,
  token: string,
  nextToken: string | undefined,
  mode: 'startup' | 'argv',
): {
  interactive: boolean;
  followingValues: number;
  commandSelected: boolean;
  stdinMode: boolean;
  syntaxCheck: boolean;
} {
  let interactive = false;
  let followingValues = 0;
  let commandSelected = false;
  let stdinMode = false;
  let syntaxCheck = false;
  for (let optionIndex = 1; optionIndex < token.length; optionIndex++) {
    const option = token[optionIndex];
    if (option === undefined) break;
    if (shell === 'ksh' && option === 'o' && optionIndex + 1 < token.length) {
      if (mode === 'argv') {
        const optionName = token.slice(optionIndex + 1);
        if (
          token[0] === '-' &&
          (optionName === 'c' || (optionName[0] === '-' && optionName.endsWith('c')))
        ) {
          commandSelected = true;
        }
      }
      break;
    }
    if (
      shell === 'ksh' &&
      option === 'o' &&
      optionIndex + 1 === token.length &&
      (nextToken?.startsWith('-') || nextToken?.startsWith('+'))
    ) {
      break;
    }
    if (shell === 'zsh' && option === 'o' && optionIndex + 1 < token.length) break;
    if (mode === 'startup' && option === 'i') interactive = token[0] === '-';
    if (mode === 'argv' && token[0] === '-' && option === 'c') commandSelected = true;
    if (mode === 'argv' && option === 'n') syntaxCheck = token[0] === '-';
    if (mode === 'argv' && option === 's') stdinMode = token[0] === '-';
    if (!SHELL_SHORT_VALUE_OPTIONS[shell]?.includes(option)) continue;
    if (optionIndex + 1 === token.length) followingValues++;
    break;
  }
  return { interactive, followingValues, commandSelected, stdinMode, syntaxCheck };
}

export function parseShellArgv(tokens: readonly string[]) {
  const shell = getBasename(tokens[0] ?? '').toLowerCase();
  let commandSelected = false;
  let stdinMode = false;
  let syntaxCheck = false;

  for (let index = 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === undefined) break;
    if (token === '--') {
      const commandIndex = commandSelected && tokens[index + 1] !== undefined ? index + 1 : null;
      return {
        command: commandIndex === null ? null : (tokens[commandIndex] ?? null),
        commandIndex,
        scriptIndex:
          !commandSelected && !stdinMode && tokens[index + 1] !== undefined ? index + 1 : null,
        readsStdinAsCommands: !commandSelected && (stdinMode || tokens[index + 1] === undefined),
        syntaxCheck,
      };
    }
    if (token === '-' || (token[0] !== '-' && token[0] !== '+')) {
      return {
        command: commandSelected ? token : null,
        commandIndex: commandSelected ? index : null,
        scriptIndex: !commandSelected && !stdinMode && token !== '-' ? index : null,
        readsStdinAsCommands: !commandSelected && (stdinMode || token === '-'),
        syntaxCheck,
      };
    }
    if (token.startsWith('--')) {
      const option = token.split('=', 1)[0] ?? token;
      if (shell === 'bash' && BASH_LONG_VALUE_OPTIONS.has(option) && !token.includes('=')) index++;
      continue;
    }

    const shortScan = scanShellShortOptions(shell, token, tokens[index + 1], 'argv');
    if (shortScan.commandSelected) commandSelected = true;
    if (shortScan.syntaxCheck) syntaxCheck = true;
    if (shortScan.stdinMode) stdinMode = true;
    index += shortScan.followingValues;
  }

  return {
    command: null,
    commandIndex: null,
    scriptIndex: null,
    readsStdinAsCommands: !commandSelected,
    syntaxCheck,
  };
}
