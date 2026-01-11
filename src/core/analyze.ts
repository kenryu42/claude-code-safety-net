import type { AnalyzeOptions, AnalyzeResult } from '../types.ts';

import { analyzeCommandInternal } from './analyze/analyze-command.ts';
import { findHasDelete } from './analyze/find.ts';
import { extractParallelChildCommand } from './analyze/parallel.ts';
import { hasRecursiveForceFlags } from './analyze/rm-flags.ts';
import { segmentChangesCwd } from './analyze/segment.ts';
import { extractXargsChildCommand, extractXargsChildCommandWithInfo } from './analyze/xargs.ts';
import { loadConfig } from './config.ts';

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
