# Greenfield construction plan

The goal of the `feat/greenfield` branch is to rebuild cc-safety-net from the behavioral contract
in [greenfield-contract.md](greenfield-contract.md) according to the amended design in
[greenfield-design.md](greenfield-design.md), and to cut over in one commit once the new gate
passes every contract row. The branch is done when Phase 11 is complete.

Users should notice almost nothing: the CLI, denial text, host protocols, file formats, rule ids,
and audit layout are preserved. The visible deltas are a closed secret-protection gap
(an agent debugging a Git remote runs `cd ~` and then reads `.ssh/config`; that read becomes a
denial like `cat ~/.ssh/config`), `explain` agreeing with the hook, a leaner hook path, and a
timeout on the one Git subprocess.

## Branch rules

- The new implementation lives under `next/`. The old `src/` is read-only reference until cutover.
- Nothing under `next/` imports from `src/`. Phase 1 adds the architecture-test rule with the first
  file so the rule is falsifiable from day one.
- Structure-independent tests are shared and must pass on both implementations: the corpora in
  `tests/analyzer/behavioral-contract-cases.ts` and `tests/engine/pipeline-contract-cases.ts`, the
  rule-id snapshot in `tests/rules/rule-ids.snapshot.json`, `tests/e2e`, and
  `scripts/verify-package.ts`. The corpora import only types from the implementation; the reason
  strings, stage names, rule ids, and intents they assert are literal contract constants, so the
  `next/` harness (Phase 3) imports the same corpus files and the `next/` gate must reproduce those
  values verbatim. The cutover commit re-points the type imports and nothing else.
- While `src/` exists, every ported module under `next/` carries a differential test under
  `tests/next/` that feeds the same inputs (the corpus commands, fixed tables, a seeded fuzz) to
  the `src/` module and the `next/` module and asserts equal output. Existing test files are never
  copied (`jscpd` scans `tests/`); fresh domain tests cover only behavior the port changes. The
  cutover commit deletes the differential tests and re-points the legacy domain tests.
- `next/` is outside `knip` and `jscpd` until Phase 5 gives it real entries (`next/entries/`);
  until then `tsc` (`noUnusedLocals`) and the differential tests are the dead-code checks.
- A row marked `knownGap` runs as `test.failing` against `src/` and as a plain test against
  `next/`. The cutover commit removes the marker together with the `src/` run. Adding a row is the
  only way to change expected behavior.
- `src/`, `dist/`, and the shipped manifests stay untouched until cutover, so `main` can be merged
  into this branch at any time and every field fix is re-run against the corpus.
- The residual-risk boundary in `REVIEW.md` and `docs/residual-risk.md` governs `next/` exactly as
  it governs `src/`: no parser fidelity to chase a crafted standard-mode bypass.
- Every phase ends with `bun run check` green. Phases that change runtime behavior visible to a
  user (5, 7, 9, 11) also run the `verify-cc-safety-net` skill against an isolated home. Its
  evidence under `artifacts/verify/` is gitignored and local to the machine that ran it; the
  commit message of the phase records the run id and the check results.
- Every lefthook job runs through `scripts/project-bun.ts`, which resolves the pinned Bun
  (1.4.1) with `bunx` when the local Bun differs, so `dist/` is always rebuilt by the pinned
  version and no `LEFTHOOK_EXCLUDE=build` is needed. The pre-push job runs `bun run check`
  through the same wrapper; on a machine whose local Bun is not the pinned one,
  `tests/scripts/project-bun.test.ts` fails inside that nested wrapper (the inner `bun` is not on
  the emptied `PATH`), so such a machine runs `bun run check` explicitly and pushes with
  `LEFTHOOK_EXCLUDE=check`.
- The two root-only failures of the shipped suite (the GUI oversized-POST 413 test and the
  Hermes process-tree kill test) retired with it in Phase 11b; the promoted suite passes as root.
  Everything in `bun run check`, including the 90% coverage floor, must pass locally.

## Phases

Status legend: `[ ]` pending, `[~]` in progress, `[x]` done. Complexity: S, M, L, XL.

### Phase 0 — Contract capture (S) `[x]`

- Route the analyzer corpus through `evaluateGuard`
  (`tests/engine/behavioral-contract-pipeline.test.ts`) so the guard stages sit in front of
  analysis for every row.
- Add pipeline-only rows (`tests/engine/pipeline-contract-cases.ts`): secret protection through
  the shell and through read tools, the metadata-only relaxation at standard versus strict, user
  and project policy-file protection, the `policy apply` invocation block, Git metadata through
  `rm`, redirections, and write tools, tool routing, and fail-closed blank input.
- Mark the reproduced secret-walk gap as `knownGap` (`test.failing`).
- Add the additive-only rule-id snapshot (`tests/rules/rule-id-snapshot.test.ts`,
  `tests/rules/rule-ids.snapshot.json`: 59 destructive records with intent, catastrophic flag,
  and activation gate; 134 secret records with the default-off tier).
- Land the contract, the amended design, and this plan under `docs/`.
- Acceptance: `bun run check` green; the known-gap row fails as expected against `src/`.
- Already covered elsewhere and therefore not duplicated: host payload and response goldens
  (`tests/integrations/hook/routing.test.ts`, `tests/e2e/protection.test.ts`), denial-frame
  goldens (`tests/integrations/format.test.ts`), explain trace goldens
  (`tests/cli/explain/trace-golden.test.ts`), doctor finding ids (`tests/cli/doctor/findings.test.ts`).

### Phase 1 — Core services (L) `[x]`

- `next/core/`: shell parser and command tree (words with text, raw, quoted, provenance; nested
  programs; heredocs with live substitutions; statuses complete, partial, invalid, limited;
  PowerShell subset with command-position auto-detection), one `Budget` with named counters,
  the environment seam (`env`, `home`, `tmpdir`, `realpath`, `entryKind`, `gitMetadata(cwd)`,
  `worktreeFacts(cwd)` with a spawn timeout), safe file I/O (symlink-refusing identity-checked
  reads, atomic writes, JSONC and TOML surgical edits), redaction, the denial renderer, and the
  rule catalog (59 destructive records, 134 secret records, the v1 and v2 custom-rule compiler).
- Decisions settled: the word model stays as shipped (text, raw, span, provenance, quoted
  boolean, parts) because no consumer needs more; the PowerShell subset is exactly what ships;
  parser caps stay parser limits that yield status `limited`; brace overflow, the Git config
  count, and `env -S` overflow stay rule-visible, every other breach throws `AnalysisLimit`.
- Layout: `next/core/shell/` (model, parse, posix, powershell, heredoc, traversal, tokens,
  projection), `next/core/tool-input.ts`, `next/core/budget.ts`, `next/core/environment.ts`,
  `next/core/paths/`, `next/core/git/`, `next/core/io/`, `next/core/redaction.ts`,
  `next/core/denial.ts`, `next/core/decision.ts`, `next/core/rules/`. Imports use the
  `@next/*` alias, re-pointed to `@/*` at cutover.
- Validation: parser domain tests per construct; property test "any string under the caps yields
  a status and never throws except `AnalysisLimit`"; redaction goldens; budget breach per counter.
- Acceptance: the parser assigns the expected status to every corpus command; the architecture
  test enforces `next/` never imports `src/`.
- Risk: the parser is the product's largest liability; every added case needs a corpus row on
  both sides of the standard-allow / strict-deny line.
- Landed: every module is a verbatim port with differential tests against `src/` (both corpora,
  fixed tables, seeded fuzz). Named deviations: `worktreeFacts` yields null (no relaxation) on any
  spawn failure, timeout, or unexpected exit status; the `LIMITS` table gives the analyzer-work
  breaches an error code and collapses their wording to the two documented reasons plus recursion
  depth; `resolveProtectedGitMetadata` takes one cwd. Carried to Phase 3: union
  `gitMetadata(execDir)` and `gitMetadata(policyDir)` when they differ; port
  `src/analyzer/git/env.ts` (import `isGitConfigEnvName` from `next/core/git/worktree.ts`) and
  `normalizeProtectedFileCandidate`; the effective-rule filter (`filterDestructiveCommandMatch`,
  `resolveEffectiveDestructiveCommandRules`, `createCommandAnalysisPolicy`) belongs to Phase 2 or 3.

