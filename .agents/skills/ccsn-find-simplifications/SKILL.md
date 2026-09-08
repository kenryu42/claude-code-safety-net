---
name: ccsn-find-simplifications
description: 'Use when working in the cc-safety-net repo to find non-obvious simplification candidates: dead, duplicated, speculative, over-built, or contract-exceeding surfaces in the analyzer, rules, guards, integrations, CLI, or GUI. Produces evidence-backed proposals for the maintainer, not a pile of guesses.'
disable-model-invocation: true
---

# Finding CC Safety Net Simplifications

This skill turns a broad "find things to simplify" request into evidence-backed candidates that remove or collapse existing surface area. It is guidance, not a checklist: follow the code, keep judgment active, and prefer a few well-proven candidates over many thin ones.

Over-engineering is this repo's documented dominant failure mode (see Scope Discipline in `AGENTS.md`), so simplification proposals have a tailwind — but the same discipline applies to the proposals themselves: each one must name the concrete cost the current code carries, not just "this looks complex."

## Start With Repo Context

- Read `AGENTS.md` (Scope Discipline, Style Guide, Knip rules), `REVIEW.md` (threat model and review boundary), and `SECURITY.md` (the standard/strict/paranoid mode contract).
- Read `docs/residual-risk.md` before judging anything in `src/core/shell`, `src/gate/analyzer`, or `src/core/rules`. Adjudicated bypass families are settled decisions; fixtures pinning them are load-bearing even when nothing else references them.
- The mode contract is the repo's central seam: standard mode blocks recognizable accidental destruction and is explicitly not bypass-proof; strict/paranoid fail closed. Complexity that exists only to chase crafted adversarial shapes in standard mode exceeds the documented contract — `REVIEW.md` forbids adding it, which makes any existing instance a prime simplification candidate. Conversely, fail-closed machinery in strict/paranoid is contract, not bloat.

## Treat As Intentional By Default

- The per-tool integrations in `src/hosts` (Claude Code, OpenCode, Codex, Copilot CLI, Cursor, Amp, Pi, Kimi Code, Gemini CLI, OpenClaw, Antigravity, Hermes, …). Each exists because a real host tool needs it; propose deleting one only if the user says the tool is dropped. Removing an unused hook or method *inside* one is still fair game.
- The residual-risk registry pair (`docs/residual-risk-registry.json` + `docs/residual-risk.md`) and the strict/paranoid fail-closed fixtures that back its families.
- The single-runtime-dependency posture (`zod` only). Hand-rolled shell parsing is the product, not a hand-rolling smell — this is a security hook with a deliberately minimal supply chain. Do not propose swapping the parser or a guard for an npm package; a new dependency is a maintainer decision to propose separately, never a "low effort" cleanup.
- Adversarial-looking strings in tests are analyzer input data, never executed. Do not propose removing them as dangerous or redundant without checking which contract or residual-risk family they pin.

## What Counts As A Strong Candidate

A strong simplification removes, folds, or demotes something real, with evidence the current design costs more than it buys:

