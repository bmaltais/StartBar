// Windows that are hidden from the user on a special workspace, and how they
// come back: the one owner of the special workspace names, of Show desktop's
// state file (what it saves, how a row is read and forgotten) and of putting a
// hidden Window back in front of the user. No Quickshell or QML imports, so the
// same file loads as a JS import inside the shell and via `require` under Node.
//
// Three things hide a Window: Show desktop (DockShowDesktop.js) moves every
// Window to "special:showdesktop<monitor id>", Omarchy's window mode minimizes
// to "special:minimized", and the Item menu's Move to scratchpad uses
// "special:scratchpad". Focusing a Window on the first two does not bring it
// back (on a Show desktop one it would show them all), so a click and a Pick
// restore it first (DockHyprland.js `RESTORE`).
//
// Show desktop's state file is named for the Hyprland instance, so a nested
// test session never restores another's. Its first line is the focused
// Window's address, then one row per hidden Window: `COLUMNS`.

var SPECIAL_PREFIX = "special:";
var SCRATCHPAD = "special:scratchpad";
var MINIMIZED = "special:minimized";
// Show desktop's workspaces are this followed by the monitor id.
var SHOWDESKTOP = "special:showdesktop";

// How a Window's workspace hides it: "scratchpad", "minimized", "showdesktop"
// or "special" (any other special workspace), and "visible" for a regular one.
function kind(workspace) {
  var name = String(workspace || "");
  if (name === SCRATCHPAD) return "scratchpad";
  if (name === MINIMIZED) return "minimized";
  if (name.indexOf(SHOWDESKTOP) === 0) return "showdesktop";
  if (name.indexOf(SPECIAL_PREFIX) === 0) return "special";
  return "visible";
}

function isSpecial(workspace) {
  return kind(workspace) !== "visible";
}

// Hyprland creates a special workspace on the focused monitor, so a monitor's
// own workspace keeps its Windows on that monitor.
function showDesktopWorkspace(monitorId) {
  return SHOWDESKTOP + monitorId;
}

// Shell side. The state file's path, and a row of it: the Window's address, the
// workspace and floating state it had and, when it floated, its position and
// size, and its monitor id.
var STATE = "\"${XDG_RUNTIME_DIR:-/tmp}/startbar-showdesktop-${HYPRLAND_INSTANCE_SIGNATURE:-0}\"";
var COLUMNS = "addr ws fl x y w h mon";
// jq, over `hyprctl -j clients`: one row for each Window Show desktop hides.
var ROWS_JQ = ".[] | select(.mapped and .workspace.id > 0) | \"\\(.address) \\(.workspace.id) \\(.floating) \\(.at[0]) \\(.at[1]) \\(.size[0]) \\(.size[1]) \\(.monitor)\"";
// jq, over `hyprctl -j clients`: the address of each Window Show desktop has hidden.
var HIDDEN_JQ = ".[] | select(.workspace.name | startswith(\"" + SHOWDESKTOP + "\")) | .address";

// A Window on a window-mode (floating) workspace is floated by Omarchy and put
// at a default spot when it comes back, and one that floated was tiled while
// hidden, so each Window's floating state, position and size are saved and
// put back: `place ADDRESS FLOATING X Y W H`. Tiled Windows are re-tiled by
// Hyprland. A spot whose middle is no longer on any monitor (one unplugged
// while hidden, such as a DisplayLink dock) is not applied: the Window would be
// off every screen.
var PLACE = "place() { [ \"$2\" = true ] || return 0; "
  + "hyprctl -j monitors | jq -e --argjson x \"$3\" --argjson y \"$4\" --argjson w \"$5\" --argjson h \"$6\" "
  + "'any(.[]; ($x + $w / 2) >= .x and ($x + $w / 2) < .x + .width / .scale and ($y + $h / 2) >= .y and ($y + $h / 2) < .y + .height / .scale)' >/dev/null || return 0; "
  + "hyprctl -j clients | jq -e --arg a \"$1\" '.[] | select(.address == $a and .floating)' >/dev/null "
  + "|| hyprctl dispatch \"hl.dsp.window.float({ action = \\\"toggle\\\", window = \\\"address:$1\\\" })\" >/dev/null; "
  + "hyprctl dispatch \"hl.dsp.window.resize({ x = $5, y = $6, exact = true, window = \\\"address:$1\\\" })\" >/dev/null; "
  + "hyprctl dispatch \"hl.dsp.window.move({ x = $3, y = $4, window = \\\"address:$1\\\" })\" >/dev/null; }\n";

// A shell function: `restore ADDRESS` moves a Window hidden by Show desktop or
// minimized to the workspace in front of the user (to the workspace Show
// desktop saved for it, which also forgets its row, so the next press brings
// back only the rest), without animating it in, and does nothing for any
// other Window.
var RESTORE = PLACE + "restore() { "
  + "hidden=$(hyprctl -j clients | jq -r --arg a \"$1\" '.[] | select(.address == $a) | .workspace.name'); "
  + "case \"$hidden\" in " + MINIMIZED + "|" + SHOWDESKTOP + "*) ;; *) return 0 ;; esac; "
  + "ws=$(hyprctl -j monitors | jq -r 'first(.[] | select(.focused) | .activeWorkspace.id) // empty'); "
  + "if [ \"${hidden#" + SHOWDESKTOP + "}\" != \"$hidden\" ]; then "
  + "state=" + STATE + "; "
  + "read -r saved fl x y w h <<< \"$(awk -v a=\"$1\" 'NR > 1 && $1 == a { print $2, $3, $4, $5, $6, $7 }' \"$state\" 2>/dev/null)\"; "
  + "[ -n \"$saved\" ] && ws=$saved; "
  + "[ -f \"$state\" ] && { grep -v \"^$1 \" \"$state\" > \"$state.new\"; "
  + "if [ \"$(wc -l < \"$state.new\")\" -le 1 ]; then rm -f \"$state\" \"$state.new\"; else mv \"$state.new\" \"$state\"; fi; }; "
  + "fi; "
  + "[ \"${ws:-0}\" -ge 1 ] 2>/dev/null || return 0; "
  + "hyprctl dispatch \"hl.dsp.window.set_prop({ prop = \\\"no_anim\\\", value = \\\"1\\\", window = \\\"address:$1\\\" })\" >/dev/null; "
  + "hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$ws\\\", window = \\\"address:$1\\\" })\" >/dev/null; "
  + "(sleep 0.4; hyprctl dispatch \"hl.dsp.window.set_prop({ prop = \\\"no_anim\\\", value = \\\"unset\\\", window = \\\"address:$1\\\" })\" >/dev/null) & "
  + "[ \"${hidden#" + SHOWDESKTOP + "}\" != \"$hidden\" ] && (sleep 0.4; place \"$1\" \"$fl\" \"$x\" \"$y\" \"$w\" \"$h\") & "
  + "}; ";

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SPECIAL_PREFIX: SPECIAL_PREFIX, SCRATCHPAD: SCRATCHPAD, MINIMIZED: MINIMIZED, SHOWDESKTOP: SHOWDESKTOP,
    kind: kind, isSpecial: isSpecial, showDesktopWorkspace: showDesktopWorkspace,
    STATE: STATE, COLUMNS: COLUMNS, ROWS_JQ: ROWS_JQ, HIDDEN_JQ: HIDDEN_JQ, PLACE: PLACE, RESTORE: RESTORE,
  };
}
