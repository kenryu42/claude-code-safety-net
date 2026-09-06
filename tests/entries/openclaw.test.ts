import { expect, test } from 'bun:test';
import portedOpenClawEntry from '@/entries/openclaw';

/**
 * OpenClaw loads this default export by name from the installed extension directory, so the entry
 * is an external format: the id it registers under, the text the host shows the user, and a
 * callable `register` are the whole contract, and all three are recorded here.
 */

test('the OpenClaw entry declares the same extension, with a register hook to call', () => {
  expect({
    ...portedOpenClawEntry,
    register: typeof portedOpenClawEntry.register,
  }).toMatchSnapshot();
});

test('it registers under the id the shipped manifest names', () => {
  expect(portedOpenClawEntry.id).toBe('cc-safety-net');
  expect(portedOpenClawEntry.name).toBe('CC Safety Net');
});
