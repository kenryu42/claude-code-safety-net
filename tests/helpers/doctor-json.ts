/**
 * The three classes of value in a `doctor --json` document that the fixture cannot pin.
 *
 * `platform` is the one system-info field whose value depends on the machine: under the fake
 * `PATH` the row installs, `nodeVersion`, `npmVersion`, `bunVersion` and every `versions` entry
 * probe nothing and are `null` on every platform, so they stay pinned byte for byte.
 */
export function normalizeDoctorJson(document: string): string {
  return (
    document
      .replace(/"(timestamp|relativeTime|oldestEntry|newestEntry)": "[^"]*"/g, '"$1": "<time>"')
      .replace(/"(version|currentVersion)": "[^"]*"/g, '"$1": "<version>"')
      // An integration id never contains a space, so only `system.platform` matches.
      .replace(/"platform": "[^"]* [^"]*"/g, '"platform": "<platform>"')
  );
}
