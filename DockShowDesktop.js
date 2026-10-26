// Show desktop (docs/SPEC.md "Input"): hide every Window on every monitor, then
// bring back the ones that were open. No Quickshell or QML imports, so the same
// file loads as a JS import inside the shell and via `require` under Node.
//
// One toggle command, like DockHyprland.js's: `["bash", "-lc", script, "bash"]`.
// The Windows go to a special workspace per monitor ("special:showdesktop0"), which stays
// hidden (follow = false). Their addresses and workspaces are saved per
// Hyprland instance, so a second press knows what to put back and a nested test
// session never restores another's.

// Focusing can warp the pointer: toggle cursor:no_warps around the focus changes
// and put the old value back (as DockHyprland.js does).
var NO_WARPS = "orig=false; hyprctl -j getoption cursor:no_warps | grep -q '\"bool\": true' && orig=true; "
  + "hyprctl eval 'hl.config({ cursor = { no_warps = true } })' >/dev/null; ";
var WARPS_BACK = "hyprctl eval \"hl.config({ cursor = { no_warps = $orig } })\" >/dev/null\n";

var DESKTOP_STATE = "\"${XDG_RUNTIME_DIR:-/tmp}/startbar-showdesktop-${HYPRLAND_INSTANCE_SIGNATURE:-0}\"";

// Windows on a special workspace (the scratchpad, Omarchy's minimized Windows)
// are left where they are, so a second press never brings them back. The
// lock keeps two quick presses from overlapping.
function showDesktop() {
  var script = "exec 9>" + DESKTOP_STATE.slice(0, -1) + ".lock\"; flock 9\n"
    + "state=" + DESKTOP_STATE + "\n"
    + "move() { hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$1\\\", follow = false, window = \\\"address:$2\\\" })\" >/dev/null; }\n"
    + "if [ -f \"$state\" ]; then\n"
    + "  # Second press: put back each saved Window that is still hidden here.\n"
    + "  prev=$(head -n1 \"$state\")\n"
    + "  hidden=$(hyprctl -j clients | jq -r '.[] | select(.workspace.name | startswith(\"special:showdesktop\")) | .address')\n"
    + "  tail -n +2 \"$state\" | while read -r addr ws mon; do\n"
    + "    echo \"$hidden\" | grep -qx \"$addr\" && move \"$ws\" \"$addr\"\n"
    + "  done\n"
    + "  rm -f \"$state\"\n"
    + "  [ -n \"$prev\" ] && hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$prev\\\" })\" >/dev/null\n"
    + "  exit 0\n"
    + "fi\n"
    + "list=$(hyprctl -j clients | jq -r '.[] | select(.mapped and .workspace.id > 0) | \"\\(.address) \\(.workspace.id) \\(.monitor)\"')\n"
    + "[ -n \"$list\" ] || exit 0\n"
    + "{ hyprctl -j activewindow | jq -r '.address // \"\"'; echo \"$list\"; } > \"$state\"\n"
    + "# Hyprland creates a special workspace on the focused monitor, so focus each\n"
    + "# monitor before moving its Windows: they then leave from where they are.\n"
    + NO_WARPS
    + "echo \"$list\" | awk '{print $3}' | sort -u | while read -r mon; do\n"
    + "  name=$(hyprctl -j monitors | jq -r --argjson m \"$mon\" '.[] | select(.id == $m) | .name')\n"
    + "  hyprctl dispatch \"hl.dsp.focus({ monitor = \\\"$name\\\" })\" >/dev/null\n"
    + "  echo \"$list\" | while read -r addr ws m; do [ \"$m\" = \"$mon\" ] && move \"special:showdesktop$mon\" \"$addr\"; done\n"
    + "done\n"
    + "prev=$(head -n1 \"$state\")\n"
    + "[ -n \"$prev\" ] && hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$prev\\\" })\" >/dev/null\n"
    + WARPS_BACK;
  return ["bash", "-lc", script, "bash"];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { showDesktop: showDesktop };
}