### Phase 2 — Policy loader (M) `[x]`

- `next/core/policy/`: defaults, user `policy.json` with section-wise salvage, project
  `policy.json` merge and weakening lines, both `rule.json` files (a malformed file drops its
  scope; user scope claims rulebook names first), live rulebooks (v1 and v2 schema, name match,
  vendored-only), environment variables (level raises only; capability flags force on),
  capability provenance, and a `retentionDays` projection. The salvage normalizer reports the
  sections it dropped; schema diagnostics run only on diagnostic surfaces.
- Validation: the fallback matrix in `docs/config-recovery.md` as a table test.
- Acceptance: every degraded case yields the documented fallback and reason; one reader serves
  the gate, the CLI, the GUI, `policy check`, and audit retention.
- Phase 2 landed: `next/core/policy/` is a verbatim port with differential tests; the hot path validates `policy.json`, `rule.json` and rulebooks with hand-written checkers in `validate.ts` that reproduce the zod diagnostics and their order, while `schema.ts` keeps the zod schemas for diagnostic surfaces only (architecture test: zod allowed in that one file, nothing else under `next/` imports it; a child-process probe proves the loader never loads zod). Named deviations: loader entries take the Environment first and a required `cwd` (no `process.cwd()` fallback); the default user home is `environment.home`; `policy.json` keeps its plain read while `rule.json` and rulebooks use the safe reader; `readRetentionDays` is a projection over the same salvaged read, with no snapshot field; `isInterpreterCommand` lives in `next/core/policy/transparent-wrappers.ts` with the four interpreter names as data.
- Effective-capability resolution (`env.ts`), effective destructive-rule state, the per-match filter and `resolveCommandAnalysisContext` live under `next/core/policy/`; Phase 3 imports them and `isInterpreterCommand` from there, and appends the remaining analyzer vocabulary to `next/core/rules/constants.ts` (Phase 2 added `COMMAND_PATTERN`, `MAX_REASON_LENGTH`, `SHELL_WRAPPERS`, `INTERPRETERS`, `PYTHON_INTERPRETER_PATTERN`, `AWK_INTERPRETERS`).
- Carried: `src/policy/diff.ts` and the GUI read/write/preview/repair helpers (Phases 7 and 9); `getRulesConfigRuntimeErrorsForConfig`, the rule.json and starter-rulebook writers, `sources.ts`, the sync budget, and the legacy config validators (Phase 8); lock and legacy path helpers (Phases 7/8); Phase 4 calls `readRetentionDays(environment, options)` at prune time.

### Phase 3 — Gate (XL) `[x]`

- `next/gate/`: intake (input caps, route table, three containment modes), the decision pipeline
  with a single catch boundary, the guard walk (`cd` and simple-assignment tracking) shared by
  the policy-file, policy-apply, Git-metadata, and secret guards, the secret matcher with its
  carrier extractors, and the destructive analyzer with one per-command dispatch (synthesized
  `xargs`, `parallel`, `find -exec`, and unknown-head children carry provenance), one wrapper
  peel, one text detector with a stop-rule parameter, worktree relaxation through the environment
  seam, the rule filter, and a trace sink.
- Validation: both corpora through `runPipeline` at standard and strict with an in-memory
  environment seam; fuzzing that no exception escapes the catch boundary; failure injection
  (seam errors, replaced files, oversized input, `toolInputTruncated`, 1,025 `GIT_CONFIG_COUNT`).
- Acceptance: 100% of corpus rows including the former known-gap rows; strict-unverifiable rows;
  every budget counter has a breach test.
- 3a landed (the verbatim port): `next/gate/` holds 53 files ported from the analyzer, guards,
  secret matcher, trace recorder, intake, and pipeline, each with a normalized-diff self-check
  and differential tests; both corpora run through the ported `evaluateGuard`; a harvested-literal
  differential replays every string literal in the legacy test suites at standard and strict;
  trace, tool-route, and failure-injection parity hold. Three review lenses and a re-review found
  no wrong port. Carried to 3b: the shared guard walk (the secret guard gains `cd` tracking, the
  known-gap row flips to a plain test against `next/`, and the harvested differential must
  classify that divergence class); budget unification (`createBudget()` is still called once per
  guard and the analyzer keeps its own derived, parallel, strip, recursion, heredoc, and
  control-flow caps); the trace sink through `evaluateGuard`; the `gitMetadata(execDir)` and
  `gitMetadata(policyDir)` union if the pipeline stage did not land it; `BUILTIN_ANALYZED_COMMANDS`
  duplicated between core and gate. Intake keeps two `statSync`/`accessSync` reads as the host
  boundary, and `process.platform` stays ambient as in `src/`.
- 3b landed (the design changes): the secret matcher walks with the scanner's exported
  `applyShellState`, so its candidates carry the tracked cwd while the evidence stays the operand;
  the walk tracks `cd` only (`cd -`, `pushd`/`popd`, subshell scoping and interpreter bodies are
  pinned as limits in `tests/next/gate/secret-walk.test.ts`; a subshell `cd` is tracked as leaking,
  as the scanner already does for the other three guards) and the metadata-only relaxation stays
  standalone-only. The known-gap row runs plain against `next/`; the harvested, secret-module and
  pipeline-corpus differentials classify the tracked-cwd divergence with one predicate
  (`deniedByTrackedCwd`) and pin the accepted inputs exactly (one input, `cd ~ && cat .ssh/config`).
- Budget: one `Budget` per `evaluateGuard`, threaded to the four guards, the secret matcher, the
  analyzer and its derived children (spy-tested per path); analyzer caps throw `AnalysisLimit{kind}`
  and `analyzeOrCapBreach` in `next/gate/analyzer/index.ts` maps the nine analyzer kinds to `src`'s
  wording with `GuardEvaluation.errorCode` (path-canonicalization kinds still fail closed);
  per-scope caps compare against `LIMITS` rather than charge; recursion depth stays a returned
  denial; `derivedCommandShape` added; no harvested outcome changed by the shared budget.
- Trace: `GuardOptions.trace` reaches the analyzer and the breach mapping; the guards record no
  steps by design; `next/gate/evaluate-command.ts` stays the analyzer-level trace oracle for `src`
  parity and is deleted at cutover with its differential tests; Phase 7 explain records `parse` and
  `segment-skipped` itself and runs `evaluateGuard` with the real dialect.
- Carried: subshell-scoped and `pushd`/`popd` tracking for the shared walk (a `src`-divergent
  scanner change for all four guards); `errorCode` on failed-closed evaluations for Phase 4's
  audit classification; the dispatch, peel and text-detector consolidations (no defect
  demonstrated in 3b); the dead segment-scoped branch of the breach mapping (a verbatim carry of
  `src`); ten `src` tests that fail only as root and one `next/` differential that needs an
  explicit per-test timeout on slow runners.

### Phase 4 — Audit (S) `[x]`

- `next/audit/`: writer (layout, caps, redaction of the four fields, 0600/0700, prune at most
  once per UTC day using `retentionDays` from the resolved snapshot), reader with filters and
  suspect detection.
