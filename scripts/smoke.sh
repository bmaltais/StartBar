#!/usr/bin/env bash
# Live smoke test: restart the Omarchy shell with this checkout loaded, fail on
# any error the plugin logs, and screenshot the Dock, the Start menu and the
# settings window in each colour scheme. Look at the screenshots afterwards:
# the script only knows that the shell loaded the plugin without complaint,
# not that what it drew is right.
#
#   scripts/smoke.sh [--monitor NAME] [--out DIR] [--type] [--no-restart]
#
#   --monitor NAME  capture this monitor (default: the focused one). Focus is
#                   moved there for the run and put back afterwards.
#   --out DIR       where the screenshots go (default: a new directory under
#                   $TMPDIR or /tmp)
#   --type          also type into the Start menu's search box and capture
#                   the results. If the menu failed to open, those keys go to
#                   whatever window has focus, so it is opt-in.
#   --no-restart    skip the shell restart (the journal check then only covers
#                   what is logged during the run)
#
# It temporarily edits this plugin's entry in ~/.config/omarchy/shell.json
# (colour scheme, built-in Start menu, auto-hide off, clock on) and restores
# the file byte for byte on exit, however the script ends.
#
# It cannot click, drag or hover: a warped pointer does not produce the motion
# Qt's hover needs. scripts/pointer.sh can, with real motion, for Previews and
# the menus; drag still needs a real mouse (CONTRIBUTING.md, "Manual
# verification checklist").
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
config=$HOME/.config/omarchy/shell.json
monitor=""
out=""
type_search=false
restart=true

while [[ $# -gt 0 ]]; do
  case $1 in
    --monitor) monitor=$2; shift 2 ;;
    --out) out=$2; shift 2 ;;
    --type) type_search=true; shift ;;
    --no-restart) restart=false; shift ;;
    -h|--help) sed -n '2,27p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "smoke: unknown option $1" >&2; exit 2 ;;
  esac
done

for tool in jq grim hyprctl omarchy omarchy-shell journalctl; do
  command -v "$tool" >/dev/null || { echo "smoke: $tool is not installed" >&2; exit 2; }
done
if $type_search; then
  command -v wtype >/dev/null || { echo "smoke: --type needs wtype" >&2; exit 2; }
fi

id=$(jq -r .id "$repo/manifest.json")
installed=$HOME/.config/omarchy/plugins/$id
if [[ $(readlink -f "$installed" 2>/dev/null) != "$repo" ]]; then
  echo "smoke: $installed does not point at this checkout, so the shell would not load it." >&2
  echo "       See CONTRIBUTING.md, \"Development install\"." >&2
  exit 2
fi
if ! jq -e --arg id "$id" '.plugins[]? | select(.id == $id)' "$config" >/dev/null; then
  echo "smoke: no entry for $id in $config; run: omarchy plugin enable $id" >&2
  exit 2
fi

out=${out:-${TMPDIR:-/tmp}/startbar-smoke-$(date +%Y%m%d-%H%M%S)}
mkdir -p "$out"
backup=$(mktemp)
cp "$config" "$backup"
focused=$(hyprctl monitors -j | jq -r '.[] | select(.focused) | .name')
monitor=${monitor:-$focused}
started=$(date '+%Y-%m-%d %H:%M:%S')

focus_monitor() {
  # Hyprland's dispatchers are Lua calls on this version.
  hyprctl dispatch "hl.dsp.focus({ monitor = \"$1\" })" >/dev/null
}

cleanup() {
  omarchy-shell -q "$id" closeStartMenu 2>/dev/null || true
  omarchy-shell -q "$id" closeSettings 2>/dev/null || true
  cp "$backup" "$config"
  rm -f "$backup"
  [[ $monitor != "$focused" ]] && focus_monitor "$focused" || true
}
trap cleanup EXIT

# Merge overrides into the plugin's entry; the shell picks the file up live.
override() {
  local tmp
  tmp=$(mktemp)
  jq --arg id "$id" --argjson o "$1" '(.plugins[] | select(.id == $id)) += $o' "$config" >"$tmp"
  cat "$tmp" >"$config"
  rm -f "$tmp"
  sleep 1.2
}

shot() {
  grim -o "$monitor" "$out/$1.png"
  echo "  $out/$1.png"
}

# Lines the plugin itself logged since the run began, minus the shell's own
# note that it noticed the checkout change.
plugin_log() {
  journalctl --user -t omarchy-shell --since "$started" --no-pager 2>/dev/null |
    grep -F -e "$id" -e "$repo" -e "$installed" |
    grep -v -F "Local plugin changed, reloading" || true
}

if $restart; then
  echo "smoke: restarting the shell"
  omarchy restart shell >/dev/null 2>&1
  sleep 5
  if ! omarchy plugin list 2>/dev/null | grep -F "$id" | grep -q enabled; then
    echo "smoke: FAILED, $id is not enabled after the restart" >&2
    exit 1
  fi
fi

[[ $monitor != "$focused" ]] && focus_monitor "$monitor" && sleep 0.5

echo "smoke: capturing $monitor"
for scheme in theme light dark; do
  override "{\"colorScheme\": \"$scheme\", \"startCommand\": \"builtin\", \"autoHide\": false, \"showStart\": true, \"showClock\": true}"
  shot "$scheme-1-dock"
  omarchy-shell -q "$id" startMenu
  sleep 1.5
  shot "$scheme-2-start-menu"
  if $type_search; then
    wtype "fi"
    sleep 1
    shot "$scheme-3-search"
  fi
  omarchy-shell -q "$id" closeStartMenu
  sleep 0.6
done

omarchy-shell -q "$id" settings
sleep 1.5
shot "settings-window"
omarchy-shell -q "$id" closeSettings

log=$(plugin_log)
if [[ -n $log ]]; then
  echo "smoke: FAILED, the plugin logged:" >&2
  echo "$log" >&2
  exit 1
fi
echo "smoke: ok, nothing logged by the plugin. Now look at the screenshots in $out"
