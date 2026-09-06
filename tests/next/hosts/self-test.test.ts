import { afterEach, describe, expect, test } from 'bun:test';
import { runIntegrationSelfTest } from '@next/hosts/self-test';
import { runIntegrationSelfTest as shippedRunIntegrationSelfTest } from '@/integrations/self-test';
import { clearAuditLogs, readAuditEntries } from '../helpers/hook-capture';
import {
  createTempRoot,
  environmentFor,
  isolationEnv,
  removeTempRoots,
  snapshotHome,
  withProcessEnv,
} from '../helpers/temp-home';

/**
 * `doctor` exits 1 when this suite fails, so the three verdicts and the rule ids behind them are
 * contract. The suite hands the audit writer no session id, so it also has to leave nothing
 * behind: the port moved its working directory from `os.tmpdir()` onto the environment, and a
 * directory or an audit home that drifted would show up as a file under the isolated home.
 */

describe('the engine self-test', () => {
  afterEach(removeTempRoots);

  test('reaches the same verdicts as the shipped suite and writes nothing', () => {
    const root = createTempRoot('self-test-');
    const env = isolationEnv(root);
    const auditHome = env.CC_SAFETY_NET_AUDIT_HOME as string;

    const shipped = withProcessEnv(env, () => {
      const summary = shippedRunIntegrationSelfTest();
      const left = { entries: readAuditEntries(auditHome), tree: snapshotHome(root) };
      clearAuditLogs(auditHome);
      return { summary, ...left };
    });
    const ported = {
      summary: runIntegrationSelfTest(environmentFor(root, env)),
      entries: readAuditEntries(auditHome),
      tree: snapshotHome(root),
    };

    expect(ported).toStrictEqual(shipped);
    expect(ported).toMatchSnapshot();
    expect(ported.summary.passed).toBe(3);
    expect(ported.summary.failed).toBe(0);
    expect(ported.summary.results.map((result) => result.ruleId)).toEqual([
      'git.reset-hard',
      'rm.recursive-force-root-or-home',
      undefined,
    ]);
    expect(ported.entries).toEqual([]);
    expect(ported.tree.map((entry) => entry.path)).toEqual(['tmp']);
  });
});
