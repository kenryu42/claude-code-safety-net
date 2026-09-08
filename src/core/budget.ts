/**
 * Every cap the shipped analyzer enforces, in one table, so a breach anywhere in the gate reports
 * through one path: `AnalysisLimit{kind}` → `errorCode` (the public audit classes) → `reason`.
 *
 * Inventory of the caps in `src/` (value; reason wording today; error code today):
 *
 * Path canonicalization (`src/core/paths/canonicalization.ts`, `PATH_CANONICALIZATION_LIMITS`)
 * - realpath attempts 16,384 and processed candidate bytes 4 MiB: `PathCanonicalizationLimitError`
 *   → `path-canonicalization-limit`, "exceeds safe analysis limits. Simplify or split…" — except
 *   where a caller swallows it: `src/gate/analyzer/recursive-delete-targets.ts` (cwd, home, allow-path
 *   and workspace comparisons fall back to lexical or to false), `src/gate/analyzer/heredoc-files.ts`
 *   (the tracked path is dropped) and `src/gate/guards/git-metadata-protection.ts` (the anchor is
 *   dropped): none, caught silently. `src/gate/secret/secret-protection.ts` rethrows it.
 * - environment expansion depth 64, and the unsupported forms `${NAME=…}`, `${NAME:?…}` on an
 *   unusable value, an unknown operator on a supported name and an unterminated `${NAME`: the same
 *   error, code and wording.
 * - missing suffix components 256: not a breach; the walk stops and returns the lexical join.
 *
 * Structural shell syntax (`src/gate/guards/semantic-facts.ts`): a guard that meets a nested program
 * with status `limited` throws `StructuralShellSyntaxLimitError` → `structural-shell-syntax-limit`,
 * "exceeds safe analysis limits. Simplify or split…". The parser caps themselves
 * (`src/core/shell/parse.ts`: 131,072 code units, 16,384 words, depth 64; `projection.ts`:
 * 256 function expansions) stay in the parser as status `limited`; the top-level program denies
 * with the recursion or structural-validation wording without throwing.
 *
 * Derived command work (`derivedTokens` in the table below and the sites sharing its error):
 * derived tokens 16,384; tracked heredoc files 64 (`src/gate/analyzer/heredoc-files.ts`); control-flow
 * states 64 per deduplication (`src/gate/analyzer/analyze-command.ts`); wrapper peel iterations 20
 * (`src/core/rules/constants.ts`, `src/gate/analyzer/segment.ts`; also a plain loop bound in
 * `wrapper-prelude.ts`); and a `command` wrapper still at the head after peeling. All caught in
 * `analyzeCommandInternal` → deny "exceeds CC Safety Net's derived-command work limit…": none,
 * an ordinary deny.
 *
 * Recursion depth 10 (`src/core/rules/constants.ts`): a returned deny "exceeds maximum recursion
 * depth…": none, an ordinary deny.
 *
 * Parallel (`src/gate/analyzer/parallel-budget.ts`): child analyses 1,024; derived tokens 16,384;
 * derived bytes 1 MiB; placeholder replacements 16,384. Caught in `analyzeCommandInternal` → deny
 * "Parallel command expands beyond CC Safety Net's analysis limits…": none, an ordinary deny.
 *
 * The table below keeps both sentences above as the reason of the kinds that report them, so the
 * denial text a user reads is unchanged. What the unification adds is the classification: the
 * pipeline catches an analyzer-cap breach, answers with the same ordinary denial `src` returns,
 * and attaches the kind's `errorCode` to the evaluation for the audit.
 *
 * Not breaches (no entry below): text-scanner work units (`src/gate/analyzer/text-scanner.ts`) are a
 * measurement the linear-scan tests read; positional expansion (`src/gate/analyzer/shell-execution.ts`,
 * 16,384 words / 131,072 characters) makes the source dynamic; git alias depth 5
 * (`src/gate/analyzer/git/parse.ts`) stops expanding; the path-scan splice depth 8
 * (`src/gate/analyzer/wrapper-prelude.ts`) returns the spliced view.
 *
 * Rule-visible (no entry below, per design §8.2): brace expansion of rm targets 64 words / 64
 * expansions / 16,384 characters (`src/gate/analyzer/recursive-delete-targets.ts`) classifies the
 * target as outside the anchored cwd under an `rm.*` rule; `GIT_CONFIG_COUNT` above 1,024
 * (`src/gate/analyzer/git/env.ts`) is `git.alias-config`; an `env -S` splice above 64 words
 * (`src/gate/analyzer/wrapper-prelude.ts`) falls back to the raw-text scan.
 *
 * Intake, checked before a Budget exists: hook stdin 8 MiB (`src/hosts/hook/common.ts`)
 * → deny "Failed to parse hook input JSON." with no audit record: none; tool-input traversal
 * (`src/core/tool-input.ts`: depth 64, nodes 10,000, keys 10,000, string 1 MiB, aggregate
 * strings 4 MiB, git-diff fallback candidates 64, and the shape refusals: accessor property,
 * proxy, inherited `command`, cycle) → `ToolInputLimitError` → `tool-input-limit`, "failed closed
 * because command analysis failed unexpectedly…" with the command omitted from the evidence.
 *
 * Outside analysis and not listed: audit field truncation (`src/audit/writer.ts`), custom-rule
 * reason length 256 (`src/core/rules/constants.ts`), rulebook, fetch and retention limits.
 */

export const REASON_COMMAND_ANALYSIS_LIMIT =
  'CC Safety Net could not analyze the command because it exceeds safe analysis limits. Simplify or split the command and retry.';

export const REASON_RECURSION_LIMIT =
  'Command exceeds maximum recursion depth and cannot be safely analyzed. Flatten the nesting and retry.';

