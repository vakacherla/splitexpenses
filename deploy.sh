#!/usr/bin/env bash
# Runs the same checks CI would run, locally, before anything reaches
# production — stops at the first failure instead of finding out from
# a broken app. This is the safety net without the GitHub/CI setup: it
# would have caught the balances-tab crash before it ever shipped, since
# that bug broke the build's own behavior, not just its appearance.
#
# What this does NOT do: sync your local files from a freshly downloaded
# zip (still a manual step before running this), or touch the Supabase
# side (migrations, Edge Functions still deploy separately, by design —
# see ARCHITECTURE.md for why).

set -euo pipefail

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s — stopping before deploy.\033[0m\n' "$1"; exit 1; }

step "Building"
npm run build || fail "Build failed"

step "Linting"
npm run lint || fail "Lint failed"

step "Running tests"
npm test || fail "Tests failed"

step "All checks passed — deploying to Vercel"
vercel --prod
