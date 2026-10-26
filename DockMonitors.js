// Move to monitor (docs/SPEC.md "Input", the Window menus): the map of the
// monitors the flyout draws, and the command that sends a Window to one. No
// Quickshell or QML imports, so the same file loads as a JS import inside the
// shell and via `require` under Node.

// The address check and argv shape DockHyprland.js uses, copied so this file
// imports nothing (a test keeps them in step).
function normalizedAddress(address) {
  if (typeof address !== "string") return null;
  var hex = address.indexOf("0x") === 0 ? address.slice(2) : address;
  return /^[0-9a-fA-F]+$/.test(hex) ? "0x" + hex : null;
}

function argv(script, args) {
  return ["bash", "-lc", script, "bash"].concat(args || []);
}

// Send a Window to a monitor by its name (DP-1, ...): onto the workspace that
// monitor is showing, without following it. Omarchy's workspace modes then
// settle how it sits there (a floating, window-mode workspace floats it, a
// tiled one tiles a Window the mode had floated), so this does not.
function moveToMonitor(address, name) {
  var normalized = normalizedAddress(address);
  if (!normalized || typeof name !== "string" || !/^[A-Za-z0-9._:-]{1,64}$/.test(name)) return null;
  var script = "a=$1; name=$2; "
    + "ws=$(hyprctl -j monitors | jq -r --arg n \"$name\" '.[] | select(.name == $n) | .activeWorkspace.id'); "
    + "[ \"${ws:-0}\" -ge 1 ] 2>/dev/null || exit 0; "
    + "hyprctl dispatch \"hl.dsp.window.move({ workspace = \\\"$ws\\\", follow = false, window = \\\"address:$a\\\" })\" >/dev/null";
  return argv(script, [normalized, name]);
}

// The name of the monitor a Window's rectangle ({x, y, w, h}, layout pixels) is
// mostly on, from `screens` ([{ name, x, y, width, height }]); "" when none or
// no rectangle (a Window on a special workspace).
function monitorOf(rect, screens) {
  if (!rect || !screens) return "";
  var cx = rect.x + rect.w / 2;
  var cy = rect.y + rect.h / 2;
  for (var i = 0; i < screens.length; i++) {
    var s = screens[i];
    if (cx >= s.x && cx < s.x + s.width && cy >= s.y && cy < s.y + s.height) return s.name;
  }
  return "";
}

// The monitors laid out as they sit on the desk, scaled to fit `box` ({ w, h },
// px) and centred in it, a `gap` apart: { width, height, rects: [{ name, x, y,
// w, h, current }] } with `current` set on the monitor named `current`.
function monitorMap(screens, current, box, gap) {
  var list = [];
  for (var i = 0; screens && i < screens.length; i++) list.push(screens[i]);
  if (list.length === 0) return { width: 0, height: 0, rects: [] };
  var g = gap || 0;
  var x0 = Math.min.apply(null, list.map(function (s) { return s.x; }));
  var y0 = Math.min.apply(null, list.map(function (s) { return s.y; }));
  var x1 = Math.max.apply(null, list.map(function (s) { return s.x + s.width; }));
  var y1 = Math.max.apply(null, list.map(function (s) { return s.y + s.height; }));
  var scale = Math.min(box.w / (x1 - x0), box.h / (y1 - y0));
  var width = Math.round((x1 - x0) * scale);
  var height = Math.round((y1 - y0) * scale);
  return {
    width: width,
    height: height,
    rects: list.map(function (s) {
      return {
        name: s.name,
        x: Math.round((s.x - x0) * scale) + g / 2,
        y: Math.round((s.y - y0) * scale) + g / 2,
        w: Math.max(1, Math.round(s.width * scale) - g),
        h: Math.max(1, Math.round(s.height * scale) - g),
        current: s.name === current,
      };
    }),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { normalizedAddress: normalizedAddress, moveToMonitor: moveToMonitor, monitorOf: monitorOf, monitorMap: monitorMap };
}