export const REASON_SAFETY_NET_FAILED_CLOSED =
  'CC Safety Net failed closed because command analysis failed unexpectedly. This is not caused by your command. Report it to the user.';

const REASON_HOOK_INPUT_UNREADABLE = 'Failed to parse hook input JSON.';

/** @internal */
export const REASON_DERIVED_COMMAND_WORK_LIMIT =
  "Command analysis exceeds CC Safety Net's derived-command work limit. Reduce nested or embedded command complexity and retry.";

/** @internal */
export const REASON_PARALLEL_ANALYSIS_LIMIT =
  "Parallel command expands beyond CC Safety Net's analysis limits. Reduce the template or explicit argument list and retry.";

/** The audit error classes a limit breach maps to; `unexpected-error` is for everything else. */
export type AnalysisErrorCode =
  | 'path-canonicalization-limit'
  | 'tool-input-limit'
  | 'structural-shell-syntax-limit';

type Limit = { cap?: number; errorCode: AnalysisErrorCode; reason: string };

const PATH = {
  errorCode: 'path-canonicalization-limit',
  reason: REASON_COMMAND_ANALYSIS_LIMIT,
} as const;
const STRUCTURAL = {
  errorCode: 'structural-shell-syntax-limit',
  reason: REASON_COMMAND_ANALYSIS_LIMIT,
} as const;
const TOOL_INPUT = {
  errorCode: 'tool-input-limit',
  reason: REASON_SAFETY_NET_FAILED_CLOSED,
} as const;
const DERIVED = {
  errorCode: 'structural-shell-syntax-limit',
  reason: REASON_DERIVED_COMMAND_WORK_LIMIT,
} as const;
const PARALLEL = {
  errorCode: 'structural-shell-syntax-limit',
  reason: REASON_PARALLEL_ANALYSIS_LIMIT,
} as const;

export const LIMITS = Object.freeze({
  realpathAttempts: { cap: 16_384, ...PATH },
  processedCandidateBytes: { cap: 4 * 1024 * 1024, ...PATH },
  /** Nesting depth of `${…}` expansions; the unsupported forms fail closed under this kind too. */
  pathEnvironmentExpansion: { cap: 64, ...PATH },
  /** A nested program the parser reported `limited`; the parser's own caps decide. */
  structuralShellSyntax: STRUCTURAL,
  /** Compared by the analyzer, which returns the recursion denial on the open segment; never thrown. */
  recursionDepth: {
    cap: 10,
    errorCode: 'structural-shell-syntax-limit',
    reason: REASON_RECURSION_LIMIT,
  },
  derivedTokens: { cap: 16_384, ...DERIVED },
  /** Per state list, compare directly; do not charge. */
  trackedHeredocFiles: { cap: 64, ...DERIVED },
  /** Per deduplication of one state list, not cumulative: compare against the cap directly. */
  controlFlowStates: { cap: 64, ...DERIVED },
  /**
   * Per segment peel and per child normalization, compare directly; also thrown for a `command`
   * wrapper still at the head.
   */
  wrapperPeelIterations: { cap: 20, ...DERIVED },
  /**
   * A derived child command the analyzer cannot normalize: no candidate, or an `env -S` value
   * that needs the quote language.
   */
  derivedCommandShape: DERIVED,
  parallelChildAnalyses: { cap: 1_024, ...PARALLEL },
  parallelDerivedTokens: { cap: 16_384, ...PARALLEL },
  parallelDerivedBytes: { cap: 1024 * 1024, ...PARALLEL },
  parallelPlaceholderReplacements: { cap: 16_384, ...PARALLEL },
  hookInputBytes: {
    cap: 8 * 1024 * 1024,
    errorCode: 'tool-input-limit',
    reason: REASON_HOOK_INPUT_UNREADABLE,
  },
  /** A depth that unwinds, not a running total: compare against the cap and throw; do not charge. */
  toolInputDepth: { cap: 64, ...TOOL_INPUT },
  toolInputNodes: { cap: 10_000, ...TOOL_INPUT },
  toolInputKeys: { cap: 10_000, ...TOOL_INPUT },
  /** Per string, not cumulative (the aggregate is the next kind): compare and throw; do not charge. */
  toolInputStringBytes: { cap: 1024 * 1024, ...TOOL_INPUT },
  toolInputAggregateStringBytes: { cap: 4 * 1024 * 1024, ...TOOL_INPUT },
  toolInputGitDiffCandidates: { cap: 64, ...TOOL_INPUT },
  /** An accessor property, proxy, inherited `command` or cycle in the tool input. */
  toolInputShape: TOOL_INPUT,
} satisfies Record<string, Limit>);

export type LimitKind = keyof typeof LIMITS;

/** The kinds with a numeric cap: the ones a Budget counts. The rest are thrown by their caller. */
export type CountedKind = {
  [K in LimitKind]: (typeof LIMITS)[K] extends { cap: number } ? K : never;
}[LimitKind];

/** The one exception thrown on purpose inside the gate; the pipeline's catch boundary maps it. */
export class AnalysisLimit extends Error {
  override readonly name = 'AnalysisLimit';

  constructor(readonly kind: LimitKind) {
    super(LIMITS[kind].reason);
  }
}

/** Independent counters for one gate call; a counter past its cap throws `AnalysisLimit`. */
export function createBudget() {
  const counters = new Map<CountedKind, number>();
  return {
    counters,
    /** Paths already canonicalized in this call, keyed by the requested path. */
    resolvedPaths: new Map<string, string>(),
    charge(kind: CountedKind, units = 1): void {
      const total = (counters.get(kind) ?? 0) + units;
      counters.set(kind, total);
      if (total > LIMITS[kind].cap) throw new AnalysisLimit(kind);
    },
  };
}

export type Budget = ReturnType<typeof createBudget>;
