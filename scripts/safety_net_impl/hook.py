"""Git/filesystem safety net for Claude Code.

Blocks destructive commands that can lose uncommitted work or delete files.
This hook runs before Bash commands execute and can deny dangerous operations.

Exit behavior:
  - Exit 0 with JSON containing permissionDecision: "deny" = block command
  - Exit 0 with no output = allow command
"""

import json
import posixpath
import re
import sys
from os import getenv

from .rules_git import _analyze_git
from .rules_rm import _analyze_rm
from .shell import _shlex_split, _split_shell_commands, _strip_wrappers

_MAX_RECURSION_DEPTH = 5

_STRICT_SUFFIX = " [strict mode - disable with: unset SAFETY_NET_STRICT]"


def _strict_mode() -> bool:
    val = (getenv("SAFETY_NET_STRICT") or "").strip().lower()
    return val in {"1", "true", "yes", "on"}


def _normalize_cmd_token(token: str) -> str:
    tok = token.strip().lower()
    while tok.startswith("$("):
        tok = tok[2:]
    tok = tok.lstrip("\\`({[")
    tok = tok.rstrip("`)}];")
    tok = posixpath.basename(tok)
    return tok


def _extract_dash_c_arg(tokens: list[str]) -> str | None:
    # Handles: <shell> -c 'cmd', <shell> -lc 'cmd', <shell> --norc -c 'cmd'
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok == "--":
            return None
        if tok == "-c":
            return tokens[i + 1] if i + 1 < len(tokens) else None
        if tok.startswith("-") and len(tok) > 1 and tok[1:].isalpha():
            letters = set(tok[1:])
            # Common combined short options for shells.
            if "c" in letters and letters.issubset({"c", "l", "i", "s"}):
                return tokens[i + 1] if i + 1 < len(tokens) else None
    return None


def _has_shell_dash_c(tokens: list[str]) -> bool:
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok == "--":
            break
        if tok == "-c":
            return True
        if tok.startswith("-") and len(tok) > 1 and tok[1:].isalpha():
            letters = set(tok[1:])
            if "c" in letters and letters.issubset({"c", "l", "i", "s"}):
                return True
    return False


def _extract_pythonish_code_arg(tokens: list[str]) -> str | None:
    # Handles: python -c 'code', node -e 'code', ruby -e 'code', perl -e 'code'
    for i in range(1, len(tokens)):
        tok = tokens[i]
        if tok == "--":
            return None
        if tok in {"-c", "-e"}:
            return tokens[i + 1] if i + 1 < len(tokens) else None
    return None


