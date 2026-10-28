// Show desktop (docs/SPEC.md "Input"): hide every Window on every monitor, then
// bring back the ones that were open. No Quickshell or QML imports, so the same
// file loads as a JS import inside the shell and via `require` under Node.
//
// One toggle command, like DockHyprland.js's: `["bash", "-lc", script, "bash"]`.
// The Windows go to a special workspace per monitor, "special:showdesktop<monitor
// id>", which stays hidden (follow = false), so a Window is hidden on the monitor
// it is on and only meets the Windows of that monitor there (on one shared
// workspace they were all tiled together, and a Window shrunk to a quarter
// made a web page such as YouTube Shorts switch to another layout). Their
// addresses and workspaces are saved per Hyprland instance, so a second press
// knows what to put back and a nested test session never restores another's.
// HiddenWindows.js owns that state file, the workspace names and `place`.

.import "HiddenWindows.js" as Hidden
.import "HyprlandScript.js" as Script

// Windows on a special workspace (the scratchpad, Omarchy's minimized Windows)
// are left where they are, so a second press never brings them back. The
// lock keeps two quick presses from overlapping.
//
function showDesktop() {
  var script = Hidden.SWEEP + "exec 9>" + Hidden.STATE.slice(0, -1) + ".lock\"; flock 9\n"
    + "state=" + Hidden.STATE + "\n"
    + Hidden.PLACE
    + "move() { hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$1\\\", follow = false, window = \\\"address:$2\\\" })\" >/dev/null; }\n"
    + "if [ -f \"$state\" ]; then\n"
    + "  # Second press: put back each saved Window that is still hidden here.\n"
    + "  " + Script.NO_WARPS + "\n"
    + "  prev=$(head -n1 \"$state\")\n"
    + "  hidden=$(hyprctl -j clients | jq -r '" + Hidden.HIDDEN_JQ + "')\n"
    + "  # Tiled Windows are placed in the order they come back: left to right, top to bottom.\n"
    + "  tail -n +2 \"$state\" | sort -k2,2n -k4,4n -k5,5n > \"$state.rows\"\n"
    + "  while read -r " + Hidden.COLUMNS + "; do\n"
    + "    echo \"$hidden\" | grep -qx \"$addr\" && move \"$ws\" \"$addr\"\n"
    + "  done < \"$state.rows\"\n"
    + "  sleep 0.4  # let Omarchy float the Windows it floats before they are placed\n"
    + "  while read -r " + Hidden.COLUMNS + "; do\n"
    + "    echo \"$hidden\" | grep -qx \"$addr\" && place \"$addr\" \"$fl\" \"$x\" \"$y\" \"$w\" \"$h\"\n"
    + "  done < \"$state.rows\"\n"
    + "  rm -f \"$state.rows\"\n"
    + "  rm -f \"$state\"\n"
    + "  # A hidden workspace left showing (seen when monitors were plugged in while hidden)\n"
    + "  # would dim and blur the screen over an empty workspace: close it where it shows.\n"
    + "  # Toggling acts on the focused monitor, so focus that monitor first.\n"
    + "  home=$(hyprctl -j monitors | jq -r 'first(.[] | select(.focused) | .name) // empty')\n"
    + "  hyprctl -j monitors | jq -r '.[] | select((.specialWorkspace.name // \"\") | startswith(\"" + Hidden.SHOWDESKTOP + "\")) | \"\\(.name) \\(.specialWorkspace.name)\"' | while read -r mname sname; do\n"
    + "    hyprctl dispatch \"hl.dsp.focus({ monitor = \\\"$mname\\\" })\" >/dev/null\n"
    + "    hyprctl dispatch \"hl.dsp.workspace.toggle_special(\\\"${sname#special:}\\\")\" >/dev/null\n"
    + "  done\n"
    + "  [ -n \"$home\" ] && hyprctl dispatch \"hl.dsp.focus({ monitor = \\\"$home\\\" })\" >/dev/null\n"
    + "  [ -n \"$prev\" ] && hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$prev\\\" })\" >/dev/null\n"
    + "  " + Script.WARPS_BACK + "\n"
    + "  exit 0\n"
    + "fi\n"
    + "list=$(hyprctl -j clients | jq -r '" + Hidden.ROWS_JQ + "')\n"
    + "[ -n \"$list\" ] || exit 0\n"
    + Script.NO_WARPS + "\n"
    + "{ hyprctl -j activewindow | jq -r '.address // \"\"'; echo \"$list\"; } > \"$state\"\n"
    + "# Hyprland creates a special workspace on the focused monitor, so focus each\n"
    + "# monitor before moving its Windows. The monitor that was focused gets the\n"
    + "# focus back at the end; refocusing a Window would show its hidden workspace.\n"
    + "home=$(hyprctl -j monitors | jq -r 'first(.[] | select(.focused) | .name) // empty')\n"
    + "echo \"$list\" | awk '{print $8}' | sort -u | while read -r mon; do\n"
    + "  name=$(hyprctl -j monitors | jq -r --argjson m \"$mon\" '.[] | select(.id == $m) | .name')\n"
    + "  [ -n \"$name\" ] && hyprctl dispatch \"hl.dsp.focus({ monitor = \\\"$name\\\" })\" >/dev/null\n"
    + "  echo \"$list\" | while read -r addr ws fl x y w h m; do [ \"$m\" = \"$mon\" ] && move \"" + Hidden.SHOWDESKTOP + "$mon\" \"$addr\"; done\n"
    + "done\n"
    + "[ -n \"$home\" ] && hyprctl dispatch \"hl.dsp.focus({ monitor = \\\"$home\\\" })\" >/dev/null\n"
    + Script.WARPS_BACK + "\n";
  return ["bash", "-lc", script, "bash"];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { showDesktop: showDesktop };
}
