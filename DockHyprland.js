// How the Dock asks Hyprland for things (docs/hyprland-notes.md has the facts
// about the dispatch API). No Quickshell or QML imports, so the same file
// loads as a JS import inside the shell and via `require` under Node, where
// the tests check the text and run `bash -n` over every script.
//
// Every function returns the argv to run (`["bash", "-lc", script, "bash",
// arg]`), or null when given an address or id it cannot use, and Service.qml only runs it.
// An address is passed as an argument, never spliced into the script.

// HyprlandToplevel.address comes back as bare hex ("56538020a4f0"), unlike
// hyprctl's own "0x"-prefixed address strings: normalize before handing it to
// a dispatch's "address:0x.." window selector.
function normalizedAddress(address) {
  if (typeof address !== "string") return null;
  var hex = address.indexOf("0x") === 0 ? address.slice(2) : address;
  return /^[0-9a-fA-F]+$/.test(hex) ? "0x" + hex : null;
}

function argv(script, arg) {
  return arg === undefined ? ["bash", "-lc", script, "bash"] : ["bash", "-lc", script, "bash", arg];
}

// Focusing a floating Window doesn't raise it: one under another floating
// Window is focused but stays hidden. So a click raises a floating Window
// after focusing it. A shell function: `raise ADDRESS`. Tiled Windows are
// left alone.
var RAISE = "raise() { hyprctl -j clients | jq -e --arg a \"$1\" '.[] | select(.address == $a and .floating)' >/dev/null "
  + "&& hyprctl dispatch \"hl.dsp.window.alter_zorder({ mode = \\\"top\\\", window = \\\"address:$1\\\" })\" >/dev/null; }; ";

// Omarchy's window mode minimizes a Window by moving it to the special
// workspace "special:minimized", where focusing it does not bring it back. A
// shell function: `restore ADDRESS` moves such a Window to the workspace in
// front of the user, without animating it in, and does nothing for any other.
var RESTORE = "restore() { "
  + "hyprctl -j clients | jq -e --arg a \"$1\" '.[] | select(.address == $a and .workspace.name == \"special:minimized\")' >/dev/null || return 0; "
  + "ws=$(hyprctl -j monitors | jq -r 'first(.[] | select(.focused) | .activeWorkspace.id) // empty'); "
  + "[ \"${ws:-0}\" -ge 1 ] 2>/dev/null || return 0; "
  + "hyprctl dispatch \"hl.dsp.window.set_prop({ prop = \\\"no_anim\\\", value = \\\"1\\\", window = \\\"address:$1\\\" })\" >/dev/null; "
  + "hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$ws\\\", window = \\\"address:$1\\\" })\" >/dev/null; "
  + "(sleep 0.4; hyprctl dispatch \"hl.dsp.window.set_prop({ prop = \\\"no_anim\\\", value = \\\"unset\\\", window = \\\"address:$1\\\" })\" >/dev/null) & "
  + "}; ";

// WORKAROUND, may need revisiting if Omarchy fixes it. A floating Window can be
// left outside every monitor (seen: two Edge web-app Windows at x=362 on a
// monitor that starts at x=1920, probably left on a monitor that was then
// unplugged or switched off), so focusing it from the Dock shows nothing. A shell function:
// `rescue ADDRESS` centers a floating Window that has less than 64x32 px on
// any monitor, and does nothing for any other (docs/hyprland-notes.md "Windows
// outside every monitor"). Positions are in layout pixels, so a monitor is its
// width and height over its scale.
var RESCUE = "rescue() { "
  + "lost=$(jq -n --arg a \"$1\" --argjson c \"$(hyprctl -j clients)\" --argjson m \"$(hyprctl -j monitors)\" '"
  + "first($c[] | select(.address == $a and .floating)) as $w | "
  + "if $w == null then false else "
  + "[$m[] | ((.width / .scale) as $mw | (.height / .scale) as $mh | "
  + "([$w.at[0] + $w.size[0], .x + $mw] | min) - ([$w.at[0], .x] | max) >= 64 and "
  + "([$w.at[1] + $w.size[1], .y + $mh] | min) - ([$w.at[1], .y] | max) >= 32)] | any | not end') || return 0; "
  + "[ \"$lost\" = true ] && hyprctl dispatch \"hl.dsp.window.center({ window = \\\"address:$1\\\" })\" >/dev/null; "
  + "}; ";