- Acceptance: record goldens; concurrent appends; an unwritable directory never changes a decision.
- Landed: `next/audit/{writer,retention,reader,display}.ts` are verbatim ports of
  `src/engine/{audit,audit-retention,audit-scan,audit-display}.ts` behind the Environment seam:
  every entry takes the `Environment` first, `CC_SAFETY_NET_AUDIT_HOME` and the `NODE_ENV` test
  refusal read `environment.env`, the home is `environment.home` (no `homedir()`/`userInfo()`), the
  `homeDir` option is gone while `now`/`createId` stay injectable, and prune reads its window through
  `readRetentionDays(environment)`. The record types moved to `next/core/audit.ts`
  (`AuditErrorCode = AnalysisErrorCode | 'unexpected-error'`) so gate and audit share them through
  core; `tests/next/architecture.test.ts` enforces "audit imports only core; core and gate never
  import audit" for both import spellings. Differentials pin byte-identical trees for a fixed clock
  and id sequence, every cap (10,000/2,000/256/32,768, the 180-character encoded cwd, the
  128-character session id), four concurrently spawned appenders, an unwritable location, and the
  retention and reader sweeps over one fixture tree.
- Carried: `src/integrations/audit.ts` (Phase 5 maps the runtime's `homeDir` option onto the
  Environment; in `src/` an explicit `homeDir` bypassed `CC_SAFETY_NET_AUDIT_HOME` and the test
  refusal, in `next/` the Environment decides); the logs CLI with `matchesLogsFlags` and
  `--prune-legacy` (Phase 7); GUI activity (Phase 9); the `__PKG_VERSION__` define (Phase 10).

### Phase 5 — Entries and hosts (L) `[x]`

- `next/entries/`: the bin resolves the `hook` verb before importing anything else through one
  dynamic import of a second chunk; the pinned path `dist/bin/cc-safety-net.js` is preserved.
- `next/hosts/<id>/`: the Claude-shaped family (Claude Code, Codex, Kimi) with three explicit
  overrides (route table including PowerShell, cwd override key, transcript attribution), the
  other stdin adapters (Cursor, Gemini, Copilot, Antigravity, Grok Build, Hermes), and the four
  in-process entries (OpenClaw, OpenCode, Pi, Amp) sharing one helper. Every adapter renders its
  own fallback deny in its host's format.
- Acceptance: adapter contract tests (payload to envelope, decision to document bytes, throw to
  host-format deny, unsupported event to silence); a cold-start budget test on the hook path;
  git-checkout mode runs without `node_modules`; the verify skill's hook recipes pass.
- Phase 5 landed: `next/hosts/` (runner, audit projection, runtime, agent detection, eight stdin adapters for nine hosts, OpenClaw/OpenCode/Pi/Amp handlers, catalog and the cc-safety-net template as data) and `next/entries/` (bin with the hook verb and legacy top-level flags, hook table, args, library API, OpenCode/Pi/Amp export entries) are verbatim ports behind the Environment seam: one `createProcessEnvironment()` per call, environment-first audit and runtime signatures with the `homeDir` option gone (OpenCode's `homeDir` maps onto `environment.home`, so `CC_SAFETY_NET_AUDIT_HOME` and the test refusal now win over it), `AnalysisLimit` classified through `LIMITS[kind].errorCode`, adapter callbacks receiving the Environment last with `process.cwd()` read at the call site.
- Adopted: every stdin adapter and the OpenClaw/Pi/Amp handlers convert any thrown value into the host's own failed-closed deny (stderr `CC Safety Net error:` line, exit 0, no audit); OpenCode's deny form is already a throw. Type-only imports of `@opencode-ai/plugin` and `@ampcode/plugin` are allowed per file by the architecture test, which also enforces hosts -> gate/core/audit, no upward imports, and no http/https/net/child_process under hosts or entries.
- Validation: one shared per-host payload table drives the in-process adapter differential and the process-level bin differential (stdout bytes, exit code, audit lines minus ts/id); fake-host differentials for the four in-process entries and the library API; cold-start and git-checkout import-closure tests on `next/entries/bin.ts`.
- Carried: `amp/run.ts` with its install/native and system-info helpers and the OpenClaw export entry (Phase 6); the hook help listing, every other verb and the dynamic CLI chunk (Phase 7); `GuardEvaluation.errorCode` in the audit for returned analyzer-cap denials (parity with `src` kept); knip entries for `next/entries`, the jscpd scope for `next/`, the verify-skill hook run and the `dist/bin` wiring (Phase 10).
- Verified: the verify skill's hook-protection recipes (deny with `Rule: git.reset-hard`, allow with
  empty stdout and exit 0, the two audit entries, isolation of the real home) pass against
  `next/entries/bin.ts` under an isolated home, and the same destructive payload through every
  stdin flag yields bytes and exit codes identical to `src`. Full-suite coverage sits at 98.90%
  (threshold 90%); `next/entries/args.ts` is ported whole for Phase 7 and only `parseCommandArgs`
  is exercised so far.
- Merged from `main` (v2.3.3) after Phase 5: the native Codex hook (`--codex`, `-cx`; the
  Claude-shaped payload, `Bash` → auto, no transcript attribution) lives in
  `next/hosts/codex/hook.ts` over the shared `next/hosts/hook/pre-tool-use.ts` that Claude Code
  now also uses; the catalog's runtime rows, the hook table, the per-host differentials and the
  verify recipes carry it. The Windows guard fixes (PowerShell default dialect for unrouted tools,
  strict secret matching for PowerShell candidates, metadata-only `ls`/`stat` for unrouted
  PowerShell) are mirrored verbatim into `next/gate`; their win32-only branches are unreachable in
  the Linux differentials and rest on the normalized-diff self-check. `main` also replaced the
  chmod-based unreadable fixtures with spies, so `bun run check` as root now fails only the GUI
  413 and Hermes process-kill tests.


### Phase 6 — Installers and detectors (L) `[x]`

- Thirteen installers and detectors with the managed hook command shared with each adapter;
  detection from host state files only; probes with a 5 s timeout; exact artifacts written
  atomically; npx and bunx cache clearing; the Hermes Python shim; the Amp hosted-repo write with
  the embedded policy; precise uninstall.
- Acceptance: fake host configs produce the exact artifacts, detect finds them, uninstall restores
  byte-identical files (JSON comment loss asserted); install is idempotent.
- From `main` v2.3.3: the Codex native plugin (`.codex-plugin/plugin.json`, `hooks/codex.json`
  running `node "${PLUGIN_ROOT}/dist/bin/cc-safety-net.js" hook --codex`, so the pinned bin path
  now has a third consumer) and the Hermes shim's Windows process-tree kill are part of the port
  source.
- Phase 6 landed: `src/` maps one file per file onto `next/hosts/<id>/{detect,install,artifact}.ts`
  (thirteen detectors, eight installers, three artifacts), `next/hosts/install/` (types, targets,
  native, npx and bunx caches, choices), `next/hosts/detect/` (context, index),
  `next/hosts/{system-info,doctor-types,managed-command}.ts`, `next/hosts/copilot-cli/plugin-id.ts`,
  `next/hosts/amp/run.ts`, `next/entries/openclaw.ts` and the first `next/cli/` files (the
  install/update/uninstall flow, prompt, banners, colors, lolcat, command definitions, update check),
  as verbatim ports. Every `homeDir` became the Environment (host relocation variables read
  `environment.env` with each site's `??`/`||` preserved, `tmpdir()` became `environment.tmpdir`,
  the spawn env and `process.platform` stay ambient), `detectAllHooks(environment, cwd, options)`
  lost its `homedir()` fallback, and the command flows call `createProcessEnvironment()` once per
  invocation. The bin still exits 1 for install, update and uninstall until Phase 7.
- Adopted: `next/hosts/managed-command.ts` derives every `npx -y cc-safety-net hook --<flag>`
  string from the catalog's long runtime flag; the four hook-config installers and the Hermes
  shim's `ANALYZER` list render it, and a test pins each against the literal `src` ships. Kimi's
  TOML and OpenCode's JSONC edits call `next/core/io` (Phase 1's port of the inline walkers, error
  strings intact); the Amp policy stamp goes through `getUserPolicyPath(environment)` /
  `normalizeGuiPolicy(value, home)`; `doctor-types` holds only HookPlatform, HookStatus, SystemInfo
  and UpdateInfo. The architecture test allows `node:child_process` only in
  `hosts/{install/native,install/choices,system-info,amp/run}.ts`, adds the `cli` layer with one
  temporary `cli -> entries/args` allowance, and the closure test bans `system-info` and `cli/`
  from the hook path.
