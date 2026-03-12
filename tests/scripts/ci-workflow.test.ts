import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const REQUIRED_CI_INPUT_PATHS = [
  '.github/workflows/**',
  'src/**',
  'scripts/**',
  'tests/**',
  'bun.lock',
  'tsconfig.json',
  'tsconfig.build.json',
  'biome.json',
  'knip.ts',
  'sgconfig.yml',
  'ast-grep/**',
] as const;

function readWorkflow(): string {
  return readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
}

function extractPaths(workflow: string, eventName: 'push' | 'pull_request'): string[] {
  const lines = workflow.split('\n');
  const eventIndex = lines.findIndex((line) => line.trim() === `${eventName}:`);
  if (eventIndex === -1) {
    throw new Error(`Missing ${eventName} event in ci workflow`);
  }

  const eventIndent = lines[eventIndex]?.match(/^\s*/)?.[0].length ?? 0;
  const eventLines: string[] = [];

  for (const line of lines.slice(eventIndex + 1)) {
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (trimmed && indent <= eventIndent) {
      break;
    }
    eventLines.push(line);
  }

  const pathsIndex = eventLines.findIndex((line) => line.trim() === 'paths:');
  if (pathsIndex === -1) {
    throw new Error(`Missing paths filter for ${eventName} in ci workflow`);
  }

  const pathsIndent = eventLines[pathsIndex]?.match(/^\s*/)?.[0].length ?? 0;
  const paths: string[] = [];

  for (const line of eventLines.slice(pathsIndex + 1)) {
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (trimmed && indent <= pathsIndent) {
      break;
    }
    if (trimmed.startsWith('- ')) {
      paths.push(trimmed.slice(2).replaceAll('"', ''));
    }
  }

  return paths;
}

describe('CI workflow trigger filters', () => {
  test('push still validates all build and static-analysis inputs', () => {
    const pushPaths = extractPaths(readWorkflow(), 'push');

    for (const requiredPath of REQUIRED_CI_INPUT_PATHS) {
      expect(pushPaths).toContain(requiredPath);
    }
  });

  test('push includes schema assets so auto-commits retrigger CI', () => {
    const pushPaths = extractPaths(readWorkflow(), 'push');

    expect(pushPaths).toContain('assets/**');
    expect(pushPaths).toContain('package.json');
  });

  test('pull requests still validate workflow and package changes', () => {
    const pullRequestPaths = extractPaths(readWorkflow(), 'pull_request');

    for (const requiredPath of REQUIRED_CI_INPUT_PATHS) {
      expect(pullRequestPaths).toContain(requiredPath);
    }

    expect(pullRequestPaths).toContain('assets/**');
    expect(pullRequestPaths).toContain('package.json');
  });
});
