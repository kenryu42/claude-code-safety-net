# Install dependencies
setup:
    uv sync
    uv run pre-commit install

# Run linter, type checker, dead code detection, and tests
check:
    # Run linter
    uv run ruff check --fix
    # Run type checker
    uv run mypy .
    # Run dead code detection
    uv run vulture
    # Run tests
    uv run pytest

# Bump version and generate changelog
bump:
    uv run cz bump
    git push --follow-tags
    gh release create $(git describe --tags --abbrev=0) --notes "$(uv run cz changelog $(git describe --tags --abbrev=0) --dry-run)"