- Validation: fresh helpers under `tests/next/helpers` (`temp-home`, `fake-bin`, `fake-command`,
  `host-differential`, `amp-runner`, `fake-tty`, `command-flow`) drive `src/` through `process.env`
  and `next/` through an Environment over a second seeded home; every installer, detector and
  uninstaller row compares trees, results and thrown messages (idempotent re-install, drift repair,
  malformed files, JSON comment loss, TOML and JSONC byte-identical restore, symlink and
  ownership-header refusals); the command flows run in-process on both sides for all thirteen
  targets with fake host CLIs as the only entries on `PATH` (an unscripted command fails with
  ENOENT instead of reaching a real binary) and the row's own temp root as the working directory;
  the update flow, the probes including the 5 s stall, the cache sweeps and Amp's scripted runner
  are covered. No test reaches the real home, a real host CLI, npx, git or the network.
- Verified: `bun run check` passes lint, typecheck, knip and the duplication scan (0 clones); the
  suite runs 6,989 tests with only the two root-only failures, `tests/next` alone 1,763; coverage
  98.54% lines against the 90% floor. The verify skill's hook recipes still pass unchanged
  against `next/entries/bin.ts` (deny, allow, both audit entries, isolation, every stdin flag), so
  the port left the hook path untouched. The verify skill never drives install, update or
  uninstall; the differential suite is the only evidence for those flows.
- Carried: relocating `next/entries/args.ts` to `next/cli/args.ts` with the dynamic CLI chunk and
  the bin's install/update/uninstall dispatch, retiring the `cli -> entries/args` allowance and
  extending the child-process and network bans to `cli` (Phase 7); doctor's remaining types and the
  self-test (Phase 7); building `dist/amp` and `dist/openclaw` and validating the repository
  manifests, and Windows and macOS portability of `tests/next` (Phase 10).
- Recorded for `main`, carried verbatim and pinned by the differentials: appending to a Kimi inline
  `hooks = [...]` whose last item is followed by a trailing comment places the separator after the
  comment, valid TOML only because the seeded item already ends with a comma; uninstalling OpenCode
  from a JSONC config leaves `[ "other-plugin"]`; `uninstall --hermes-agent` leaves the emptied
  plugins directory behind. Fix on `main` first, then re-port.

### Phase 7 — CLI diagnostics (M) `[x]`

- `status`, `doctor` with stable finding ids and `--json`, `statusline` glyphs including the
  Claude settings probe, `explain` through the pipeline with a trace sink and the real dialect,
  `logs`, `rule verify` and `rule doc`, `policy check` and `policy apply` with the TTY gate.
- Acceptance: explain goldens; doctor JSON goldens; exit codes 0 and 1 only; every surface is a
  projection of one policy resolution; the verify skill's explain, diagnostics, and logs recipes pass.
- From `main` v2.3.3: `logs --project` matches with `relative`/`sep` rather than a `/` prefix.
- From Phase 6: the command flows already live in `next/cli/install/`; wire them behind the bin's
  dynamic CLI chunk, move `parseCommandArgs` from `next/entries/args.ts` to `next/cli/args.ts`,
  retire the architecture test's `cli -> entries/args` allowance and extend its child-process and
  network bans to the `cli` layer.
- Phase 7 landed: `next/cli/` (`main.ts` exporting `runCli`, `args.ts` moved from `entries`,
  `help.ts`, every command definition, `status.ts`, `statusline.ts`, `doctor/*`, `explain/*`,
  `audit-log.ts`, `policy/index.ts`, `rule/{verify,doc,sync-migrate}.ts`, `utils/terminal.ts`),
  `next/gate/{explain,rulebook-fixtures}.ts`, `next/hosts/{self-test,doctor-types}.ts` and
  `next/core/policy/{config-file,diff}.ts` plus `writeUserPolicyFromGui` in the store, as verbatim
  ports behind the Environment seam (`createProcessEnvironment()` once per command handler).
  `next/entries/bin.ts` keeps the hook verb and the legacy top-level hook flags on static imports
  behind the same help/version scan `src` runs, and reaches everything else through exactly one
  `import('@next/cli/main')`; the closure test allows `cli/args.ts` inside the hook closure and
  pins that single dynamic specifier. The `rule` and `gui` handlers print one stderr line naming
  the command as unavailable and exit 1 until Phases 8 and 9; their help output is `src`'s.
- Adopted: the hook command definition renders its option list from the hosts catalog (cli may not
  import entries); `explainCommand(command, options, environment)` runs the whole guard sequence
  through `evaluateGuard` with the recording trace sink and the real dialect, records `parse` and
  `segment-skipped` itself, synthesizes `src`'s pre-analysis rule-check shape for protection
  denials, throws the structural limit for parser-limited programs and runs the activation
  candidate through a second `evaluateGuard` with the secret guard off; `config-file.ts` collects
  the rule-config and legacy validators and the runtime-error helper (the one zod consumer outside
  the schema, listed in the architecture test) with a private copy of `getUnknownOverrideErrors`;
  the store writes user policy through safe-read directly; `findRuleV2Leftovers` computes its scope
  paths inline; `rulebook-fixtures.ts` lives under `next/gate/` because it needs two analyzer word
  helpers, and the architecture test now rejects any core file importing the gate. Known gaps the
  explain differential lists rather than compares: inputs whose command position auto-detects
  PowerShell, and standard-mode partial programs (`src` explain analyzes them where the hook and
  the pipeline answer raw-text; design 8.4).
- Validation: a process-level harness (`tests/next/helpers/cli-differential.ts`) spawns both bins
  under an isolated home with an empty fake `PATH` and compares stdout, stderr and exit bytes,
  folding only the temp root and the repository root; rows cover help for every verb, version,
  unknown command and option, status (ready, degraded, strict, worktree, weakened project),
  statusline (JSON, non-JSON, plugin disabled, paranoid and rule-override glyphs, the legacy
  spelling), doctor human and `--json` (fresh, Cursor configured, invalid configs, v2 leftovers,
  unsafe posture, audit entries), explain human and `--json` for eighteen commands plus flag,
  limit and usage rows, logs over a seeded tree with every flag and usage error, policy check and
  apply, and the install/update/uninstall dispatch (the `update` row is a parse failure because the
  flow probes the registry before detection). Eighteen explain pairs and seven doctor reports are
  pinned under `tests/next/fixtures/cli/` from the shipped side so they keep guarding after
  cutover; `rule verify` and `rule doc` run in-process on both sides. Command strings are analyzer
  input, never executed; no test reaches the real home, a host CLI, npm or the network.
- Verified: `bun run check` passes lint, typecheck, knip and the duplication scan (0 clones); the
  suite runs 7,280 tests with only the two root-only failures, `tests/next` alone 2,015; coverage
  97.61% lines against the 90% floor. The verify skill's explain, diagnostics and logs recipes pass
  against `next/entries/bin.ts` under an isolated home (`--version` prints `dev`; blocked, allowed
  and JSON traces; status ready at level standard; doctor healthy with only
  `integration.none-configured`; one deny row, two with `--all`, the JSON array), and every one
  of those outputs, help, the unknown-command path and the doctor report with its timings dropped,
  is byte-identical to the shipped bin; nothing leaked into the real home.
- Carried: the rule dispatcher and every rule subcommand except verify and doc, the rest of
  sync-migrate, migrate and update-notice, exporting `getUnknownOverrideErrors` with
  `getUnknownOverrideErrorsForConfig` and deleting `config-file.ts`'s private copy, `validateConfig`'s
  first consumer, and the `rule --help` row that reaches the stub today (Phase 8); the gui command
  (Phase 9); knip entries for `next/cli` and the `/** @internal */` tag on `getConfigSource`, the
  two-chunk dist build and the packaged CLI journeys, doctor goldens that are Linux-shaped, and
  the rows only a non-root run can pin (the plural "sources could not be read" branch of logs and a
  failing `--prune-legacy`) (Phase 10); deleting `next/gate/evaluate-command.ts` with its
  differential tests (Phase 11).

