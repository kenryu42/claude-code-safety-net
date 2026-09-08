/**
 * Entry point for the explain command module.
 * Re-exports analysis function and formatting utilities.
 */

// Flag parsing
export { parseExplainFlags } from '@/cli/explain/flags';
// Formatting utilities
export { formatTraceHuman, formatTraceJson } from '@/cli/explain/format';
// Core analysis logic
export { explainCommand } from '@/gate/explain';
