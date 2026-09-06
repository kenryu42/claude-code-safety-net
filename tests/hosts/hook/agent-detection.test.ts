import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProcessEnvironment } from '@/core/environment';
import { detectClaudeShapeAgent as portedDetect } from '@/hosts/hook/agent-detection';
import { withEnv } from '../../helpers';

/**
 * Who a Claude-shaped payload came from, decided from the transcript path against the three
 * configuration roots. The port reads the roots and the home off the captured `Environment`
 * instead of `process.env`, so every row drives both implementations under the same variables
 * and the answers have to agree.
 */

let home: string;

beforeEach(() => {
  home = mkdtempSync(
    join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'next-agent-detection-'),
  );
  for (const path of [
    join('.codex', 'sessions', 't.jsonl'),
    join('.codex', 'claude', 'p.jsonl'),
    join('.copilot', 's.jsonl'),
    join('.claude', 'projects', 'p.jsonl'),
    join('cx', 't.jsonl'),
  ]) {
    mkdirSync(join(home, path, '..'), { recursive: true });
    writeFileSync(join(home, path), '{}\n');
  }
  symlinkSync('.codex', join(home, 'link'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

type Row = {
  name: string;
  transcript: (root: string) => unknown;
  env?: Record<string, string | undefined>;
  expected?: string;
};

const ROWS: readonly Row[] = [
  {
    name: 'a transcript under the default Codex root',
    transcript: (root) => join(root, '.codex', 'sessions', 't.jsonl'),
    expected: 'codex',
  },
  {
    name: 'a transcript under the default Copilot root',
    transcript: (root) => join(root, '.copilot', 's.jsonl'),
    expected: 'copilot-cli',
  },
  {
    name: 'a transcript under the default Claude Code root',
    transcript: (root) => join(root, '.claude', 'projects', 'p.jsonl'),
    expected: 'claude-code',
  },
  {
    name: 'a transcript under a relocated Codex root',
    transcript: (root) => join(root, 'cx', 't.jsonl'),
    env: { CODEX_HOME: 'cx' },
    expected: 'codex',
  },
  {
    name: 'a transcript inside two configured roots at once',
    transcript: (root) => join(root, '.codex', 'claude', 'p.jsonl'),
    env: { CLAUDE_CONFIG_DIR: join('.codex', 'claude') },
    expected: 'unknown',
  },
  {
    name: 'a transcript reached through a symlinked root',
    transcript: (root) => join(root, 'link', 'sessions', 't.jsonl'),
    expected: 'codex',
  },
  {
    name: 'a transcript path that does not exist under a root',
    transcript: (root) => join(root, '.codex', 'sessions', 'gone.jsonl'),
  },
  {
    name: 'a relative transcript path',
    transcript: () => join('.codex', 'sessions', 't.jsonl'),
    expected: 'unknown',
  },
  { name: 'a transcript path that is a number', transcript: () => 42, expected: 'unknown' },
  { name: 'a null transcript path', transcript: () => null, expected: 'unknown' },
  { name: 'no transcript path at all', transcript: () => undefined, expected: 'unknown' },
  {
    name: 'no transcript path inside a Claude Code session',
    transcript: () => undefined,
    env: { CLAUDECODE: '1' },
    expected: 'claude-code',
  },
  {
    name: 'no transcript path with a Claude Code entrypoint',
    transcript: () => undefined,
    env: { CLAUDE_CODE_ENTRYPOINT: 'cli' },
    expected: 'claude-code',
  },
];

for (const row of ROWS) {
  test(row.name, () => {
    // A configured root is written relative to the fixture so the row can name it before the
    // temporary home exists; the environment variable itself is absolute, as a host would set it.
    const rooted = (value: string | undefined) =>
      value === undefined ? undefined : join(home, value);
    withEnv(
      {
        HOME: home,
        CODEX_HOME: rooted(row.env?.CODEX_HOME),
        COPILOT_HOME: rooted(row.env?.COPILOT_HOME),
        CLAUDE_CONFIG_DIR: rooted(row.env?.CLAUDE_CONFIG_DIR),
        CLAUDECODE: row.env?.CLAUDECODE,
        CLAUDE_CODE_ENTRYPOINT: row.env?.CLAUDE_CODE_ENTRYPOINT,
      },
      () => {
        const ported = portedDetect(row.transcript(home), createProcessEnvironment());
        expect(ported).toMatchSnapshot();
        if (row.expected) expect<string>(ported).toBe(row.expected);
      },
    );
  });
}
