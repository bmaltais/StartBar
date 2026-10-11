#!/usr/bin/env bash
# Drive the real pointer, to try what `npm run smoke` cannot: hover a Dock Item,
# move onto its Preview, right-click. Needs ydotool and a writable /dev/uinput
# (docs/hyprland-notes.md "Moving the pointer").
#   scripts/pointer.sh move X Y     move there with real motion (a hover fires)
#   scripts/pointer.sh left|right   click
#   scripts/pointer.sh shot FILE    screenshot DP-1
# A Preview needs the pointer to rest on its Item for ~400 ms, then to move onto
# the thumbnail: sleep between the calls and shoot to see what is up.
set -euo pipefail

export YDOTOOL_SOCKET="${XDG_RUNTIME_DIR:-/tmp}/.ydotool_socket"
if [ ! -S "$YDOTOOL_SOCKET" ]; then
  nohup ydotoold --socket-path="$YDOTOOL_SOCKET" --socket-own="$(id -u):$(id -g)" >/dev/null 2>&1 &
  sleep 1
fi

case "${1:-}" in
  move)
    # cursor.move puts the pointer there but raises no hover; a 1 px nudge does.
    hyprctl dispatch "hl.dsp.cursor.move({ x = $2, y = $3 })" >/dev/null
    ydotool mousemove -x 1 -y 0
    ydotool mousemove -x -1 -y 0
    ;;
  left) ydotool click 0xC0 >/dev/null ;;
  right) ydotool click 0xC1 >/dev/null ;;
  shot) grim -o DP-1 "$2" ;;
  *) echo "usage: $0 move X Y | left | right | shot FILE" >&2; exit 2 ;;
esac