### Phase 8 — Rulebook manager (M) `[x]`

- `rule init`, `add`, `remove`, `update`, `list`, `wrapper`, with `migrate` and `sync` as edge
  shims; bounded GitHub fetch (64 sources, 4 concurrent, 131 requests, 64 MiB, 15 s, no
  redirects, per-response caps); vendoring through temp and rename; acceptance limits; fixtures
  evaluated through the pipeline.
- Acceptance: a fake server exercises every limit; nothing is written on failure; a post-change
  reload equals the gate's view.
- From Phase 7: `next/cli/main.ts` dispatches `rule` to a stub; wire the dispatcher over
  `next/cli/rule/{verify,doc}.ts`, port the rest of `sync-migrate.ts`, `migrate` and `update-notice`
  verbatim, export `getUnknownOverrideErrors` from the scope-policy module with
  `getUnknownOverrideErrorsForConfig` and delete the private copy in `next/core/policy/config-file.ts`,
  give `validateConfig` its consumer, and add the `rule --help` differential row.
- Phase 8 landed: the manager library is a new top-level layer, `next/rules-manager/`
  (`resolver`, `sync`, `sources`, `resource-limits`, `config-file`, `types`, `paths`), and
  `next/cli/rule/` is complete (`index` with `runRuleCommand(environment, args)`, `format`,
  `migrate`, `update-notice`, `sync-migrate` with `runRuleSyncMigration`), all verbatim ports with
  the Environment first and `src`'s parameters after it; `next/cli/main.ts` dispatches `rule`
  for real. The runtime-error helpers (`getRulesConfigRuntimeErrorsForConfig`,
  `getUnknownOverrideErrorsForConfig`) moved into `next/core/policy/scope-policy.ts` where `src`
  keeps them and `config-file.ts` lost its private copy; the two filesystem-scope binders are
  exported from core paths for `getScopePaths`; `findRuleV2Leftovers` uses `getScopePaths`;
  `validateConfig` has its consumer in `migrate.ts`. The architecture test carries the
  `rules-manager` layer (imports core, gate, audit, hosts; no network or child-process modules;
  cli may import it; nothing below may) and the closure test keeps it off the hook path.
