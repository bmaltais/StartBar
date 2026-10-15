#!/usr/bin/env bash
# Syntax-check every shell script of the project, and run shellcheck over them when it is installed (the rules are in ../.shellcheckrc).
# `bash -n` catches a broken script before it is run against the live shell; it cannot catch a script that is wrong.
#
#   scripts/lint-sh.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# scripts/devkit is a submodule: without it checked out its globs match nothing and are left out.
shopt -s nullglob
files=(scripts/*.sh scripts/dev scripts/reload scripts/sheet scripts/tours/*.sh scripts/devkit/bin/* scripts/devkit/lib/*.sh .githooks/pre-commit)
for f in "${files[@]}"; do
  bash -n "$f"
done
if command -v shellcheck >/dev/null; then
  shellcheck -x -s bash "${files[@]}"
else
  echo "lint-sh: shellcheck is not installed, only the syntax was checked"
fi
echo "lint-sh: ok, ${#files[@]} scripts"