// Focusing can warp the pointer: toggle cursor:no_warps around a dispatch and
// put the old value back.
var NO_WARPS = "orig=false; hyprctl -j getoption cursor:no_warps | grep -q '\"bool\": true' && orig=true; "
  + "hyprctl eval 'hl.config({ cursor = { no_warps = true } })' >/dev/null; ";
var WARPS_BACK = "hyprctl eval \"hl.config({ cursor = { no_warps = $orig } })\" >/dev/null";

// Peek's saved state (the focused Window, each monitor's workspace, the
// fullscreen Windows) and the lock that keeps its scripts from overlapping.
// Both are named for the Hyprland instance, so a second Hyprland session of
// the same user (a nested test session, another login) has its own and never
// restores or locks another's.
var PEEK_LOCK = "exec 9>\"${XDG_RUNTIME_DIR:-/tmp}/startbar-peek-${HYPRLAND_INSTANCE_SIGNATURE:-0}.lock\"; flock 9\n";
var PEEK_STATE = "\"${XDG_RUNTIME_DIR:-/tmp}/startbar-peek-${HYPRLAND_INSTANCE_SIGNATURE:-0}\"";

// Put back what an earlier peek changed, from the saved state in $rest: any
// Window that was maximized or full screen, then each monitor's workspace.
var PEEK_UNDO = "undo() {\n"
  + "  echo \"$rest\" | while read -r kind a b; do\n"
  + "    [ \"$kind\" = f ] || continue\n"
  + "    cur=$(hyprctl -j clients | jq -r --arg a \"$a\" '.[] | select(.address == $a) | .fullscreen')\n"
  + "    [ \"$cur\" = 0 ] || continue\n"
  + "    mode=maximized; [ \"$b\" = 2 ] && mode=fullscreen\n"
  + "    hyprctl dispatch \"hl.dsp.window.fullscreen({ mode = \\\"$mode\\\", action = \\\"set\\\", window = \\\"address:$a\\\" })\" >/dev/null\n"
  + "  done\n"
  + "  echo \"$rest\" | while read -r kind name ws; do\n"
  + "    [ \"$kind\" = m ] || continue\n"
  + "    cur=$(hyprctl -j monitors | jq -r --arg n \"$name\" '.[] | select(.name == $n) | .activeWorkspace.id')\n"
  + "    if [ \"$cur\" != \"$ws\" ]; then\n"
  + "      hyprctl dispatch \"hl.dsp.focus({ monitor = \\\"$name\\\" })\" >/dev/null\n"
  + "      hyprctl dispatch \"hl.dsp.focus({ workspace = \\\"$ws\\\" })\" >/dev/null\n"
  + "    fi\n"
  + "  done\n"
  + "}\n";

// A click on a Dock Item: focus the Window and raise it if floating. The
// pointer stays where it is.
function focusWindow(address) {
  var normalized = normalizedAddress(address);
  if (!normalized) return null;
  var script = "addr=\"$1\"; "
    + NO_WARPS
    + RAISE
    + RESTORE
    + RESCUE
    + "restore \"$addr\"; "
    + "rescue \"$addr\"; "
    + "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$addr\\\" })\"; "
    + "raise \"$addr\"; "
    + WARPS_BACK;
  return argv(script, normalized);
}

// The Preview opening: rescue each of its Windows (see RESCUE), so a Window
// outside every monitor is on screen to be captured, not a blank thumbnail.
// Null when there is none to rescue.
function rescueWindows(addresses) {
  var list = (addresses || []).map(normalizedAddress).filter(Boolean);
  if (list.length === 0) return null;
  return ["bash", "-lc", RESCUE + "for a in \"$@\"; do rescue \"$a\"; done", "bash"].concat(list);
}

// A click on a hover Preview can also bring the pointer along
// (previewWarpPointer): after focusing, move it to the middle of the Window,
// read from `hyprctl -j clients`, which also covers a Window on another
// workspace or monitor once focus has switched to it.
function focusWindowAndWarp(address) {
  var normalized = normalizedAddress(address);
  if (!normalized) return null;
  var script = "addr=\"$1\"; "
    + RAISE
    + RESTORE
    + RESCUE
    + "restore \"$addr\"; "
    + "rescue \"$addr\"; "
    + "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$addr\\\" })\" >/dev/null; "
    + "raise \"$addr\"; "
    + "sleep 0.1; "
    + "pos=$(hyprctl -j clients | jq -r --arg a \"$addr\" '.[] | select(.address == $a) | \"\\(.at[0] + (.size[0] / 2) | floor) \\(.at[1] + (.size[1] / 2) | floor)\"'); "
    + "[ -n \"$pos\" ] && hyprctl dispatch \"hl.dsp.cursor.move({ x = ${pos% *}, y = ${pos#* } })\" >/dev/null";
  return argv(script, normalized);
}

