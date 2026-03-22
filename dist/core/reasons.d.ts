/**
 * Reasons module - externalizes hard-coded reason strings.
 */
/**
 * Get a reason string by key, with optional overrides from config.
 * @param key - reason key (e.g., 'checkout_double_dash')
 * @param configReasons - optional mapping of keys to custom strings from config
 * @returns the reason string (config override if present, otherwise default)
 */
export declare function getReason(key: string, configReasons?: Record<string, string>): string;
