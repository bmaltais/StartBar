// The layouts the Item menu offers for a floating Window, and the tile
// arrangement it offers for a tiled one (docs/SPEC.md "Snap
// layouts"). Each layout is a list of zones, each zone a rectangle given as
// fractions of a monitor's usable area: x and y from its top-left corner, w and
// h its size. DockHyprland.snapWindow turns a zone into pixels. No Quickshell
// or QML imports, so the same file loads in the shell and under Node.

var THIRD = 1 / 3;

// The whole area: choosing it maximizes the Window (it is not a zone to size to).
var FULL = [{ x: 0, y: 0, w: 1, h: 1, maximize: true }];

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
  // Wide and narrow side by side.
  [{ x: 0, y: 0, w: 2 * THIRD, h: 1 }, { x: 2 * THIRD, y: 0, w: THIRD, h: 1 }],
  FULL,
];

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

// The shapes dwindle can give two or three tiles, as thumbnails (see
// DockHyprland.reshapeTiles). Each zone carries its layout's `shape`. dwindle
// halves each split, so three columns are 1/2, 1/4 and 1/4 wide.
var SHAPES = {
  2: [
    [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
    [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }],
  ],
  3: [
    [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }],
    [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.25, h: 1 }, { x: 0.75, y: 0, w: 0.25, h: 1 }],
    [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }],
    [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.25 }, { x: 0, y: 0.75, w: 1, h: 0.25 }],
  ],
};
var SHAPE_NAMES = { 2: ["H", "V"], 3: ["HV", "HH", "VH", "VV"] };

// The shape thumbnails for `count` tiles; empty for any other count.
function shapeLayouts(count) {
  var layouts = SHAPES[count] || [];
  return layouts.map(function (layout, i) {
    return layout.map(function (z) { return { x: z.x, y: z.y, w: z.w, h: z.h, shape: SHAPE_NAMES[count][i] }; });
  });
}

// The tiled Windows of a workspace as one layout: each zone is a tile's current
// rectangle as fractions of the tiles' bounding box, carrying the Window's `id`.
// Empty when fewer than two tiles have a known rectangle (nothing to swap with).
function tileLayout(items, workspace) {
  var tiles = windowsOn(items, workspace).filter(function (w) { return !w.floating && w.rect; });
  if (tiles.length < 2) return [];
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  tiles.forEach(function (w) {
    x0 = Math.min(x0, w.rect.x); y0 = Math.min(y0, w.rect.y);
    x1 = Math.max(x1, w.rect.x + w.rect.w); y1 = Math.max(y1, w.rect.y + w.rect.h);
  });
  var width = x1 - x0, height = y1 - y0;
  if (width <= 0 || height <= 0) return [];
  return tiles.map(function (w) {
    return { x: (w.rect.x - x0) / width, y: (w.rect.y - y0) / height,
             w: w.rect.w / width, h: w.rect.h / height, id: w.id };
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LAYOUTS: LAYOUTS, FULL: FULL, windowsOn: windowsOn, tileLayout: tileLayout, shapeLayouts: shapeLayouts };
}
