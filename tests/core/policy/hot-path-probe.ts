import { createRequire } from 'node:module';
import { sep } from 'node:path';

/**
 * Not a test: the child process behind `hot-path.test.ts`. It imports the module named by
 * its first argument, reports how many loaded modules came from the schema library, then
 * imports the module named by its second argument and reports again. The second count is
 * the control — without it a probe that simply cannot see the library would pass.
 */

const loaded = createRequire(import.meta.url).cache;

function schemaLibraryModules(): number {
  return Object.keys(loaded).filter((key) => key.includes(`${sep}node_modules${sep}zod${sep}`))
    .length;
}

await import(process.argv[2] as string);
console.log(schemaLibraryModules());
await import(process.argv[3] as string);
console.log(schemaLibraryModules());
