import { renameSync, writeFileSync } from 'node:fs';

/**
 * Write via a sibling temp file and rename, so an interrupted install leaves the
 * previous file intact instead of a truncated one. The temp file must share the
 * destination's directory: rename is only atomic within a filesystem.
 */
export function atomicWriteFile(dest: string, content: string | Buffer): void {
  const tmp = `${dest}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, dest);
}
