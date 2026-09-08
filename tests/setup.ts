import { afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testHome = mkdtempSync(
  join(process.env.CC_SAFETY_NET_TEST_TMPDIR ?? tmpdir(), 'cc-safety-net-test-home-'),
);
// Spawned children inherit the environment as it was at process start, so these
// assignments are invisible to them. Any test that spawns a subprocess running
// the guard must pass `env: { ...process.env }` explicitly or its audit entries
// land in the developer's real ~/.cc-safety-net/logs.
process.env.CC_SAFETY_NET_AUDIT_HOME = join(testHome, 'audit-home');
process.env.CC_SAFETY_NET_HOME ??= join(testHome, 'safety-net-home');
process.env.CC_SAFETY_NET_NO_UPDATE_CHECK = '1';
// `shouldUseColor()` reads the suite's own stdout, so every record of CLI output would carry
// ANSI escapes when a developer runs the tests in a terminal and none when CI pipes them. The
// records hold the plain text; the rows whose contract is the colored output hold a terminal open
// and unset this themselves.
process.env.NO_COLOR = '1';
// Agent detection reads these as evidence; running the suite inside a Claude
// Code session would otherwise flip 'unknown' expectations to 'claude-code'.
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
// The npx-cache helper honors npm_config_cache; under an npm-driven test run it
// would point spawned CLIs at the developer's real npx cache.
delete process.env.npm_config_cache;
// The Hermes and OpenClaw resolvers read these before the homeDir a test passes, so a
// developer who exports one runs the install and uninstall cases against their real
// plugin directory. Cleared here rather than per suite: the subprocess helpers rebuild
// their environment from process.env, so one deletion covers direct calls and spawned
// CLIs alike. Cases that need a value set it with withEnv.
delete process.env.HERMES_HOME;
delete process.env.OPENCLAW_STATE_DIR;
delete process.env.OPENCLAW_CONFIG_PATH;
// OpenCode's config and cache roots honour these before the homeDir a test passes, so a
// developer who exports them runs the install, uninstall, and detect cases against their real
// XDG directories (uninstall even rm -rf's the real plugin cache). Cleared here rather than per
// suite for the same reason as the OpenClaw vars above. Cases that need a value set it with withEnv.
delete process.env.XDG_CONFIG_HOME;
delete process.env.XDG_CACHE_HOME;

afterAll(() => rmSync(testHome, { recursive: true, force: true }));
