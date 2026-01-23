/**
 * Entry point for the explain command module.
 * Re-exports analysis function and formatting utilities.
 */
export { explainCommand } from '@/bin/explain/analyze';
export { formatTraceHuman, formatTraceJson } from '@/bin/explain/format';
