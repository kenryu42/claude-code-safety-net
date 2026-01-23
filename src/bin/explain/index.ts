/**
 * Entry point for the explain command module.
 * Re-exports analysis function and formatting utilities.
 */

// Core analysis logic
export { explainCommand } from '@/bin/explain/analyze';

// Formatting utilities
export { formatTraceHuman, formatTraceJson } from '@/bin/explain/format';
