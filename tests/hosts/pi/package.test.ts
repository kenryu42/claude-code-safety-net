import { describe, expect, test } from 'bun:test';
import pkg from '../../../package.json';

describe('Pi package manifest', () => {
  test('declares the Pi extension entrypoint for pi install npm:cc-safety-net', () => {
    expect(pkg.pi).toEqual({ extensions: ['./dist/pi/index.js'] });
    expect(pkg.keywords).toContain('pi-package');
  });
});
