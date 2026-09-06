import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * The rebuild under `next/` is a second implementation of the same contract,
 * not a layer over the old one. Two rules keep it that way until cutover:
 * nothing under `next/` imports `src/`, and nothing under `next/` imports a
 * third-party package, except the files listed below — the schema validator,
 * which every other module reaches for diagnostics through `validate.ts` so the
 * loader never pulls it onto the hook's path, and the host layer, allowed here
 * per file when Phase 5 lands the first one.
 */

const NEXT_ROOT = join(import.meta.dir, '..', 'src');
const SCHEMA_MODULE = join(NEXT_ROOT, 'core', 'policy', 'schema.ts');
/** The legacy `.safety-net.json` validator: a diagnostic-only module the hook path never loads,
 *  and the one place besides the schema itself that the schema library is reached from. */
const LEGACY_CONFIG_VALIDATOR = join(NEXT_ROOT, 'core', 'policy', 'config-file.ts');

const THIRD_PARTY_ALLOWANCES: Record<string, readonly string[]> = {
  'core/policy/schema.ts': ['zod'],
  // The two hosts whose SDK types are the host's own parameter shapes: an `import type` is erased,
  // so neither the cold-start closure nor a git checkout without `node_modules` ever sees them.
  'hosts/opencode/plugin.ts': ['@opencode-ai/plugin'],
  'entries/index.ts': ['@opencode-ai/plugin'],
  'hosts/amp/tool-call.ts': ['@ampcode/plugin'],
  'entries/amp.ts': ['@ampcode/plugin'],
};

/** The layers a host adapter may reach for; `entries` is above it, and `hosts` is its own. */
const HOST_LAYERS = ['core', 'gate', 'audit', 'hosts'];
const NETWORK_MODULES = ['node:http', 'node:https', 'node:net', 'http', 'https', 'net'];
/**
 * The installers' spawn boundary: the four host-layer files whose `src/` counterparts spawn a
 * host CLI. The hook path never spawns, and the import-closure test keeps all four off it.
 */
const CHILD_PROCESS_ALLOWANCES: readonly string[] = [
  'hosts/amp/run.ts',
  'hosts/install/native.ts',
  'hosts/install/choices.ts',
  'hosts/system-info.ts',
  // The browser opener and `gh`.
  'gui/index.ts',
  // The folder dialogs.
  'gui/choose-directory.ts',
];

/** The one loopback listener under `next/`. */
const NETWORK_ALLOWANCES: Record<string, readonly string[]> = { 'gui/index.ts': ['node:http'] };

/** The layers a CLI command may reach for; `entries` is above it, and `cli` is its own. */
const CLI_LAYERS = ['core', 'gate', 'audit', 'hosts', 'rules-manager', 'cli'];

/** The layers the rulebook manager may reach for; `cli` and `entries` are above it. */
const RULES_MANAGER_LAYERS = ['core', 'gate', 'audit', 'hosts', 'rules-manager'];

/** The one host-tier module that reaches into `cli`, for the install flow, the argument parser,
 *  doctor's activity summary and its update check. */
const GUI_LAYERS = ['core', 'gate', 'audit', 'hosts', 'rules-manager', 'cli', 'gui'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf-8' })
    .filter((entry) => entry.endsWith('.ts'))
    .map((entry) => join(dir, entry));
}

// The third alternative is `createRequire`: the schema module reaches its validator
// that way, so that line would otherwise name a package no static import mentions.
const IMPORT_SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\w*[rR]equire\s*\((?:[^()'"]*\)\s*\()?\s*['"]([^'"]+)['"]\s*\)/g;

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(IMPORT_SPECIFIER)].flatMap((match) => {
    const specifier = match[1] ?? match[2] ?? match[3];
    return specifier === undefined ? [] : [specifier];
  });
}

function isAllowed(specifier: string, file: string): boolean {
  if (specifier.startsWith('node:')) return true;
  if (specifier.startsWith('@/')) return true;
  if (specifier.startsWith('.')) {
    return !relative(NEXT_ROOT, join(file, '..', specifier)).startsWith('..');
  }
  if (specifier === 'bun') return true;
  return (THIRD_PARTY_ALLOWANCES[relative(NEXT_ROOT, file)] ?? []).includes(specifier);
}

