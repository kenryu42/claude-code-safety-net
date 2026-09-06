import { describe, expect, test } from 'bun:test';
import {
  INSTALL_TARGETS,
  type InstallTarget,
  orderInstallTargets,
  runInstallTargetsInOrder,
} from '@/hosts/install/targets';

const SELECTION: readonly InstallTarget[] = ['pi', 'cursor', 'amp', 'cursor'];

describe('install targets', () => {
  test('the table is the catalog row for row', () => {
    expect(INSTALL_TARGETS).toMatchSnapshot();
  });

  test('a selection is deduplicated and put back into catalog order', () => {
    expect(orderInstallTargets(SELECTION)).toEqual(['amp', 'cursor', 'pi']);
  });

  test('the ordered run visits each target once, in the order it was handed', async () => {
    const record = async (run: typeof runInstallTargetsInOrder) => {
      const visited: InstallTarget[] = [];
      await run(orderInstallTargets(SELECTION), async (target) => {
        visited.push(target);
      });
      return visited;
    };
    const visited = await record(runInstallTargetsInOrder);
    expect(visited).toMatchSnapshot();
  });
});
