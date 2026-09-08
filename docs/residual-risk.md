# Residual Risk Registry

This registry records bypass families adjudicated as **accepted residual risk** for standard mode
under the review boundary in `REVIEW.md` and the mode contract in `SECURITY.md`. Its job is to make
review converge: each family is adjudicated once, here, instead of re-litigated in every review
cycle. `docs/residual-risk-registry.json` is the canonical structured index for identifiers,
boundaries, affected modes, and adjudication metadata; this file is the human-readable rationale.

All command examples are analyzer input strings only. Do not execute them in a shell.

## How Reviews Consume This Registry

- A finding that falls inside a listed family is pre-adjudicated. It is not merge-blocking and does
  not get a standard-mode parser fix. Report it, if at all, as a non-blocking residual note.
- The productive response to a newly crafted bypass inside a listed family is a strict or paranoid
  fail-closed fixture (see `tests/gate/behavioral-contract-cases.ts`), not more standard-mode
  parser logic. Strict mode's fail-closed promise is finite and checkable; standard's blocklist is
  not.
- Realistic non-adversarial provenance or field evidence makes a standard-mode false negative
  must-fix. A reviewer-constructed shape may become a new residual family only when the automated
  gates in `REVIEW.md` pass and an independent classifier confirms it. Otherwise it is
  evidence-invalid.
- Corpus growth follows evidence, not imagination. New must-block entries in
  `tests/gate/behavioral-contract-cases.ts` come from field evidence; the fix is then the
  smallest change that makes the corpus pass, preferring an ownership boundary, a bounded
  conservative check, or a strict-only denial over parser fidelity.

## How a Family Gets Adjudicated

1. The primary agent verifies and classifies the finding using the deterministic decision order in
   `REVIEW.md`.
2. Existing-family matches reuse that family. Must-fix findings become behavioral-contract corpus
   entries before the smallest corrective change. Evidence-invalid findings create no registry
   entry.
3. A candidate new family requires an independent, context-isolated classifier. Both agents must
   agree on every gate; disagreement cannot accept risk.
4. Accepted new families get a strict or paranoid fail-closed fixture, a structured entry in
   `docs/residual-risk-registry.json`, and the rationale below.
5. Review confirms the registry entry and this document stay synchronized before the
   classification is complete.

RR-1 through RR-10 are immutable legacy records; `automated_from` marks that boundary. Entries
after RR-10 are adjudicated in one of two ways: `"kind": "automated"`, a classified finding that
carries a strict or paranoid fail-closed fixture, or `"kind": "design"`, a residual an adjudicated
design document accepted, whose `sources` cite that document and whose `strict_fixture` is `null`
because no analyzer input can fail closed on it.

Automated entries use this shape; the candidate identifies the adjudicated finding and the
evidence must cite existing repository files:

```json
{
  "id": "RR-11",
  "title": "Family Title",
  "boundary": "distinct-ownership-boundary",
  "affected_modes": ["standard"],
  "strict_fixture": {
    "path": "tests/gate/behavioral-contract-cases.ts",
    "case_id": "rr-11-case-id",
    "mode": "strict",
    "command": "analyzer input that must fail closed",
    "expected_rule_id": "expected.rule-id"
  },
  "adjudication": {
    "kind": "automated",
    "date": "YYYY-MM-DD",
    "candidate": {
      "summary": "Canonical description of the exact finding being classified.",
      "path": "src/relevant-source.ts",
      "line": 123
    },
    "documented_boundary": "SECURITY.md boundary",
    "evidence": [{ "path": "SECURITY.md", "note": "Relevant contract evidence." }]
  }
}
```

Add each automated fixture to the test file named by `strict_fixture.path` and assert the expected
blocking rule under its declared mode.

## What Is Never Residual Risk

A finding in any of these areas is always in scope and merge-blocking, no matter how contrived the
triggering input is:

- Catastrophic protections failing in any mode: recursive deletion of root or home, destructive
  mutation of the protected Git metadata set, or destructive mutation of the canonical user policy
  file.
- Strict or paranoid mode failing open where `SECURITY.md` documents fail-closed behavior.
- False positives: a safe command that agents commonly run being blocked.
- Documented resource bounds regressing, or new resource-exhaustion behavior such as catastrophic
  regex backtracking or unbounded recursion.
- Secret redaction failing in audit or diagnostic output, or the tool itself becoming a harmful
  vector (`SECURITY.md`, "The Boundary: Bug or Vulnerability?").

## Adjudicated Families

### RR-1: Dynamic Executables and Computed Command Names

Command names assembled at runtime: `$(printf r)m -rf /`; `c=rm; "$c" -rf dir`;
`$(which rm) -rf dir`. Standard allows these by contract: helpful agents write the literal command
name, and resolving computed names means emulating shell expansion. Strict blocks the family as
`shell.dynamic-executable`.

