# Release notes draft — the greenfield rebuild

A draft for the release that ships the rebuilt `src/`. Numbers marked "measured" come from the
sandbox the rebuild was verified in; re-measure on the release machine before publishing.

## Secret protection now follows `cd`

The secret matcher used to inspect each command segment on its own, so `cat ~/.ssh/config` was
denied while `cd ~ && cat .ssh/config` read the same file and was allowed. The matcher now walks
the command with the same shell-state tracking the protected-path guards have always used: a
`cd` moves the directory later relative operands resolve against, and a simple assignment that
holds a directory is followed when a `cd` dereferences it.

What changes for a user:

- `cd ~ && cat .ssh/config`, `cd ~ && cat .ssh/config | grep Host`, `cd ~ && cat > .ssh/config`
  and `d=~; cd "$d" && cat .ssh/config` are denied at every level, with the operand (`.ssh/config`)
  reported as the evidence.
- A read before the `cd` (`cat .ssh/config && cd ~`) resolves against the directory the command
  actually runs in, as before.
- The tracked scope is deliberately the scanner's: only `cd` moves the cwd (`cd -`, `pushd` and
  `popd` do not), a `cd` inside a subshell group counts as if it leaked into the rest of the
  command, an operand inside an interpreter body (`sh -c '…'`) resolves against the segment that
  runs the interpreter, and a `cd` inside that body is scanned as text rather than walked. A `cd`
  to an unset variable or to a command substitution leaves later relative operands unresolvable,
  which the matcher treats as before (no denial from the walk alone).

No policy change is needed; the rules, levels and `secretProtection` configuration are the same.

## Same contract, rebuilt implementation

The hook, CLI, API, GUI and every host integration keep their behavior: the rebuild was verified
command by command against the previous implementation, on the same fixtures, before the old code
was removed, and the recorded expectations from that comparison are now the test suite's oracle.

- Hook cold start: the hook path is a lean entry that loads only what a decision needs. Measured:
  node itself 30 ms, the hook 99 ms median over seven interleaved runs on the verification
  sandbox, with a test that fails if the hook exceeds node's startup by more than 150 ms or if
  the hook's static import closure exceeds 400,000 bytes (measured 344,139).
- Package: `dist/vendor/zod.cjs` is gone; zod is bundled where the CLI needs it and never loaded
  on the hook path. Packed tarball measured under the 560,000-byte cap the package verification
  enforces.
- Diagnostics: `doctor --json` keeps its shape; `explain`, `status`, `logs` and the rules manager
  print the same text.

## For contributors

`src/` is now layered as core → gate → audit → hosts → rules-manager → cli → gui → entries, with
an architecture test that forbids upward imports and sockets outside the GUI. The CLI runs from
source as `bun run src/entries/bin.ts`, and the self-invocation guard recognizes that path.
Tests live under `tests/` mirroring `src/`, and state their expectations directly: the gate's
replay reads `tests/fixtures/gate/harvested-verdicts.jsonl`, a readable verdict per literal, and
the snapshots and digests that remain cover output surfaces whose bytes are the contract (denial
text, host output documents, `doctor --json`, `explain`, CLI help). A behavior change lands as a
failing intent row first and only then re-records (`CC_SAFETY_NET_UPDATE_GOLDENS=1`,
`bun test --update-snapshots`), naming in the commit message which entries changed and why.
