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
export declare function formatBlockedMessage(input: FormatBlockedMessageInput): string;
export {};
