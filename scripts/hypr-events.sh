#!/usr/bin/env bash
# Record Hyprland's window, focus and workspace events with timestamps, to see
# who changed focus and in what order while you reproduce something by hand.
#   scripts/hypr-events.sh start [file]   record in the background (default /tmp/startbar-events.log)
#   scripts/hypr-events.sh stop           stop it
# It stops by PID, not `pkill -f`: that pattern also matches the shell running it.
set -euo pipefail

pidfile="${XDG_RUNTIME_DIR:-/tmp}/startbar-events.pid"
socket="${XDG_RUNTIME_DIR:-/tmp}/hypr/${HYPRLAND_INSTANCE_SIGNATURE:?not running under Hyprland}/.socket2.sock"

case "${1:-}" in
  start)
    log="${2:-/tmp/startbar-events.log}"
    : > "$log"
    nohup bash -c "socat -u UNIX-CONNECT:'$socket' - | grep --line-buffered -E '^(activewindowv2|openwindow|closewindow|workspacev2|focusedmonv2)' | while read -r line; do echo \"\$(date +%T.%3N) \$line\"; done >> '$log'" >/dev/null 2>&1 &
    echo $! > "$pidfile"
    echo "recording to $log"
    ;;
  stop)
    [ -f "$pidfile" ] || { echo "not recording"; exit 0; }
    pkill -P "$(cat "$pidfile")" || true
    kill "$(cat "$pidfile")" 2>/dev/null || true
    rm -f "$pidfile"
    ;;
  *)
    echo "usage: $0 start [file] | stop" >&2
    exit 2
    ;;
esac
