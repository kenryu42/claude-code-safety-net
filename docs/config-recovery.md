# Configuration recovery: ready and degraded

Runtime policy evaluation loads a snapshot on every tool call from the policy files and the rulebook
files each scope's `rule.json` lists. It performs no writes, network requests, or caching. When one
of those sources cannot be validated, the snapshot reports one of two states.

| State | Meaning | Runtime behavior |
| --- | --- | --- |
| `ready` | Every active source validated | Ordinary evaluation |
| `degraded` | A candidate source was rejected | Ordinary evaluation against the fallback, plus a warning on every reporting surface |

**Invalid configuration never denies ordinary work.** An invalid candidate is never enforced, but it
never locks the agent out either: a rule source that cannot be verified is dropped, and an unreadable
policy file falls back to protective defaults, so there is always something safe left to enforce.

## Why dropping beats blocking

Denying every tool call on unverifiable rule configuration looks like fail-closed safety and is not.
Tamper resistance covers the canonical user `policy.json` and the project `policy.json` only;
`rule.json` and the rulebook files are best-effort. In the ready state nothing gates an agent
removing a rulebook entry from `rule.json` — removal is not drift, so no diagnostic and no protection
fires. An actor that wants those rules gone already has an unguarded path, so blocking on a
*corrupt* rulebook buys nothing against them and only strands the user whose rulebook file hit a
merge conflict.

Be precise about what dropping costs. It removes the denials that source contributed, so a command
the user deliberately blocked can now run. That is less enforcement than the configured policy, and
it is the accepted price of not locking the agent out — not a security-neutral outcome.

What dropping cannot do is grant anything beyond the baseline of a machine with no rulebook
configured:

- Built-in destructive-command, secret, policy-file, and Git-metadata rules do not read rule
  configuration at all, so they stay at full strength. Their *reach* has one user-configured input:
  `transparent_wrappers`. See the caveat below the table.
- A rulebook contributes only blocking rules, so dropping it can never add an allowance.
- `overrides` in `rule.json` can disable built-in rules, so ignoring an unreadable `rule.json`
  restores those built-ins rather than losing them.

Closing the gap for real requires a protected or authenticated configuration contract for
`rule.json` — the same tamper resistance `policy.json` already has. That is a deliberate product
decision and is deferred, not part of this contract. A fail-closed default is not a substitute for
it: blocking stopped the honest user and not the actor, since removing a `rule.json` entry is a
single unguarded write that is strictly easier than corrupting a rulebook file.

## Which fallback is active per failure

`errors` name a source that was dropped. `warnings` name a source that stays active with only the
rejected part ignored. Both produce the `degraded` state.

| Failure | Severity | Active fallback |
| --- | --- | --- |
| Unknown field in an otherwise readable `policy.json` | warning | The salvaged policy: recognized valid sections survive, invalid ones fall back to protective defaults |
| Invalid recognized field in `policy.json` | warning | The salvaged policy; the invalid section only falls back to its protective default |
| Empty or malformed JSON in `policy.json` | warning | Built-in protective defaults (destructive-command and secret protection enabled, no allow paths, no disabling overrides) |
| Unknown or invalid field in the project `.cc-safety-net/policy.json` | warning | The salvaged project policy: its recognized valid fields still layer over the user policy, the rest is dropped |
| Empty or malformed JSON in the project `.cc-safety-net/policy.json` | warning | The user policy alone; the project file contributes nothing |
| An `audit` section in the project `.cc-safety-net/policy.json` | warning | The user policy's audit settings; audit is user scope only and the project section is ignored |
| Unknown rule override key | warning | Every loaded rule, with only the unknown override ignored |
| Project override naming a user-scoped rule | warning | The user-scoped rule as configured; user policy stays authoritative |
| Duplicate active rulebook name | warning | The rulebook that claimed the name first; the later one contributes nothing |
| Missing rulebook file for a configured source | error | None — that source is dropped |
| Rulebook file that is not valid JSON, or fails the rulebook schema | error | None — that source is dropped |
| Rulebook whose `name` does not match the source that lists it | error | None — that source is dropped |
| Remote source with nothing vendored yet | error | None — that source is dropped until `rule update` vendors it |
| Malformed, empty, or unsupported-`version` `rule.json` | error | None — that whole scope is dropped, including its `transparent_wrappers` |
| Unreadable or unsafe policy filesystem | error | None for rule sources; `policy.json` falls back to protective defaults |

A failure in one scope drops only that scope. The other scope's verified rules stay enforced, and
every built-in rule keeps applying in every case.

An edit to a rulebook is not in the table because it is not a failure state: rulebooks are live
files, so the guard reads the edited file on the next tool call. An edit that breaks the file is the
invalid-rulebook row above — that source drops until the file is fixed.

One caveat is worth stating precisely, because it is the only place dropped configuration reduces
built-in *coverage* rather than removing custom rules. `transparent_wrappers` is declared in
`rule.json`, not in a rulebook, and it is what lets analysis look through a user-declared wrapper to
the command underneath. A dropped rulebook leaves it intact, because `rule.json` still reads. An
unreadable `rule.json` loses it for that scope, so a destructive command behind a wrapper that scope
declared is no longer unwrapped. There is no verified copy to fall back to — `rule.json` carries no
digest by design — and the alternative is the lockout this contract exists to remove. An agent can
already delete that key from a readable `rule.json` without tripping anything, so the gap sits inside
the tamper boundary rather than opening a new one. Both halves are pinned in `tests/core/policy/snapshot.test.ts`.

