import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/**
 * Two budgets on the hook entry, both read off its transitive static import closure. Cold start:
 * the modules a hook call cannot avoid loading are the gate, the audit writer and the nine stdin
 * adapters, and nothing else the CLI carries — an installer, a detector, doctor, the GUI, the
 * rulebook manager, the zod policy schema or an in-process entry pulled in by a stray import is a
 * regression the hook path pays for on every tool call. Git-checkout mode: the same closure names
 * no package, so the plugin runs from a checkout with no `node_modules`.
 */

const NEXT_ROOT = join(import.meta.dir, '..', '..', 'src');
const HOOK_ENTRY = join(NEXT_ROOT, 'entries', 'bin.ts');

const STATIC_SPECIFIER = /(?:^|[\n;])\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g;
const DYNAMIC_SPECIFIER = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Every module the file names at load time; a dynamic `import()` is a chunk, not a static cost. */
function staticSpecifiers(source: string): string[] {
  return [...source.matchAll(STATIC_SPECIFIER)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/** The chunks the file splits off, which load only when the branch that names them runs. */
function dynamicSpecifiers(source: string): string[] {
  return [...source.matchAll(DYNAMIC_SPECIFIER)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

/** The file a specifier loads, or undefined when it names a package rather than a file. A module
 *  path is either the file itself or the `index.ts` of the directory it names, as the bundler
 *  resolves it. */
function resolveSpecifier(specifier: string, fromFile: string): string | undefined {
  const base = specifier.startsWith('@/')
    ? join(NEXT_ROOT, specifier.slice('@/'.length))
    : specifier.startsWith('.')
      ? join(dirname(fromFile), specifier)
      : undefined;
  if (base === undefined) return undefined;
  return existsSync(`${base}.ts`) ? `${base}.ts` : join(base, 'index.ts');
}

function closureOf(entryFile: string) {
  const files = new Set<string>();
  const bare = new Set<string>();
  const pending = [entryFile];
  while (pending.length > 0) {
    const file = pending.pop() as string;
    if (files.has(relative(NEXT_ROOT, file))) continue;
    files.add(relative(NEXT_ROOT, file));
    for (const specifier of staticSpecifiers(readFileSync(file, 'utf-8'))) {
      const resolved = resolveSpecifier(specifier, file);
      if (resolved === undefined) bare.add(specifier);
      else pending.push(resolved);
    }
  }
  return { files, bare };
}

// Anchored at a path segment: `hosts/hook/agent-detection.ts` is the Claude transcript
// attribution the hook path itself needs, while `hosts/<id>/install.ts`, a detector, the doctor
// modules and `hosts/system-info.ts` (which spawns a host CLI) are the CLI's, as is every file
// under `cli/`.
const OFF_THE_HOOK_PATH =
  /(^|\/)(install|detect|doctor|system-info)|^cli\/|(^|\/)gui\/|rules-manager\/|^core\/policy\/schema\.ts$/;
const IN_PROCESS_ENTRIES = [
  'hosts/openclaw/',
  'hosts/opencode/',
  'hosts/pi/',
  'hosts/amp/',
  'hosts/templates/',
];

const offTheHookPath = (file: string) =>
  // `cli/args.ts` is the exception under `cli/`: the hook verb parses its own flags with the
  // shared parser, so the whole CLI's argument parser — and nothing else it carries — is on the
  // hook path.
  file !== 'cli/args.ts' &&
  (OFF_THE_HOOK_PATH.test(file) ||
    IN_PROCESS_ENTRIES.some((prefix) => file.startsWith(prefix)) ||
    file === 'entries/api.ts');

const offTheCheckout = (specifier: string) => !specifier.startsWith('node:') && specifier !== 'bun';

const closure = closureOf(HOOK_ENTRY);

describe('the hook entry closure', () => {
  test('cold-start budget: the gate, the writer and the adapters, and nothing the CLI carries', () => {
    expect(
      [
        'gate/pipeline.ts',
        'audit/writer.ts',
        'entries/hook-integrations.ts',
        'hosts/antigravity-cli/hook.ts',
        'hosts/claude-code/hook.ts',
        'hosts/codex/hook.ts',
        'hosts/copilot-cli/hook.ts',
        'hosts/cursor/hook.ts',
        'hosts/gemini-cli/hook.ts',
        'hosts/grok-build/hook.ts',
        'hosts/hermes-agent/hook.ts',
        'hosts/kimi-code/hook.ts',
      ].filter((file) => !closure.files.has(file)),
    ).toEqual([]);
    expect([...closure.files].filter(offTheHookPath)).toEqual([]);
  });

  test('the bin reaches the CLI through exactly one dynamic import', () => {
    expect(dynamicSpecifiers(readFileSync(HOOK_ENTRY, 'utf-8'))).toEqual(['@/cli/main']);
  });

  test('the CLI chunk carries the GUI on a static import', () => {
    expect(staticSpecifiers(readFileSync(join(NEXT_ROOT, 'cli', 'main.ts'), 'utf-8'))).toContain(
      '@/gui/index',
    );
  });

  test('git-checkout mode: the closure names no package', () => {
    expect([...closure.bare].filter(offTheCheckout)).toEqual([]);
  });

  test('the predicates are falsifiable', () => {
    const source =
      "import { a } from '@/core/policy/schema'; import z from 'zod'; import { b } from './x'; import { c } from '@/hosts/system-info';";
    const specifiers = staticSpecifiers(source);
    expect(specifiers).toEqual(['@/core/policy/schema', 'zod', './x', '@/hosts/system-info']);

    const resolved = specifiers.map((specifier) => resolveSpecifier(specifier, HOOK_ENTRY));
    expect(
      resolved
        .filter((file) => file !== undefined)
        .map((file) => relative(NEXT_ROOT, file))
        .filter(offTheHookPath),
    ).toEqual(['core/policy/schema.ts', 'hosts/system-info.ts']);
    expect(
      specifiers.filter((_, index) => resolved[index] === undefined).filter(offTheCheckout),
    ).toEqual(['zod']);

    expect(offTheHookPath('cli/args.ts')).toBeFalse();
    expect(offTheHookPath('cli/main.ts')).toBeTrue();
    expect(offTheHookPath('rules-manager/sync.ts')).toBeTrue();
    expect(offTheHookPath('cli/rule/index.ts')).toBeTrue();
    expect(offTheHookPath('gui/index.ts')).toBeTrue();
    expect(offTheHookPath('gui/frontend/main.ts')).toBeTrue();
    expect(
      dynamicSpecifiers(
        "const cli = await import('@/cli/main');\nconst gui = await import('@/cli/gui');\n",
      ),
    ).toEqual(['@/cli/main', '@/cli/gui']);
  });
});
