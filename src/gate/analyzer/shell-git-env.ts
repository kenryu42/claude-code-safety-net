import { isGitConfigEnvName } from '@/core/git/worktree';
import {
  GIT_SSH_ENV_NAMES,
  isGitContextEnvOverrideName,
  isTrackedGitEnvName,
  parseGitContextAppendEnvAssignment,
} from './git/env';
import { parseEnvAssignment } from './wrapper-prelude';

export interface ShellGitContextEnvState {
  /** Inherited process environment the shell starts from. */
  env: ReadonlyMap<string, string>;
  effectiveEnvAssignments?: ReadonlyMap<string, string>;
  shellAssignments: Map<string, string>;
}

interface GitContextAssignment {
  name: string;
  value: string;
}

interface SegmentGitContextAssignment extends GitContextAssignment {
  /** False for assignments that only prefix a command word, which a shell scopes to it. */
  persists: boolean;
}

const TMPDIR_ENV_NAME = 'TMPDIR';
const IFS_ENV_NAME = 'IFS';
const ENV_APPEND_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)\+=/;
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Builtins that can publish an already declared name to later commands. */
const EXPORT_BUILTINS = new Set(['export', 'typeset', 'declare', 'readonly']);
/** Prefixes that invoke a shell builtin, so the builtin's operands still declare names. */
const BUILTIN_CALL_PREFIXES = new Set(['builtin', 'command', 'time']);

export function createShellGitContextEnvState(
  env: ReadonlyMap<string, string>,
  effectiveEnvAssignments?: ReadonlyMap<string, string>,
): ShellGitContextEnvState {
  return {
    env,
    effectiveEnvAssignments: getInitialEffectiveShellEnvAssignments(env, effectiveEnvAssignments),
    shellAssignments: new Map(),
  };
}

export function cloneShellGitContextEnvState(
  state: ShellGitContextEnvState,
): ShellGitContextEnvState {
  return {
    env: state.env,
    effectiveEnvAssignments: state.effectiveEnvAssignments
      ? new Map(state.effectiveEnvAssignments)
      : undefined,
    shellAssignments: new Map(state.shellAssignments),
  };
}

/**
 * A recognized assignment is effective for later segments unless it merely prefixes a
 * command word, which scopes it to that command. An export-family builtin naming a
 * tracked variable publishes it too. Exotic export-state manipulation is not emulated:
 * it can only withhold the worktree relaxation.
 */
export function applyShellGitContextEnvSegment(
  tokens: readonly string[],
  state: ShellGitContextEnvState,
): void {
  const segment = collectSegmentEnvAssignments(tokens, state);

  segment.assignments
    .filter((assignment) => assignment.persists)
    .forEach((assignment) => {
      state.shellAssignments.set(assignment.name, assignment.value);
      setEffectiveGitContextAssignment(state, assignment);
    });

  const commandIndex = segment.commandIndex;
  if (commandIndex !== -1 && EXPORT_BUILTINS.has(tokens[commandIndex] ?? '')) {
    tokens
      .filter((token) => ENV_NAME_RE.test(token) && isTrackedShellEnvName(token))
      .forEach((name) => {
        exportTrackedGitContextEnvName(state, name);
      });
  }

  const invokedIndex = commandIndex === -1 ? -1 : resolveInvokedWordIndex(tokens, commandIndex);
  if (invokedIndex === -1 || tokens[invokedIndex] !== 'unset') {
    return;
  }
  const operandsStart = getUnsetOperandsStart(tokens, invokedIndex);
  if (operandsStart === null) {
    return;
  }
  tokens.slice(operandsStart).forEach((name) => {
    unsetTrackedGitContextEnvName(state, name);
  });
}

export function getSegmentGitContextEnvAssignments(
  tokens: readonly string[],
  state: ShellGitContextEnvState,
): ReadonlyMap<string, string> | undefined {
  const assignments = collectSegmentEnvAssignments(tokens, state).assignments;
  if (assignments.length === 0) {
    return state.effectiveEnvAssignments;
  }

  const nextEnvAssignments = new Map(state.effectiveEnvAssignments ?? []);
  assignments.forEach((assignment) => {
    nextEnvAssignments.set(assignment.name, assignment.value);
  });
  return nextEnvAssignments;
}

/**
 * Assignments before the command word set the environment; a `NAME=value` token after
 * it is a command argument, unless an export-family builtin declares its operands.
 * Worktree override names count wherever they appear, so their presence alone keeps
 * the relaxation withheld.
 */
function collectSegmentEnvAssignments(
  tokens: readonly string[],
  state: ShellGitContextEnvState,
): { assignments: readonly SegmentGitContextAssignment[]; commandIndex: number } {
  const commandIndex = tokens.findIndex((token) => !isEnvAssignmentToken(token));
  const declaresOperands =
    commandIndex !== -1 &&
    EXPORT_BUILTINS.has(tokens[resolveInvokedWordIndex(tokens, commandIndex)] ?? '');
  const currentValues = getCurrentShellAssignmentValues(state);

  const assignments = tokens.flatMap((token, index) => {
    const assignment = parseShellContextEnvAssignment(token, currentValues, state.env);
    if (!assignment) {
      return [];
    }
    if (
      commandIndex !== -1 &&
      index > commandIndex &&
      !declaresOperands &&
      !isGitContextEnvOverrideName(assignment.name)
    ) {
      return [];
    }
    currentValues.set(assignment.name, assignment.value);
    return [
      {
        ...assignment,
        persists: commandIndex === -1 || declaresOperands,
      },
    ];
  });

  return { assignments, commandIndex };
}