function closeWindow(address) {
  var normalized = normalizedAddress(address);
  if (!normalized) return null;
  return argv("hyprctl dispatch \"hl.dsp.window.close({ window = \\\"address:$1\\\" })\"", normalized);
}

// The dispatch behind each Window-state row of the context menu. The ids and
// labels are DockModel.windowActions'; a test checks every id has one here.
var WINDOW_ACTIONS = {
  maximize: function (target) { return "hl.dsp.window.fullscreen({ mode = \"maximized\", " + target + " })"; },
  fullscreen: function (target) { return "hl.dsp.window.fullscreen({ mode = \"fullscreen\", " + target + " })"; },
  float: function (target) { return "hl.dsp.window.float({ action = \"toggle\", " + target + " })"; },
  moveLeft: function (target) { return "hl.dsp.window.move({ direction = \"left\", " + target + " })"; },
  moveRight: function (target) { return "hl.dsp.window.move({ direction = \"right\", " + target + " })"; },
  moveUp: function (target) { return "hl.dsp.window.move({ direction = \"up\", " + target + " })"; },
  moveDown: function (target) { return "hl.dsp.window.move({ direction = \"down\", " + target + " })"; },
  center: function (target) { return "hl.dsp.window.center({ " + target + " })"; },
  pin: function (target) { return "hl.dsp.window.pin({ " + target + " })"; },
  scratchpad: function (target) { return "hl.dsp.window.move({ workspace = \"special:scratchpad\", follow = false, " + target + " })"; },
};

// One dispatch aimed at the Window by address, whether or not it is the
// focused one. The dispatch is passed as an argument, so nothing is escaped.
function windowAction(id, address) {
  var normalized = normalizedAddress(address);
  if (!normalized) return null;
  var make = Object.prototype.hasOwnProperty.call(WINDOW_ACTIONS, id) ? WINDOW_ACTIONS[id] : null;
  if (!make) return null;
  return argv("hyprctl dispatch \"$1\"", make("window = \"address:" + normalized + "\""));
}

// Swap two tiled Windows' places in the layout: both stay tiled and Hyprland
// rearranges the rest.
function swapTiles(address, other) {
  var a = normalizedAddress(address), b = normalizedAddress(other);
  if (!a || !b || a === b) return null;
  // Both are validated hex, so they go straight into the dispatch.
  return argv("hyprctl dispatch \"hl.dsp.window.swap({ target = \\\"address:" + b + "\\\", window = \\\"address:" + a + "\\\" })\"");
}

// Reshape a tiled workspace (docs/SPEC.md "Snap layouts"): `reshapeTiles(address,
// shape, zone)` flips dwindle's splits until the workspace's two or three tiles
// have the shape, then swaps the Window into the zone. Shapes name each split,
// outer first: H is side by side, V is stacked. Two tiles: "H", "V". Three:
// "HV" (one beside two stacked), "HH" (three columns), "VH" (one on top, two
// below), "VV" (three rows). Hyprland has no way to choose a shape, only
// `togglesplit`, which flips the split of the focused Window's parent: the lone
// Window's flips the outer split, one of the pair's the inner. So the shape is
// read from the geometry (the lone Window is the largest), flipped one split at
// a time, and read again. Then `swapsplit` on the lone Window puts it first, as
// the thumbnail draws it.
var TILE_SHAPE = "def tiles($a): . as $c | first($c[] | select(.address == $a)) as $w | "
  + "[$c[] | select(.workspace.id == $w.workspace.id and .monitor == $w.monitor and .floating == false "
  + "and .mapped and (.hidden | not))]; "
  + "def box: { x0: (map(.at[0]) | min), y0: (map(.at[1]) | min), "
  + "x1: (map(.at[0] + .size[0]) | max), y1: (map(.at[1] + .size[1]) | max) }; "
  + "def shape: . as $t | ($t | box) as $b | ($b.x1 - $b.x0) as $W | ($b.y1 - $b.y0) as $H | "
  + "if ($t | length) == 2 then { n: 2, shape: (if (($t[0].at[1] - $t[1].at[1]) | fabs) <= 2 then \"H\" else \"V\" end) } "
  + "elif ($t | length) == 3 then "
  + "($t | sort_by(-(.size[0] * .size[1])) | .[0]) as $l | [$t[] | select(.address != $l.address)] as $p | "
  + "(if $l.size[1] >= $H * 0.9 and $l.size[0] < $W * 0.9 then \"H\" else \"V\" end) as $r | "
  + "(if (($p[0].at[1] - $p[1].at[1]) | fabs) <= 2 then \"H\" else \"V\" end) as $q | "
  + "(if $r == \"H\" then (($l.at[0] - $b.x0) | fabs) <= 2 else (($l.at[1] - $b.y0) | fabs) <= 2 end) as $f | "
  + "{ n: 3, shape: ($r + $q), lone: $l.address, pair: $p[0].address, first: $f } "
  + "else { n: ($t | length) } end; ";

