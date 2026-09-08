# Security Policy

## Supported Versions

Security fixes are provided for the latest published release of `cc-safety-net`.

If you are using an older version, please upgrade to the latest version before reporting an issue unless the vulnerability also affects the latest release.

## Security Model and Invariants

CC Safety Net is a best-effort, static pre-execution policy gate for supported coding-agent tool calls. It is not an operating-system sandbox, a privilege boundary, or protection for commands that bypass an installed integration. An agent and the command text it supplies are untrusted; the user's policy, pinned rulebook state, configured roots, and adapter-established execution context are trusted inputs.

The current implementation preserves these product invariants:

- Adapters grant command-execution capability only to exact, integration-specific tool names. Unknown tools retain conservative policy-file and sensitive-path inspection without treating arbitrary text as a shell command. This is covered by `tests/gate/intake.test.ts`, `tests/hosts/hook/common.test.ts`, `tests/hosts/opencode/plugin.test.ts`, and `tests/hosts/pi/tool-call.test.ts`.
- The canonical user `policy.json` receives best-effort static protection against direct write, edit, and patch targets; exact shell operands and write redirections; supported environment, relative, and existing symlink aliases; recursive `rm` of its directory or an ancestor; and `mv` when the file, its directory, or an ancestor is a source. Rulebooks, lockfiles, caches, sibling files, and policy-directory inspection are intentionally outside this guard. Core and integration coverage lives in `tests/gate/guards/policy-protection.test.ts`, `tests/hosts/opencode/plugin.test.ts`, and `tests/hosts/pi/tool-call.test.ts`.
- The nearest ancestor Git control-plane entry, resolved linked-worktree or submodule Git directories, common Git directory when available, and their `hooks` subtrees receive best-effort static protection against the supported delete, move, redirection, write-tool, and patch routes. Other repositories below the execution directory and Git-internal paths outside this set are not protected by this guard.
- Sensitive-path protection applies across supported command, path, search, and patch shapes, including unknown-tool fallback inspection. See `tests/gate/secret/secret-protection.test.ts` and the hook, OpenCode, and Pi integration tests above.
- Destructive-command decisions are semantic and context-sensitive: nested execution, working directory, shell mode, safety options, disabled built-ins, and custom rules affect the result. `tests/gate/contract.test.ts` records a small representative contract; the remaining `tests/gate/analyzer/` suites provide exhaustive edge coverage.
- User policy is authoritative. Project rulebooks may add restrictions but cannot weaken user-scoped rules. Remote rulebooks are resolved through pinned lock and digest state. These behaviors are covered by `tests/core/policy/merge.test.ts` and `tests/rules-manager/sync.test.ts`.
- Runtime evaluation loads a deeply immutable policy snapshot from local policy, lockfiles, and verified caches. It performs no repair writes, network requests, or in-memory caching; synchronization remains an explicit CLI operation. See `tests/core/policy/snapshot.test.ts` and the fail-closed-to-sync integration coverage.
- Invalid configuration resolves to one of two runtime states, and never denies ordinary work. `ready` enforces every validated source. `degraded` means a candidate source was rejected and something safe is enforced in its place: an unverifiable rule source is dropped so it contributes no rules, a duplicate rulebook name keeps the first claim, and an unreadable policy file falls back to the salvaged policy or to built-in protective defaults. The rejected candidate is never treated as active, and the fallback is reported in audit metadata, `doctor`, the GUI and status surface, `rule list`, and an appended warning on the next denial — on decisions made after the configuration snapshot is loaded; the always-on policy-file and Git metadata protections deny before config load and carry no config state. Dropping a source removes the denials that source contributed. That is a real reduction in enforcement relative to the configured policy, and it is the accepted cost of not locking the agent out; it is not presented as a security-neutral outcome. What dropping cannot do is weaken a built-in rule or permit something the built-ins block: rulebooks contribute only blocking rules and no wrapper metadata, and ignoring an unreadable `rule.json` restores the built-ins its `overrides` would have disabled. The resulting posture is that of a machine with no rulebook configured, which is why the state is reported on every surface rather than absorbed silently. One exception is scoped and documented: `transparent_wrappers` lives in `rule.json`, so an unreadable `rule.json` narrows which wrapped commands built-in analysis unwraps for that scope. `rule.json` carries no lock or digest by design, so no verified copy exists to fall back to, and an agent can already delete that key from a readable file in the ready state without a diagnostic, which places the gap inside the tamper boundary below rather than outside it. A dropped rulebook cache, missing lock entry, or digest mismatch leaves wrapper metadata intact. No command or path is allowlisted in return, because nothing is denied for being unconfigurable. See `docs/config-recovery.md`, `tests/core/policy/snapshot.test.ts`, `tests/gate/pipeline.test.ts`, `tests/gate/intake.test.ts`, `tests/hosts/opencode/plugin.test.ts`, and `tests/hosts/pi/tool-call.test.ts`.
- Tamper resistance covers the canonical user `policy.json` only. Custom rule configuration — `rule.json`, rulebooks, lockfiles, and caches — is best-effort against agent modification: in the ready state an agent can already remove a rulebook entry from `rule.json`, and removal is not drift, so nothing gates it. This is why denying every tool call on unverifiable rule configuration was removed rather than kept: an actor that wants those rules gone already has an unguarded path, so the denial protected nothing and only stranded the user. Adding protection for `rule.json` is a deferred product decision and is not part of the current model.
- Audit command and segment fields are redacted for recognized credential forms before serialization. Audit paths, serialization, decision metadata, and redaction behavior are covered by `tests/audit/writer.test.ts` and the integration audit tests.
- False-positive reports prepared in the GUI replace the entry's own working directory and the user's home directory with `<project>` and `~` before the report is displayed. Substitution requires a path boundary, so sibling directories and unrelated paths sharing a prefix are left intact rather than rewritten. Nothing else is scrubbed: absolute paths outside those two prefixes, hostnames, and branch or remote names are carried through. The report is shown in an editable preview, prefills a GitHub issue form only on explicit user action, and issues no network request itself. Coverage lives in `tests/gui/report.test.ts`.
- On Windows, untrusted cwd-selection and recursive-delete operands that select Win32 UNC or device namespaces are rejected before filesystem access. Trusted roots, including namespaced roots established by an adapter, and relative paths beneath them remain supported.
- Untrusted recursive tool input is bounded to 64 object levels, 10,000 visited values, 10,000 own keys, 1 MiB per string, and 4 MiB of aggregate string data. Hook stdin is capped at 8 MiB of raw bytes. Exceeding either boundary fails closed.
- `GIT_CONFIG_COUNT` is capped at 1,024 entries. Malformed counts and incomplete key/value pairs fail closed before linked-worktree relaxation.
- Rule synchronization accepts at most 64 configured sources and resolves at most four sources concurrently while preserving configured order. Repository discovery and subsequent resolution share one nonconfigurable operation budget of 131 GitHub requests and 64 MiB of successfully read response bytes. Each request rejects redirects, has a mandatory 15-second timeout covering both fetch and body consumption, and retains per-response bounds of 512 KiB for metadata, 256 KiB for commit metadata, 16 MiB for repository trees, and 4 MiB for rulebook content. `Content-Length` and streamed per-response bytes are enforced before rulebook validation or digest use. A resolver failure stops new source work, aborts standards-compliant in-flight fetches, and drains work that already started before returning; check mode performs no resolution, network request, cache write, or lock write.
- Rulebook acceptance limits are fixed and nonconfigurable: at most 1,024 allowed commands, 1,024 rules, 2,048 fixtures, 1,024 block arguments per rule, 16,384 block arguments total, 1,048,576 UTF-16 code units per supported string, 4,194,304 supported string code units total, and 131,072 code units per fixture command. Validation retains at most 64 detailed errors. Fixtures are shape-validated and never executed. Inputs over any limit fail closed with a fixed diagnostic before policy cache or lock publication.

