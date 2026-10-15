#!/usr/bin/env bash
# Project rules for the scripts: the devkit's (scripts/devkit/bin/lint: a background launch must redirect its output; a sandbox must not
# copy or link the real shell.json). Run by `npm run check`. Skipped, and says so, while the submodule is not checked out.
kit=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/devkit/bin/lint
[[ -x $kit ]] || { echo "lint-rules: scripts/devkit is empty, so the devkit's rules are skipped (git submodule update --init scripts/devkit)"; exit 0; }
exec "$kit" "$(dirname "${BASH_SOURCE[0]}")/.."
