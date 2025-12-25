#!/usr/bin/env python3
"""
Git/filesystem safety net for Claude Code.

Blocks destructive commands that can lose uncommitted work or delete files.
This hook runs before Bash commands execute and can deny dangerous operations.

Exit behavior:
  - Exit 0 with JSON containing permissionDecision: "deny" = block command
  - Exit 0 with no output = allow command
"""

try:
    from scripts.safety_net_impl.hook import main as _impl_main
except ImportError:  # When executed as a script from the scripts/ directory.
    from safety_net_impl.hook import main as _impl_main  # type: ignore[no-redef]


def main() -> int:
    return _impl_main()


if __name__ == "__main__":
    import sys

    sys.exit(main())
