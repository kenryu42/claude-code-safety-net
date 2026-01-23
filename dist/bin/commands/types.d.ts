/**
 * Command option definition for CLI help generation.
 */
export interface CommandOption {
    /** Flag notation, e.g., "--json" or "-h, --help" */
    flags: string;
    /** Human-readable description */
    description: string;
    /** Default value hint (optional) */
    default?: string;
    /** Argument placeholder, e.g., "<path>" */
    argument?: string;
}
/**
 * Command definition for CLI help generation and routing.
 */
export interface Command {
    /** Primary command name, e.g., "doctor" */
    name: string;
    /** Alternative invocations, e.g., ["--doctor"] */
    aliases?: string[];
    /** One-line description shown in main help */
    description: string;
    /** Usage pattern, e.g., "doctor [options]" */
    usage: string;
    /** Available options for this command */
    options: CommandOption[];
    /** Example invocations (optional) */
    examples?: string[];
    /** Positional argument description, e.g., "<command>" */
    argument?: string;
    /** Whether this is a hidden command (not shown in main help) */
    hidden?: boolean;
}
