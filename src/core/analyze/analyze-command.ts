import { dangerousInText } from '@/core/analyze/dangerous-text';
import { analyzeSegment, segmentChangesCwd } from '@/core/analyze/segment';
import { splitShellCommands } from '@/core/shell';
import { type AnalyzeOptions, type AnalyzeResult, type Config, MAX_RECURSION_DEPTH } from '@/types';

const REASON_STRICT_UNPARSEABLE =
  'Command could not be safely analyzed (strict mode). Verify manually.';

export const REASON_RECURSION_LIMIT =
  'Command exceeds maximum recursion depth and cannot be safely analyzed.';

export type InternalOptions = AnalyzeOptions & { config: Config };

export function analyzeCommandInternal(
  command: string,
  depth: number,
  options: InternalOptions,
): AnalyzeResult | null {
  if (depth >= MAX_RECURSION_DEPTH) {
    return { reason: REASON_RECURSION_LIMIT, segment: command };
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
  // Preserve effectiveCwd from caller (e.g., after cd in prior segment of outer command)
  // undefined = use cwd, null = unknown (after cd/pushd)
  let effectiveCwd: string | null | undefined =
    options.effectiveCwd !== undefined ? options.effectiveCwd : options.cwd;

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
        // Pass current effectiveCwd so nested analysis sees CWD changes from prior segments
        return (
          analyzeCommandInternal(nestedCommand, depth + 1, { ...options, effectiveCwd })?.reason ??
          null
        );
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