The current public command analyzer returns `null` when it allows a command and an `AnalyzeResult` when it blocks one. It does **not** expose the parser's internal `complete`, `partial`, or `limited` states. Unsupported or malformed shell syntax is safety-level dependent: standard mode may allow malformed safe-looking text, while strict mode blocks unparseable input; destructive-looking malformed text can still be blocked by conservative heuristics. Parser resource exhaustion is different: input beyond 131,072 UTF-16 code units, more than 16,384 words, or nesting beyond 64 levels is denied rather than analyzed incompletely.

Standard, Strict, and Paranoid are safety presets that supply defaults. Standard mode is best-effort protection for recognizable destructive commands and intentionally allows dynamic executables, guarded command structure assembled through substitution, unverifiable recursive-delete targets, and standalone metadata-only checks of built-in sensitive paths. Standard mode also allows `eval` and `source` of a single fully literal local generator command, such as `eval "$(ssh-agent -s)"` or `source <(kubectl completion bash)`, after the substitution body itself passes analysis. Only the generator command's shape is verified — the shell it emits at runtime is executed unverified, so this extends trust to the output of every literal local command, including forms like `eval "$(cat somefile)"`; any dynamic word, compound or redirected body, remote-fetching head such as `curl` or `wget`, or shell or wrapper head stays blocked, and strict and paranoid modes deny every dynamic shell source unconditionally. Sensitive content access and user-configured deny paths, including their descendants, remain blocked. Strict and paranoid modes fail closed on those forms and metadata-only sensitive-path discovery, and are required when commands may come from prompt injection or other adversarial context.

