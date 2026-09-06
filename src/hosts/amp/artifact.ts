/**
 * Ownership marker prepended to the built Amp plugin artifact
 * (dist/amp/cc-safety-net/index.ts). The installer and doctor detect a CC Safety Net
 * managed plugin by this exact first line; the build stamps it via
 * buildAmpArtifactHeader.
 */
export const AMP_MANAGED_HEADER =
  '// cc-safety-net managed Amp plugin. Do not edit. Reinstall with: npx -y cc-safety-net install --amp';

/** Directory Amp materializes the plugin into, and the name it lists the plugin under. */
export const AMP_PLUGIN_DIRECTORY = 'cc-safety-net';

/** File Amp loads as the plugin runtime, relative to the directory that holds it. */
export const AMP_PLUGIN_ENTRY = `${AMP_PLUGIN_DIRECTORY}/index.ts`;

/** Build-time artifact header: the stable marker plus a diagnostic version line. */
export function buildAmpArtifactHeader(version: string): string {
  return `${AMP_MANAGED_HEADER}\n// version: ${version}\n`;
}
