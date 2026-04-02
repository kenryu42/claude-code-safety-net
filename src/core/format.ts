type RedactFn = (text: string) => string;

export interface FormatBlockedMessageInput {
  reason: string;
  command?: string;
  segment?: string;
  maxLen?: number;
  redact?: RedactFn;
  /** When true, formats the message as a confirmation prompt instead of a hard block. */
  askMode?: boolean;
}

export function formatBlockedMessage(input: FormatBlockedMessageInput): string {
  const { reason, command, segment, askMode } = input;
  const maxLen = input.maxLen ?? 200;
  const redact = input.redact ?? ((t: string) => t);

  const header = askMode ? 'FLAGGED by Safety Net' : 'BLOCKED by Safety Net';
  let message = `${header}\n\nReason: ${reason}`;

  if (command) {
    const safeCommand = redact(command);
    message += `\n\nCommand: ${excerpt(safeCommand, maxLen)}`;
  }

  if (segment && segment !== command) {
    const safeSegment = redact(segment);
    message += `\n\nSegment: ${excerpt(safeSegment, maxLen)}`;
  }

  if (askMode) {
    message += '\n\nThis command may be destructive. Approve to proceed, or deny to cancel.';
  } else {
    message +=
      '\n\nIf this operation is truly needed, ask the user for explicit permission and have them run the command manually.';
  }

  return message;
}

function excerpt(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}