- Adopted: `getScopePaths` keeps `src`'s `options.cwd ?? process.cwd()` fallbacks and `rule list`
  passes `process.cwd()` to the loader (core's loader requires a cwd); `SyncRulesConfigOptions`
  extends `Partial<RulesPolicyOptions>` for the same reason; the source-limit constants stay in
  core and the manager's `RULE_SYNC_RESOURCE_LIMITS` imports `RULE_SOURCE_LIMIT`; the fetch is
  the global `fetch` with `redirect: 'error'`, `GITHUB_FETCH_LIMITS` and
  `RULE_SYNC_RESOURCE_LIMITS` unchanged and pinned as literals, and `resolveUrl` on the operation
  is the only seam tests use to reach a loopback server. Superseded: fixtures are evaluated at
  fetch and author time against the rulebook's own rules (`evaluateRulebookFixtures`), not
  through the pipeline: a fixture asserts which of the rulebook's rules fires or that none does,
  which the full pipeline cannot express because a built-in rule would fire first.
- Validation: in-process differentials over twin seeded homes against one loopback fake GitHub
  (`tests/next/helpers/{loopback-server,fake-github,rules-manager-differential,rulebook-seeds}.ts`)
  cover every fetch cap and exact-cap acceptance, the 131-request catalogue add, the 65th source,
  budget exhaustion across responses, a redirect, a stall, non-OK bodies left unread, a fanout of
  four with the first error aborting the rest, both fault hooks and every rollback, name
  collisions and unclaimed files, selective and whole-scope updates, every remove match form and
  the runtime reload; process-level rows through both bins cover every rule verb, help leaf and
  usage error with stdout, stderr, exit code and tree compared; the update notice runs on both
  sides with `getPackageVersion` and `fetch` spied and a fixed clock. `rule add owner/repo` never
  runs through a bin. The manager suite runs behind a dead `HTTPS_PROXY` so an accidental real
  fetch fails fast.
- Verified: `bun run check` passes lint, typecheck, knip and the duplication scan (0 clones); the
  suite runs 7,580 tests with only the two root-only failures, `tests/next` alone 2,315; coverage
  97.21% lines against the 90% floor. A rule-command drive against `next/entries/bin.ts` under
  isolated homes (init with the starter, list, add and remove of a local source with
  `--delete-source`, wrapper add/list and the reserved-head refusal, update, verify, sync, migrate,
  doc, the help and usage paths) is byte-identical to the shipped bin in output and tree, with
  nothing leaked into the real home; no drive reaches GitHub.
- Recorded for `main`, carried verbatim and pinned by the differentials: `rule add` and
  `rule remove` do not run the post-change runtime reload (only `rule update` and `--check` do),
  so contract 6.1's "add/remove/update re-load the changed scope" describes `update` alone and an
  add over a stale override key reports success; an add's fetch failure reports the bare fetch
  message where an update wraps the same failure as `Failed to update <spec>: …`; `rule init`
  over a malformed `rule.json` prints `Rule config initialized.` and exits 0 leaving the file;
  `rule migrate` restores `rule.json` and the migrated rulebook when the post-write reload
  reports a stale override, so `docs/config-recovery.md`'s "the migrated files are written and
  the legacy file is retained" describes only the legacy file; `rule sync` removes the lock and
  cache even for a source it could not migrate from them. Fix on `main` first, then re-port.
- Carried: the gui command (Phase 9); knip entries for `next/rules-manager` and `next/cli` (the
  `/** @internal */` tags on the manager's test hooks are unchecked until then), the two-chunk
  dist build and the packaged CLI journeys (Phase 10); deleting `next/gate/evaluate-command.ts`
  with its differential tests (Phase 11).

### Phase 9 — GUI (M, optional) `[x]`

- Loopback server, ephemeral port, token in the URL and the POST header, 1 MiB bodies, policy
  editor, activity feed, project draft with compare-and-swap, scrubbed false-positive report. The
  star, health, and install-from-GUI endpoints are deferred unless a demonstrated need appears.
- Acceptance: token and CSRF tests; CAS conflict; no core module imports the GUI; the verify
  skill's GUI recipe passes.
- From Phase 8: `next/cli/main.ts` dispatches `gui` to a stub; port `src/gui` and the four GUI
  store helpers and wire the handler.
- Phase 9 landed: `next/gui/` is a new top-level layer (`index`, `activity`, `assets`, `page`,
  `choose-directory`, `frontend/*`) ported verbatim from `src/gui` behind the Environment seam:
  `runGuiCommand(args, options)` creates one `createProcessEnvironment()` and hands it to
  `createPolicyGuiServer(environment, options)`; every policy, rules, audit, retention, baseline
  and snapshot read takes it; `getActivityFeed(environment, days, logsDir)` reports
  `environment.home`; `fetchIntegrations`, `fetchHealth` and `fetchStarContext` take the
  environment and lose `probe.homeDir`. The four GUI store helpers (`readUserPolicyForGui`,
  `previewUserPolicyForGui`, `createPolicyPreview(policy, env)`, `repairUserPolicyForGui`) live
  in `next/core/policy/store.ts` and the GUI imports the rule metadata constants from
  `core/rules` directly. `next/cli/main.ts` dispatches `gui` through a static import of
  `@next/gui/index` behind the bin's one dynamic import; the architecture test carries the `gui`
  layer (imports core, gate, audit, hosts, rules-manager and cli; `node:http` only in
  `gui/index.ts`, `node:child_process` only there and in `choose-directory.ts`; nothing below
  imports it and only `cli/main.ts` may) and the closure test keeps `gui/` off the hook path.
  `assets.ts`, `page.ts`, `choose-directory.ts` and the four non-TS frontend files are
  byte-identical to `src`; `frontend/main.ts` differs only in its three import specifiers.
- Adopted: every endpoint the shipped page calls is ported, superseding the deferral of star,
  health and install-from-GUI (the Integrations and Overview views are blank without them); they
  stay the thin wrappers `src` has, injectable through the server options and droppable later.
  Named deviations beyond the seam: `PolicyGuiServerOptions` and `RunGuiCommandOptions` extend
  `Partial<RulesPolicyOptions>` with a private `loaderOptions` supplying
  `options.cwd ?? process.cwd()` to core's loaders; the `node:net` `AddressInfo` type import is
  an inline `{ port: number }` cast; `readRetentionDays` replaces `resolveAuditRetentionDays`;
  biome sorts the ported frontend's imports, so the served page carries the same three helper
  module bodies in a different order (the page tests sort module sections rather than skip the
  script).
- Validation: twin-home in-process differentials (`tests/next/helpers/{gui-differential,gui-page}.ts`)
  drive both servers with the same request sequences and compare status, headers, bodies and
  trees: the token and header guard on every route, the page, every user-policy state, preview,
  explain against a draft, write, reset, repair, the body cap, the project draft with the
  revision compare-and-swap (including an apply held open across a directory pick), the symlink
  refusal, the activity window and retention bound, the rulebook listing, star, integrations,
  health, install and uninstall through injected hooks, and 404; direct differentials cover the
  feed, the picker with fake dialogs, the star helpers with a fake `gh`, integrations and health
  with the stub fetcher, `runIntegration` against fake homes and `runGuiCommand`; four page-slice
  tests evaluate the pure blocks of both pages; `gui --help`, `help gui` and `gui --bad` run
  through both bins, `gui --no-open` never does.
- Verified: `bun run check` passes lint, typecheck, knip and the duplication scan (0 clones); the
  suite runs 7,696 tests with only the two root-only failures, `tests/next` alone 2,431; coverage
  97.21% lines against the 90% floor. The verify skill's GUI recipe against `next/entries/bin.ts`
  (`gui --no-open` under an isolated home seeded through the hook: the auth gate 403/200 and the
  POST header gate, the served page, the activity feed showing the seeded `git.reset-hard` deny,
  the tester through `/api/policy/explain`, a policy save proven on disk with mode 0600 and in
  `status`, the project draft's 409 on a stale revision and its apply, an invalid write refused,
  teardown of the started PID only) passes with every deterministic response byte-identical to
  the shipped server and nothing leaked into the real home; rendering the page in a headless
  browser for the screenshots let the page's own load-time calls fetch the public star count and
  the npm latest version (read-only).
- Recorded, test-side only: under bun 1.3.11 a module-load `Bun.build` leaves the bundler's
  listing of `next/core` and `next/gui` stale for the rest of a `bun test` process, so every test
  file that imports `@next/gui/{index,page,assets}` directly calls
  `repairBundlerDirectoryCache()` from `tests/next/helpers/gui-bundle-repair.ts` (Phase 10's
  frozen assets should retire it); `os.homedir()` is resolved at process start, so the shipped
  side of the feed rows is spied rather than moved through `HOME`; the two implementations never
  run concurrently in one file (both register `process.once` signal handlers and both read
  `process.env`); the shipped 413 row answers 200 on both sides under this bun, so the body-cap
  row is a pure differential; bun's `fetch` in this container ignores a dead `HTTPS_PROXY`, so
  that guard is not a fence and the manager and GUI suites reach no external host by
  construction (loopback `resolveUrl`, injected hooks). `POST /api/rules/choose-directory`
  calls the picker directly on both sides, so it is the one route no hook can stub (fix on
  `main` first if a seam is wanted).
- Carried: knip entries for `next/gui` and the frontend entry, freezing `next/gui/assets.ts`
  into dist through `scripts/gui-assets.ts`, the two-chunk dist build and the packaged CLI
  journeys, and excluding `next/gui/frontend` from the widened jscpd scope until cutover (it is
  a verbatim copy of `src/gui/frontend`) (Phase 10); deleting `next/gate/evaluate-command.ts`
  with its differential tests (Phase 11).

### Phase 10 — Build, verification, release (M) `[x]`

- Bundles with no module-level work; committed `dist/` with the pinned entry paths; the
  verify-build allowlist updated; packed-tarball journeys on the six-cell matrix; the atomic
  release transaction retained; coverage, duplication, knip, and an import lint with cycle check
  and third-party ban that also flags `fetch`, `require`, and non-literal `import()` below the
  host layer.
- Acceptance: tarball at or under 560,000 bytes; the git-checkout plugin works without
  `node_modules`; CI green.
- From `main` v2.3.3: the release scripts validate the Codex manifest and hook file
  (`verify-repository-plugin.ts`, `release-state.ts`, `prepare-release-files.ts`), and CI runs
  `check:ci` on Windows and macOS, so `tests/next` must be portable before cutover: spawn through
  `process.execPath`, build child environments with `createSpawnEnv`, quote native paths in POSIX
  fixtures, and avoid `/`-joined path assertions.
- From Phase 6: `tests/helpers.ts` creates its linked-worktree seed under the real `tmpdir()` once
  per process and never removes it, so every full run leaves one more `safety-net-worktree-seed-*`
  directory behind; root it under `CC_SAFETY_NET_TEST_TMPDIR` or remove it on exit.
- From Phase 7: knip needs entries for `next/cli` (and `getConfigSource` in `next/gate/explain.ts`
  carries `/** @internal */` for its test-only export); the dist build must emit the bin chunk and
  the CLI chunk with the dynamic specifier intact; the doctor JSON goldens under
  `tests/next/fixtures/cli/doctor/` embed Linux-shaped system info and must be normalized or
  parameterized before CI runs them on Windows and macOS.
- From Phase 8: knip needs entries for `next/rules-manager`; the manager's loopback rows move
  roughly 80 MiB per run and the catalogue add issues 262 loopback requests, so they are the rows
  to watch on a slow CI runner.
- From Phase 9: knip needs entries for `next/gui` and `next/gui/frontend/main.ts`;
  `scripts/gui-assets.ts` must freeze `next/gui/assets.ts` as it freezes the shipped module (and
  the frozen page carries the helper modules in the ported import order); the jscpd scope, once
  widened to `next/`, must exclude `next/gui/frontend`; the frozen assets should retire
  `tests/next/helpers/gui-bundle-repair.ts`.
- Phase 10 landed: `scripts/build-layout.ts` holds the two source trees the scripts can bundle
  (`SHIPPED_LAYOUT`: `src/` into the committed `dist/`; `PORTED_LAYOUT`: `next/entries/*` into
  the gitignored `dist-next/`) and `resolveLayout(argv)` reads `--layout shipped|ported`; every
  build and verify script (`build`, `build-runtime`, `build-output`, `verify-build`,
  `gui-assets`, `build-schema`, `verify-package`, `verify-repository-plugin`) takes a defaulted
  layout, so every layout-less invocation is unchanged and the shipped bundles built before and
  after the change are byte-identical. `bun run build:next` emits the shipped layout minus
  `vendor/zod.cjs`: the ported schema imports zod statically and lies behind the bin's single
  `import(`, so zod is bundled into the CLI chunk (`ZodError` is the pinned marker that the hook
  closure must not carry) and the bin itself is a 7 KB entry whose hook path lives in two shared
  chunks. `tsconfig.build-next.json` emits the declarations (byte-identical to the shipped
  `index.d.ts` and `api.d.ts`); `verify:package:next` stages a temporary package directory with
  `dist-next` as `dist` and runs the unchanged packed journeys (ported tarball 453,777 bytes
  against the 560,000 cap; shipped 519,686); the ported schema generation writes to a temporary
  path and must equal the committed asset (shared writer in `build-schema.ts`, test under
  `tests/next/core/policy`). knip covers `next/` (entries for the six roots, the frontend and
  the differential harness; every reported export unexported, deleted or tagged `/** @internal */`
  at the root cause; no hints left), `check-duplicates` runs a second jscpd invocation over
  `next tests/next` with the frontend excluded (the six clones inside `next/` are gone), and the
  architecture test gains a static-import cycle check (238 files, 803 edges, none), bans on
  `fetch(`, `require(`, `createRequire` and non-literal `import(` below the host layer, the
  socket-module ban on every layer, and a non-literal `import(` ban everywhere with the OpenClaw
  installer's probe allowed. `tests/next` spawns bun only through `process.execPath`, builds
  child environments through `isolatedSpawnEnv` over `createSpawnEnv`, builds path expectations
  with `join`, and compares doctor JSON raw while the goldens store the
  `normalizeDoctorJson` form (time, version and platform folds only); `tests/helpers.ts` roots
  the worktree seed under `CC_SAFETY_NET_TEST_TMPDIR` and drops it in `afterAll`; the two
  root-only audit-log rows became three root-safe rows (a regular file where the logs directory
  is expected, a spied `unlinkSync`). `tests/next/e2e/packed-runtime.test.ts` builds both
  layouts fresh into temporary outdirs and runs eight journeys through `node` on both bins under
  isolated homes and an empty `PATH`; `tests/scripts/build-layout.test.ts` pins the ported
  layout's paths, the zod-free hook closure, the single dynamic import and the version define.
- Adopted: a layout carries only what the trees differ on (`outdir`, `alias`, `entrypoints`,
  the `emitted` names Bun and tsc choose from the entries' common root, `typesCommand`,
  `lazyZod` standing for the vendored copy, the inline plugin and the allowlist entry together,
  and the `loadArtifacts`/`loadGuiAssets` loaders that keep one layout's build from importing the
  other tree); the schema generators are static imports in `build-schema.ts` because a loader
  made knip credit every export of both schema modules; `PORTED_LAYOUT` is `@internal` until the
  cutover makes it the only layout. The Phase 7 wording of the seed fix (`process.on('exit')`)
  was unusable: bun's test runner never emits `exit`.
- Verified: `bun run check` passes lint, typecheck, knip and both duplication scans; the suite
  runs 7,683 of 7,722 tests with only the two root-only failures, `tests/next` and `tests/scripts`
  alone 2,532; coverage 96.97% lines against the 90% floor. The verify drive against the
  built bins (`node dist-next/bin/cc-safety-net.js` beside `node dist/bin/cc-safety-net.js`, run
  id `verify-20260905-175324-next10`, 36 checks) passes: `node --check` on both, the same tree
  minus `vendor/zod.cjs`, the zod-free hook closure, `--version`, `--help`, `hook --help`,
  `explain` (text and `--json`), `status`, the hook on a deny, an allow and `rm -rf /`, `logs`,
  `doctor` (`--json` and text) byte-identical after folding roots, times and audit ids; the
  `api`, `index`, `pi` and OpenClaw entries load under node with identical results; the managed
  headers, manifests and declarations are identical; `gui --no-open` on the built bin gates on
  the token (403/200), serves the frozen page with the same lines as the shipped one, and
  answers `/api/policy`, `/api/rules` and `/api/activity` identically; only the started PIDs are
  killed and nothing reaches the real home. `verify:package:next`, `verify-repository-plugin
  --layout ported` and `build-schema --layout ported` pass.
- Recorded: this sandbox exports `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_*`/`GIT_CONFIG_VALUE_*`,
  which makes verify-package's incomplete-Git-config journey resolve as a complete config on
  both layouts (run it with those unset); the local bun 1.3.11 build of the shipped layout
  differs from the committed `dist/` (chunk hashes and minified bytes), so the shipped layout is
  only ever built into a temporary outdir here; the ported chunks total 872 KB against the
  shipped 463 KB of chunks plus the vendored zod because the four entries share their code
  through chunks instead of the bin, while the tarball is 66 KB smaller; `gui-bundle-repair.ts`
  stays because the tests that build the ported layout import `next/gui/assets` in-process; tsc
  leaves empty directories under `dist-next`. Windows-only gaps left as recorded at the
  time (wrongly: `test-windows.yml` runs `check:ci` on windows-latest, so the cutover PR closed
  them): `DYNAMIC_IMPORT_ALLOWANCES` compares a native `relative()`
  path against a `/`-spelled literal, about 45 `<home>/`-spelled row-table constants remain, and
  the CLI differential's fake bin is `#!/bin/sh`. Pre-existing leaks outside this phase: the
  per-fixture `safety-net-worktree-*` roots whose callers never call `cleanup`, the module-scope
  `safety-net-hook-cwd-*` root in `tests/integrations/hook-helpers.ts`, and the
  `cc-safety-net-release-seed-*` root in `tests/scripts/release-git.test.ts`.
- Carried: flipping the default layout to ported, deleting the shipped half of
  `build-layout.ts` with the `src/` artifact imports and `tsconfig.build-next.json` (re-pointing
  `tsconfig.build.json`), rebuilding `dist/`, retiring `gui-bundle-repair.ts`, deleting
  `next/gate/evaluate-command.ts` with its knip entry and the differential tests, folding
  `build:next` and `verify:package:next` back into the defaults in `package.json` and `ci.yml`,
  and the Windows-only gaps and the per-fixture worktree leak (Phase 11).

### Phase 11 — Performance validation and cutover (S+M) `[x]`

- Measure hook cold start before and after the lean entry and the validator removal on the CI
  runner; set a hook-path budget test.
- Cutover in one commit: swap the entries, delete `src/`, move `next/` to `src/`, rebuild
  `dist/`, keep structure-independent tests, retire structure-dependent legacy tests, drop the
  `LEFTHOOK_EXCLUDE=build` note.
- Run the `verify-cc-safety-net` skill against the cut-over CLI; draft release notes for the
  closed secret-walk gap.
- Acceptance: hook path at or under Node startup plus a fixed budget; all corpus rows including
  the former known-gap rows pass; release notes drafted.
- From Phase 10: the scripts take `--layout`; the cutover flips the default to the ported
  tree, deletes the shipped half of `scripts/build-layout.ts` (and the `src/` artifact
  imports), folds `tsconfig.build-next.json` into `tsconfig.build.json` and `build:next` and
  `verify:package:next` into the default scripts and `ci.yml`, retires
  `tests/next/helpers/gui-bundle-repair.ts`, and removes the `next/gate/evaluate-command.ts`
  knip entry with the harness; the remaining Windows-only gaps in `tests/next` (a `/`-spelled
  allowance literal, `<home>/`-spelled row-table constants, the `#!/bin/sh` fake bin) and the
  per-fixture `safety-net-worktree-*` leak are the portability items left.
- Phase 11a landed (freeze before the cutover): every shipped-versus-ported comparison under
  `tests/next` now records the ported outcome beside the untouched assertion. `recordPorted`
  and `rootFolds` in `tests/next/helpers/temp-home.ts` snapshot the value the differential
  compares after the helper's folds plus record-only folds of wall-clock text, the checkout
  path and, on Windows, the path separator; `describeDifferential` takes the fixture root;
  `expectSameOutcome` records its outcome except for a relative target that climbs out of the
  fixture root into the temp directory (a lexical check, `climbsOut`, so the same rows are
  skipped on every host); the CLI differential's two side roots have the same length;
  `gate/pipeline`, `gate/contract` (corpus-pinned) and `gate/trace-parity`, `gate/trace-sink`
  (deleted with the harness) carry no snapshot by design. 122 `.snap` files,
  7,999,006 bytes, none over 1 MB.
- Corpora too large to snapshot use `expectRecordedDigest` in
  `tests/next/helpers/gate-differential.ts`: SHA-256 over canonical JSON of the sorted
  `[input, value]` pairs (Map and Set contents included) per `<place>/<level>`, per fuzz batch
  and per core corpus (parser programs, projections, tokens, sanitizers, validators) in
  `tests/next/fixtures/gate/harvested-digests.json` (173 keys); written only when
  absent and never under `CI`, re-recorded with `CC_SAFETY_NET_UPDATE_GOLDENS=1`, dumped with
  `CC_SAFETY_NET_DUMP_VERDICTS=<dir>`. The harvested and fuzz batches run under a pinned
  process environment (`HOME` and `TMPDIR` inside the fixture tree, fixed `USER`, `LOGNAME`,
  `SHELL`, `PATH`) on both sides, and the sensitive-text projection under a pinned `TMPDIR`
  with the other supported path variables unset, so a `$TMPDIR` literal decides the same
  whether or not the host exports it.
- `tests/next/e2e/hook-cold-start.test.ts` pins the budget: the ported bin's static import
  closure at or under 400,000 bytes (measured 344,139) and its `hook --claude-code`
  median over seven interleaved runs at or under node's median plus 150 ms (measured here:
  node 30.0 ms, hook 98.8 ms; the byte cap is the sharp half, the time allowance a
  coarse ceiling).
- Verified: `bun test tests/next` twice with no snapshot added or updated and once under
  `CI=true` (2,451 pass); the same suite with the temp directory moved to a longer path
  and with the home moved passes except for the two `cli/status` rows below; `bun run check`
  (7,688 of 7,727 pass, coverage 97.54% lines, the two root-only legacy failures unchanged).
- Carried to the cutover: freeze `HARVESTED_LITERALS` into a fixture before the legacy suites
  it scans are retired, or the digest corpus empties; two `cli/status` rows print a fixture
  path that exceeds 80 columns on a host whose temp directory is long (macOS runners) and
  truncate there, so the cutover pins a short `TMPDIR` on that runner (`createTempRoot` also
  honours `CC_SAFETY_NET_TEST_TMPDIR`); confirm the digests on the macOS and Windows runners
  (the dump names any differing pair); a thrown outcome records only its kind and name; the
  snapshot record becomes the sole assertion once the shipped side is deleted.
- Phase 11b landed (the cutover, one commit): `src/` is the port (`git mv next src`, history
  follows), the shipped tree and every legacy suite under `tests/` are gone except the
  structure-independent keepers (the two contract corpora under `tests/gate/`,
  `tests/entries/public-api.test.ts`, `tests/hosts/pi/package.test.ts`,
  `tests/hosts/amp/built-artifact.test.ts`, `tests/e2e`, `tests/e2e-live`, `tests/setup*.ts`),
  `tests/next` is `tests/`, the `@next/*` alias is `@/*`, and `scripts/build-layout.ts`,
  `tsconfig.build-next.json`, `build:next`, `verify:package:next`, `dist/vendor/zod.cjs`,
  `gui-bundle-repair.ts` and `gate/evaluate-command.ts` with `trace-parity.test.ts` are
  deleted; `build-layout.test.ts` is `build-closure.test.ts` over the one build. The one
  behavior edit under `src/` is `src/gate/guards/safety-net-invocation.ts`, whose entrypoint
  set names `src/entries/bin.ts` instead of the retired CLI path.
- The 6,964 harvested literals are frozen in `tests/fixtures/gate/harvested-literals.json`
  (the scanner over the legacy suites is gone); the snapshots, the 173 digests and the
  doctor/explain goldens moved unchanged and are the sole oracle: every differential helper
  runs one side and records it where it compared before, `knownGap` is gone from the corpus,
  and `cd ~ && cat .ssh/config` is pinned as a `secret.home.ssh` denial in the corpus,
  harvested and secret-protection tests.
- `tests/helpers.ts` keeps only the exports the promoted suite, `tests/e2e` and
  `tests/scripts` import; `tests/helpers/policy.ts` builds its snapshot over
  `@/core/policy/snapshot`; `ci.yml` pins `TMPDIR=/tmp/ccsn` on the macOS leg so the two
  `cli/status` rows keep their column width; `check-duplicates` ignores import blocks
  (the single-sided helpers share their import lists). `tests/scripts/build-contract.test.ts`
  pins the Amp and OpenClaw artifacts as zod-free (only the CLI chunk carries zod), reversing
  the Phase 10 expectation that they bundle it. `SECURITY.md`, `docs/residual-risk.md`, the
  residual-risk registry, `docs/review-prompt.md` and `docs/config-recovery.md` cite the
  promoted tests; the historical findings documents keep their wording. Review added three
  literal tests (the cutover entrypoint, the skill/template sync, the implicit `logs` window
  below thirty days) and restored the packaged 1 MiB structural-limit journey under
  `tests/e2e/`.
- The pinned Bun (1.4.1, CI's runtime) records differently from the local 1.3.11 in four
  places. Three are folded record-only in the helpers and their six snapshot files re-recorded:
  the bundled GUI script body (`[bundle]`), the thrown `syscall` name (`statx` and `lstat` both
  record `<stat>`), and directory modes in flow tree listings (file modes stay). The fourth was
  a helper bug: the held-socket GUI reply arrives chunked under 1.4.1 and the observer now
  de-frames it. The GUI oversized-POST row is recorded under the pinned Bun, where the server
  answers 413; under 1.3.11 it is the one failing row.
- Verified: `bun run check` under the bare Bun (2,605 pass, the 413 row the one failure,
  13,584 snapshots consumed and none written, coverage 95.03% lines and 96.56% functions
  against the 90% floor) and the suite under the pinned Bun (2,605 pass, the nested-wrapper
  `project-bun` row the one failure); `bun run build` twice with a byte-identical `dist/`;
  `verify:repository-plugin` and `verify:package` (tarball 449,076 bytes); the hook budget test
  (closure 344,160 bytes under the local build, 350,268 in the committed `dist/`; node 30 ms,
  hook 99 ms); the `verify-cc-safety-net` drive of the cut-over CLI (run
  `verify-20260906-061638-cutover11`, 43 checks: source and built entry answer alike for
  version, help, explain, status, logs, doctor, rule list, the hook rows including the closed
  secret-walk gap, and the token-gated GUI; the real home untouched).
- Carried: the skill body's source-inspection steps (`src/analyzer`, `src/guards`, `src/rules`
  in `src/hosts/templates/cc-safety-net.ts` and `skills/cc-safety-net/SKILL.md`) still name
  the retired layout because two recorded snapshots embed the template text; change both
  together and re-record `tests/hosts/builtin-commands` and `tests/hosts/opencode/plugin`.
  Describe and test titles that still say `shipped` or `next/… versus src/…` are snapshot
  keys and stay until a deliberate re-record; the same holds for the `build-layout-` temp-root
  prefix. `tests/scripts/project-bun.test.ts` fails only when the suite itself runs through
  the pinned-Bun wrapper (the inner `bun` is not on the emptied `PATH`). Under a bare Bun
  older than 1.4.1 the GUI 413 row and, after a file that loads `src/gui/assets` in-process,
  a directory-listing staleness in `bun test` can fail; neither is worked around. The
  Windows-only gaps and the per-fixture worktree leak remain as recorded.

## How to resume

1. `git checkout feat/greenfield && git merge main` (merge, never rebase, so the corpus re-runs
   against every field fix).
2. Read the phase status above; the status markers are the only record of progress.
3. Run `CI=true bun test tests/gate/contract.test.ts tests/gate/harvested.test.ts` to confirm
   the corpus and the recorded digests are intact before touching `src/`.
4. Finish the phase, run `bun run check`, run the verify skill where the phase requires it,
   update the status marker here, commit, and push to `feat/greenfield` (the Branch rules say
   when the pre-push job needs `LEFTHOOK_EXCLUDE=check`).
