#!/usr/bin/env bash
# Retake the README screenshots on this machine, the same way every time.
#
#   scripts/screenshots.sh [--only NAME,NAME] [--install] [--out DIR] [--monitor NAME] [--no-restart]
#
#   --only      just these: taskbar, start-menu, start-menu-light, start-menu-dark,
#               search, settings, right-click, pin-menu, window-menu, preview
#   --install   copy the results over screenshots/ (default: leave them in --out
#               for a look, and print what each would replace)
#   --out DIR   where the images go (default: a new directory under $TMPDIR or /tmp)
#   --monitor   capture this monitor (default: the focused one)
#   --no-restart  skip the shell restart
#
# What it does to the session while it runs: switches the monitor to an empty
# workspace (so no windows of yours are in a shot), opens two throwaway foot
# windows for the Preview, moves the real pointer, and types two letters into
# the Start menu's search box once it has seen the menu open. It puts the
# workspace, the plugin's entry in shell.json and the windows back on exit.
# Needs ydotool and a writable /dev/uinput: docs/hyprland-notes.md "Moving the
# pointer".
#
# The Dock shows your pins and open windows, and the wallpaper and theme are
# yours, so the images differ from release to release for those reasons alone.
# Look at every one before committing it.
#
# Every image is the subject plus the same margin ($margin px) of wallpaper on
# each side, so they look alike side by side. Things that sit on the bottom edge
# (the Dock, and the Preview and Start menu above it) carry on down to the
# monitor's bottom edge instead, and ones against the left edge start at it. The
# Items, menus and Preview are cropped to the rectangle the shell reports for
# them (`layout`); the settings window to its own size.
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
config=$HOME/.config/omarchy/shell.json
only=""
install=false
out=""
monitor=""
restart=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --only) only=$2; shift 2 ;;
    --install) install=true; shift ;;
    --out) out=$2; shift 2 ;;
    --monitor) monitor=$2; shift 2 ;;
    --no-restart) restart=false; shift ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "screenshots: unknown option $1" >&2; exit 2 ;;
  esac
done

for tool in jq grim hyprctl omarchy omarchy-shell magick wtype foot ydotool; do
  command -v "$tool" >/dev/null || { echo "screenshots: $tool is not installed" >&2; exit 2; }
done
[[ -w /dev/uinput ]] || { echo "screenshots: /dev/uinput is not writable (docs/hyprland-notes.md)" >&2; exit 2; }

id=$(jq -r .id "$repo/manifest.json")
installed=$HOME/.config/omarchy/plugins/$id
if [[ $(readlink -f "$installed" 2>/dev/null) != "$repo" ]]; then
  echo "screenshots: $installed does not point at this checkout (CONTRIBUTING.md, \"Development install\")." >&2
  exit 2
fi

wanted() { [[ -z $only || ,$only, == *,"$1",* ]]; }

out=${out:-${TMPDIR:-/tmp}/startbar-screenshots-$(date +%Y%m%d-%H%M%S)}
mkdir -p "$out"
pointer=$repo/scripts/pointer.sh

# The wallpaper left around every subject, in pixels.
margin=32

monitor=${monitor:-$(hyprctl monitors -j | jq -r '.[] | select(.focused) | .name')}
read -r mx my mw mh < <(hyprctl monitors -j | jq -r --arg m "$monitor" '.[] | select(.name == $m) | "\(.x) \(.y) \(.width) \(.height)"')
orig_workspace=$(hyprctl monitors -j | jq -r --arg m "$monitor" '.[] | select(.name == $m) | .activeWorkspace.id')
orig_focused=$(hyprctl monitors -j | jq -r '.[] | select(.focused) | .name')

backup=$(mktemp)
cp "$config" "$backup"
spares=()

