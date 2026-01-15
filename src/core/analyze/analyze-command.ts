import {
  type AnalyzeOptions,
  type AnalyzeResult,
  type Config,
  MAX_RECURSION_DEPTH,
} from '../../types.ts';

import { splitShellCommands } from '../shell.ts';

import { dangerousInText } from './dangerous-text.ts';
import { detectSourceProcessSubstitution } from './eval-source.ts';
import { detectPipeToShell } from './pipe-to-shell.ts';
import { analyzeSegment, segmentChangesCwd } from './segment.ts';

const REASON_STRICT_UNPARSEABLE =
  'Command could not be safely analyzed (strict mode). Verify manually.';

export type InternalOptions = AnalyzeOptions & { config: Config };

export function analyzeCommandInternal(
  command: string,
  depth: number,
  options: InternalOptions,
): AnalyzeResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    return null;
  }

  // Check for patterns that are lost during shell parsing
  // These must be detected on the raw command string before splitting
  // Run at all depths to catch nested patterns like "bash -c 'curl | bash'"

  // Pipe-to-shell: "curl | bash" would be split into safe-looking segments
  const pipeToShellReason = detectPipeToShell(command);
  if (pipeToShellReason) {
    return { reason: pipeToShellReason, segment: command };
  }

  // Source with process substitution: "source <(...)" loses the <( during parsing
  const sourceProcessSubReason = detectSourceProcessSubstitution(command);
  if (sourceProcessSubReason) {
    return { reason: sourceProcessSubReason, segment: command };
  }

  const segments = splitShellCommands(command);

  // Strict mode: block if command couldn't be parsed (unclosed quotes, etc.)
  // Detected when splitShellCommands returns a single segment containing the raw command
  if (
    options.strict &&
    segments.length === 1 &&
    segments[0]?.length === 1 &&
    segments[0][0] === command &&
    command.includes(' ')
  ) {
    return { reason: REASON_STRICT_UNPARSEABLE, segment: command };
  }

  const originalCwd = options.cwd;
  let effectiveCwd: string | null | undefined = options.cwd;

  for (const segment of segments) {
    const segmentStr = segment.join(' ');

    if (segment.length === 1 && segment[0]?.includes(' ')) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        return { reason: textReason, segment: segmentStr };
      }
      if (segmentChangesCwd(segment)) {
        effectiveCwd = null;
      }
      continue;
    }

    const reason = analyzeSegment(segment, depth, {
      ...options,
      cwd: originalCwd,
      effectiveCwd,
      analyzeNested: (nestedCommand: string): string | null => {
        return analyzeCommandInternal(nestedCommand, depth + 1, options)?.reason ?? null;
      },
    });
    if (reason) {
      return { reason, segment: segmentStr };
    }

    if (segmentChangesCwd(segment)) {
      effectiveCwd = null;
    }
  }

  return null;
}
