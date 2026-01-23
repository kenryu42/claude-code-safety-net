/**
 * Formatting functions for explain command output.
 */

import {
  formatColoredTokenArray,
  formatHeader,
  formatStepStyleD,
  getBoxChars,
  wrapReason,
} from '@/bin/explain/format-helpers';
import { colors } from '@/bin/utils/colors';
import type { ExplainResult } from '@/types';

export function formatTraceHuman(result: ExplainResult, options?: { asciiOnly?: boolean }): string {
  const box = getBoxChars(options?.asciiOnly ?? false);
  const width = 58;
  const lines: string[] = [];
  let stepNum = 1;

  // Header
  lines.push(...formatHeader(box, width));
  lines.push('');

  // Check for global error step (e.g., empty command)
  const errorStep = result.trace.steps.find((s) => s.type === 'error');
  if (errorStep && errorStep.type === 'error') {
    lines.push('ERROR');
    lines.push(`  ${errorStep.message}`);
    lines.push('');
    lines.push('RESULT');
    lines.push(
      `  Status: ${result.result === 'blocked' ? colors.red('BLOCKED') : colors.green('ALLOWED')}`,
    );
    lines.push('');
    lines.push('CONFIG');
    const configPath = result.configSource ?? 'none';
    lines.push(`  Path: ${configPath}`);
    return lines.join('\n');
  }

  // INPUT section
  const parseStep = result.trace.steps.find((s) => s.type === 'parse');
  if (parseStep && parseStep.type === 'parse') {
    lines.push('INPUT');
    lines.push(`  ${parseStep.input}`);
    lines.push('');

    // STEP 1: Split shell commands with segment arrays
    lines.push(`STEP ${stepNum} ${box.h} Split shell commands`);
    stepNum++;
    for (let i = 0; i < parseStep.segments.length; i++) {
      const seg = parseStep.segments[i];
      if (seg) {
        // Generate a random seed for each segment to randomize colors
        const seed = Math.random();
        lines.push(`  Segment ${i + 1}: ${formatColoredTokenArray(seg, seed)}`);
      }
    }
  }

  // Process each segment
  const segments = result.trace.segments;
  const hasMultipleSegments = segments.length > 1;

  for (const seg of segments) {
    if (hasMultipleSegments) {
      lines.push('');

      // Get the command string for this segment
      let segCommand = '';
      if (parseStep && parseStep.type === 'parse') {
        const tokens = parseStep.segments[seg.index];
        if (tokens) {
          segCommand = tokens.join(' ');
        }
      }

      // Calculate padding
      // If label is too long for the box, truncate it
      // Box width is 'width', we need 1 char for left border, 1 for right border
      // So max label length is width - 2 (borders) - 2 (space padding around label if we want)
      // The box drawing uses: box.sh (left side) + label + box.sh (right side)
      // We want at least 2 chars of dash on each side if possible

      const maxLabelLen = width - 4; // Reserve 2 dashes on each side

      // Calculate display command (truncated if needed)
      let displayCommand = segCommand;
      const baseLabel = ` Segment ${seg.index + 1}: `;
      const suffix = ' '; // Trailing space

      // If we have a command, check if we need to truncate
      if (segCommand) {
        // Total length = baseLabel + command + suffix
        const totalLen = baseLabel.length + segCommand.length + suffix.length;

        if (totalLen > maxLabelLen) {
          // Available space for command = maxLabelLen - baseLabel - suffix
          const availableForCmd = maxLabelLen - baseLabel.length - suffix.length;
          // Reserve 1 char for ellipsis
          displayCommand = `${segCommand.substring(0, availableForCmd - 1)}…`;
        }
      }

      // Construct the final strings
      // We need plain string for length calculation
      const labelContent = segCommand
        ? `${baseLabel}${displayCommand}${suffix}`
        : ` Segment ${seg.index + 1} `;

      // And colored string for output
      const coloredContent = segCommand
        ? `${baseLabel}${colors.cyan(displayCommand)}${suffix}`
        : labelContent;

      const segLineLen = width - labelContent.length;
      const leftLen = Math.floor(segLineLen / 2);
      const rightLen = segLineLen - leftLen;

      lines.push(`${box.sh.repeat(leftLen)}${coloredContent}${box.sh.repeat(rightLen)}`);
    }

    // Check if segment was skipped
    const skippedStep = seg.steps.find((s) => s.type === 'segment-skipped');
    if (skippedStep) {
      lines.push('');
      lines.push('  (skipped — prior segment blocked)');
      continue;
    }

    // Track recursion depth for nested formatting
    let inRecursion = false;
    let hasVisibleSteps = false;

    for (const step of seg.steps) {
      const formattedStep = formatStepStyleD(step, stepNum, box);
      if (formattedStep) {
        hasVisibleSteps = true;
        // Handle recursion start
        if (step.type === 'recurse') {
          lines.push('');
          const recurseLabel = ' RECURSING ';
          const recurseLineLen = width - recurseLabel.length - 4;
          lines.push(`  ${box.tl}${box.h}${recurseLabel}${box.h.repeat(recurseLineLen)}`);
          lines.push(`  ${box.v}`);
          inRecursion = true;
          continue;
        }

        // Add step content
        for (const line of formattedStep.lines) {
          if (inRecursion) {
            lines.push(`  ${box.v} ${line}`);
          } else {
            lines.push(line);
          }
        }
        if (formattedStep.incrementStep) {
          stepNum++;
        }
      }
    }

    // Close recursion box if open
    if (inRecursion) {
      lines.push(`  ${box.v}`);
      lines.push(`  ${box.bl}${box.h.repeat(width - 2)}`);
      inRecursion = false;
    }

    // Show minimal indicator for segments with no visible analysis steps
    if (!hasVisibleSteps) {
      lines.push('');
      lines.push(`  ${colors.green('✓')} Allowed (no matching rules)`);
    }
  }

  // RESULT section
  lines.push('');
  lines.push('RESULT');
  if (result.result === 'blocked') {
    lines.push(`  Status: ${colors.red('BLOCKED')}`);
    if (result.reason) {
      const reasonLines = wrapReason(result.reason, '          ');
      lines.push(`  Reason: ${reasonLines[0]}`);
      for (let i = 1; i < reasonLines.length; i++) {
        lines.push(reasonLines[i] ?? '');
      }
    }
  } else {
    lines.push(`  Status: ${colors.green('ALLOWED')}`);
  }

  // CONFIG section
  lines.push('');
  lines.push('CONFIG');
  const configPath = result.configSource ?? 'none';
  const configStatus = result.configValid ? '' : ' (invalid)';
  lines.push(`  Path: ${configPath}${configStatus}`);

  return lines.join('\n');
}

export function formatTraceJson(result: ExplainResult): string {
  return JSON.stringify(result, null, 2);
}
