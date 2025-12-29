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
    # Run tests with coverage report
    uv run pytest --cov=scripts --cov-report=json --cov-report=term-missing

# Bump version and generate changelog
bump:
    uv run cz bump
    git push -u origin HEAD --follow-tags
    gh release create $(git describe --tags --abbrev=0) --notes "$(uv run cz changelog $(git describe --tags --abbrev=0) --dry-run)"
