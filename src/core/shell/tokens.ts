export function normalizeCommandToken(token: string): string {
  return getBasename(token).toLowerCase();
}

export function getBasename(token: string): string {
  return (
    token
      .split(/[\\/]/)
      .pop()
      ?.replace(/\.exe$/i, '') ?? token
  );
}

export function extractShortOpts(
  tokens: readonly string[],
  options?: { readonly shortOptsWithValue?: ReadonlySet<string> },
): Set<string> {
  const opts = new Set<string>();
  let pastDoubleDash = false;

  for (const token of tokens) {
    if (token === '--') {
      pastDoubleDash = true;
      continue;
    }
    if (pastDoubleDash) continue;

    if (token.startsWith('-') && !token.startsWith('--') && token.length > 1) {
      for (let i = 1; i < token.length; i++) {
        const char = token[i];
        if (!char || !/[a-zA-Z]/.test(char)) {
          break;
        }
        const shortOpt = `-${char}`;
        opts.add(shortOpt);
        if (options?.shortOptsWithValue?.has(shortOpt)) {
          break;
        }
      }
    }
  }

  return opts;
}

const SHORT_VALUE_OPTIONS = new Map([
  ['bash', new Set(['O', 'o'])],
  ['dash', new Set(['o'])],
  ['ksh', new Set(['o'])],
  ['sh', new Set(['o'])],
  ['zsh', new Set(['o'])],
]);
const ATTACHED_SHORT_VALUE_OPTIONS = new Map([['zsh', new Set(['o'])]]);
const LONG_VALUE_OPTIONS = new Map([['bash', new Set(['--init-file', '--rcfile'])]]);

/** Returns the command string selected by shell argv before any script positional. */
export function getShellCommandString(command: string, args: readonly string[]): string | null {
  for (let index = 0; index < args.length; index++) {
    const token = args[index];
    if (
      token === undefined ||
      token === '--' ||
      token === '-' ||
      (token[0] !== '-' && token[0] !== '+')
    ) {
      return null;
    }
    if (token.startsWith('--')) {
      const longValueOptions = LONG_VALUE_OPTIONS.get(command);
      if (hasAttachedLongValue(token, longValueOptions)) continue;
      if (!longValueOptions?.has(token)) continue;
      if (args[index + 1] === undefined) return null;
      index++;
      continue;
    }
    const shortOptions = parseShortOptions(command, token);
    if (shortOptions.commandSelected) {
      return args[index + shortOptions.followingValues + 1] ?? null;
    }
    const next = args[index + 1];
    if (
      command === 'ksh' &&
      (token === '-o' || token === '+o') &&
      next !== undefined &&
      next[0] !== '-' &&
      next[0] !== '+'
    ) {
      index++;
    }
    index += shortOptions.followingValues;
  }
  return null;
}

function parseShortOptions(command: string, token: string) {
  const valueOptions = SHORT_VALUE_OPTIONS.get(command);
  const attachedValueOptions = ATTACHED_SHORT_VALUE_OPTIONS.get(command);
  let commandSelected = false;
  let followingValues = 0;
  for (let index = 1; index < token.length; index++) {
    const option = token[index];
    if (option === undefined) break;
    if (token[0] === '-' && option === 'c') commandSelected = true;
    if (command === 'ksh' && option === 'o') {
      if (index + 1 < token.length) {
        const optionName = token.slice(index + 1);
        if (!commandSelected && token[0] === '-' && optionName === 'c') continue;
        if (
          !commandSelected &&
          token[0] === '-' &&
          optionName[0] === '-' &&
          optionName.endsWith('c')
        ) {
          commandSelected = true;
        }
        break;
      }
      if (commandSelected) followingValues++;
      continue;
    }
    if (!valueOptions?.has(option)) continue;
    if (attachedValueOptions?.has(option) && index + 1 < token.length) break;
    followingValues++;
  }
  return { commandSelected, followingValues };
}

function hasAttachedLongValue(token: string, options: ReadonlySet<string> | undefined): boolean {
  return options !== undefined && [...options].some((option) => token.startsWith(`${option}=`));
}

export type QuoteScanState = {
  inSingle: boolean;
  inDouble: boolean;
  escaped: boolean;
};

export function advanceQuoteScanState(char: string, state: QuoteScanState): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }

  if (char === '\\' && !state.inSingle) {
    state.escaped = true;
    return true;
  }

  if (char === "'" && !state.inDouble) {
    state.inSingle = !state.inSingle;
    return true;
  }

  if (char === '"' && !state.inSingle) {
    state.inDouble = !state.inDouble;
    return true;
  }

  return false;
}

export function hasUnclosedQuotes(command: string): boolean {
  const state: QuoteScanState = { inSingle: false, inDouble: false, escaped: false };

  for (const char of stripShellComments(command)) {
    advanceQuoteScanState(char, state);
  }

  return state.inSingle || state.inDouble;
}

function stripShellComments(command: string): string {
  let result = '';
  const state: QuoteScanState = { inSingle: false, inDouble: false, escaped: false };
  let inComment = false;
  let atTokenStart = true;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (!char) break;

    if (inComment) {
      if (char === '\n' || char === '\r') {
        result += char;
        inComment = false;
        state.escaped = false;
      }
      continue;
    }

    if (char === '#' && !state.inSingle && !state.inDouble && atTokenStart) {
      inComment = true;
      continue;
    }

    result += char;
    if (!state.inSingle && !state.inDouble && !state.escaped) {
      atTokenStart = /[\s;&|()<>]/.test(char);
    }
    advanceQuoteScanState(char, state);
  }

  return result;
}
