// How snap layouts are applied to Hyprland (docs/SPEC.md "Snap layouts"; what a
// pick means is decided by SnapLayouts.js `plan`). No Quickshell or QML imports,
// so the same file loads as a JS import inside the shell and via `require` under
// Node for the test suite.
//
// Like DockHyprland.js every function returns the argv to run (`["bash", "-lc",
// script, "bash", arg...]`), or null for an address or zone it cannot use, and an
// address is passed as an argument, never spliced into the script.

.import "HyprlandScript.js" as Script

// A maximized or full screen Window refuses layout changes ("Can't swap
// fullscreen window") and fills the area, so snapping one starts by taking it out.
var UNSET_FULLSCREEN = "[ \"$(hyprctl -j clients | jq -r --arg a \"$a\" 'first(.[] | select(.address == $a)).fullscreen // 0')\" != 0 ] "
  + "&& { " + Script.unsetFullscreen("window = \\\"address:$a\\\"") + "; sleep 0.3; }";

// Maximize a Window (not a toggle: a Window already maximized stays so), the "full"
// thumbnail of the snap picker. It keeps its tiled or floating state underneath.
function maximizeWindow(address) {
  var normalized = Script.normalizedAddress(address);
  if (!normalized) return null;
  return Script.argv("hyprctl dispatch \"hl.dsp.window.fullscreen({ mode = \\\"maximized\\\", action = \\\"set\\\", window = \\\"address:$1\\\" })\"", normalized);
}

// Swap two tiled Windows' places in the layout: both stay tiled and Hyprland
// rearranges the rest.
function swapTiles(address, other) {
  var a = Script.normalizedAddress(address), b = Script.normalizedAddress(other);
  if (!a || !b || a === b) return null;
  // Both are validated hex, so they go straight into the script.
  return ["bash", "-lc", "a=" + a + "\n" + UNSET_FULLSCREEN + "\n"
    + "hyprctl dispatch \"hl.dsp.window.swap({ target = \\\"address:" + b + "\\\", window = \\\"address:$a\\\" })\"", "bash"];
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
  var a = Script.normalizedAddress(address);
  if (!a || !/^(H|V|HV|HH|VH|VV)$/.test(String(shape)) || !zone) return null;
  var fr = [zone.x, zone.y, zone.w, zone.h].map(Number);
  if (fr.some(function (n) { return !isFinite(n); })) return null;
  var script = [
    "a=$1; want=$2; zx=$3; zy=$4",
    UNSET_FULLSCREEN,
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
// reaches lower. A bar layer taller than half the monitor is ignored: on some
// setups it is one surface over the whole monitor (the bar's popups share it),
// and counting it left no area at all. An area under 200 px does nothing. A moment after the move the Window is read back and, if an app
// has put itself above that line, moved down to it.
// A window on one of Omarchy's window-mode workspaces carries a titlebar (the
// hyprbars plugin) drawn above its top edge, outside its own rectangle: `$tb`
// is that bar's height, so the zone starts at the bar rather than the window.
var SNAP_GEOMETRY = "first(.[] | select(.address == $a)) as $w | "
  + "(if (($w.tags // []) | index(\"omarchy-floating-workspace\")) != null then $bh else 0 end) as $tb | "
  + "first($m[] | select(.id == $w.monitor)) as $o | ($o.scale // 1) as $s | 6 as $g | "
  + "([$o.reserved[1], ([($l[$o.name].levels // {}) | to_entries[].value[] "
  + "| select(.namespace == \"omarchy-bar\" and .y <= $o.y + 1 and .h < ($o.height / $s) / 2) | .y + .h - $o.y] | max // 0)] | max) as $top | "
  + "($o.x + $o.reserved[0] + $g) as $x0 | ($o.y + $top + $g) as $y0 | "
  + "(($o.width / $s) - $o.reserved[0] - $o.reserved[2] - 2 * $g) as $aw | "
  + "(($o.height / $s) - $top - $o.reserved[3] - 2 * $g) as $ah | "
  + "if $aw < 200 or $ah < 200 then empty else "
  + "{ x: ($x0 + $aw * $f[0] + ($g / 2) | floor), y: ($y0 + $ah * $f[1] + ($g / 2) + $tb | floor), "
  + "w: ($aw * $f[2] - $g | floor), h: ($ah * $f[3] - $g - $tb | floor), "
  + "limit: ($o.y + $top + $tb), fs: $w.fullscreen, fl: $w.floating } end";

function snapWindow(address, zone, others) {
  var normalized = Script.normalizedAddress(address);
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
    // The window-mode titlebar's height, when the plugin is on.
    "bh=0",
    "[ \"$(hyprctl -j getoption plugin:hyprbars:enabled 2>/dev/null | jq -r '.bool // false' 2>/dev/null)\" = true ] && bh=$(hyprctl -j getoption plugin:hyprbars:bar_height 2>/dev/null | jq -r '.int // 0' 2>/dev/null)",
    "[ -n \"$bh\" ] || bh=0",
    // place ADDRESS FRACTIONS: float it, size it, move it, then read it back.
    "place() {",
    "  local a=$1 f=$2 geo t at",
    "  geo=$(hyprctl -j clients | jq -c --arg a \"$a\" --argjson m \"$mon\" --argjson l \"$lay\" --argjson f \"$f\" --argjson bh \"$bh\" '" + SNAP_GEOMETRY + "') || return 0",
    "  [ -n \"$geo\" ] || return 0",
    "  get() { jq -r \".$1\" <<<\"$geo\"; }",
    "  t=\"window = \\\"address:$a\\\"\"",
    // The unset must name the mode the Window is in: maximized (1) or full screen (2), or both (3).
    "  [ \"$(get fs)\" != 0 ] && " + Script.unsetFullscreen("$t"),
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

// The command for a snap plan (SnapLayouts.plan), or null for none.
function snapCommand(plan) {
  if (!plan) return null;
  switch (plan.action) {
  case "maximize": return maximizeWindow(plan.id);
  case "reshape": return reshapeTiles(plan.id, plan.shape, plan.zone);
  case "swap": return swapTiles(plan.id, plan.other);
  case "snap": return snapWindow(plan.id, plan.zone, plan.others);
  }
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    snapWindow: snapWindow,
    snapCommand: snapCommand,
    swapTiles: swapTiles,
    maximizeWindow: maximizeWindow,
    reshapeTiles: reshapeTiles,
    TILE_SHAPE: TILE_SHAPE,
  };
}
