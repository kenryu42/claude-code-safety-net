import { describe, expect, test } from 'bun:test';
import { getBundledOutputs, isPublicDeclarationOutput } from '../../scripts/build-output';

describe('getBundledOutputs', () => {
  // Phase 5 artifact evidence compares raw `wc -c` bytes for index/CLI/Pi to
  // revision 0bf15f82. CLI startup is measured separately with 10 interleaved
  // cold Node `--help` subprocesses for current and baseline artifacts; it is
  // intentionally not asserted here because absolute process timing is host-sensitive.
  test('finds bundled outputs with Windows paths', () => {
    const outputs = getBundledOutputs([
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\index.js', size: 1000 },
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\bin.js', size: 2000 },
      { path: 'C:\\a\\cc-safety-net\\cc-safety-net\\dist\\pi.js', size: 3000 },
    ]);

    expect(outputs.indexOutput?.size).toBe(1000);
    expect(outputs.binOutput?.size).toBe(2000);
    expect(outputs.piOutput?.size).toBe(3000);
  });

  test('keeps both public declarations with Windows paths', () => {
    // tsc names them relative to rootDir, so both land under entries/; matching the
    // published names instead would delete them before build.ts moves them up.
    expect(isPublicDeclarationOutput('dist\\entries\\index.d.ts')).toBeTrue();
    expect(isPublicDeclarationOutput('dist\\entries\\api.d.ts')).toBeTrue();
    expect(isPublicDeclarationOutput('dist\\api.d.ts')).toBeFalse();
    expect(isPublicDeclarationOutput('dist\\entries\\pi.d.ts')).toBeFalse();
  });
});
