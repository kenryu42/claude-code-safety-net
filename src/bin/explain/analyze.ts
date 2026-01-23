/**
 * Core analysis logic for the explain command.
 */

import { buildAnalyzeOptions, getConfigSource } from '@/bin/explain/config';
import { redactEnvAssignmentsInString, redactEnvAssignmentTokens } from '@/bin/explain/redact';
import {
  explainSegment,
  isUnparseableCommand,
  REASON_STRICT_UNPARSEABLE,
} from '@/bin/explain/segment';
import { dangerousInText } from '@/core/analyze/dangerous-text';
import { segmentChangesCwd } from '@/core/analyze/segment';
import { splitShellCommands } from '@/core/shell';
import type { ExplainOptions, ExplainResult, ExplainTrace, TraceStep } from '@/types';

export function explainCommand(command: string, options?: ExplainOptions): ExplainResult {
  const trace: ExplainTrace = { steps: [], segments: [] };
  const analyzeOpts = buildAnalyzeOptions(options);
  const { configSource, configValid } = getConfigSource({ cwd: options?.cwd });

  if (!command || !command.trim()) {
    trace.steps.push({ type: 'error', message: 'No command provided' });
    return {
      trace,
      result: 'allowed',
      configSource,
      configValid,
    };
  }

  const segments = splitShellCommands(command);
  // Redact env assignments in parse trace to prevent leaking secrets in JSON output
  // Handle both quoted values (single/double) and unquoted values
  const redactedInput = command.replace(
    /\b([A-Za-z_][A-Za-z0-9_]*)=(?:"[^"]*"|'[^']*'|\S+)/g,
    '$1=<redacted>',
  );
  const redactedSegments = segments.map((seg) => redactEnvAssignmentTokens(seg));
  trace.steps.push({
    type: 'parse',
    input: redactedInput,
    segments: redactedSegments,
  });

  if (analyzeOpts.strict && isUnparseableCommand(command, segments)) {
    trace.steps.push({
      type: 'strict-unparseable',
      rawCommand: redactedInput,
      reason: REASON_STRICT_UNPARSEABLE,
    });
    return {
      trace,
      result: 'blocked',
      reason: REASON_STRICT_UNPARSEABLE,
      segment: redactEnvAssignmentsInString(command),
      configSource,
      configValid,
    };
  }

  let blocked = false;
  let blockReason: string | undefined;
  let blockSegment: string | undefined;
  let effectiveCwd: string | null | undefined = analyzeOpts.effectiveCwd;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!segment) continue;

    const segmentSteps: TraceStep[] = [];

    if (blocked) {
      segmentSteps.push({
        type: 'segment-skipped',
        index: i,
        reason: 'prior-segment-blocked',
      });
      trace.segments.push({ index: i, steps: segmentSteps });
      continue;
    }

    // Check for unparseable segment (single token with spaces) - matches guard behavior
    if (segment.length === 1 && segment[0]?.includes(' ')) {
      const textReason = dangerousInText(segment[0]);
      if (textReason) {
        segmentSteps.push({
          type: 'dangerous-text',
          token: redactEnvAssignmentsInString(segment[0]),
          matched: true,
          reason: textReason,
        });
        trace.segments.push({ index: i, steps: segmentSteps });
        blocked = true;
        blockReason = textReason;
        blockSegment = redactEnvAssignmentsInString(segment.join(' '));
        continue;
      }
      segmentSteps.push({
        type: 'dangerous-text',
        token: redactEnvAssignmentsInString(segment[0]),
        matched: false,
      });
      if (segmentChangesCwd(segment)) {
        segmentSteps.push({
          type: 'cwd-change',
          segment: redactEnvAssignmentsInString(segment.join(' ')),
          effectiveCwdNowUnknown: true,
        });
        effectiveCwd = null;
      }
      trace.segments.push({ index: i, steps: segmentSteps });
      continue;
    }

    const result = explainSegment(segment, 0, { ...analyzeOpts, effectiveCwd }, segmentSteps);

    if (result) {
      blocked = true;
      blockReason = result.reason;
      blockSegment = redactEnvAssignmentsInString(segment.join(' '));
    }

    if (segmentChangesCwd(segment)) {
      segmentSteps.push({
        type: 'cwd-change',
        segment: redactEnvAssignmentsInString(segment.join(' ')),
        effectiveCwdNowUnknown: true,
      });
      effectiveCwd = null;
    }

    trace.segments.push({ index: i, steps: segmentSteps });
  }

  return {
    trace,
    result: blocked ? 'blocked' : 'allowed',
    reason: blockReason,
    segment: blockSegment,
    configSource,
    configValid,
  };
}
