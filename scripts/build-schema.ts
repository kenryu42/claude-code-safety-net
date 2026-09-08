#!/usr/bin/env bun
import * as z from 'zod';
import { getRulesConfigSchema } from '../src/core/policy/schema';

const SCHEMA_OUTPUT_PATH = 'assets/cc-safety-net.schema.json';

/** @internal */
export async function writeRulesConfigJsonSchema(schema: z.core.$ZodType, outputPath: string) {
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-7',
  }) as Record<string, unknown>;
  setUniqueItems(jsonSchema, 'transparent_wrappers');

  const finalSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://raw.githubusercontent.com/kenryu42/cc-safety-net/main/assets/cc-safety-net.schema.json',
    title: 'CC Safety Net Configuration',
    description: 'Configuration file for cc-safety-net rulebook sources and local policy',
    ...jsonSchema,
  };

  await Bun.write(outputPath, `${JSON.stringify(finalSchema, null, 2)}\n`);

  // Format with Biome to ensure consistent formatting with the linter
  return Bun.spawnSync(['bunx', 'biome', 'format', '--write', outputPath]);
}

async function main(): Promise<void> {
  console.log('Generating JSON Schema...');
  const result = await writeRulesConfigJsonSchema(getRulesConfigSchema(), SCHEMA_OUTPUT_PATH);
  if (result.exitCode !== 0) {
    console.error('Failed to format schema:', result.stderr.toString());
    process.exit(1);
  }
  console.log(`✓ JSON Schema generated: ${SCHEMA_OUTPUT_PATH}`);
}

function setUniqueItems(schema: Record<string, unknown>, propertyName: string): void {
  if (!schema.properties || typeof schema.properties !== 'object') return;

  const property = (schema.properties as Record<string, unknown>)[propertyName];
  if (!property || typeof property !== 'object') return;

  (property as Record<string, unknown>).uniqueItems = true;
}

if (import.meta.main) await main();
