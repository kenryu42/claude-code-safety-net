import { analyzeCommandInternal } from '@/core/analyze/analyze-command';
import { findHasDelete } from '@/core/analyze/find';
import { extractParallelChildCommand } from '@/core/analyze/parallel';
import { hasRecursiveForceFlags } from '@/core/analyze/rm-flags';
import { segmentChangesCwd } from '@/core/analyze/segment';
import { extractXargsChildCommand, extractXargsChildCommandWithInfo } from '@/core/analyze/xargs';
import { loadConfig } from '@/core/config';
import type { AnalyzeOptions, AnalyzeResult } from '@/types';

export function analyzeCommand(
  command: string,
  options: AnalyzeOptions = {},
): AnalyzeResult | null {
  const config = options.config ?? loadConfig(options.cwd);
  return analyzeCommandInternal(command, 0, { ...options, config });
}

export { loadConfig };

/** @internal Exported for testing */
export { findHasDelete as _findHasDelete };
/** @internal Exported for testing */
export { extractParallelChildCommand as _extractParallelChildCommand };
/** @internal Exported for testing */
export { hasRecursiveForceFlags as _hasRecursiveForceFlags };
/** @internal Exported for testing */
export { segmentChangesCwd as _segmentChangesCwd };
/** @internal Exported for testing */
export { extractXargsChildCommand as _extractXargsChildCommand };
/** @internal Exported for testing */
export { extractXargsChildCommandWithInfo as _extractXargsChildCommandWithInfo };
