/**
 * Tests for the explain command paranoid mode.
 */
import { describe, expect, test } from 'bun:test';
import { explainCommand } from '@/bin/explain/index';
import { withEnv } from '../../helpers.ts';

describe('explainCommand paranoid mode', () => {
  test('interpreter blocked in paranoid mode', () => {
    withEnv({ SAFETY_NET_PARANOID_INTERPRETERS: '1' }, () => {
      const result = explainCommand('python -c "print(1)"');
      expect(result.result).toBe('blocked');
      expect(result.reason).toContain('paranoid');
      const allSteps = result.trace.segments.flatMap((s) => s.steps);
      const interpStep = allSteps.find((s) => s.type === 'interpreter');
      expect(interpStep).toBeDefined();
      if (interpStep && interpStep.type === 'interpreter') {
        expect(interpStep.paranoidBlocked).toBe(true);
      }
    });
  });

  test('SAFETY_NET_PARANOID enables paranoid interpreters', () => {
    withEnv({ SAFETY_NET_PARANOID: '1' }, () => {
      const result = explainCommand('node -e "console.log(1)"');
      expect(result.result).toBe('blocked');
      expect(result.reason).toContain('paranoid');
    });
  });
});