Adjudicated 2026-07-22. Sources: `SECURITY.md` safety-preset contract; behavioral-contract case
"allows an executable assembled by command substitution at standard safety".

### RR-2: Command Structure Assembled Through Substitution

Flags or operands that materialize from substitution output at runtime, such as
`rm $(printf -- '-rf') dir`. Standard allows guarded structure-via-substitution; the bounded
conservative rules that already catch dynamic input, such as the xargs and GNU Parallel
dynamic-input rules and the linear dangerous-text scans, stay active. Strict fails closed on
unverifiable forms.

Adjudicated 2026-07-22. Sources: `SECURITY.md` safety-preset contract;
`tests/gate/behavioral-contract-cases.ts`.

### RR-3: Unverifiable Recursive-Delete Targets

Recursive-delete targets whose runtime value static analysis cannot prove, such as
`rm -rf "$BUILD_DIR"` or computed paths under temp roots. Standard allows them because temp-cleanup
idioms are pervasive and blocking them is false-positive-prohibitive; strict blocks the family as
`rm.recursive-force-dynamic-target`, and that rule can be force-enabled under standard through
per-rule policy controls. `allow_paths` never apply to dynamic targets, and the catastrophic set
remains enforced.

Adjudicated 2026-07-22. Sources: `SECURITY.md` safety-preset and allow-path contracts;
`docs/rm-temp-target-security-findings.md` section 2;
`tests/gate/behavioral-contract-cases.ts`.

### RR-4: Runtime-Reconstructed Strings Inside Interpreter Code

Sensitive paths or commands assembled by interpreter expressions: `chr()` and
`String.fromCharCode()` character assembly, split base64 or hex fragments, concatenation,
reversal, and runtime-discovered filenames. Standard scans literals, including complete base64
literals; expression evaluation is refused because it would require partial interpreters for every
language. The complete mitigation is OS-level filesystem enforcement.

Adjudicated 2026-07-22. Sources: `docs/secret-protection-known-limitations.md`;
`docs/secret-protection-bypass-findings.md`.

### RR-5: Script and Interpreter File Bodies

Destructive content inside a file the analyzed command merely invokes, such as `bash setup.sh` or
`python tool.py`. The gate analyzes command text, not file contents; inline `-c` and `-e` code is
analyzed. This is inherent residual risk for a static pre-execution text gate in every mode; the
mitigation is OS-level enforcement or a sandbox.

