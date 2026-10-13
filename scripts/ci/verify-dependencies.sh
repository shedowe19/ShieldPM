#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repository_root"

(
    cd backend
    node node_modules/typescript/bin/tsc --noEmit
    npx --yes --package yarn@1.22.22 yarn test --run
)
(
    cd frontend
    node check-locales.cjs
    npx --yes --package yarn@1.22.22 yarn test --run
    npx --yes --package yarn@1.22.22 yarn build
)
node frontend/scripts/ci/check-bundle-budget.cjs --dist frontend/dist --budget frontend/performance-budget.json