/** Skips `builtin`/`command`/`time` prefixes and their options to the word they invoke. */
function resolveInvokedWordIndex(tokens: readonly string[], commandIndex: number): number {
  let index = commandIndex;
  while (BUILTIN_CALL_PREFIXES.has(tokens[index] ?? '')) {
    index += 1;
    while (tokens[index]?.startsWith('-')) {
      // `command -v`/`-V` only reports availability; nothing is invoked.
      if (/^-p*[vV][pvV]*$/.test(tokens[index] ?? '')) {
        return commandIndex;
      }
      index += 1;
    }
  }
  return index;
}

function isEnvAssignmentToken(token: string): boolean {
  return parseEnvAssignment(token) !== null || ENV_APPEND_ASSIGNMENT_RE.test(token);
}

function parseShellContextEnvAssignment(
  token: string,
  currentValues: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): GitContextAssignment | null {
  return parseEnvAssignment(token) ?? parseAppendEnvAssignment(token, currentValues, env);
}

function parseAppendEnvAssignment(
  token: string,
  currentValues: ReadonlyMap<string, string>,
  env: ReadonlyMap<string, string>,
): GitContextAssignment | null {
  const gitAssignment = parseGitContextAppendEnvAssignment(token, env, currentValues);
  if (gitAssignment) return gitAssignment;

  const name = token.match(ENV_APPEND_ASSIGNMENT_RE)?.[1];
  if (!name) return null;
  const eqIdx = token.indexOf('=');
  return {
    name,
    value: `${currentValues.has(name) ? currentValues.get(name) : (env.get(name) ?? '')}${token.slice(eqIdx + 1)}`,
  };
}

function isTrackedShellEnvName(name: string): boolean {
  return name === TMPDIR_ENV_NAME || name === IFS_ENV_NAME || isTrackedGitEnvName(name);
}

function getCurrentShellAssignmentValues(state: ShellGitContextEnvState): Map<string, string> {
  return new Map([...(state.effectiveEnvAssignments ?? []), ...state.shellAssignments]);
}

function getInitialEffectiveShellEnvAssignments(
  env: ReadonlyMap<string, string>,
  effectiveEnvAssignments?: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> | undefined {
  const inheritedAssignments = [...GIT_SSH_ENV_NAMES, TMPDIR_ENV_NAME, IFS_ENV_NAME]
    .map((name) => {
      const value = env.get(name);
      return value === undefined ? null : ([name, value] as const);
    })
    .filter((assignment): assignment is readonly [string, string] => assignment !== null);

  if (inheritedAssignments.length === 0) {
    return effectiveEnvAssignments;
  }

  return new Map([...inheritedAssignments, ...(effectiveEnvAssignments ?? [])]);
}

function setEffectiveGitContextAssignment(
  state: ShellGitContextEnvState,
  assignment: GitContextAssignment,
): void {
  const nextEnvAssignments = new Map(state.effectiveEnvAssignments ?? []);
  nextEnvAssignments.set(assignment.name, assignment.value);
  state.effectiveEnvAssignments = nextEnvAssignments;
}

function exportTrackedGitContextEnvName(state: ShellGitContextEnvState, name: string): void {
  setEffectiveGitContextAssignment(state, {
    name,
    value:
      state.shellAssignments.get(name) ??
      state.effectiveEnvAssignments?.get(name) ??
      state.env.get(name) ??
      '',
  });
}

function unsetTrackedGitContextEnvName(state: ShellGitContextEnvState, name: string): void {
  if (!isTrackedShellEnvName(name) && !ENV_NAME_RE.test(name)) {
    return;
  }
  state.shellAssignments.set(name, '');
  if (
    !isTrackedShellEnvName(name) ||
    name === TMPDIR_ENV_NAME ||
    name === IFS_ENV_NAME ||
    isGitConfigEnvName(name)
  ) {
    setEffectiveGitContextAssignment(state, { name, value: '' });
    return;
  }
  if (!state.effectiveEnvAssignments?.has(name)) {
    return;
  }

  const nextEnvAssignments = new Map(state.effectiveEnvAssignments);
  nextEnvAssignments.delete(name);
  state.effectiveEnvAssignments = nextEnvAssignments.size === 0 ? undefined : nextEnvAssignments;
}

function getUnsetOperandsStart(tokens: readonly string[], commandIndex: number): number | null {
  let i = commandIndex + 1;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      return null;
    }
    if (token === '--') {
      return i + 1;
    }
    if (token === '-v') {
      i++;
      continue;
    }
    if (token.startsWith('-')) {
      return null;
    }
    return i;
  }
  return i;
}
