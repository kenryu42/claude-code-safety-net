export const COPILOT_PLUGIN_ID = 'cc-safety-net@cc-marketplace';
export const COPILOT_PLUGIN_DIR = ['cc-marketplace', 'cc-safety-net'] as const;
export const COPILOT_LEGACY_PLUGIN_DIR = ['_direct', 'copilot-safety-net'] as const;
// The marketplace checkout from before the plugin was renamed "safety-net" -> "cc-safety-net".
export const COPILOT_PRE_RENAME_PLUGIN_DIR = ['cc-marketplace', 'safety-net'] as const;
export const COPILOT_PRE_RENAME_PLUGIN_ID = 'safety-net@cc-marketplace';
const COPILOT_MARKETPLACE_ID = 'cc-marketplace';
const COPILOT_LEGACY_PLUGIN_ID = 'copilot-safety-net';

function hasIdentifier(output: string | null, identifier: string): boolean {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, 'm').test(output ?? '');
}

export function hasCopilotSafetyNetPlugin(output: string | null): boolean {
  return hasIdentifier(output, COPILOT_PLUGIN_ID);
}

export function hasCopilotMarketplace(output: string | null): boolean {
  return hasIdentifier(output, COPILOT_MARKETPLACE_ID);
}

export function hasCopilotLegacyPlugin(output: string | null): boolean {
  return hasIdentifier(output, COPILOT_LEGACY_PLUGIN_ID);
}

// The boundary check in hasIdentifier keeps the "-safety-net@cc-marketplace" tail of the
// replacement plugin id from matching.
export function hasCopilotPreRenamePlugin(output: string | null): boolean {
  return hasIdentifier(output, COPILOT_PRE_RENAME_PLUGIN_ID);
}
