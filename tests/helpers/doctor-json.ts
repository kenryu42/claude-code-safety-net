/**
 * The three classes of value in a `doctor --json` document that the fixture cannot pin.
 *
 * `platform` is the one system-info field whose value depends on the machine: under the fake
 * `PATH` the row installs, `nodeVersion`, `npmVersion`, `bunVersion` and every `versions` entry
 * probe nothing and are `null` on every platform, so they stay pinned byte for byte.
 */
/**
 * Windows has no owner or mode to read, so `getDoctorPosture` reports a directory it found intact
 * as `unknown` with no issues where a POSIX host reports `safe`. The two are the same cell — the
 * check found nothing wrong — and the document is pinned in the POSIX spelling. A directory that
 * is missing, a symlink or not a directory reports the same status on either host, so only this
 * one pair is folded, and only where the host cannot answer.
 */
export const foldWindowsPosture = (document: string): string =>
  process.platform === 'win32'
    ? document.replaceAll(
        /"status": "unknown",(\s*)"issues": \[\]/g,
        '"status": "safe",$1"issues": []',
      )
    : document;

export function normalizeDoctorJson(document: string): string {
  return (
    document
      .replace(/"(timestamp|relativeTime|oldestEntry|newestEntry)": "[^"]*"/g, '"$1": "<time>"')
      .replace(/"(version|currentVersion)": "[^"]*"/g, '"$1": "<version>"')
      // An integration id never contains a space, so only `system.platform` matches.
      .replace(/"platform": "[^"]* [^"]*"/g, '"platform": "<platform>"')
  );
}
