import {
  AWK_INTERPRETERS,
  INTERPRETERS,
  PYTHON_INTERPRETER_PATTERN,
  SHELL_WRAPPERS,
} from '@/core/rules/constants';
import { getBasename, normalizeCommandToken } from '@/core/shell/tokens';

/** Commands the analyzer inspects itself, so a wrapper may never claim their names. */
export const BUILTIN_ANALYZED_COMMANDS = new Set(['rm', 'find', 'xargs', 'parallel']);
const RESERVED_TRANSPARENT_WRAPPERS = new Set([
  'git',
  'busybox',
  ...BUILTIN_ANALYZED_COMMANDS,
  ...SHELL_WRAPPERS,
  ...INTERPRETERS,
  ...AWK_INTERPRETERS,
]);

/** The interpreters that take code on the command line; the analyzer's code-flag table keys. */
const CODE_FLAG_INTERPRETERS = new Set(['python', 'node', 'ruby', 'perl']);

export function isReservedTransparentWrapper(command: string): boolean {
  const normalized = normalizeCommandToken(command);
  return RESERVED_TRANSPARENT_WRAPPERS.has(normalized) || isInterpreterCommand(normalized);
}

export function isInterpreterCommand(command: string): boolean {
  return CODE_FLAG_INTERPRETERS.has(normalizeInterpreter(command));
}

function normalizeInterpreter(command: string): string {
  const interpreter = getBasename(command).toLowerCase();
  return PYTHON_INTERPRETER_PATTERN.test(interpreter) ? 'python' : interpreter;
}