- An internal symbol, engine hook, or GUI implementation surface has no production consumer. For public exports, configuration, policy knobs, and CLI or GUI features, require contract or deprecation evidence; repository-local absence cannot prove that external users do not depend on them.
- Tests or comments are the only consumers, and the behavior they pin is not a mode-contract guarantee or a residual-risk fixture.
- Two representations mirror the same fact (e.g. a value stored in the IR and re-derived in the analyzer, or parallel per-tool code that could share one path without weakening any tool's enforcement). Note that `bun run check` already gates textual duplication via jscpd — focus on structural duplication it cannot see.
- Standard-mode parser or rule logic whose only justification is a deliberately crafted bypass shape: per `REVIEW.md` that belongs to strict/paranoid fail-closed handling or documented residual risk, not emulation code.
- Defensive copies, freezes, re-validation, or normalization applied to values a same-process trusted caller already owns. The trust boundary here is precise: hook payloads from host tools, user config/policy files, and analyzed command strings are untrusted and deserve validation; values passed between this repo's own modules ordinarily do not.
- Speculative generality with no consumer: registries with one entry, schemas ahead of their first real user, fields whose values are forced constants, options no integration sets.
- An invariant, fallback, or special-case test that exists only to protect an unused API.
- The simplified behavior may differ slightly, but the new behavior is still reasonable, within the mode contract, and easier to explain.

Thin candidates are not enough: one typo, a single `knip` run, "this looks complex" without call-site proof, or anything whose removal would create a false negative for recognizable danger in standard mode.

## Survey Broadly

Use parallel subagents when the user asks for breadth. Give each a domain and require evidence, not guesses:

- Parser and IR (`src/core/shell`, `src/core`): normalization passes, node kinds, fields nothing downstream reads.
- Analyzer and rules (`src/gate/analyzer`, `src/core/rules`): rule machinery, severity plumbing, contract-exceeding emulation.
- Guards and policy (`src/gate/guards`, `src/core/policy`): backstops mirroring the same fact, config knobs nothing sets.
- Engine and CLI (`src/gate`, `src/cli`): commands, flags, install/detect flows, output formatting.
- Integrations (`src/hosts`, `hooks/`, root plugin manifests): per-tool duplication, unused adapter methods.
- GUI (`src/gui`): surfaces or state with no interaction path.
- Tests, scripts, build (`tests/`, `scripts/`): redundant fixtures, verification scripts checking what another gate already checks.

Do not let the first good candidate stop the survey, and start with the largest production files — duplicated lifecycle and defensive machinery costs more than stray unused symbols.

## Prove Or Reject Each Candidate

Classify consumers before writing anything up:

- Production corpus: `src/`, `hooks/`, `scripts/` used at build/publish time, root plugin manifests (`kimi.plugin.json`, package.json `pi`/`bin`/peer-dependency wiring), and the tracked `skills/` directory. Ignore `dist/` (generated) and the untracked personal dirs (`report/`, `research/`, `artifacts/`, `droid-wiki/`, `TODO.md`, `REDESIGN.md`).
- Non-production corpus: `tests/` and comments. README and other docs are non-runtime evidence, but count as contract consumers for public surfaces.
- Ambiguous corpus: e2e and e2e-live tests that exercise real host-tool wiring — these often pin integration contracts; read them before classifying.

Use `rg` first: the exact symbol, config key, CLI flag, rule id, tool name string, and any wire/JSON strings (integrations dispatch on string tool names, so grep strings, not just identifiers). Then read the call sites. `knip` helps but runs in `--production` mode — a `/** @internal */` tag means test-only-by-design, not dead; and dynamic string dispatch hides real consumers from it.

Reject or downgrade when:

- A production consumer exists and removal would be a feature decision, not a cleanup.
- The surface is pinned by the mode contract, a residual-risk family, or a documented decision in `docs/`, and the new evidence does not beat the recorded rationale.
- Removal would cause a standard-mode false negative for a plausible accidental command, or weaken strict/paranoid fail-closed behavior.
- Removal forces broad churn without reducing public surface or required behavior.

## Report, Don't Restructure

This repo has no notes system and a solo maintainer. The deliverable is a report to the user, strongest evidence first. For each candidate:

- **What**: the exact symbols/files to remove, fold, or demote, with `file:line` references.
- **Evidence**: production vs test/doc consumers found, and the searches that establish absence.
- **What we give up**: the strongest counterargument, stated honestly — including any behavior change and why it stays within the mode contract.
- **Blast radius**: tests, docs, and fixtures that would change with it.

Do not create new docs, directories, dependencies, or process files to hold findings — placement of new repo structure is the maintainer's call. Do not implement removals during a survey unless the user asked for fixes; when they do, implement the smallest change per candidate, keep `tests/` mirroring `src/`, and follow the Red–Green rule for any behavior change.

## Validation

A findings-only survey needs no checks. When candidates are implemented, run `bun run check` once at the end (never its pieces separately). If knip then flags fallout, fix the root cause per the Knip section of `AGENTS.md` — unexport, tag `/** @internal */`, or trim the barrel; never touch `ignoreIssues`.
