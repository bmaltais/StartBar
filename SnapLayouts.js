// The layouts the Item menu offers for a floating Window (docs/SPEC.md "Snap
// layouts"). Each layout is a list of zones, each zone a rectangle given as
// fractions of a monitor's usable area: x and y from its top-left corner, w and
// h its size. DockHyprland.snapWindow turns a zone into pixels. No Quickshell
// or QML imports, so the same file loads in the shell and under Node.

var THIRD = 1 / 3;

var LAYOUTS = [
  // Halves.
  [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  // Two stacked.
  [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
  // Thirds.
  [{ x: 0, y: 0, w: THIRD, h: 1 }, { x: THIRD, y: 0, w: THIRD, h: 1 }, { x: 2 * THIRD, y: 0, w: THIRD, h: 1 }],
  // Quarters.
  [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
   { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }],
  // A main pane with two stacked beside it.
  [{ x: 0, y: 0, w: 2 * THIRD, h: 1 }, { x: 2 * THIRD, y: 0, w: THIRD, h: 0.5 }, { x: 2 * THIRD, y: 0.5, w: THIRD, h: 0.5 }],
  // One on top, two side by side below it.
  [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }],
];

// The layouts with exactly `count` zones: what a tiled workspace with that many
// Windows can be arranged as.
function layoutsFor(count) {
  return LAYOUTS.filter(function (layout) { return layout.length === count; });
}

// The Windows on one workspace, from the Dock's Items (a Window Item has
// `window`, a Group Item `windows`); special workspaces (the scratchpad,
// Omarchy's minimized) hold none. A Window is counted once.
function windowsOn(items, workspace) {
  var seen = {};
  var found = [];
  var name = String(workspace || "");
  if (!name || name.indexOf("special") === 0) return found;
  for (var i = 0; i < (items || []).length; i++) {
    var item = items[i];
    var list = item.windows || (item.window ? [item.window] : []);
    for (var j = 0; j < list.length; j++) {
      var w = list[j];
      if (!w || seen[w.id] || String(w.workspace || "") !== name) continue;
      seen[w.id] = true;
      found.push(w);
    }
  }
  return found;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LAYOUTS: LAYOUTS, layoutsFor: layoutsFor, windowsOn: windowsOn };
}
