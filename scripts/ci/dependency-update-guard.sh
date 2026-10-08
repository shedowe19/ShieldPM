#!/usr/bin/env bash
set -euo pipefail

# The updater owns new proposals only. Once a PR is open, reviewers may add
# compatibility fixes, security resolutions, documentation, and a custom body.
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_OUTPUT:?GITHUB_OUTPUT is required}"

open_pr_count="$(gh pr list --repo "$GITHUB_REPOSITORY" --state open \
    --head update-all-deps --limit 1 --json number --jq 'length')"

case "$open_pr_count" in
    0)
        echo "can_update=true" >> "$GITHUB_OUTPUT"
        ;;
    ''|*[!0-9]*)
        echo "::error::Could not validate the existing dependency pull request state."
        exit 1
        ;;
    *)
        echo "can_update=false" >> "$GITHUB_OUTPUT"
        echo "::notice::An update-all-deps pull request is already open; preserving its branch and description."
        ;;
esac