Failures unrelated to configuration are unchanged: malformed hook or tool payloads, unparseable
commands in strict mode, and parser or resource-limit failures still deny that one tool call.

Duplicate rulebook names resolve deterministically in favour of the first claim, with the user scope
claiming before the project scope. Because the collision is resolved rather than fatal, changing one
scope does not fail on a name the other scope already uses.

## No recovery plane

Nothing is special-cased while degraded, because nothing is denied for being unconfigurable. There is
no allowlisted repair command and no allowlisted config path: `cc-safety-net rule update`, reading
`rule.json`, and editing it are ordinary calls that pass or fail on their own merits. Shell edit
forms of `rule.json` (`sed -i`, `jq … > tmp && mv`) are likewise ordinary, consistent with
`rule.json` not being a protected path.

The user and project `policy.json` files remain protected in every state. Policy-file protection runs
before the configuration snapshot is loaded, so it is unaffected by the state and denies mutation
regardless.

## Truthful reporting after a change

`cc-safety-net rule add`, `rule remove`, and `rule update` reload the scope they changed the way the
guard loads it before reporting success. If a diagnostic remains — an unknown override key, for
example — the command reports failure with that exact diagnostic and exits non-zero.

The verification covers the scope being changed, not the whole machine. Diagnostics owned solely
by the other scope are left alone so that setting up one scope while the other is still incomplete
remains possible. `rule migrate` propagates that result, so migrating a scope whose `rule.json`
carries a stale override reports that diagnostic; the migrated files are written and the legacy file
is retained, so re-running after the fix succeeds.

## Leftovers from version 2

A scope that was configured by an earlier version can still carry a `rule.lock` and a `cache`
directory. Neither is read: every rulebook loads from its own file. `cc-safety-net doctor` reports
the leftovers, and the deprecated `cc-safety-net rule sync` migrates them once — it vendors any
cached rulebook that still matches its recorded digest, names the remote sources that need
`cc-safety-net rule update` instead, and deletes the lock and cache.

## Where the state is reported

Every degraded state is reported on all of the surfaces below. The reason names the failing file or
source, the rejected condition, what is no longer active, and the repair. How likely you are to
*notice* without going looking varies by failure; see the next section.

- A degraded snapshot appends a `Config warning:` line to the next user-visible denial.
- Audit records carry a `configFallback` flag on allowed and denied decisions alike. Allowed
  decisions are the case that matters: they are where a dropped rule would otherwise pass unnoticed.
- Both ride only on decisions made after the configuration snapshot is loaded: the always-on
  policy-file and Git metadata protections deny before config load, so those denials carry neither
  the warning line nor the audit flag.
- `cc-safety-net doctor` reports the state as a `config.runtime-degraded` warning finding with the
  full reason as its detail.
- `cc-safety-net status` prints the verdict — `ready` or `degraded` — with each diagnostic on its own
  line. A plugin that is disabled in Claude Code appears as one of those diagnostics, scoped to
  Claude Code. It is informational and always exits 0; `doctor` stays the deep diagnostic.
- The statusline appends `⚠️`.
- The GUI reports the state in the protection banner it already shows across views.
- `rule list` prints a `Warnings` section and exits non-zero only when errors remain; warnings alone
  exit 0.
  It covers rule configuration only, not `policy.json`. `doctor` is the one command that reports both.

Because nothing is blocked, an agent can also run `status`, `doctor`, `rule verify`, and `rule list`
itself to see the same diagnostics.

## Which failures you will feel

Reporting is not the same as being noticed. Only the statusline marker is passive; the `Config
warning:` line needs an unrelated denial to ride on, and everything else waits for you to run a
command or open the GUI. Whether a degraded runtime is self-announcing depends on which direction it
moved:

- **Dropped rule sources are silent.** They remove denials, so nothing rubs. A command a rulebook
  used to block simply runs, and a clean session produces no signal at all. This is the accepted cost
  of not blocking, and it is the case worth checking after any change to rule configuration.
  `cc-safety-net status` is the cheap habitual check for it; reach for `doctor` when you want the
  full report. An unmigrated legacy inline config is quieter still: it is never read at runtime and
  reports nowhere, so `cc-safety-net rule verify` is what finds it.
- **An invalid `policy.json` mostly announces itself.** Rejected sections fall back to *protective*
  defaults: both protections forced on, allow paths dropped, disabling overrides dropped. The result
  is more denials than you configured, so you find it through friction — something you deliberately
  allowed starts getting blocked.

Stated precisely, an invalid `policy.json` loudly imposes the defaults you had relaxed and quietly
loses the protections you had added above them. The quiet half is small and worth knowing:

- An invalid `safety.level` falls back to `standard`, so a typo in `paranoid` silently lowers the
  preset. With the statusline configured this is visible twice, since the level emoji changes as well
  as gaining `⚠️`.
- Invalid entries in `secret_protection.deny_paths`, and per-rule overrides you had set to `on` above
  their default, are dropped rather than repaired.

`cc-safety-net doctor` reports every case above, including both quiet ones.
