import { isAbsolute, join } from 'node:path';
import { AnalysisLimit, createBudget } from '@/core/budget';
import type { Environment } from '@/core/environment';
import { resolveExistingPath } from '@/core/paths/canonicalization';
import { isSameOrInsidePath } from '@/gate/intake';

type ClaudeShapeAgent = 'codex' | 'copilot-cli' | 'claude-code' | 'unknown';

/** Detect the caller behind a Claude Code-shaped hook payload. The path is
 *  externally supplied JSON, so any non-string shape must degrade to
 *  'unknown' rather than crash the hook before analysis. */
export function detectClaudeShapeAgent(
  transcriptPath: unknown,
  environment: Environment,
): ClaudeShapeAgent {
  if (
    transcriptPath !== undefined &&
    transcriptPath !== null &&
    typeof transcriptPath !== 'string'
  ) {
    return 'unknown';
  }
  if (typeof transcriptPath === 'string' && !isAbsolute(transcriptPath)) {
    return 'unknown';
  }

  try {
    const budget = createBudget();
    const transcript =
      typeof transcriptPath === 'string' && transcriptPath
        ? resolveExistingPath(transcriptPath, environment.paths, budget)
        : undefined;
    const home = environment.home;
    const roots = [
      ['codex', environment.env.get('CODEX_HOME') || join(home, '.codex')],
      ['copilot-cli', environment.env.get('COPILOT_HOME') || join(home, '.copilot')],
      ['claude-code', environment.env.get('CLAUDE_CONFIG_DIR') || join(home, '.claude')],
    ] as const;
    const matches = transcript
      ? roots.flatMap(([agent, root]) => {
          if (!isAbsolute(root)) return [];
          return isSameOrInsidePath(
            transcript,
            resolveExistingPath(root, environment.paths, budget),
          )
            ? [agent]
            : [];
        })
      : [];

    if (matches.length === 1) return matches[0] ?? 'unknown';
    if (matches.length > 1) return 'unknown';
  } catch (error) {
    if (error instanceof AnalysisLimit) return 'unknown';
    return 'unknown';
  }

  if (
    environment.env.get('CLAUDECODE') === '1' ||
    Boolean(environment.env.get('CLAUDE_CODE_ENTRYPOINT'))
  ) {
    return 'claude-code';
  }
  return 'unknown';
}
