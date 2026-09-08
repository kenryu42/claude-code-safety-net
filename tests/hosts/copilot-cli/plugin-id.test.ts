import { describe, expect, test } from 'bun:test';
import {
  COPILOT_LEGACY_PLUGIN_DIR,
  COPILOT_PLUGIN_DIR,
  COPILOT_PLUGIN_ID,
  COPILOT_PRE_RENAME_PLUGIN_DIR,
  COPILOT_PRE_RENAME_PLUGIN_ID,
  hasCopilotLegacyPlugin,
  hasCopilotMarketplace,
  hasCopilotPreRenamePlugin,
  hasCopilotSafetyNetPlugin,
} from '@/hosts/copilot-cli/plugin-id';

/** `copilot plugin list` lines, including one the host painted green. */
const OUTPUTS: readonly (string | null)[] = [
  'cc-safety-net@cc-marketplace',
  'x cc-safety-net@cc-marketplace y',
  'copilot-safety-net',
  'safety-net@cc-marketplace',
  'cc-marketplace',
  'ccc-marketplace',
  null,
  '\u001b[32mcc-safety-net@cc-marketplace\u001b[0m',
];

const readAll = (
  predicates: readonly ((output: string | null) => boolean)[],
): readonly boolean[][] =>
  OUTPUTS.map((output) => predicates.map((predicate) => predicate(output)));

describe('the Copilot plugin identifiers', () => {
  test('match on a token boundary, so a longer identifier never counts as a hit', () => {
    // Columns: plugin, marketplace, legacy plugin, pre-rename plugin. The pre-rename id is a tail
    // of the current one, and `ccc-marketplace` a head-extension of the marketplace id.
    expect(
      readAll([
        hasCopilotSafetyNetPlugin,
        hasCopilotMarketplace,
        hasCopilotLegacyPlugin,
        hasCopilotPreRenamePlugin,
      ]),
    ).toEqual([
      [true, true, false, false],
      [true, true, false, false],
      [false, false, true, false],
      [false, true, false, true],
      [false, true, false, false],
      [false, false, false, false],
      [false, false, false, false],
      [false, true, false, false],
    ]);
  });

  test('name the same plugin, marketplace and checkout directories', () => {
    // A plugin id is `<plugin>@<marketplace>`; a directory is the pair the checkout nests under.
    expect(COPILOT_PLUGIN_ID).toBe('cc-safety-net@cc-marketplace');
    expect(COPILOT_PLUGIN_DIR).toEqual(['cc-marketplace', 'cc-safety-net']);
    expect(COPILOT_LEGACY_PLUGIN_DIR).toEqual(['_direct', 'copilot-safety-net']);
    expect(COPILOT_PRE_RENAME_PLUGIN_DIR).toEqual(['cc-marketplace', 'safety-net']);
    expect(COPILOT_PRE_RENAME_PLUGIN_ID).toBe('safety-net@cc-marketplace');
  });
});