For Node and Bun inline evaluation, standard mode treats sensitive path literals as inert diagnostic or test data only when a bounded lexical scan finds no recognizable filesystem or command-execution marker. Strict and paranoid modes retain conservative literal inspection, configured deny paths and their descendants are never relaxed, and opaque or custom access wrappers remain outside standard mode's non-adversarial guarantee.

Trusted user policy may configure `destructive_command_protection.allow_paths`: absolute or `~/`-prefixed directories whose contents are treated like trusted temporary roots for recursive-delete analysis (`rm`, `Remove-Item`, `find -delete`), in every safety level. Allow paths never relax secret protection or deny paths, never apply to dynamic or unverifiable targets, and never cover root, home, or protected Git metadata targets. Entries equal to or containing the home directory are rejected at validation and again after symlink canonicalization at analysis time; targets are canonicalized best-effort before matching, so a symlink escaping an allowed directory is not covered. Allow paths are a deliberate, user-scoped relaxation: anything a command deletes beneath them is outside CC Safety Net's protection.

Catastrophic protections are always enforced: recursive deletion of root, recursive deletion of the user's home directory, destructive mutation of the protected Git metadata set, and destructive mutation of the canonical user policy file. They do not depend on safety level, the destructive-command master switch, per-rule overrides, or allow paths.

Trusted user policy may explicitly set a registered built-in destructive-command rule to `"on"` or `"off"`. For non-catastrophic rules, the destructive-command master switch wins first, followed by the rule override and then the resolved preset capability. An `"off"` override for a catastrophic rule remains valid policy syntax but is ignored. These per-rule controls do not change the documented threat-model boundary, do not apply to custom rules or secret patterns, and do not independently control fail-closed parser or sensitive-path outcomes that have no registered destructive-command rule ID. Consequently, Strict with all five Strict-tier destructive-command rules off is still Strict for those non-rule outcomes.

PowerShell support is partial. Its parser preserves native quoting, path separators, connectors, pipelines, and dynamic-word provenance for a conservative subset: `Remove-Item` and its supported aliases, the file cmdlets `Get-Content`, `Set-Content`, `Add-Content`, `Copy-Item`, and `Move-Item` with the aliases `gc`, `cat`, `type`, `cp`, and `mv`, plus existing cross-shell command rules; it is not a general PowerShell parser. Sensitive-path checks resolve a `$HOME`, `$env:USERPROFILE`, `$env:HOME`, or `~` prefix joined to a literal suffix by either path separator, for positional operands and space-separated parameter values; an expression assembled any other way, including concatenation, a subexpression, `Join-Path`, and a colon-joined parameter value, is not evaluated and not covered. Explicit `powershell` mode and quote-aware `auto` detection are covered by `tests/core/shell/parse.test.ts` and the PowerShell path-expression cases in `tests/gate/secret/secret-protection.test.ts`, while `posix` mode intentionally does not apply PowerShell removal rules.

Codex support is bounded by the host's unified exec design, which is the default shell path on macOS and Linux. Codex sends a `PreToolUse` payload for `exec_command` but none for `write_stdin`. Text written into an already-running interactive session therefore reaches the shell without inspection and without an audit entry; only the command that opened the session is evaluated. No adapter change can close this gap, because the host supplies no event for that call.

OpenClaw `exec` calls whose `host` is `auto` or absent are analyzed with local Gateway filesystem semantics, because Gateway is the only proven path mapping and an absent host is the default shape on every install without a sandbox. On a sandbox-configured install the host resolves `auto` to the sandbox, so such a command executes in the container while its analysis and audit record describe Gateway paths. An explicit `host: "sandbox"` request for that same execution is failed closed.

