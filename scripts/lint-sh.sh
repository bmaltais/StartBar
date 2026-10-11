#!/usr/bin/env bash
# Syntax-check every script in scripts/, and run shellcheck over them when it is
# installed. `bash -n` catches a broken script before it is run against the
# live shell; it cannot catch a script that is wrong.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
for script in scripts/*.sh; do
  bash -n "$script"
done
if command -v shellcheck >/dev/null; then
  shellcheck scripts/*.sh
else
  echo "lint-sh: shellcheck is not installed, only the syntax was checked"
fi