function reshapeTiles(address, shape, zone) {
  var a = normalizedAddress(address);
  if (!a || !/^(H|V|HV|HH|VH|VV)$/.test(String(shape)) || !zone) return null;
  var fr = [zone.x, zone.y, zone.w, zone.h].map(Number);
  if (fr.some(function (n) { return !isFinite(n); })) return null;
  var script = [
    "a=$1; want=$2; zx=$3; zy=$4",
    "t() { hyprctl -j clients | jq -c --arg a \"$a\" '" + TILE_SHAPE + "tiles($a) | shape'; }",
    "flip() { hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$1\\\" })\" >/dev/null; "
      + "hyprctl dispatch 'hl.dsp.layout(\"togglesplit\")' >/dev/null; sleep 0.25; }",
    "for i in 1 2 3 4; do",
    "  s=$(t) || exit 0",
    "  cur=$(jq -r '.shape // empty' <<<\"$s\")",
    "  [ \"${#cur}\" = \"${#want}\" ] || exit 0",
    "  [ \"$cur\" = \"$want\" ] && break",
    "  if [ \"${#want}\" = 1 ] || [ \"${cur:0:1}\" != \"${want:0:1}\" ]; then",
    "    [ \"${#want}\" = 1 ] && id=$a || id=$(jq -r .lone <<<\"$s\")",
    "  else id=$(jq -r .pair <<<\"$s\"); fi",
    "  flip \"$id\"",
    "done",
    // Three tiles: the lone Window belongs first (left or top), as drawn. `swapsplit` on it mirrors the outer split.
    "if [ \"${#want}\" = 2 ]; then",
    "  s=$(t) || exit 0",
    "  [ \"$(jq -r '.first' <<<\"$s\")\" = false ] && { id=$(jq -r .lone <<<\"$s\"); "
      + "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$id\\\" })\" >/dev/null; "
      + "hyprctl dispatch 'hl.dsp.layout(\"swapsplit\")' >/dev/null; sleep 0.25; }",
    "fi",
    // Put the Window in the zone: swap with whoever is there now.
    "other=$(hyprctl -j clients | jq -r --arg a \"$a\" --argjson zx \"$zx\" --argjson zy \"$zy\" '" + TILE_SHAPE
      + "tiles($a) | . as $t | ($t | box) as $b | ($b.x0 + ($b.x1 - $b.x0) * $zx) as $px | ($b.y0 + ($b.y1 - $b.y0) * $zy) as $py "
      + "| first($t[] | select(.at[0] <= $px and .at[0] + .size[0] >= $px and .at[1] <= $py and .at[1] + .size[1] >= $py)).address // empty')",
    "[ -n \"$other\" ] && [ \"$other\" != \"$a\" ] && hyprctl dispatch \"hl.dsp.window.swap({ target = \\\"address:$other\\\", window = \\\"address:$a\\\" })\" >/dev/null",
    "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$a\\\" })\" >/dev/null",
    "exit 0",
  ].join("\n");
  // The zone's centre, as fractions of the tiles' box.
  var cx = fr[0] + fr[2] / 2, cy = fr[1] + fr[3] / 2;
  return ["bash", "-lc", script, "bash", a, String(shape), String(cx), String(cy)];
}