def _redact_secrets(text: str) -> str:
    # Heuristic redaction: do not echo likely secrets back into logs.
    redacted = text

    # KEY=VALUE patterns for common secret-ish keys.
    redacted = re.sub(
        r"\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASS|KEY|CREDENTIALS)[A-Z0-9_]*)=([^\s]+)",
        r"\1=<redacted>",
        redacted,
        flags=re.IGNORECASE,
    )

    # Authorization headers.
    redacted = re.sub(
        r"(?i)(authorization\s*:\s*)([^\s]+)",
        r"\1<redacted>",
        redacted,
    )

    # URL credentials: scheme://user:pass@host
    redacted = re.sub(
        r"(?i)(https?://)([^\s/:@]+):([^\s@]+)@",
        r"\1<redacted>:<redacted>@",
        redacted,
    )

    # Common GitHub token prefixes.
    redacted = re.sub(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b", "<redacted>", redacted)
    return redacted


def _format_safe_excerpt(label: str, text: str) -> str:
    text = _redact_secrets(text)
    if len(text) > 300:
        text = text[:300] + "…"
    return f"{label}: {text}\n\n"


def _dangerous_in_text(text: str) -> str | None:
    t = text.lower()

    # Last-resort heuristics for when proper parsing fails or when destructive commands
    # are embedded in substitutions.
    if re.search(
        r"(?<![\w/\\])(?:/[^\s'\";|&]+/)?rm\b[^\n;|&]*(?:\s-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b|\s-r\b[^\n;|&]*\s-f\b|\s-f\b[^\n;|&]*\s-r\b|\s--recursive\b[^\n;|&]*\s--force\b|\s--force\b[^\n;|&]*\s--recursive\b)",
        t,
    ):
        return "rm -rf is destructive. List files first, then delete individually."

    if "git reset --hard" in t:
        return "git reset --hard destroys uncommitted changes. Use 'git stash' first."
    if "git reset --merge" in t:
        return "git reset --merge can lose uncommitted changes."
    if "git clean -f" in t or "git clean --force" in t:
        return (
            "git clean -f removes untracked files permanently. "
            "Review with 'git clean -n' first."
        )
    if ("git push --force" in t or re.search(r"\bgit\s+push\s+-f\b", t)) and (
        "--force-with-lease" not in t
    ):
        return (
            "Force push can destroy remote history. "
            "Use --force-with-lease if necessary."
        )
    if "git branch -D" in t and "git branch -d" not in t:
        return "git branch -D force-deletes without merge check. Use -d for safety."
    if "git stash drop" in t:
        return (
            "git stash drop permanently deletes stashed changes. "
            "List stashes first with 'git stash list'."
        )
    if "git stash clear" in t:
        return "git stash clear permanently deletes ALL stashed changes."
    if "git checkout --" in t:
        return (
            "git checkout -- discards uncommitted changes permanently. "
            "Use 'git stash' first."
        )
    if re.search(r"\bgit\s+restore\b", t) and (
        "--staged" not in t and "--help" not in t and "--version" not in t
    ):
        if "--worktree" in t:
            return "git restore --worktree discards uncommitted changes permanently."
        return (
            "git restore discards uncommitted changes. "
            "Use 'git stash' or 'git diff' first."
        )

    return None


def _analyze_segment(
    segment: str,
    *,
    depth: int,
    cwd: str | None,
    strict: bool,
) -> tuple[str, str] | None:
    tokens = _shlex_split(segment)
    if tokens is None:
        if strict:
            return segment, "Unable to parse shell command safely." + _STRICT_SUFFIX
        reason = _dangerous_in_text(segment)
        return (segment, reason) if reason else None
    if not tokens:
        return None

    tokens = _strip_wrappers(tokens)
    if not tokens:
        return None

    head = _normalize_cmd_token(tokens[0])

    # Wrapper/interpreter recursion: bash/sh/zsh -c '...'
    if head in {"bash", "sh", "zsh", "dash", "ksh"}:
        cmd_str = _extract_dash_c_arg(tokens)
        if cmd_str is not None:
            if depth >= _MAX_RECURSION_DEPTH:
                return segment, "Command analysis recursion limit reached."
            analyzed = _analyze_command(
                cmd_str,
                depth=depth + 1,
                cwd=cwd,
                strict=strict,
            )
            if analyzed:
                return analyzed
        elif strict and _has_shell_dash_c(tokens):
            return segment, "Unable to parse shell -c wrapper safely." + _STRICT_SUFFIX

    # python/node/ruby/perl one-liners (-c/-e): can hide rm/git.
    if head in {"python", "python3", "node", "ruby", "perl"}:
        code = _extract_pythonish_code_arg(tokens)
        if code is not None:
            reason = _dangerous_in_text(code)
            if reason:
                return segment, reason
            if strict:
                return (
                    segment,
                    "Cannot safely analyze interpreter one-liners." + _STRICT_SUFFIX,
                )

    allow_tmpdir_var = not re.search(r"\bTMPDIR=", segment)

    if head == "busybox" and len(tokens) >= 2:
        applet = _normalize_cmd_token(tokens[1])
        if applet == "rm":
            reason = _analyze_rm(
                ["rm", *tokens[2:]],
                allow_tmpdir_var=allow_tmpdir_var,
                cwd=cwd,
                strict=strict,
            )
            return (segment, reason) if reason else None

    if head == "git":
        reason = _analyze_git(["git", *tokens[1:]])
        return (segment, reason) if reason else None
    if head == "rm":
        reason = _analyze_rm(
            ["rm", *tokens[1:]],
            allow_tmpdir_var=allow_tmpdir_var,
            cwd=cwd,
            strict=strict,
        )
        return (segment, reason) if reason else None

    # Detect embedded destructive commands (e.g. $(rm -rf ...), `git reset --hard`).
    for i in range(1, len(tokens)):
        cmd = _normalize_cmd_token(tokens[i])
        if cmd == "rm":
            reason = _analyze_rm(
                ["rm", *tokens[i + 1 :]],
                allow_tmpdir_var=allow_tmpdir_var,
                cwd=cwd,
                strict=strict,
            )
            if reason:
                return segment, reason
        if cmd == "git":
            reason = _analyze_git(["git", *tokens[i + 1 :]])
            if reason:
                return segment, reason

    reason = _dangerous_in_text(segment)
    return (segment, reason) if reason else None


def _analyze_command(
    command: str,
    *,
    depth: int,
    cwd: str | None,
    strict: bool,
) -> tuple[str, str] | None:
    effective_cwd = cwd
    for segment in _split_shell_commands(command):
        analyzed = _analyze_segment(
            segment,
            depth=depth,
            cwd=effective_cwd,
            strict=strict,
        )
        if analyzed:
            return analyzed

        if effective_cwd is not None and _segment_changes_cwd(segment):
            effective_cwd = None
    return None


def _segment_changes_cwd(segment: str) -> bool:
    tokens = _shlex_split(segment)
    if tokens is not None:
        # Best-effort handling for grouped commands/subshells like:
        #   { cd ..; ...; }
        #   ( cd ..; ... )
        #   $( cd ..; ... )
        while tokens and tokens[0] in {"{", "(", "$("}:
            tokens = tokens[1:]

        tokens = _strip_wrappers(tokens)
        if tokens and tokens[0].lower() == "builtin":
            tokens = tokens[1:]

        if tokens:
            return _normalize_cmd_token(tokens[0]) in {"cd", "pushd", "popd"}

    return bool(
        re.match(
            r"^\s*(?:\$\(\s*)?[\(\{]*\s*(?:command\s+|builtin\s+)?(?:cd|pushd|popd)(?:\s|$)",
            segment,
            flags=re.IGNORECASE,
        )
    )


def main() -> int:
    strict = _strict_mode()
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        if not strict:
            return 0
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "BLOCKED by safety_net.py\n\nReason: Invalid hook input."
                        ),
                    }
                }
            )
        )
        return 0

    if not isinstance(input_data, dict):
        if not strict:
            return 0
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "BLOCKED by safety_net.py\n\n"
                            "Reason: Invalid hook input structure."
                        ),
                    }
                }
            )
        )
        return 0

    tool_name = input_data.get("tool_name")
    if tool_name != "Bash":
        return 0

    tool_input = input_data.get("tool_input")
    if not isinstance(tool_input, dict):
        if not strict:
            return 0
        print(
            json.dumps(
                {
                    "hookSpecificOutput": {
                        "hookEventName": "PreToolUse",
                        "permissionDecision": "deny",
                        "permissionDecisionReason": (
                            "BLOCKED by safety_net.py\n\n"
                            "Reason: Invalid hook input structure."
                        ),
                    }
                }
            )
        )
        return 0

    command = tool_input.get("command")
    if not isinstance(command, str) or not command.strip():
        return 0

    cwd_val = input_data.get("cwd")
    cwd = cwd_val.strip() if isinstance(cwd_val, str) else None
    if cwd == "":
        cwd = None

    analyzed = _analyze_command(command, depth=0, cwd=cwd, strict=strict)
    if analyzed:
        segment, reason = analyzed
        output = {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": (
                    "BLOCKED by safety_net.py\n\n"
                    f"Reason: {reason}\n\n"
                    + _format_safe_excerpt("Command", command)
                    + _format_safe_excerpt("Segment", segment)
                    + "If this operation is truly needed, ask the user for explicit "
                    "permission and have them run the command manually."
                ),
            }
        }
        print(json.dumps(output))
        return 0

    return 0
