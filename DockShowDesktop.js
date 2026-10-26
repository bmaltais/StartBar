// Show desktop (docs/SPEC.md "Input"): hide every Window on every monitor, then
// bring back the ones that were open. No Quickshell or QML imports, so the same
// file loads as a JS import inside the shell and via `require` under Node.
//
// One toggle command, like DockHyprland.js's: `["bash", "-lc", script, "bash"]`.
// The Windows go to the special workspace "special:showdesktop", which stays
// hidden (follow = false). Their addresses and workspaces are saved per
// Hyprland instance, so a second press knows what to put back and a nested test
// session never restores another's.

// Focusing a Window can warp the pointer to it, even on another monitor: toggle
// cursor:no_warps around the restore and put the old value back (as
// DockHyprland.js does).
var NO_WARPS = "orig=false; hyprctl -j getoption cursor:no_warps | grep -q '\"bool\": true' && orig=true; "
  + "hyprctl eval 'hl.config({ cursor = { no_warps = true } })' >/dev/null; ";
var WARPS_BACK = "hyprctl eval \"hl.config({ cursor = { no_warps = $orig } })\" >/dev/null\n";

var DESKTOP_STATE = "\"${XDG_RUNTIME_DIR:-/tmp}/startbar-showdesktop-${HYPRLAND_INSTANCE_SIGNATURE:-0}\"";

// Windows on a special workspace (the scratchpad, Omarchy's minimized Windows)
// are left where they are, so a second press never brings them back. The
// lock keeps two quick presses from overlapping.
//
// A Window on a window-mode (floating) workspace is floated by Omarchy and put
// at a default spot when it comes back, and one that floated was tiled while
// hidden, so each Window's floating state, position and size are saved and
// put back: `place ADDRESS FLOATING X Y W H` (a copy is in DockHyprland.js's
// RESTORE, for the click path). Tiled Windows are re-tiled by Hyprland.
var PLACE = "place() { [ \"$2\" = true ] || return 0; "
  + "hyprctl -j clients | jq -e --arg a \"$1\" '.[] | select(.address == $a and .floating)' >/dev/null "
  + "|| hyprctl dispatch \"hl.dsp.window.float({ action = \\\"toggle\\\", window = \\\"address:$1\\\" })\" >/dev/null; "
  + "hyprctl dispatch \"hl.dsp.window.resize({ x = $5, y = $6, exact = true, window = \\\"address:$1\\\" })\" >/dev/null; "
  + "hyprctl dispatch \"hl.dsp.window.move({ x = $3, y = $4, window = \\\"address:$1\\\" })\" >/dev/null; }\n";

function showDesktop() {
  var script = "exec 9>" + DESKTOP_STATE.slice(0, -1) + ".lock\"; flock 9\n"
    + "state=" + DESKTOP_STATE + "\n"
    + PLACE
    + "move() { hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$1\\\", follow = false, window = \\\"address:$2\\\" })\" >/dev/null; }\n"
    + "if [ -f \"$state\" ]; then\n"
    + "  # Second press: put back each saved Window that is still hidden here.\n"
    + "  " + NO_WARPS + "\n"
    + "  prev=$(head -n1 \"$state\")\n"
    + "  hidden=$(hyprctl -j clients | jq -r '.[] | select(.workspace.name == \"special:showdesktop\") | .address')\n"
    + "  # Tiled Windows are placed in the order they come back: left to right, top to bottom.\n"
    + "  tail -n +2 \"$state\" | sort -k2,2n -k4,4n -k5,5n > \"$state.rows\"\n"
    + "  while read -r addr ws fl x y w h; do\n"
    + "    echo \"$hidden\" | grep -qx \"$addr\" && move \"$ws\" \"$addr\"\n"
    + "  done < \"$state.rows\"\n"
    + "  sleep 0.4  # let Omarchy float the Windows it floats before they are placed\n"
    + "  while read -r addr ws fl x y w h; do\n"
    + "    echo \"$hidden\" | grep -qx \"$addr\" && place \"$addr\" \"$fl\" \"$x\" \"$y\" \"$w\" \"$h\"\n"
    + "  done < \"$state.rows\"\n"
    + "  rm -f \"$state.rows\"\n"
    + "  rm -f \"$state\"\n"
    + "  [ -n \"$prev\" ] && hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$prev\\\" })\" >/dev/null\n"
    + "  " + WARPS_BACK
    + "  exit 0\n"
    + "fi\n"
    + "list=$(hyprctl -j clients | jq -r '.[] | select(.mapped and .workspace.id > 0) | \"\\(.address) \\(.workspace.id) \\(.floating) \\(.at[0]) \\(.at[1]) \\(.size[0]) \\(.size[1])\"')\n"
    + "[ -n \"$list\" ] || exit 0\n"
    + NO_WARPS + "\n"
    + "{ hyprctl -j activewindow | jq -r '.address // \"\"'; echo \"$list\"; } > \"$state\"\n"
    + "echo \"$list\" | while read -r addr ws fl x y w h; do move special:showdesktop \"$addr\"; done\n"
    + WARPS_BACK;
  return ["bash", "-lc", script, "bash"];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { showDesktop: showDesktop, PLACE: PLACE };
}
