import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every string literal the retired test suites spelled out, harvested as text at the cutover and
 * frozen here; `gate/harvested.test.ts` replays them as commands against the gate.
 */
export const HARVESTED_LITERALS: readonly string[] = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'fixtures', 'gate', 'harvested-literals.json'), 'utf-8'),
);

export const HARVESTED_LITERAL_COUNT = HARVESTED_LITERALS.length;
