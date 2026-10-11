#!/bin/bash
# Restart the live Omarchy shell and fail if StartBar logs QML errors while
# loading. Run it after editing Service.qml or StartMenuView.qml: node --test
# cannot see the QML side, and qmllint cannot resolve the Quickshell types.
set -euo pipefail

since=$(date +%T)
omarchy-restart-shell >/dev/null 2>&1
sleep "${SMOKE_WAIT:-8}"

pgrep -x quickshell >/dev/null || { echo "smoke: the shell did not come back" >&2; exit 1; }

errors=$(journalctl --user -t omarchy-shell --since "$since" --no-pager |
  grep -i 'io.github.bmaltais.startbar' | grep -E 'WARN|ERROR' || true)

if [ -n "$errors" ]; then
  echo "$errors" >&2
  echo "smoke: StartBar logged errors" >&2
  exit 1
fi
echo "smoke: no StartBar errors in the shell log"