/**
 * The top-level directory under `next/` a specifier resolves to, so the layering rule reads the
 * layer rather than the spelling: `../audit/writer` and `@/audit/writer` are one violation.
 */
function layerOf(specifier: string, file: string) {
  if (specifier.startsWith('@/')) return specifier.split('/')[1];
  if (!specifier.startsWith('.')) return undefined;
  return relative(NEXT_ROOT, join(file, '..', specifier)).split(sep)[0];
}

function resolvesToSchemaModule(specifier: string, file: string): boolean {
  if (specifier === '@/core/policy/schema') return true;
  if (!specifier.startsWith('.')) return false;
  const resolved = join(file, '..', specifier);
  return resolved === SCHEMA_MODULE || `${resolved}.ts` === SCHEMA_MODULE;
}

/** The specifiers a file imports as types only, which are erased before anything runs. */
const TYPE_ONLY_IMPORT = /(?:^|\n)\s*(import\b[^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g;

function typeOnlyImports(source: string): string[] {
  return [...source.matchAll(TYPE_ONLY_IMPORT)].flatMap((match) =>
    match[2] !== undefined && match[1]?.startsWith('import type') ? [match[2]] : [],
  );
}

/**
 * The host tier: an adapter reaches down into the gate, core and audit and never back up into an
 * entry, and no file the hook path loads opens a socket or spawns a process — the two capabilities
 * a gate that runs on every tool call has no use for.
 */
function layeringViolations(file: string, source: string): string[] {
  const path = relative(NEXT_ROOT, file);
  const layer = path.split(sep)[0];
  const specifiers = importSpecifiers(source);
  const allowedThirdParty = THIRD_PARTY_ALLOWANCES[path] ?? [];
  const offending = specifiers.filter((specifier) => {
    // The socket ban holds for every layer: below the hosts nothing may open one at all, and
    // `node:https` reached from `core` is the same violation as `node:http` reached from `gui`.
    if (NETWORK_MODULES.includes(specifier))
      return !(NETWORK_ALLOWANCES[path] ?? []).includes(specifier);
    if (
      layer === 'hosts' ||
      layer === 'entries' ||
      layer === 'cli' ||
      layer === 'rules-manager' ||
      layer === 'gui'
    ) {
      if (specifier === 'node:child_process') return !CHILD_PROCESS_ALLOWANCES.includes(path);
    }
    if (layer === 'hosts') {
      if (specifier.startsWith('node:') || allowedThirdParty.includes(specifier)) return false;
      return !HOST_LAYERS.includes(layerOf(specifier, file) ?? '');
    }
    if (layer === 'cli') {
      if (specifier.startsWith('node:') || allowedThirdParty.includes(specifier)) return false;
      if (layerOf(specifier, file) === 'gui') return path !== 'cli/main.ts';
      return !CLI_LAYERS.includes(layerOf(specifier, file) ?? '');
    }
    if (layer === 'rules-manager') {
      if (specifier.startsWith('node:') || allowedThirdParty.includes(specifier)) return false;
      return !RULES_MANAGER_LAYERS.includes(layerOf(specifier, file) ?? '');
    }
    if (layer === 'gui') {
      if (specifier.startsWith('node:')) return false;
      return !GUI_LAYERS.includes(layerOf(specifier, file) ?? '');
    }
    if (layer === 'core' || layer === 'gate' || layer === 'audit') {
      if (layer === 'core' && layerOf(specifier, file) === 'gate') return true;
      return (
        layerOf(specifier, file) === 'hosts' ||
        layerOf(specifier, file) === 'entries' ||
        layerOf(specifier, file) === 'cli' ||
        layerOf(specifier, file) === 'rules-manager' ||
        layerOf(specifier, file) === 'gui'
      );
    }
    return false;
  });
  return [
    ...offending.map((specifier) => `${path} imports ${specifier}`),
    ...allowedThirdParty
      .filter(
        (specifier) =>
          (layer === 'hosts' || layer === 'entries') &&
          specifiers.includes(specifier) &&
          !typeOnlyImports(source).includes(specifier),
      )
      .map((specifier) => `${path} imports ${specifier} as a value`),
  ];
}

/**
 * A static import cycle is a pair of modules neither of which can be loaded on its own: whichever
 * one the loader reaches first runs against a half-initialized other half, so a constant read at
 * module scope is `undefined` and no type checks the difference. Only value imports build the
 * graph — an `import type` is erased before anything runs.
 */
const VALUE_IMPORT = /(?:^|[\n;])\s*((?:import|export)\b[^'"]*?)\bfrom\s*['"]([^'"]+)['"]/g;

/** The files a module loads at import time, resolved the way the bundler resolves them: a module
 *  path names either the file itself or the `index.ts` of the directory. */
function importedModules(file: string, source: string): string[] {
  return [...source.matchAll(VALUE_IMPORT)].flatMap((match) => {
    const specifier = match[2];
    if (specifier === undefined || match[1]?.trimStart().startsWith('import type')) return [];
    const base = specifier.startsWith('@/')
      ? join(NEXT_ROOT, specifier.slice('@/'.length))
      : specifier.startsWith('.')
        ? join(file, '..', specifier)
        : undefined;
    if (base === undefined) return [];
    return [existsSync(`${base}.ts`) ? `${base}.ts` : join(base, 'index.ts')];
  });
}

/** Three-colour depth-first search over the import graph: a node still on the walking stack is
 *  grey, and an edge back to one is a cycle, reported as the stack from that node onward. */
function findImportCycles(graph: Map<string, string[]>): string[][] {
  const visited = new Map<string, 'walking' | 'done'>();
  const cycles: string[][] = [];
  for (const root of graph.keys()) {
    if (visited.has(root)) continue;
    visited.set(root, 'walking');
    const walked = [root];
    const frames = [{ node: root, edges: graph.get(root) ?? [], next: 0 }];
    while (frames.length > 0) {
      const frame = frames.at(-1) as (typeof frames)[number];
      if (frame.next === frame.edges.length) {
        visited.set(frame.node, 'done');
        walked.pop();
        frames.pop();
        continue;
      }
      const edge = frame.edges[frame.next] as string;
      frame.next += 1;
      if (visited.get(edge) === 'walking') {
        cycles.push([...walked.slice(walked.indexOf(edge)), edge]);
        continue;
      }
      if (visited.has(edge)) continue;
      visited.set(edge, 'walking');
      walked.push(edge);
      frames.push({ node: edge, edges: graph.get(edge) ?? [], next: 0 });
    }
  }
  return cycles;
}

/** A dynamic import the bundler cannot see through: its target is decided at run time, so it is
 *  never bundled and resolves against whatever the installed tree happens to hold. */
const NON_LITERAL_IMPORT = /\bimport\s*\((?!\s*["'])/;

/**
 * The capabilities the layers beneath the hosts have no use for. The gate runs on every tool call
 * from a bundle that must work in a checkout with no `node_modules`: it never calls out to the
 * network, never falls back to CommonJS to reach a package, and never defers a load it cannot name.
 */
const LOW_LAYER_BANS = [
  /\bfetch\s*\(/,
  /\brequire\s*\(/,
  /\bcreateRequire\b/,
  NON_LITERAL_IMPORT,
] as const;

/** The installer imports the cached plugin's `main` entry through `pathToFileURL` to prove the
 *  export is callable — a runtime path by nature, and off the hook path. */
const DYNAMIC_IMPORT_ALLOWANCES: readonly string[] = ['hosts/opencode/install.ts'];

function matchedBans(path: string, source: string, patterns: readonly RegExp[]): string[] {
  return source.split('\n').flatMap((line) =>
    patterns.flatMap((pattern) => {
      const match = line.match(pattern);
      return match === null ? [] : [`${path}: ${match[0]}`];
    }),
  );
}

function lowLayerBans(path: string, source: string): string[] {
  const layer = path.split(sep)[0];
  if (layer !== 'core' && layer !== 'gate' && layer !== 'audit') return [];
  return matchedBans(path, source, LOW_LAYER_BANS);
}

function dynamicImportBans(path: string, source: string): string[] {
  if (DYNAMIC_IMPORT_ALLOWANCES.includes(path)) return [];
  return matchedBans(path, source, [NON_LITERAL_IMPORT]);
}

describe('next/ architecture', () => {
  const files = sourceFiles(NEXT_ROOT);

  test('contains source files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test('never imports src/ and never imports a third-party package', () => {
    const violations = files.flatMap((file) =>
      importSpecifiers(readFileSync(file, 'utf-8'))
        .filter((specifier) => !isAllowed(specifier, file))
        .map((specifier) => `${relative(NEXT_ROOT, file)} imports ${specifier}`),
    );
    expect(violations).toEqual([]);
  });

  test('audit sits under core, and neither core nor gate reaches back into it', () => {
    const violations = files.flatMap((file) => {
      const path = relative(NEXT_ROOT, file);
      const specifiers = importSpecifiers(readFileSync(file, 'utf-8'));
      const offending = path.startsWith(`audit${sep}`)
        ? specifiers.filter(
            (specifier) =>
              !specifier.startsWith('node:') &&
              layerOf(specifier, file) !== 'core' &&
              layerOf(specifier, file) !== 'audit',
          )
        : specifiers.filter(
            (specifier) =>
              layerOf(specifier, file) === 'audit' &&
              (path.startsWith(`core${sep}`) || path.startsWith(`gate${sep}`)),
          );
      return offending.map((specifier) => `${path} imports ${specifier}`);
    });
    expect(violations).toEqual([]);
  });

  test('the schema validator is imported by no module under next/ but the legacy config validator', () => {
    const violations = files
      .filter((file) => file !== SCHEMA_MODULE && file !== LEGACY_CONFIG_VALIDATOR)
      .flatMap((file) =>
        importSpecifiers(readFileSync(file, 'utf-8'))
          .filter((specifier) => resolvesToSchemaModule(specifier, file))
          .map((specifier) => `${relative(NEXT_ROOT, file)} imports ${specifier}`),
      );
    expect(violations).toEqual([]);
  });

  test('hosts import gate, core and audit; entries import anything below; nothing reaches up', () => {
    expect(files.flatMap((file) => layeringViolations(file, readFileSync(file, 'utf-8')))).toEqual(
      [],
    );
  });

  test('the rule is falsifiable', () => {
    const file = join(NEXT_ROOT, 'core', 'example.ts');
    const offending =
      "import y from 'zod';\nimport { z } from '../../tests/helpers';\nimport { ok } from './decision';\nimport { n } from 'node:fs';\nconst lazy = await import('@/core/decision');\nconst required = require('zod');\nconst lazily = createRequire(import.meta.url)('zod');\n";
    expect(importSpecifiers(offending).filter((specifier) => !isAllowed(specifier, file))).toEqual([
      'zod',
      '../../tests/helpers',
      'zod',
      'zod',
    ]);

    const snapshot = join(NEXT_ROOT, 'core', 'policy', 'snapshot.ts');
    expect(isAllowed('zod', SCHEMA_MODULE)).toBeTrue();
    expect(isAllowed('zod', snapshot)).toBeFalse();
    // The legacy validator reaches the schema module, never the package behind it.
    expect(isAllowed('zod', LEGACY_CONFIG_VALIDATOR)).toBeFalse();
    expect(resolvesToSchemaModule('./schema', snapshot)).toBeTrue();
    expect(resolvesToSchemaModule('@/core/policy/schema', snapshot)).toBeTrue();
    expect(resolvesToSchemaModule('./validate', snapshot)).toBeFalse();

    const pipeline = join(NEXT_ROOT, 'gate', 'pipeline.ts');
    expect(layerOf('../audit/writer', pipeline)).toBe('audit');
    expect(layerOf('@/audit/writer', pipeline)).toBe('audit');
    expect(layerOf('../core/redaction', join(NEXT_ROOT, 'audit', 'display.ts'))).toBe('core');
    expect(layerOf('node:fs', pipeline)).toBeUndefined();

    expect(
      layeringViolations(
        join(NEXT_ROOT, 'hosts', 'example', 'hook.ts'),
        "import { main } from '@/entries/bin';\nimport { request } from 'node:http';\nimport { spawn } from 'node:child_process';\n",
      ),
    ).toEqual([
      'hosts/example/hook.ts imports @/entries/bin',
      'hosts/example/hook.ts imports node:http',
      'hosts/example/hook.ts imports node:child_process',
    ]);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'cli', 'example.ts'),
        "import { main } from '@/entries/bin';\nimport { parseCommandArgs } from '@/entries/args';\n",
      ),
    ).toEqual(['cli/example.ts imports @/entries/bin', 'cli/example.ts imports @/entries/args']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'cli', 'example.ts'),
        "import { spawn } from 'node:child_process';\nimport { request } from 'node:http';\n",
      ),
    ).toEqual(['cli/example.ts imports node:child_process', 'cli/example.ts imports node:http']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'core', 'example.ts'),
        "import { writeGuardAudit } from '@/hosts/audit';\n",
      ),
    ).toEqual(['core/example.ts imports @/hosts/audit']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'core', 'example.ts'),
        "import { colorize } from '@/cli/utils/colors';\n",
      ),
    ).toEqual(['core/example.ts imports @/cli/utils/colors']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'core', 'example.ts'),
        "import { request } from 'node:https';\n",
      ),
    ).toEqual(['core/example.ts imports node:https']);
    const gateHelper = "import { analysisWordText } from '@/gate/analyzer/command-words';\n";
    expect(layeringViolations(join(NEXT_ROOT, 'core', 'example.ts'), gateHelper)).toEqual([
      'core/example.ts imports @/gate/analyzer/command-words',
    ]);
    expect(layeringViolations(join(NEXT_ROOT, 'gate', 'rulebook-fixtures.ts'), gateHelper)).toEqual(
      [],
    );
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'rules-manager', 'example.ts'),
        "import { runCli } from '@/cli/main';\nimport { request } from 'node:https';\nimport { spawn } from 'node:child_process';\n",
      ),
    ).toEqual([
      'rules-manager/example.ts imports @/cli/main',
      'rules-manager/example.ts imports node:https',
      'rules-manager/example.ts imports node:child_process',
    ]);
    const managerHelper = "import { syncRulesConfig } from '@/rules-manager/sync';\n";
    expect(layeringViolations(join(NEXT_ROOT, 'core', 'example.ts'), managerHelper)).toEqual([
      'core/example.ts imports @/rules-manager/sync',
    ]);
    expect(layeringViolations(join(NEXT_ROOT, 'gate', 'example.ts'), managerHelper)).toEqual([
      'gate/example.ts imports @/rules-manager/sync',
    ]);
    expect(
      layeringViolations(join(NEXT_ROOT, 'hosts', 'example', 'hook.ts'), managerHelper),
    ).toEqual(['hosts/example/hook.ts imports @/rules-manager/sync']);
    expect(layeringViolations(join(NEXT_ROOT, 'cli', 'rule', 'index.ts'), managerHelper)).toEqual(
      [],
    );
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'rules-manager', 'sync.ts'),
        "import { evaluateRulebookFixtures } from '@/gate/rulebook-fixtures';\nimport { getLocalRulebookPath } from '@/core/policy/paths';\n",
      ),
    ).toEqual([]);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'hosts', 'install', 'native.ts'),
        "import { spawn } from 'node:child_process';\n",
      ),
    ).toEqual([]);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'hosts', 'opencode', 'plugin.ts'),
        "import { Plugin } from '@opencode-ai/plugin';\n",
      ),
    ).toEqual(['hosts/opencode/plugin.ts imports @opencode-ai/plugin as a value']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'gui', 'activity.ts'),
        "import { createServer } from 'node:http';\nimport { spawn } from 'node:child_process';\nimport { main } from '@/entries/bin';\n",
      ),
    ).toEqual([
      'gui/activity.ts imports node:http',
      'gui/activity.ts imports node:child_process',
      'gui/activity.ts imports @/entries/bin',
    ]);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'gui', 'index.ts'),
        "import { createServer } from 'node:http';\nimport { spawn } from 'node:child_process';\nimport { runInstallCommand } from '@/cli/install/index';\nimport { request } from 'node:https';\n",
      ),
    ).toEqual(['gui/index.ts imports node:https']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'gui', 'index.ts'),
        "import { createConnection } from 'node:net';\n",
      ),
    ).toEqual(['gui/index.ts imports node:net']);
    expect(
      layeringViolations(
        join(NEXT_ROOT, 'gui', 'choose-directory.ts'),
        "import { spawn } from 'node:child_process';\nimport { createServer } from 'node:http';\n",
      ),
    ).toEqual(['gui/choose-directory.ts imports node:http']);
    const guiEntry = "import { runGuiCommand } from '@/gui/index';\n";
    expect(layeringViolations(join(NEXT_ROOT, 'cli', 'main.ts'), guiEntry)).toEqual([]);
    expect(layeringViolations(join(NEXT_ROOT, 'cli', 'status.ts'), guiEntry)).toEqual([
      'cli/status.ts imports @/gui/index',
    ]);
    const guiHelper = "import { getActivityFeed } from '@/gui/activity';\n";
    expect(layeringViolations(join(NEXT_ROOT, 'core', 'example.ts'), guiHelper)).toEqual([
      'core/example.ts imports @/gui/activity',
    ]);
    expect(layeringViolations(join(NEXT_ROOT, 'gate', 'example.ts'), guiHelper)).toEqual([
      'gate/example.ts imports @/gui/activity',
    ]);
    expect(layeringViolations(join(NEXT_ROOT, 'audit', 'example.ts'), guiHelper)).toEqual([
      'audit/example.ts imports @/gui/activity',
    ]);
    expect(layeringViolations(join(NEXT_ROOT, 'hosts', 'example', 'hook.ts'), guiHelper)).toEqual([
      'hosts/example/hook.ts imports @/gui/activity',
    ]);
    expect(layeringViolations(join(NEXT_ROOT, 'rules-manager', 'example.ts'), guiHelper)).toEqual([
      'rules-manager/example.ts imports @/gui/activity',
    ]);
  });

  test('no module under next/ loads another in a cycle', () => {
    const graph = new Map(
      files
        .filter((file) => !relative(NEXT_ROOT, file).startsWith(join('gui', 'frontend')))
        .map((file) => [file, importedModules(file, readFileSync(file, 'utf-8'))] as const),
    );
    expect(
      findImportCycles(graph).map((cycle) => cycle.map((file) => relative(NEXT_ROOT, file))),
    ).toEqual([]);
  });

  test('core, gate and audit reach neither the network, CommonJS nor an unnameable load', () => {
    expect(
      files.flatMap((file) => lowLayerBans(relative(NEXT_ROOT, file), readFileSync(file, 'utf-8'))),
    ).toEqual([]);
  });

  test('every dynamic import under next/ names its target as a literal', () => {
    expect(
      files.flatMap((file) =>
        dynamicImportBans(relative(NEXT_ROOT, file), readFileSync(file, 'utf-8')),
      ),
    ).toEqual([]);
  });

  test('the cycle and capability rules are falsifiable', () => {
    expect(
      findImportCycles(
        new Map([
          ['a.ts', ['b.ts']],
          ['b.ts', ['a.ts']],
          ['c.ts', ['a.ts']],
        ]),
      ),
    ).toEqual([['a.ts', 'b.ts', 'a.ts']]);
    expect(
      findImportCycles(
        new Map([
          ['a.ts', ['b.ts', 'c.ts']],
          ['b.ts', ['c.ts']],
          ['c.ts', []],
        ]),
      ),
    ).toEqual([]);
    expect(
      importedModules(
        join(NEXT_ROOT, 'gate', 'pipeline.ts'),
        [
          "import type { Budget } from '@/core/budget';",
          "import { evaluateGuard } from './example-missing';",
          "import { redactSecrets } from '@/core/redaction';",
        ].join('\n'),
      ),
    ).toEqual([
      join(NEXT_ROOT, 'gate', 'example-missing', 'index.ts'),
      join(NEXT_ROOT, 'core', 'redaction.ts'),
    ]);

    const banned = [
      'const r = await fetch(url);',
      "const z = require('zod');",
      "import { createRequire } from 'node:module';",
      'const m = await import(name);',
      "const ok = await import('@/cli/main');",
    ].join('\n');
    const core = join('core', 'example.ts');
    expect(lowLayerBans(core, banned)).toEqual([
      `${core}: fetch(`,
      `${core}: require(`,
      `${core}: createRequire`,
      `${core}: import(`,
    ]);
    const hook = join('hosts', 'example', 'hook.ts');
    expect(lowLayerBans(hook, banned)).toEqual([]);
    expect(dynamicImportBans(hook, banned)).toEqual([`${hook}: import(`]);
    expect(dynamicImportBans('hosts/opencode/install.ts', banned)).toEqual([]);
  });
});
