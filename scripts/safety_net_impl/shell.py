"""Shell parsing helpers for the safety net."""

import shlex


def _split_shell_commands(command: str) -> list[str]:
    parts: list[str] = []
    buf: list[str] = []
    in_single = False
    in_double = False
    escape = False

    i = 0
    while i < len(command):
        ch = command[i]

        if escape:
            buf.append(ch)
            escape = False
            i += 1
            continue

        if ch == "\\" and not in_single:
            buf.append(ch)
            escape = True
            i += 1
            continue

        if ch == "'" and not in_double:
            in_single = not in_single
            buf.append(ch)
            i += 1
            continue

        if ch == '"' and not in_single:
            in_double = not in_double
            buf.append(ch)
            i += 1
            continue

        if not in_single and not in_double:
            if command.startswith("&&", i) or command.startswith("||", i):
                part = "".join(buf).strip()
                if part:
                    parts.append(part)
                buf = []
                i += 2
                continue
            if command.startswith("|&", i):
                part = "".join(buf).strip()
                if part:
                    parts.append(part)
                buf = []
                i += 2
                continue
            if ch == "|":
                part = "".join(buf).strip()
                if part:
                    parts.append(part)
                buf = []
                i += 1
                continue
            if ch == "&":
                prev = command[i - 1] if i > 0 else ""
                nxt = command[i + 1] if i + 1 < len(command) else ""
                if prev in {">", "<"} or nxt == ">":
                    buf.append(ch)
                    i += 1
                    continue

                part = "".join(buf).strip()
                if part:
                    parts.append(part)
                buf = []
                i += 1
                continue
            if ch in {";", "\n"}:
                part = "".join(buf).strip()
                if part:
                    parts.append(part)
                buf = []
                i += 1
                continue

        buf.append(ch)
        i += 1

    part = "".join(buf).strip()
    if part:
        parts.append(part)
    return parts


def _shlex_split(segment: str) -> list[str] | None:
    try:
        return shlex.split(segment, posix=True)
    except ValueError:
        return None


def _strip_env_assignments(tokens: list[str]) -> list[str]:
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if "=" not in tok:
            break
        key, _value = tok.split("=", 1)
        if not key or not (key[0].isalpha() or key[0] == "_"):
            break
        if not all(ch.isalnum() or ch == "_" for ch in key[1:]):
            break
        i += 1
    return tokens[i:]


def _strip_wrappers(tokens: list[str]) -> list[str]:
    previous: list[str] | None = None
    depth = 0
    while tokens and tokens != previous and depth < 20:
        previous = tokens
        depth += 1

        tokens = _strip_env_assignments(tokens)
        if not tokens:
            return tokens

        head = tokens[0].lower()
        if head == "sudo":
            i = 1
            while i < len(tokens) and tokens[i].startswith("-") and tokens[i] != "--":
                i += 1
            if i < len(tokens) and tokens[i] == "--":
                i += 1
            tokens = tokens[i:]
            continue

        if head == "env":
            i = 1
            while i < len(tokens):
                tok = tokens[i]
                if tok == "--":
                    i += 1
                    break
                if tok in {"-u", "--unset", "-C", "-P", "-S"}:
                    i += 2
                    continue
                if tok.startswith("--unset="):
                    i += 1
                    continue
                if tok.startswith("-u") and len(tok) > 2:
                    i += 1
                    continue
                if tok.startswith("-C") and len(tok) > 2:
                    i += 1
                    continue
                if tok.startswith("-P") and len(tok) > 2:
                    i += 1
                    continue
                if tok.startswith("-S") and len(tok) > 2:
                    i += 1
                    continue
                if tok.startswith("-") and tok != "-":
                    i += 1
                    continue
                break

            tokens = tokens[i:]
            continue

        if head == "command":
            i = 1
            while i < len(tokens):
                tok = tokens[i]
                if tok == "--":
                    i += 1
                    break
                if tok in {"-p", "-v", "-V"}:
                    i += 1
                    continue
                if tok.startswith("-") and tok != "-" and not tok.startswith("--"):
                    chars = tok[1:]
                    if chars and all(ch in {"p", "v", "V"} for ch in chars):
                        i += 1
                        continue
                break

            tokens = tokens[i:]
            continue

        break

    return _strip_env_assignments(tokens)


def _short_opts(tokens: list[str]) -> set[str]:
    """Extract individual short option characters from tokens.

    Stops at `--` end-of-options marker to avoid treating positional
    arguments (e.g., filenames starting with `-`) as options.

    Also stops parsing a token at the first non-alpha character to avoid
    false positives from attached option values (e.g., `-C/path` should
    only contribute `C`, not `C`, `/`, `p`, `a`, `t`, `h`).
    """
    opts: set[str] = set()
    for tok in tokens:
        if tok == "--":
            break  # End of options; remaining tokens are positional args
        if tok.startswith("--") or not tok.startswith("-") or tok == "-":
            continue
        for ch in tok[1:]:
            if not ch.isalpha():
                break
            opts.add(ch)
    return opts