// Snap layouts (docs/SPEC.md "Snap layouts"): put a Window in a zone of its monitor's usable
// area, as fractions of it: `snapWindow(address, {x, y, w, h})`. Floats the
// Window first if it is tiled, leaves full screen, then resizes and moves it.
// The usable area starts below whatever the top edge holds: the space Hyprland
// reserves there, or the Omarchy bar's own layer while it is showing, whichever
// reaches lower. A moment after the move the Window is read back and, if an app
// has put itself above that line, moved down to it.
var SNAP_GEOMETRY = "first(.[] | select(.address == $a)) as $w | "
  + "first($m[] | select(.id == $w.monitor)) as $o | ($o.scale // 1) as $s | 6 as $g | "
  + "([$o.reserved[1], ([($l[$o.name].levels // {}) | to_entries[].value[] "
  + "| select(.namespace == \"omarchy-bar\" and .y <= $o.y + 1) | .y + .h - $o.y] | max // 0)] | max) as $top | "
  + "($o.x + $o.reserved[0] + $g) as $x0 | ($o.y + $top + $g) as $y0 | "
  + "(($o.width / $s) - $o.reserved[0] - $o.reserved[2] - 2 * $g) as $aw | "
  + "(($o.height / $s) - $top - $o.reserved[3] - 2 * $g) as $ah | "
  + "{ x: ($x0 + $aw * $f[0] + ($g / 2) | floor), y: ($y0 + $ah * $f[1] + ($g / 2) | floor), "
  + "w: ($aw * $f[2] - $g | floor), h: ($ah * $f[3] - $g | floor), "
  + "limit: ($o.y + $top), fs: $w.fullscreen, fl: $w.floating }";

function snapWindow(address, zone, others) {
  var normalized = normalizedAddress(address);
  if (!normalized || !zone) return null;
  var fr = [zone.x, zone.y, zone.w, zone.h].map(Number);
  if (fr.some(function (n) { return !isFinite(n); })) return null;
  var rest = [];
  // QML hands over a list that is array-like but not an Array.
  var list = [];
  for (var k = 0; others && k < others.length && k < 8; k++) list.push(others[k]);
  for (var i = 0; i < list.length; i++) {
    var f = [list[i].x, list[i].y, list[i].w, list[i].h].map(Number);
    if (f.some(function (n) { return !isFinite(n); })) return null;
    rest.push(f);
  }
  var script = [
    "a=$1; shift",
    "fr=\"[$1,$2,$3,$4]\"; others=$5",
    "mon=$(hyprctl -j monitors); lay=$(hyprctl -j layers)",
    // place ADDRESS FRACTIONS: float it, size it, move it, then read it back.
    "place() {",
    "  local a=$1 f=$2 geo t at",
    "  geo=$(hyprctl -j clients | jq -c --arg a \"$a\" --argjson m \"$mon\" --argjson l \"$lay\" --argjson f \"$f\" '" + SNAP_GEOMETRY + "') || return 0",
    "  [ -n \"$geo\" ] || return 0",
    "  get() { jq -r \".$1\" <<<\"$geo\"; }",
    "  t=\"window = \\\"address:$a\\\"\"",
    "  [ \"$(get fs)\" != 0 ] && hyprctl dispatch \"hl.dsp.window.fullscreen({ mode = \\\"fullscreen\\\", action = \\\"unset\\\", $t })\" >/dev/null",
    "  [ \"$(get fl)\" != true ] && hyprctl dispatch \"hl.dsp.window.float({ action = \\\"set\\\", $t })\" >/dev/null",
    "  hyprctl dispatch \"hl.dsp.window.resize({ x = $(get w), y = $(get h), exact = true, $t })\" >/dev/null",
    "  hyprctl dispatch \"hl.dsp.window.move({ x = $(get x), y = $(get y), $t })\" >/dev/null",
    // Some apps settle on a position of their own after a resize: read it back.
    "  sleep 0.2",
    "  at=$(hyprctl -j clients | jq -r --arg a \"$a\" '.[] | select(.address == $a) | \"\\(.at[0]) \\(.at[1])\"')",
    "  [ -n \"$at\" ] && [ \"${at#* }\" -lt \"$(get limit)\" ] && hyprctl dispatch \"hl.dsp.window.move({ x = ${at% *}, y = $(get y), $t })\" >/dev/null",
    "  return 0",
    "}",
    // The other Windows on its workspace, most recently used first, one per remaining zone.
    "n=$(jq 'length' <<<\"$others\")",
    "ids=",
    "[ \"$n\" -gt 0 ] && ids=$(hyprctl -j clients | jq -r --arg a \"$a\" --argjson n \"$n\" "
      + "'first(.[] | select(.address == $a)) as $w | [.[] | select(.address != $a and .mapped and (.hidden | not) "
      + "and .monitor == $w.monitor and .workspace.id == $w.workspace.id and .workspace.id > 0)] "
      + "| sort_by(.focusHistoryID) | .[:$n][].address')",
    "place \"$a\" \"$fr\"",
    "i=0",
    "for id in $ids; do",
    "  place \"$id\" \"$(jq -c \".[$i]\" <<<\"$others\")\"",
    "  i=$((i + 1))",
    "done",
    "exit 0",
  ].join("\n");
  var fractions = fr.map(String);
  var asObjects = rest.map(function (f) { return [f[0], f[1], f[2], f[3]]; });
  return ["bash", "-lc", script, "bash", normalized].concat(fractions, [JSON.stringify(asObjects)]);
}