Grok Build hooks are fail-open by design, and the host exposes no `failClosed` knob to change that. Only an explicit deny decision on stdout blocks a tool call; a hook that crashes, times out, or emits malformed output lets the call proceed. The adapter therefore emits an explicit deny for its own fail-closed outcomes, such as truncated tool input or an unusable working directory, but a failure that prevents the adapter from producing output at all is not a block on this host.

Policy-file protection is deliberately a minimal exact-path guard, not command emulation or an operating-system security boundary. It tracks only simple assignment-only shell variables and explicit `cd` changes needed to resolve direct paths. It does not infer computed interpreter paths, inspect interpreter bodies, expand shell globs or braces, infer archive members, simulate `find` actions, infer remote filenames, or infer a transfer's final filename from its destination directory. Malformed shell input is blocked by this guard only when the canonical policy path remains directly extractable; parser resource exhaustion still fails closed. The hard-stop message, `This path contains the protected policy config and you must not modify or delete it.`, is guidance to the agent, not a claim of complete filesystem enforcement. Use a trusted write broker, operating-system permissions, a sandbox, or equivalent runtime enforcement when complete protection is required.

The structural command IR is produced by the bounded internal POSIX and PowerShell parsers. No third-party shell parser is embedded in the published JavaScript artifacts.

## Reporting a Vulnerability

Please do not report security vulnerabilities in public GitHub issues.

Use GitHub private vulnerability reporting for this repository when available. If that is unavailable, email the maintainer at jliew@420024lab.com.

Include as much detail as you can safely share:

- The affected `cc-safety-net` version
- Your operating system and runtime version
- The affected integration, such as Claude Code, OpenCode, Gemini CLI, GitHub Copilot CLI, Grok Build, or Codex
- Steps to reproduce the issue
- The command or input that bypasses, weakens, or abuses CC Safety Net
- Any relevant output from `cc-safety-net explain` or `cc-safety-net doctor`
- Whether the issue can cause data loss, command execution, secret exposure, or another concrete security impact

Please redact tokens, credentials, private repository names, and sensitive file paths before sending logs or command output.

## The Boundary: Bug or Vulnerability?

CC Safety Net's job is to stop agents from running destructive commands within the selected safety level's documented guarantees. A report that the tool failed to do that job is a **bug**, and it belongs in a public GitHub issue. The strict and paranoid threat model assumes an attacker (prompt injection, adversarial context) can emit any destructive command, so publishing "this command shape is not caught" does not hand the attacker a capability they did not already have — it just gets the gap fixed faster and lets users ship a custom rule as an immediate workaround.

A report that the tool did something harmful it was never supposed to do — leak a secret, write a file outside its own directory, or ship a tampered package — is a **vulnerability**. The non-obvious construction is the secret, so it belongs in private disclosure.

The dividing line is: **did the tool fail to stop a destructive command, or did the tool itself become the harmful vector?**

## What Counts as a Security Issue

Report these privately:

- Leakage of secrets through block messages, audit logs, diagnostics, debug output, or a false-positive report prefill, including a redaction bypass for a specific token format or a path the report preview claims to have replaced
- A path traversal or filesystem issue in audit logging or configuration handling, where crafted input writes outside the intended directory
- A supply-chain or packaging issue affecting the published npm package or plugin distribution, including rulebook integrity

## What Should Be Reported Publicly Instead

Use normal GitHub issues for:

- Any bypass or fail-open that lets a destructive command execute — a coverage gap (a command the rules do not block yet), a parser, tokenizer, or wrapper-analysis edge case, or an analysis error that lets a command through instead of blocking it. Report the command *shape*, not a ready-to-paste weaponized prompt-injection payload.
- False positives where a safe command is blocked
- Missing convenience rules or new feature requests
- Documentation bugs
- Installation problems without a security impact
- Questions about custom rules or configuration

## Response Expectations

You should receive an initial response within 7 days.

The maintainer will work with you to confirm the impact, identify affected versions, prepare a fix, and coordinate disclosure. Please give the maintainer reasonable time to investigate before publishing details publicly.

## Disclosure

When a vulnerability is confirmed, the maintainer will publish a fix as soon as practical and may publish a GitHub security advisory or release note with appropriate credit, unless you request otherwise.

Please do not publicly disclose exploit details until a fixed version is available.
