/**
 * Runs the explain command and reports its exit code to the CLI entry point.
 *
 * The trace is written here rather than in the entry point so the write can be awaited:
 * `process.exit` drops whatever is still queued on a piped stdout, which truncated long
 * traces at the pipe buffer size.
 */

import {
  explainCommand,
  formatTraceHuman,
  formatTraceJson,
  parseExplainFlags,
} from '@/cli/explain/index';
import { AnalysisLimit, LIMITS } from '@/core/budget';
import type { Environment } from '@/core/environment';
import { ToolInputLimitError } from '@/core/tool-input';
import { StructuralShellSyntaxLimitError } from '@/gate/guards/semantic-facts';
import { GuardEvaluationError } from '@/gate/pipeline';

function writeStdoutLine(text: string): Promise<void> {
  return new Promise((resolve) => {
    process.stdout.write(`${text}\n`, () => resolve());
  });
}

export async function runExplain(environment: Environment, args: string[]): Promise<number> {
  const flags = parseExplainFlags(args);
  if (!flags) {
    return 1;
  }

  // Analysis budgets fail closed by throwing. Report those as bounded output so the CLI
  // never answers a limit with an uncaught stack trace; anything else is a real bug and
  // still reaches the top-level handler.
  try {
    const result = explainCommand(flags.command, { cwd: flags.cwd }, environment);
    const asciiOnly = !!process.env.NO_COLOR || !process.stdout.isTTY;

    await writeStdoutLine(
      flags.json ? formatTraceJson(result) : formatTraceHuman(result, { asciiOnly }),
    );
    return 0;
  } catch (error) {
    const message = analysisLimitMessage(
      error instanceof GuardEvaluationError ? error.cause : error,
    );
    if (message === undefined) throw error;
    if (flags.json) {
      await writeStdoutLine(JSON.stringify({ error: message }));
      return 1;
    }
    console.error(message);
    return 1;
  }
}

/**
 * What a budget breach reads as on this surface. The pipeline wraps the throw in a
 * `GuardEvaluationError` and answers the hook with its own deny sentence, so the
 * canonicalization kinds are spelled out here with the text `src`'s
 * `PathCanonicalizationLimitError` carried.
 */
function analysisLimitMessage(cause: unknown): string | undefined {
  if (cause instanceof StructuralShellSyntaxLimitError) return cause.message;
  if (cause instanceof ToolInputLimitError) return cause.message;
  if (
    cause instanceof AnalysisLimit &&
    LIMITS[cause.kind].errorCode === 'path-canonicalization-limit'
  )
    return 'Path canonicalization work limit exceeded.';
  return undefined;
}