Adjudicated 2026-07-22. Source: `SECURITY.md` policy-file protection non-goals ("does not inspect
interpreter bodies").

### RR-6: Exact Shell-Expansion Emulation

Glob, brace, extglob, arithmetic, and `IFS` word-splitting semantics. Standard applies bounded
conservative checks and the documented compatibility exceptions but never exact expansion
emulation; crafted expansion tricks that survive those checks are residual, and strict-tier
fail-closed behavior owns the adversarial case.

Adjudicated 2026-07-22. Sources: `SECURITY.md` non-goals ("does not expand shell globs or
braces"); `docs/rm-temp-target-security-findings.md` section 2.

### RR-7: Runtime Shell-State Mutation

Aliases, shell functions, `PATH` or `IFS` mutation, sourced files, and disabled built-ins crafted
to change what command text means at execution time. Tracking is limited to simple assignment-only
variables, explicit `cd`, and the documented shell-state factors; the linear dangerous-text scans
still catch recognizable destructive text regardless of surrounding structure.

Adjudicated 2026-07-22. Sources: `REVIEW.md` threat model (runtime mutation); `SECURITY.md`
policy-file protection scope.

### RR-8: Quoting-Concatenation and Analyzer-Marker Attacks

Crafted quote concatenation aimed at analyzer internals, such as the sentinel-spoofing shape
`rm -rf "$tmp" '__PREFIX_'SUFFIX__`. The archetype was eliminated when the internal parser replaced
sentinel-based quote rewriting; no sentinel markers exist in the analyzer today. The family remains
adversarial by construction, and standard mode makes no bypass-proof claim against deliberate
quoting tricks. The same input causing
a strict or paranoid fail-open is never residual.

Adjudicated 2026-07-22. Source: `docs/rm-temp-target-security-findings.md` section 1.

### RR-9: Exact Tool-Language Emulation

Full emulation of `find` actions, `xargs`, GNU Parallel, archive member layouts, `find`-style
simulation, remote filenames, or a transfer's final filename. Bounded conservative rules stay
active in standard, including `find.delete` and the xargs and parallel dynamic-input rules; exact
argument-language emulation is refused in every mode.

Adjudicated 2026-07-22. Sources: `REVIEW.md` threat model; `SECURITY.md` policy-file protection
non-goals.

### RR-10: Standalone Metadata-Only Sensitive-Path Checks

Metadata-only discovery of built-in sensitive paths, such as `ls -la ~/.ssh` or `stat .env`.
Standard intentionally allows standalone metadata checks while keeping content access blocked;
strict and paranoid block metadata-only discovery.

Adjudicated 2026-07-22. Source: `SECURITY.md` safety-preset contract.

### RR-11: Adversarial Repo-Delivered Configuration

A cloned repository ships `.cc-safety-net/policy.json` or custom rules that weaken protection
relative to the user's own policy, and social-engineers the clone. The project policy is honored as
written, loosenings included, because within a team the committed file is the leader's legitimate
artifact and git is its delivery mechanism, not an attack channel. Distinguishing a leader's file
from a hostile one needs a trust gesture per repository, which was rejected: it defends against an
adversary CC Safety Net does not claim to stop, since a hostile agent can uninstall the tool
outright. `CC_SAFETY_NET_LEVEL` still raises the level for a session and is never lowered by a
project file, and every weakening is displayed in `status`, `doctor`, the statusline, and the GUI.

Adjudicated 2026-08-28. Sources: `TEAM-POLICY-DESIGN.md` threat model adjudication;
`TEAM-POLICY-DESIGN.md` rejected alternatives (trust-gated weakening).

### RR-12: Project Policy Guard Best-Effort Gaps

The guard on `<project>/.cc-safety-net/policy.json` inherits the user-scope gaps: writes laundered
through `git` are not recognized as mutations of the protected file. Brace groups and subshells are
traversed by the guard; `tests/gate/guards/policy-protection.test.ts` locks group coverage for both
scopes. The guard exists for the mistake model, a helpful agent routing around a block, and that
agent writes the file plainly. Closing the gaps means the exact-shell-emulation work already
refused in RR-5 through RR-9, on a file whose deliberate-attack case is RR-11 and therefore out of
scope. The complete mitigation is filesystem permissions.

The `policy apply` invocation block carries the same standard: it recognizes the documented
runner forms (direct bins, `npx`/`bunx`/`pnpx`, `dlx` and `exec` subcommands, runtime
entrypoints, versioned specs, interleaved options) but does not emulate every package runner's
full option grammar, and an unrecognized spelling passes the guard. The backstop is the command
itself: `policy apply` refuses to run without an interactive terminal, so an invocation that
slips past the guard still cannot apply silently.

Adjudicated 2026-08-28. Sources: `TEAM-POLICY-DESIGN.md` guard extension; `SECURITY.md`
policy-file protection non-goals.

### RR-13: Live Rulebook Files Lose Edit-Pending Enforcement

Rulebooks are read from their files on every tool call, so an accidentally corrupted or deleted
`rulebook.json` drops that source's rules fail-open instead of keeping the last validated version
enforced, which is what the retired lock and cache provided. The loss is bounded to custom rules:
built-in protections and the effective policy are untouched, other sources stay active, and the
condition is named with its file in block messages, `status`, the statusline, and `doctor`. Keeping
the old behavior meant keeping a digest over co-located data that anything able to corrupt the
rulebook could regenerate beside it. Deliberate removal of a project rule was already accepted by
the threat model as weakening relative to team intent but never below the user baseline.

Adjudicated 2026-08-28. Sources: `TEAM-POLICY-DESIGN.md` live-loading; `TEAM-POLICY-DESIGN.md`
accepted residuals.

### RR-14: Vendored Rulebook Drift Until Update

`rule add` and `rule update` write the fetched rulebook into `<rulebook-name>/rulebook.json`, and
nothing re-fetches afterwards. A vendored file edited locally, or an upstream repository that moves
on, drifts until someone runs `rule update`. This is the price of the offline runtime contract:
members never fetch, so a clone is protected with no network access and no per-repo command. Drift
is visible where it matters, in the vendored file's own git history and in the diff `rule update`
prints before overwriting.

Adjudicated 2026-08-28. Source: `TEAM-POLICY-DESIGN.md` vendoring remote sources.

### RR-15: GUI Session Token Readable by the Agent That Launches It

`gui` prints its session URL, token included, on stdout. An agent that launches the command itself
therefore reads the token and can drive the token-gated write endpoints, including the
project-policy apply that writes `<dir>/.cc-safety-net/policy.json`. The token defeats
browser-origin attacks — another page, or a process that never saw that line, cannot reach the
loopback server — but it cannot exclude the launcher, because handing it over is what lets the
browser page work at all. The exposure pre-exists for user-policy writes; project-policy writes are
the reason to record it now, since the same token reaches a file the rest of a team loads. What
still holds against the mistake model is the direct route: the always-on policy-file guard and the
`policy apply` invocation block deny an agent editing or applying those files by command. Closing
the gap needs a confirmation channel the browser session cannot supply on its own, which a
single-user localhost session tool does not justify.

Adjudicated 2026-08-29. Sources: `REVIEW.md` threat model; `SECURITY.md` policy-file protection
non-goals.
