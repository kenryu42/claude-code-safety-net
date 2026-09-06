/**
 * The configurations the CLI row tables seed. One spelling per fixture, so `status`, the
 * statusline and the diagnostics that follow are all describing the same files when they
 * disagree about what those files mean.
 */

export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const USER_POLICY = 'home/.cc-safety-net/policy.json';
export const PROJECT_POLICY = 'project/.cc-safety-net/policy.json';

/** Claude Code with the plugin switched on; without it nothing is enforced there. */
export const PLUGIN_SETTINGS = json({ enabledPlugins: { 'cc-safety-net@cc-marketplace': true } });

/** A user scope at strict that the project scope relaxes back to standard. */
export const WEAKENED_BY_PROJECT = {
  [USER_POLICY]: json({ version: 1, safety: { level: 'strict' } }),
  [PROJECT_POLICY]: json({ version: 1, safety: { level: 'standard' } }),
};

/** One rule switched off against what the level grants, which every surface reports as a
 *  customization of the level rather than as the level itself. */
export const RULE_SWITCHED_OFF = json({
  version: 1,
  destructive_command_protection: { overrides: { 'git.reset-hard': 'off' } },
});