// Peek: hovering a Preview thumbnail focuses its Window to show it. The first
// peek saves the original state; later ones undo the previous peek first,
// keeping that saved state.
function peekWindow(address) {
  var normalized = normalizedAddress(address);
  if (!normalized) return null;
  var script = PEEK_LOCK
    + PEEK_UNDO
    + "addr=\"$1\"; state=" + PEEK_STATE + "\n"
    + NO_WARPS
    + "if [ -f \"$state\" ]; then\n"
    + "  # Moving on from an earlier peek: put its changes back first, keeping the\n"
    + "  # saved original state, so only this window's peek is in effect.\n"
    + "  rest=$(tail -n +2 \"$state\")\n"
    + "  undo\n"
    + "else\n"
    + "  {\n"
    + "    hyprctl -j activewindow | jq -r '.address // \"\"'\n"
    + "    hyprctl -j monitors | jq -r '.[] | \"m \\(.name) \\(.activeWorkspace.id)\"'\n"
    + "    hyprctl -j clients | jq -r '.[] | select(.fullscreen != 0) | \"f \\(.address) \\(.fullscreen)\"'\n"
    + "  } > \"$state\"\n"
    + "fi\n"
    + "hyprctl -j clients | jq -r --arg a \"$addr\" '. as $c | ($c[] | select(.address == $a) | .workspace.id) as $w | $c[] | select(.workspace.id == $w and .fullscreen != 0 and .address != $a) | \"\\(.address) \\(.fullscreen)\"' | while read -r other fs; do\n"
    + "  mode=maximized; [ \"$fs\" = 2 ] && mode=fullscreen\n"
    + "  hyprctl dispatch \"hl.dsp.window.fullscreen({ mode = \\\"$mode\\\", action = \\\"unset\\\", window = \\\"address:$other\\\" })\" >/dev/null\n"
    + "done\n"
    + RAISE
    + "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$addr\\\" })\" >/dev/null\n"
    + "raise \"$addr\"\n"
    + WARPS_BACK;
  return argv(script, normalized);
}

// Put everything a peek changed back, then forget the saved state.
function peekRestore() {
  var script = PEEK_LOCK
    + PEEK_UNDO
    + "state=" + PEEK_STATE + "; [ -f \"$state\" ] || exit 0\n"
    + "prev=$(head -n1 \"$state\"); rest=$(tail -n +2 \"$state\"); rm -f \"$state\"\n"
    + NO_WARPS
    + "undo\n"
    + "[ -n \"$prev\" ] && hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$prev\\\" })\" >/dev/null\n"
    + WARPS_BACK;
  return argv(script);
}

// A click picked the peeked Window: keep how it looks and drop the saved state.
function peekCommit() {
  return argv(PEEK_LOCK.replace("\n", "; ") + "rm -f " + PEEK_STATE);
}

