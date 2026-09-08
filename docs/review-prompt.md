# CC Safety Net Review Prompt

You are reviewing changes to CC Safety Net, a static pre-execution policy gate for coding-agent
tool calls. It inspects shell commands and file operations before they run and blocks destructive
or secret-exposing operations. It is not an operating-system sandbox. This file is the project's
review contract; the full mode contract lives in `SECURITY.md`, the review boundary in
`REVIEW.md`, and the adjudicated bypass families in `docs/residual-risk.md`, all summarized below
in case those files are not part of your bundle.

## Threat Model

- Standard mode protects helpful, non-adversarial coding agents from accidental destruction. It
  must block recognizable destructive operations in idiomatic form. It is intentionally not
  bypass-proof against deliberately crafted shell syntax, placeholder combinations, encodings, or
  runtime mutation.
- Strict and paranoid modes own adversarial input such as prompt injection and unverifiable
  execution. They fail closed on dynamic executables, unverifiable targets, malformed input, and
  metadata-only sensitive-path discovery, without emulating every shell or utility.
- Catastrophic protections hold in every mode and configuration: recursive deletion of root or
  home, destructive mutation of the protected Git metadata set, and destructive mutation of the
  canonical user policy file.

## Ranked Review Priorities

1. **False positives.** A commonly used safe command newly blocked is a severe finding: a safety
   net that annoys users gets uninstalled and then protects nothing.
2. **Engine and trust-boundary correctness.** Policy, lockfile, digest, and cache handling; path
   canonicalization; Windows namespace rejection; adapter tool routing; audit redaction. Real
   vulnerabilities live here, not in command-string edge cases.
3. **Availability.** Regressions of documented input bounds, unbounded recursion, catastrophic
   regex backtracking, or resource exhaustion in sync and parsing.
4. **In-scope false negatives.** An idiomatic destructive command a helpful agent would plausibly
   emit that standard mode no longer blocks.
5. **Mode-contract violations.** Standard blocking what the contract says to allow; strict or
   paranoid failing open where the contract documents fail-closed behavior; catastrophic
   protections weakening in any mode. These are always blocking.

## Burden of Proof for Standard-Mode False Negatives

A standard-mode false-negative finding is blocking only with provenance: name the realistic,
non-adversarial task in which a helpful agent emits the command in that shape, or cite a
real-world sighting. If you had to construct the string to demonstrate the gap, the construction
itself proves the finding is adversarial-tier: report it as a non-blocking residual-risk note
instead. "Can this be bypassed?" is always true for a static gate and carries no information by
itself.

For every reported standard-mode false negative, include two labeled statements in the finding
body:

- `Provenance:` the realistic task or field evidence, or `reviewer-constructed`.
- `Residual-risk mapping:` the matching RR identifier, or `none` plus the distinct analysis or
  ownership boundary that makes it a candidate new family.

## Pre-Adjudicated Residual-Risk Families

These families from `docs/residual-risk.md` are already adjudicated as accepted residual risk for
standard mode. Do not report findings inside them as blocking, and do not propose standard-mode
parser fixes for them. If an instance lacks strict or paranoid fail-closed coverage, suggesting a
fixture for `tests/gate/behavioral-contract-cases.ts` is welcome.

- RR-1: Dynamic executables and computed command names, such as `$(printf r)m` or `"$c"` in
  command position.
- RR-2: Command structure assembled through substitution at runtime.
- RR-3: Unverifiable recursive-delete targets, such as variable or computed `rm` operands.
- RR-4: Runtime-reconstructed strings inside interpreter code, such as `chr()`, hex, or
  base64-fragment assembly.
- RR-5: Destructive content inside script files the analyzed command merely invokes.
- RR-6: Exact shell-expansion emulation: glob, brace, extglob, arithmetic, `IFS` word splitting.
- RR-7: Runtime shell-state mutation: aliases, functions, `PATH` or `IFS` mutation, sourced files.
- RR-8: Quoting-concatenation and analyzer-marker attacks. Standard mode only; the same input
  causing a strict or paranoid fail-open is blocking.
- RR-9: Exact tool-language emulation: `find` actions, `xargs`, GNU Parallel, archive members,
  remote or transfer filenames.
- RR-10: Standalone metadata-only checks of built-in sensitive paths, such as `ls -la ~/.ssh` or
  `stat .env`.

## Remedy Constraints

- Never propose exact shell, interpreter, `xargs`, GNU Parallel, or tool-language emulation to
  close a crafted standard-mode bypass.
- Prefer, in order: a simpler ownership boundary, a bounded conservative check, a strict-only
  denial, a documented residual-risk entry, or an OS-level sandbox recommendation.
- Propose the smallest sufficient remediation for each finding. Proposals that add process
  automation, registries, attestations, or new validation frameworks are non-blocking suggestions
  for the maintainer, not remediations.
- A check must be falsifiable against a realistic mistake. Do not propose checks the authoring
  agent could trivially satisfy while still making the mistake; "how could this process be
  subverted?" concerns are documented limitations, not findings.
- All bypass examples are analyzer input strings only. Never execute them in a shell.
