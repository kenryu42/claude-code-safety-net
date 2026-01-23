/**
 * Low-level formatting utilities for explain command output.
 */

import { colorizeToken } from '@/bin/utils/colors';
import type { TraceStep } from '@/types';

/**
 * Box drawing characters for formatting
 */
export interface BoxChars {
  // Double-line box (header)
  dh: string; // horizontal
  dv: string; // vertical
  dtl: string; // top-left
  dtr: string; // top-right
  dbl: string; // bottom-left
  dbr: string; // bottom-right
  // Single-line box (recursion)
  h: string;
  v: string;
  tl: string;
  tr: string;
  bl: string;
  br: string;
  // Segment separator
  sh: string; // heavy horizontal
}

export function getBoxChars(asciiOnly: boolean): BoxChars {
  if (asciiOnly) {
    return {
      dh: '=',
      dv: '|',
      dtl: '+',
      dtr: '+',
      dbl: '+',
      dbr: '+',
      h: '-',
      v: '|',
      tl: '+',
      tr: '+',
      bl: '+',
      br: '+',
      sh: '=',
    };
  }
  return {
    dh: '═',
    dv: '║',
    dtl: '╔',
    dtr: '╗',
    dbl: '╚',
    dbr: '╝',
    h: '─',
    v: '│',
    tl: '┌',
    tr: '┐',
    bl: '└',
    br: '┘',
    sh: '━',
  };
}

export function formatHeader(box: BoxChars, width: number): string[] {
  const title = '  Command Analysis';
  const padding = width - title.length;
  return [
    `${box.dtl}${box.dh.repeat(width)}${box.dtr}`,
    `${box.dv}${title}${' '.repeat(padding)}${box.dv}`,
    `${box.dbl}${box.dh.repeat(width)}${box.dbr}`,
  ];
}

function formatTokenArray(tokens: readonly string[]): string {
  return JSON.stringify(tokens);
}

/**
 * Format a token array with each token in a unique distinct color.
 * Uses a curated palette for maximum visual distinction.
 */
export function formatColoredTokenArray(tokens: readonly string[], seed = 0): string {
  const coloredTokens = tokens.map((token, index) => colorizeToken(token, index, seed));
  return `[${coloredTokens.join(',')}]`;
}

export function wrapReason(reason: string, indent: string, maxWidth = 70): string[] {
  const words = reason.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);

  return lines.map((line, i) => (i === 0 ? line : `${indent}${line}`));
}

export interface FormattedStep {
  lines: string[];
  incrementStep: boolean;
}

export function formatStepStyleD(
  step: TraceStep,
  stepNum: number,
  box: BoxChars,
): FormattedStep | null {
  const lines: string[] = [];

  switch (step.type) {
    case 'parse':
      // Handled separately in main function
      return null;

    case 'env-strip': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Strip environment variables`);
      const envKeys = Object.keys(step.envVars);
      lines.push(`  Removed: ${envKeys.map((k) => `${k}=<redacted>`).join(', ')}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }

    case 'leading-tokens-stripped': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Strip wrappers`);
      lines.push(`  Removed: ${step.removed.join(', ')}`);
      lines.push(`  Tokens:  ${formatTokenArray(step.output)}`);
      return { lines, incrementStep: true };
    }

    case 'shell-wrapper': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Detect shell wrapper`);
      lines.push(`  Wrapper: ${step.wrapper} -c`);
      lines.push(`  Inner:   ${step.innerCommand}`);
      return { lines, incrementStep: true };
    }

    case 'interpreter': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Detect interpreter`);
      lines.push(`  Interpreter: ${step.interpreter}`);
      lines.push(`  Code:        ${step.codeArg}`);
      if (step.paranoidBlocked) {
        lines.push(`  Result:      ✗ BLOCKED (paranoid mode)`);
      }
      return { lines, incrementStep: true };
    }

    case 'busybox': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Busybox wrapper`);
      lines.push(`  Subcommand: ${step.subcommand}`);
      return { lines, incrementStep: true };
    }

    case 'recurse':
      // Handled specially in main function to open recursion box
      return { lines: [], incrementStep: false };

    case 'rule-check': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Match rules`);
      const ruleRef = `${step.ruleModule}:${step.ruleFunction}()`;
      lines.push(`  Rule:   ${ruleRef}`);
      if (step.matched) {
        lines.push(`  Result: MATCHED`);
      } else {
        lines.push(`  Result: No match`);
      }
      return { lines, incrementStep: true };
    }

    case 'tmpdir-check':
      // This is internal detail, skip in Style D output
      return null;

    case 'fallback-scan': {
      if (step.embeddedCommandFound) {
        lines.push('');
        lines.push(`STEP ${stepNum} ${box.h} Fallback scan`);
        lines.push(`  Found: ${step.embeddedCommandFound}`);
        return { lines, incrementStep: true };
      }
      return null;
    }

    case 'custom-rules-check': {
      if (step.rulesChecked) {
        lines.push('');
        lines.push(`STEP ${stepNum} ${box.h} Custom rules`);
        if (step.matched) {
          lines.push(`  Result: MATCHED`);
        } else {
          lines.push(`  Result: No match`);
        }
        return { lines, incrementStep: true };
      }
      return null;
    }

    case 'cwd-change':
      // Internal detail, skip
      return null;

    case 'dangerous-text': {
      if (step.matched) {
        lines.push('');
        lines.push(`STEP ${stepNum} ${box.h} Dangerous text check`);
        lines.push(`  Token:  ${step.token}`);
        lines.push(`  Result: MATCHED`);
        return { lines, incrementStep: true };
      }
      return null;
    }

    case 'strict-unparseable': {
      lines.push('');
      lines.push(`STEP ${stepNum} ${box.h} Strict mode check`);
      lines.push(`  Command: ${step.rawCommand}`);
      lines.push(`  Result:  ✗ UNPARSEABLE`);
      return { lines, incrementStep: true };
    }

    case 'segment-skipped':
      // Handled in main function
      return null;

    case 'error': {
      lines.push('');
      lines.push(`ERROR: ${step.message}`);
      return { lines, incrementStep: false };
    }

    default:
      return null;
  }
}
