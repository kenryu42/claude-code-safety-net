#!/usr/bin/env bun
import * as z from 'zod';

const SCHEMA_OUTPUT_PATH = 'assets/cc-safety-net.schema.json';

const CustomRuleSchema = z
  .strictObject({
    name: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
      .describe('Unique identifier for the rule (case-insensitive for duplicate detection)'),
    command: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
      .describe(
        "Base command to match (e.g., 'git', 'npm', 'docker'). Paths are normalized to basename.",
      ),
    subcommand: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/)
      .optional()
      .describe(
        "Optional subcommand to match (e.g., 'add', 'install'). If omitted, matches any subcommand.",
      ),
    block_args: z
      .array(z.string().min(1))
      .min(1)
      .describe(
        'Arguments that trigger the block. Command is blocked if ANY of these are present.',
      ),
    reason: z.string().min(1).max(256).describe('Message shown when the command is blocked'),
  })
  .describe('A custom rule that blocks specific command patterns');

const ConfigSchema = z.strictObject({
  $schema: z.string().optional().describe('JSON Schema reference for IDE support'),
  version: z.literal(1).describe('Schema version (must be 1)'),
  rules: z.array(CustomRuleSchema).default([]).describe('Custom blocking rules'),
});

async function main(): Promise<void> {
  console.log('Generating JSON Schema...');

  const jsonSchema = z.toJSONSchema(ConfigSchema, {
    io: 'input',
    target: 'draft-7',
  });

  const finalSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://raw.githubusercontent.com/kenryu42/claude-code-safety-net/main/assets/cc-safety-net.schema.json',
    title: 'Safety Net Configuration',
    description: 'Configuration file for cc-safety-net plugin custom rules',
    ...jsonSchema,
  };

  await Bun.write(SCHEMA_OUTPUT_PATH, `${JSON.stringify(finalSchema, null, 2)}\n`);

  console.log(`✓ JSON Schema generated: ${SCHEMA_OUTPUT_PATH}`);
}

main();