// With newWindowWorkspace on: a Window that opens tiled beside other Windows
// moves to the lowest-numbered workspace with no Window on it, which is shown,
// and is maximized or full screen there as the mode says ("normal" leaves it as it is). A floating, full screen or special-workspace Window
// is left alone (dialogs, popups, Omarchy's minimized Windows), except that a
// Window Omarchy's floating workspace mode floated (tag omarchy-mode-floated)
// counts as tiled, since on such a workspace every Window floats. A Window
// that is already alone only gets the mode. The lock keeps Windows opening
// together (a restored session) from picking the same workspace.
function openOnOwnWorkspace(address, mode) {
  var normalized = normalizedAddress(address);
  if (!normalized || ["normal", "maximized", "fullscreen"].indexOf(mode) < 0) return null;
  var script = [
    "addr=\"$1\"",
    "exec 9>\"${XDG_RUNTIME_DIR:-/tmp}/startbar-newws.lock\"; flock 9",
    "sleep 0.15",
    "clients=$(hyprctl -j clients)",
    "win=$(echo \"$clients\" | jq -c --arg a \"$addr\" 'first(.[] | select(.address == $a)) // empty')",
    "[ -n \"$win\" ] || exit 0",
    "echo \"$win\" | jq -e '(.floating and ((.tags // []) | index(\"omarchy-mode-floated\") | not)) or .fullscreen != 0 or .workspace.id < 1' >/dev/null && exit 0",
    "here=$(echo \"$win\" | jq '.workspace.id')",
    "others=$(echo \"$clients\" | jq --arg a \"$addr\" --argjson w \"$here\" '[.[] | select(.workspace.id == $w and .address != $a)] | length')",
    "if [ \"$others\" -gt 0 ]; then",
    "  used=$(echo \"$clients\" | jq -c --arg a \"$addr\" '[.[] | select(.workspace.id > 0 and .address != $a) | .workspace.id] | unique')",
    "  ws=$(jq -n --argjson u \"$used\" 'first(range(1; 1000) | select(. as $i | $u | index($i) | not))')",
    "  hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$ws\\\", window = \\\"address:$addr\\\" })\" >/dev/null",
    "fi",
    "mode=" + mode,
    "[ \"$mode\" = normal ] || hyprctl dispatch \"hl.dsp.window.fullscreen({ mode = \\\"$mode\\\", action = \\\"set\\\", window = \\\"address:$addr\\\" })\" >/dev/null",
  ].join("\n");
  return argv(script, normalized);
}

// Omarchy's Glassy look blurs what is behind a see-through surface, but only
// for the layer surfaces its own rules name. This names ours (the Dock and
// Start menu, and the settings window) so a glassy StartBar is blurred the
// same way. It is inert while Hyprland's blur is off. Named, so running it
// again replaces the rule; a `hyprctl reload` drops it, so it is run again then.
function glassRule() {
  return argv("hyprctl eval 'hl.layer_rule({ name = \"startbar-glass\", match = { namespace = \"^omarchy-startbar\" }, "
    + "blur = true, ignore_alpha = 0.3 })' >/dev/null");
}

// Hyprland's input:follow_mouse at runtime: 1 focuses a Window when the
// pointer enters it, 0 needs a click. float_switch_override_focus 2 makes that
// hold between two floating Windows too (Omarchy's windowed mode); its default,
// 1, only switches focus between a floating and a tiled Window. It is not persistent, so it is run again
// after a config reload (see Service.qml).
function followMouse(on) {
  return argv("hyprctl eval 'hl.config({ input = { follow_mouse = " + (on ? 1 : 0)
    + ", float_switch_override_focus = " + (on ? 2 : 1) + " } })' >/dev/null");
}

// A Window that just took focus (Hyprland's activewindowv2 event): raise it if
// it floats, so hover focus (focusFollowsMouse) also brings it to the front.
function raiseWindow(address) {
  var normalized = normalizedAddress(address);
  if (!normalized) return null;
  return argv(RAISE + "raise \"$1\"", normalized);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizedAddress: normalizedAddress,
    focusWindow: focusWindow,
    rescueWindows: rescueWindows,
    focusWindowAndWarp: focusWindowAndWarp,
    closeWindow: closeWindow,
    windowAction: windowAction,
    snapWindow: snapWindow,
    swapTiles: swapTiles,
    reshapeTiles: reshapeTiles,
    TILE_SHAPE: TILE_SHAPE,
    windowActionIds: Object.keys(WINDOW_ACTIONS),
    peekWindow: peekWindow,
    peekRestore: peekRestore,
    peekCommit: peekCommit,
    openOnOwnWorkspace: openOnOwnWorkspace,
    glassRule: glassRule,
    followMouse: followMouse,
    raiseWindow: raiseWindow,
  };
}