cleanup() {
  omarchy-shell -q "$id" closeStartMenu 2>/dev/null || true
  omarchy-shell -q "$id" closeSettings 2>/dev/null || true
  for address in "${spares[@]:-}"; do
    [[ -n $address ]] && hyprctl dispatch "hl.dsp.window.close({ window = \"address:$address\" })" >/dev/null 2>&1 || true
  done
  cp "$backup" "$config"
  rm -f "$backup"
  hyprctl dispatch "hl.dsp.focus({ monitor = \"$monitor\" })" >/dev/null 2>&1 || true
  hyprctl dispatch "hl.dsp.focus({ workspace = \"$orig_workspace\" })" >/dev/null 2>&1 || true
  [[ $monitor != "$orig_focused" ]] && hyprctl dispatch "hl.dsp.focus({ monitor = \"$orig_focused\" })" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The state the README images show: left-aligned icons, theme colours, the
# built-in Start menu, previews on with the peek, no clock, no badge.
readme_state='{"alignment":"left","colorScheme":"theme","showStart":true,"startCommand":"builtin","startHoverOpen":false,"showClock":false,"showWorkspaceBadge":false,"transparent":false,"groupWindows":true,"showPreviews":true,"previewPeek":true,"previewWarpPointer":false,"autoHide":false}'

override() {
  local tmp
  tmp=$(mktemp)
  jq --arg id "$id" --argjson o "$1" '(.plugins[] | select(.id == $id)) += $o' "$config" >"$tmp"
  cat "$tmp" >"$config"
  rm -f "$tmp"
  sleep 1.2
}

# The Dock's Items and any open menu, as rectangles (see below).
shell_layout() { omarchy-shell "$id" layout 2>/dev/null; }

# wait_for FILTER: run a jq filter (ending in @tsv) over the layout until it gives
# something, up to 4 s, and print it space-separated. Fails if it never does.
wait_for() {
  local out i
  for i in $(seq 1 40); do
    out=$(shell_layout | jq -re "$1 // empty" 2>/dev/null | tr '\t' ' ') || out=""
    if [[ -n $out ]]; then echo "$out"; return 0; fi
    sleep 0.1
  done
  return 1
}

full() { grim -o "$monitor" "$1"; }

# frame FULL.png OUT.png X Y W H [down]: the rectangle plus $margin on every
# side, clamped to the monitor; with `down`, carried on to the monitor's bottom
# edge (for things standing on the Dock).
frame() {
  local x=$(($3 - margin)) y=$(($4 - margin)) w=$(($5 + 2 * margin)) h=$(($6 + 2 * margin))
  ((x < 0)) && { w=$((w + x)); x=0; }
  ((y < 0)) && { h=$((h + y)); y=0; }
  ((x + w > mw)) && w=$((mw - x))
  [[ ${7:-} == down ]] && h=$((mh - y))
  ((y + h > mh)) && h=$((mh - y))
  magick "$1" -crop "${w}x${h}+${x}+${y}" +repage "$2"
}

# stash CLASS: move that app's windows to a workspace of their own, away from the
# one being shot, so they appear in the Dock without covering the wallpaper.
stash() {
  local address i
  for i in $(seq 1 30); do
    hyprctl clients -j | jq -e --arg c "$1" '.[] | select(.class == $c)' >/dev/null && break
    sleep 0.1
  done
  for address in $(hyprctl clients -j | jq -r --arg c "$1" '.[] | select(.class == $c) | .address'); do
    hyprctl dispatch "hl.dsp.window.move({ workspace = \"$((empty_ws + 1))\", follow = false, window = \"address:$address\" })" >/dev/null
  done
  sleep 0.5
}

# pointer move to monitor-relative X Y
at() { "$pointer" move $((mx + $1)) $((my + $2)); }

keep() {
  cp "$1" "$out/$2.png"
  local was=""
  [[ -f $repo/screenshots/$2.png ]] && was=" (now $(magick identify -format '%wx%h' "$repo/screenshots/$2.png"))"
  echo "  $2.png $(magick identify -format '%wx%h' "$out/$2.png")$was"
}

# An empty workspace for a clean background: the first id from 90 up with no windows.
empty_ws=90
while hyprctl clients -j | jq -e --argjson w "$empty_ws" '.[] | select(.workspace.id == $w)' >/dev/null; do empty_ws=$((empty_ws + 1)); done

if $restart; then
  echo "screenshots: restarting the shell"
  omarchy restart shell >/dev/null 2>&1
  sleep 5
fi

hyprctl dispatch "hl.dsp.focus({ monitor = \"$monitor\" })" >/dev/null
hyprctl dispatch "hl.dsp.focus({ workspace = \"$empty_ws\" })" >/dev/null
sleep 1
override "$readme_state"
echo "screenshots: capturing $monitor on workspace $empty_ws, into $out"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"; cleanup' EXIT

if wanted taskbar; then
  at $((mw / 2)) 200
  full "$tmp/t.png"
  # From the top of the Items (less the margin) down to the bottom edge, 790 wide.
  top=$(shell_layout | jq -r '[.items[].y] | min // 0')
  magick "$tmp/t.png" -crop "790x$((mh - top + margin))+0+$((top - margin))" +repage "$tmp/taskbar.png"
  keep "$tmp/taskbar.png" taskbar
fi

# Start menu in each colour scheme: theme is start-menu.png (and search.png).
start_menu() {
  local scheme=$1 name=$2 typed=${3:-false}
  override "$(jq -c --arg s "$scheme" '. + {colorScheme: $s}' <<<"$readme_state")"
  omarchy-shell -q "$id" startMenu
  sleep 1.5
  full "$tmp/menu.png"
  local box bx by bw bh
  box=$(wait_for '.menus.start | select(.height > 300) | [.x, .y, .width, .height] | @tsv') || box=""
  read -r bx by bw bh <<<"$box"
  if [[ -z $box ]]; then
    echo "screenshots: the Start menu did not open for $name, skipping it" >&2
  else
    frame "$tmp/menu.png" "$tmp/$name.png" $bx $by $bw $bh down
    keep "$tmp/$name.png" "$name"
    if $typed && wanted search; then
      wtype "fi"
      sleep 1
      full "$tmp/typed.png"
      frame "$tmp/typed.png" "$tmp/search.png" $bx $by $bw $bh down
      keep "$tmp/search.png" search
    fi
  fi
  omarchy-shell -q "$id" closeStartMenu
  sleep 0.6
}
if wanted start-menu || wanted search; then start_menu theme start-menu true; fi
if wanted start-menu-light; then start_menu light start-menu-light; fi
if wanted start-menu-dark; then start_menu dark start-menu-dark; fi
override "$readme_state"

if wanted settings; then
  omarchy-shell -q "$id" settings
  sleep 1.5
  full "$tmp/s.png"
  frame "$tmp/s.png" "$tmp/settings.png" $(((mw - 640) / 2)) $(((mh - 760) / 2)) 640 760
  keep "$tmp/settings.png" settings
  omarchy-shell -q "$id" closeSettings
  sleep 0.6
fi

# Where things are comes from the shell itself: `omarchy-shell <id> layout` gives
# the Dock's Items and any open menu as rectangles in pixels from the monitor's
# top-left corner (the panel's `layout()` in Service.qml), so nothing is found by
# comparing screenshots.

# crop_rect FULL.png OUT.png X Y W H: a menu's rectangle with the margin.
crop_rect() { frame "$1" "$2" "$3" "$4" "$5" "$6"; }

# right_click_item FILTER MENU: right click the centre of the Item the filter picks,
# and print the rectangle of the menu that opens ("x y w h").
open_item_menu() {
  local item x y w h
  item=$(wait_for ".items[] | select($1) | [.x, .y, .width, .height] | @tsv") || return 1
  read -r x y w h <<<"$item"
  at $((x + w / 2)) $((y + h / 2)); sleep 0.4
  "$pointer" right >/dev/null
  wait_for '.menus.item | select(.height > 40) | [.x, .y, .width, .height] | @tsv'
}

# Bar menu: right click on the bar away from any Item, with auto-hide on as in
# the image, so the Dock is revealed by the pointer first.
if wanted right-click; then
  override "$(jq -c '. + {autoHide: true}' <<<"$readme_state")"
  at $((mw / 2)) $((mh - 2)); sleep 1.2
  at $((mw * 6 / 10)) $((mh - 12)); sleep 0.5
  "$pointer" right >/dev/null
  if rect=$(wait_for '.menus.bar | select(.height > 100) | [.x, .y, .width, .height] | @tsv'); then
    read -r bx by bw bh <<<"$rect"
    sleep 0.3
    full "$tmp/rc.png"
    crop_rect "$tmp/rc.png" "$tmp/right-click.png" $bx $by $bw $bh
    keep "$tmp/right-click.png" right-click
  else
    echo "screenshots: the Bar menu did not open, skipping it" >&2
  fi
  at $((mw / 2)) 200
  "$pointer" left >/dev/null
  sleep 0.5
  override "$readme_state"
fi

# pin-menu: the first Pin with no Windows (the App's actions, its icon and name,
# Unpin from taskbar).
if wanted pin-menu; then
  at $((mw / 2)) 200; sleep 0.5
  if rect=$(open_item_menu '.kind == "pin"'); then
    read -r bx by bw bh <<<"$rect"
    sleep 0.3
    full "$tmp/pm.png"
    crop_rect "$tmp/pm.png" "$tmp/pin-menu.png" $bx $by $bw $bh
    keep "$tmp/pin-menu.png" pin-menu
  else
    echo "screenshots: found no Pin without Windows, skipping pin-menu" >&2
  fi
  at $((mw / 2)) 200; "$pointer" left >/dev/null; sleep 0.5
fi

# window-menu: a throwaway foot window posing as btop, whose Item is not pinned
# (the App's actions, the window's state, Close Window, then the App's icon and
# name and Pin to taskbar).
if wanted window-menu; then
  foot --app-id=btop --title="Window one" -o colors-dark.background=c8c8c8 -o colors-dark.foreground=202020 sh -c "echo 'Window one'; sleep 600" >/dev/null 2>&1 &
  stash btop
  at $((mw / 2)) 200; sleep 0.5
  if rect=$(open_item_menu '.appId == "btop"'); then
    read -r bx by bw bh <<<"$rect"
    sleep 0.3
    full "$tmp/wm.png"
    crop_rect "$tmp/wm.png" "$tmp/window-menu.png" $bx $by $bw $bh
    keep "$tmp/window-menu.png" window-menu
  else
    echo "screenshots: the throwaway window's menu did not open, skipping window-menu" >&2
  fi
  at $((mw / 2)) 200; "$pointer" left >/dev/null; sleep 0.5
  for address in $(hyprctl clients -j | jq -r '.[] | select(.class == "btop") | .address'); do
    hyprctl dispatch "hl.dsp.window.close({ window = \"address:$address\" })" >/dev/null 2>&1 || true
  done
  sleep 1
fi

# Preview: two throwaway windows of one app make a group Item, whose Preview is
# wider than any single Window's. Hover that Item and crop to the Preview and the
# Dock under it.
if wanted preview; then
  for n in one two; do
    foot --app-id=startbar-screenshot --title="Window $n" sh -c "echo 'Window $n'; ls $repo | head -12; sleep 600" >/dev/null 2>&1 &
  done
  sleep 1; stash startbar-screenshot
  at $((mw / 2)) 200; sleep 0.5
  if item=$(wait_for '.items[] | select(.key == "group:class:startbar-screenshot") | [.x, .y, .width, .height] | @tsv'); then
    read -r x y w h <<<"$item"
    spares=($(hyprctl clients -j | jq -r '.[] | select(.class == "startbar-screenshot") | .address'))
    # From the Dock's edge first: jumping straight onto an Item can lose the hover.
    at $((mw / 2)) $((mh - 2)); sleep 0.5
    at $((x + w / 2)) $((y + h / 2))
    if rect=$(wait_for '.menus.preview | select(.width > 100 and .height > 50) | [.x, .y, .width, .height] | @tsv'); then
      read -r bx by bw bh <<<"$rect"
      sleep 0.6
      full "$tmp/pv.png"
      frame "$tmp/pv.png" "$tmp/preview.png" $bx $by $bw $bh down
      keep "$tmp/preview.png" preview
    else
      echo "screenshots: the Preview did not open, skipping it" >&2
    fi
  else
    echo "screenshots: could not find a group Item of the two windows, skipping the Preview" >&2
  fi
  at $((mw / 2)) 200
fi

if $install; then
  echo "screenshots: installing into screenshots/"
  cp "$out"/*.png "$repo/screenshots/"
  git -C "$repo" status --short screenshots
else
  echo "screenshots: look at them in $out; --install copies them over screenshots/"
fi
