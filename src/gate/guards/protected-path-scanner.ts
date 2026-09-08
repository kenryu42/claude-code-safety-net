import type { Budget } from '@/core/budget';
import type { ShellSyntaxFacts } from '@/core/shell/projection';
import { getBasename } from '@/core/shell/tokens';
import type { EnvironmentContext } from '@/gate/analysis';
import { stripWrappers } from '@/gate/analyzer/wrapper-prelude';
import { StructuralShellSyntaxLimitError } from './semantic-facts';

export type ProtectedPathShellState = Readonly<{
  cwd: string;
  variables: ReadonlyMap<string, string>;
}>;

const MV_OPTIONS_WITH_VALUES = new Set(['-S', '--suffix']);

type ProtectedPathCommandScanner = Readonly<{
  findSegmentTarget: (segment: readonly string[], state: ProtectedPathShellState) => string | null;
  isRedirectionTarget: (target: string, state: ProtectedPathShellState) => boolean;
  findMalformedTarget: (source: string) => string | null;
  normalizeCwd: (
    target: string,
    cwd: string,
    environment: EnvironmentContext,
    budget: Budget,
  ) => string;
}>;

export function findProtectedPathMutationInCommand(
  syntax: ShellSyntaxFacts,
  cwd: string,
  environment: EnvironmentContext,
  budget: Budget,
  scanner: ProtectedPathCommandScanner,
): string | null {
  if (syntax.status === 'structural-limit') throw new StructuralShellSyntaxLimitError();
  if (syntax.status !== 'complete') return scanner.findMalformedTarget(syntax.source);

  let state: ProtectedPathShellState = { cwd, variables: new Map() };
  let segment: string[] = [];
  for (const entry of syntax.entries) {
    if (entry.kind === 'operator') {
      if (!entry.boundary) continue;
      const target = scanner.findSegmentTarget(segment, state);
      if (target) return target;
      state = applyShellState(segment, state, environment, budget, scanner.normalizeCwd);
      segment = [];
      continue;
    }
    if (entry.kind === 'redirection') {
      if (
        entry.role === 'file-write' &&
        entry.target &&
        scanner.isRedirectionTarget(
          expandTrackedShellVariables(entry.target, state.variables),
          state,
        )
      ) {
        return entry.target;
      }
      continue;
    }
    segment.push(entry.text);
  }
  return scanner.findSegmentTarget(segment, state);
}

export function expandTrackedShellVariables(
  text: string,
  variables: ReadonlyMap<string, string>,
): string {
  return text
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-+])([^}]*)\}/g,
      (match, name: string, operator: string, word: string) => {
        const value = variables.get(name);
        if (value === undefined) return match;
        const usable = operator.startsWith(':') ? value !== '' : true;
        if (operator.endsWith('-')) {
          return usable ? value : expandTrackedShellVariables(word, variables);
        }
        return usable ? expandTrackedShellVariables(word, variables) : '';
      },
    )
    .replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
      (match, name: string) => variables.get(name) ?? match,
    )
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, name: string) => variables.get(name) ?? match);
}

export function isAssignmentOnlySegment(tokens: readonly string[]): boolean {
  return tokens.length > 0 && tokens.every((token) => /^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token));
}

export function extractMvOperandPaths(args: readonly string[]): {
  sources: readonly string[];
  destination: string | null;
} {
  const operands: string[] = [];
  let targetDirectory: string | null = null;
  let optionsEnded = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === undefined) break;
    if (!optionsEnded && arg === '--') {
      optionsEnded = true;
      continue;
    }
    if (!optionsEnded && (arg === '-t' || arg === '--target-directory')) {
      targetDirectory = args[++index] ?? null;
      continue;
    }
    if (!optionsEnded && arg.startsWith('--target-directory=')) {
      targetDirectory = arg.slice('--target-directory='.length);
      continue;
    }
    if (!optionsEnded && arg.startsWith('-t') && arg.length > 2) {
      targetDirectory = arg.slice(2);
      continue;
    }
    if (!optionsEnded && MV_OPTIONS_WITH_VALUES.has(arg)) {
      index++;
      continue;
    }
    if (!optionsEnded && (arg.startsWith('--suffix=') || arg.startsWith('--backup='))) continue;
    if (!optionsEnded && arg.startsWith('-')) continue;
    operands.push(arg);
  }
  return targetDirectory
    ? { sources: operands, destination: targetDirectory }
    : { sources: operands.slice(0, -1), destination: operands.at(-1) ?? null };
}

/**
 * One segment's effect on the tracked shell state: an assignment-only segment extends the
 * variables, a `cd` after wrapper stripping moves the cwd through `normalizeCwd`, and a bare `cd`
 * or `cd -` leaves it where it was. Shared by the protected-path guards through
 * `findProtectedPathMutationInCommand` and by the secret matcher's own walk, so a relative operand
 * resolves against the same directory in both.
 */
export function applyShellState(
  segment: readonly string[],
  state: ProtectedPathShellState,
  environment: EnvironmentContext,
  budget: Budget,
  normalizeCwd: ProtectedPathCommandScanner['normalizeCwd'],
): ProtectedPathShellState {
  const variables = isAssignmentOnlySegment(segment)
    ? new Map([...state.variables, ...extractShellAssignments(segment, state.variables)])
    : state.variables;
  const stripped = stripWrappers([...segment], environment);
  const target = getBasename(stripped[0] ?? '').toLowerCase() === 'cd' ? stripped[1] : undefined;
  return {
    cwd:
      !target || target === '-'
        ? state.cwd
        : normalizeCwd(
            expandTrackedShellVariables(target, variables),
            state.cwd,
            environment,
            budget,
          ),
    variables,
  };
}

function extractShellAssignments(
  segment: readonly string[],
  variables: ReadonlyMap<string, string>,
): readonly [string, string][] {
  return segment.flatMap((token): [string, string][] => {
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)(.*)$/.exec(token);
    const value = assignment?.[2]?.startsWith('=') ? assignment[2].slice(1) : undefined;
    return assignment?.[1] !== undefined && value !== undefined
      ? [[assignment[1], expandTrackedShellVariables(value, variables)]]
      : [];
  });
}
