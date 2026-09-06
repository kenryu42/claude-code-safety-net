import { expect, test } from 'bun:test';
import portedOpenClawEntry from '@next/entries/openclaw';
import shippedOpenClawEntry from '@/integrations/openclaw/index';

/**
 * OpenClaw loads this default export by name from the shipped extension directory, so the entry is
 * an external format: the id it registers under, the text the host shows the user, and a callable
 * `register` are the whole contract, and all three must survive the port unchanged.
 */

test('the OpenClaw entry declares the same extension, with a register hook to call', () => {
  const declared = { ...portedOpenClawEntry, register: typeof portedOpenClawEntry.register };
  expect(declared).toEqual({ ...shippedOpenClawEntry, register: 'function' });
  expect(declared).toMatchSnapshot();
});

test('it registers under the id the shipped manifest names', () => {
  expect(portedOpenClawEntry.id).toBe('cc-safety-net');
  expect(portedOpenClawEntry.name).toBe('CC Safety Net');
});
