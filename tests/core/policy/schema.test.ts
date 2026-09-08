import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getRulesConfigSchema } from '@/core/policy/schema';
import { writeRulesConfigJsonSchema } from '../../../scripts/build-schema';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

/**
 * `assets/cc-safety-net.schema.json` is a committed, published artifact, and after cutover the
 * ported schema is what generates it. A ported schema drift, a changed post-processing step or a
 * Biome formatting change makes the rendered document differ from the committed bytes and fails
 * this test; the test and `scripts/build-schema.ts` call the same writer, so they cannot disagree
 * about how the document is produced.
 */
describe('ported rules config schema', () => {
  // Named here but created inside the test, so a run whose tests are all filtered out leaves no
  // directory behind: `afterAll` never fires for a describe that contributed no test.
  const directory = join(
    process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(),
    `schema-asset-${process.pid}`,
  );
  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  test('the ported schema renders the committed asset byte for byte', async () => {
    mkdirSync(directory, { recursive: true });
    const output = join(directory, 'cc-safety-net.schema.json');
    const result = await writeRulesConfigJsonSchema(getRulesConfigSchema(), output);

    expect(result.exitCode).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(
      readFileSync(join(REPO_ROOT, 'assets', 'cc-safety-net.schema.json'), 'utf8'),
    );
  }, 30_000);
});
