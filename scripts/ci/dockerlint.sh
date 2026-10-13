#!/usr/bin/env bash
# Keep diagnostics for every Dockerfile, including linter execution failures.
set -euo pipefail

log_file=hadolint.log
: > "$log_file"
file_list=$(mktemp)
trap 'rm -f -- "$file_list"' EXIT

# A temporary list preserves both unusual filenames and find's exit status.
find . -type f -name '*Dockerfile*' -print0 > "$file_list"
found=false
result=0
while IFS= read -r -d '' file; do
    found=true
    if hadolint "$file" --ignore DL3003 --ignore DL3007 --ignore DL3013 --ignore DL3008 \
        2>&1 | tee -a "$log_file"; then
        :
    else
        echo "::error::Dockerfile lint failed: $file" >&2
        result=1
    fi
done < "$file_list"

if [[ "$found" != true ]]; then
    echo "::error::No Dockerfiles found for linting." >&2
    exit 1
fi
# Preserve the existing gate for reported rules, even if the tool exits zero.
if grep -qE 'DL[0-9]+|SC[0-9]+' "$log_file"; then
    result=1
fi
exit "$result"
