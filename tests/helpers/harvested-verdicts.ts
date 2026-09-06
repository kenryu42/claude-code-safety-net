import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GateVerdict } from './gate-differential';

/**
 * The readable oracle for the harvested replay: one JSON line per harvested literal, in the order
 * `harvested-literals.json` spells them, holding the literal and one cell per place and level —
 * `{"literal": "git reset --hard", "work/standard": "deny git.reset-hard @command-analysis", …}`.
 *
 * A cell names the classification, never a machine-specific string: `allow`, `deny <rule id>
 * @<stage>` where a rule decided, `deny @<stage> <reason>` where none did (those reasons are the
 * text the host displays, so they are the contract), and `fail-closed …` where the guard threw
 * instead of returning. A reader can therefore see which literal flipped and to what, which is
 * what a digest over the same verdicts cannot say.
 */

const TABLE_FILE = join(import.meta.dir, '..', 'fixtures', 'gate', 'harvested-verdicts.jsonl');

export type HarvestedRow = Readonly<Record<string, string>> & { readonly literal: string };

/** One decision as a cell. `uncaught` reaches one only if a verdict escaped the catch boundary. */
export function harvestedVerdictCell(verdict: GateVerdict): string {
  if (verdict.outcome === 'allow') return 'allow';
  return [
    verdict.thrown === undefined ? verdict.outcome : 'fail-closed',
    verdict.ruleId,
    `@${String(verdict.stage)}`,
    verdict.ruleId === undefined ? verdict.reason : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(' ');
}

/** The recorded table, or null when no run has recorded one yet. */
export function loadHarvestedVerdicts(): readonly HarvestedRow[] | null {
  if (!existsSync(TABLE_FILE)) return null;
  return readFileSync(TABLE_FILE, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as HarvestedRow);
}

export function writeHarvestedVerdicts(rows: readonly HarvestedRow[]): void {
  mkdirSync(dirname(TABLE_FILE), { recursive: true });
  writeFileSync(TABLE_FILE, rows.map((row) => `${JSON.stringify(row)}\n`).join(''));
}
