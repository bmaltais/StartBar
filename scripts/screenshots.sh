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
# Crops are anchored to the monitor's bottom-left corner, as the current images
# are; their sizes are in `crops` below. The Preview and the Bar menu vary in
# size, so they are cropped to what appeared on screen when they opened.
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

# Crop sizes of the fixed-size images, from the current files in screenshots/.
crop_taskbar=790x170
crop_start=790x710

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

full() { grim -o "$monitor" "$1"; }

# crop FULL.png WxH OUT.png: that size from the monitor's bottom-left corner.
crop_bottom_left() {
  local size=$1 h=${2#*x}
  magick "$3" -crop "${size}+0+$((mh - h))" +repage "$4"
}

# changed_box BEFORE AFTER: "x y w h" of what differs between two screenshots.
changed_box() {
  local diff
  diff=$(mktemp --suffix=.png)
  magick compare -metric AE -fuzz 4% "$1" "$2" -compose Src -highlight-color white -lowlight-color black "$diff" 2>/dev/null || true
  # %@ prints no newline, and `read` fails on a line without one.
  { magick "$diff" -format '%@' info: 2>/dev/null; echo; } | sed -E 's/^([0-9]+)x([0-9]+)\+([0-9]+)\+([0-9]+)$/\3 \4 \1 \2/'
  rm -f "$diff"
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
  crop_bottom_left "$crop_taskbar" "$crop_taskbar" "$tmp/t.png" "$tmp/taskbar.png"
  keep "$tmp/taskbar.png" taskbar
fi

# Start menu in each colour scheme: theme is start-menu.png (and search.png).
start_menu() {
  local scheme=$1 name=$2 typed=${3:-false}
  override "$(jq -c --arg s "$scheme" '. + {colorScheme: $s}' <<<"$readme_state")"
  full "$tmp/before.png"
  omarchy-shell -q "$id" startMenu
  sleep 1.5
  full "$tmp/menu.png"
  local box
  box=$(changed_box "$tmp/before.png" "$tmp/menu.png")
  read -r _ _ _ bh <<<"$box"
  if [[ ${bh:-0} -lt 300 ]]; then
    echo "screenshots: the Start menu did not open for $name, skipping it" >&2
  else
    crop_bottom_left "$crop_start" "$crop_start" "$tmp/menu.png" "$tmp/$name.png"
    keep "$tmp/$name.png" "$name"
    if $typed && wanted search; then
      wtype "fi"
      sleep 1
      full "$tmp/typed.png"
      crop_bottom_left "$crop_start" "$crop_start" "$tmp/typed.png" "$tmp/search.png"
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
  magick "$tmp/s.png" -crop "640x760+$(((mw - 640) / 2))+$(((mh - 760) / 2))" +repage "$tmp/settings.png"
  keep "$tmp/settings.png" settings
  omarchy-shell -q "$id" closeSettings
  sleep 0.6
fi

# Bar menu: right click on the bar away from any Item, with auto-hide on as in
# the image, so the Dock is revealed by the pointer first.
if wanted right-click; then
  override "$(jq -c '. + {autoHide: true}' <<<"$readme_state")"
  at $((mw / 2)) $((mh - 2)); sleep 1.2
  at $((mw * 6 / 10)) $((mh - 12)); sleep 0.5
  full "$tmp/rc-before.png"
  "$pointer" right
  sleep 1
  full "$tmp/rc-after.png"
  read -r bx by bw bh < <(changed_box "$tmp/rc-before.png" "$tmp/rc-after.png")
  if [[ ${bh:-0} -lt 200 ]]; then
    echo "screenshots: the Bar menu did not open, skipping it" >&2
  else
    # The diff trims the menu's own border (close to the background in colour); pad it back.
    magick "$tmp/rc-after.png" -crop "$((bw + 10))x$((bh + 6))+$((bx - 5))+$((by - 3))" +repage "$tmp/right-click.png"
    keep "$tmp/right-click.png" right-click
  fi
  at $((mw / 2)) 200
  "$pointer" left
  sleep 0.5
  override "$readme_state"
fi

# Item menus: right click an Item and crop to what appeared. pin-menu is the
# first Pin with no Windows (its menu is short: the App's actions, its icon and
# name, Unpin from taskbar); window-menu is a throwaway foot window posing as btop, whose Item
# is not pinned (the App's actions, the window's state, Close Window, then its
# icon and name and Pin to taskbar). The menu's crop is padded back like the
# Bar menu's.
item_menu() {
  local name=$1 x=$2 before=$3
  at "$x" $((mh - 26)); sleep 0.6
  "$pointer" right >/dev/null
  sleep 1
  full "$tmp/im-after.png"
  # Only the region over the Item: a terminal's blinking cursor elsewhere on
  # the screen would otherwise count as a change.
  local rx=$(( x > 160 ? x - 160 : 0 )) ry=$((mh - 700))
  magick "$before" -crop "520x700+${rx}+${ry}" +repage "$tmp/im-b.png"
  magick "$tmp/im-after.png" -crop "520x700+${rx}+${ry}" +repage "$tmp/im-a.png"
  read -r bx by bw bh < <(changed_box "$tmp/im-b.png" "$tmp/im-a.png")
  bx=$((bx + rx)); by=$((by + ry))
  # Keeps the crop only for a menu above the Dock (not a Preview or a tooltip).
  if [[ ${bh:-0} -lt 60 || ${by:-9999} -gt $((mh - 120)) ]]; then
    return 1
  fi
  magick "$tmp/im-after.png" -crop "$((bw + 10))x$((bh + 6))+$((bx - 5))+$((by - 3))" +repage "$tmp/$name.png"
  menu_h=$bh
  return 0
}

if wanted pin-menu; then
  at $((mw / 2)) 200; sleep 0.8
  at $((mw / 2)) $((mh - 2)); sleep 1.2
  full "$tmp/im-away.png"
  found=false
  for slot in $(seq 1 10); do
    at $((mw / 2)) $((mh - 2)); sleep 0.5
    menu_h=0
    if item_menu pin-menu $((31 + 46 * slot)) "$tmp/im-away.png" && [[ $menu_h -lt 190 ]]; then
      found=true
      break
    fi
    # Close whatever opened (a Window Item's menu) and try the next slot.
    at $((mw / 2)) 200; "$pointer" left >/dev/null; sleep 0.6
  done
  if $found; then keep "$tmp/pin-menu.png" pin-menu; else echo "screenshots: found no Pin without Windows, skipping pin-menu" >&2; fi
  at $((mw / 2)) 200; "$pointer" left >/dev/null; sleep 0.5
fi

if wanted window-menu; then
  at $((mw / 2)) $((mh - 2)); sleep 1.2
  foot --app-id=btop --title="Window one" -o colors-dark.background=c8c8c8 -o colors-dark.foreground=202020 sh -c "echo 'Window one'; sleep 600" >/dev/null 2>&1 &
  sleep 2.5
  at $((mw / 2)) 200; sleep 0.8
  at $((mw / 2)) $((mh - 2)); sleep 1.2
  full "$tmp/wm-away.png"
  # The throwaway window is the newest Item, so the last icon on the Dock: scan
  # one row of pixels through the icons for the rightmost column that differs
  # from the Dock's own colour, and right-click just inside it.
  row=$(magick "$tmp/wm-away.png" -crop "$((mw / 2))x1+0+$((mh - 26))" +repage -depth 8 txt:- | tail -n +2 \
    | sed -E 's/^([0-9]+),0:.*(#[0-9A-Fa-f]{6}).*$/\1 \2/')
  bg=${row##* }
  last_x=$(awk -v bg="$bg" '$2 != bg { last = $1 } END { print last }' <<<"$row")
  menu_h=0
  if [[ -n $last_x ]] && item_menu window-menu $((last_x - 8)) "$tmp/wm-away.png" && [[ $menu_h -lt 400 ]]; then
    keep "$tmp/window-menu.png" window-menu
  else
    echo "screenshots: no Item menu opened, skipping window-menu" >&2
  fi
  at $((mw / 2)) 200; "$pointer" left >/dev/null; sleep 0.5
  # By class, not the list taken at the start: the window may map late.
  for address in $(hyprctl clients -j | jq -r '.[] | select(.class == "btop") | .address'); do
    hyprctl dispatch "hl.dsp.window.close({ window = \"address:$address\" })" >/dev/null 2>&1 || true
  done
  sleep 1
fi

# Preview: two throwaway windows of one app make a group Item, whose Preview is
# wider than any single Window's. Hover the Dock's slots in turn and keep the
# widest Preview; what appeared, against the screen with the pointer away, is
# the crop.
if wanted preview; then
  for n in one two; do
    foot --app-id=startbar-screenshot --title="Window $n" sh -c "echo 'Window $n'; ls $repo | head -12; sleep 600" >/dev/null 2>&1 &
  done
  sleep 2.5
  spares=($(hyprctl clients -j | jq -r '.[] | select(.class == "startbar-screenshot") | .address'))
  # Baseline with the pointer on the Dock's edge, not over a window: focus follows
  # the pointer, and a different active border would show up in every diff.
  at $((mw / 2)) 200; sleep 0.8
  at $((mw / 2)) $((mh - 2)); sleep 1.2
  full "$tmp/away.png"
  best=0; found=""
  if [[ ${#spares[@]} -ge 2 ]]; then
    for slot in $(seq 0 14); do
      # Back to the edge first: jumping from Item to Item loses some hovers.
      at $((mw / 2)) $((mh - 2)); sleep 0.5
      at $((31 + 46 * slot)) $((mh - 26)); sleep 1.2
      full "$tmp/hover.png"
      read -r bx by bw bh < <(changed_box "$tmp/away.png" "$tmp/hover.png")
      if [[ ${bw:-0} -gt $best && ${by:-9999} -lt $((mh - 120)) ]]; then
        best=$bw
        cp "$tmp/hover.png" "$tmp/best.png"
        found="$bx $by $bw $bh"
      fi
    done
  fi
  if [[ -z $found || $best -lt 300 ]]; then
    echo "screenshots: could not find a Preview of the two windows, skipping it" >&2
  else
    read -r bx by bw bh <<<"$found"
    x=$((bx > 7 ? bx - 7 : 0)); y=$((by > 7 ? by - 7 : 0))
    magick "$tmp/best.png" -crop "$((bw + 14))x$((mh - y))+${x}+${y}" +repage "$tmp/preview.png"
    keep "$tmp/preview.png" preview
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
