// Snap layouts (docs/SPEC.md "Snap layouts"): which layouts a Window is
// offered, and what picking a zone of one does. Each layout is a list of zones,
// each zone a rectangle given as fractions of a monitor's usable area: x and y
// from its top-left corner, w and h its size. No Quickshell or QML imports, so
// the same file loads in the shell and under Node.
//
// The interface Service.qml uses:
//   windowAt(items, address)   the Window with that address, off special workspaces
//   layoutsFor(items, win)     the layouts its picker shows; empty means no picker
//   plan(win, layout, zone, fillOthers)
//                              what picking `zone` of `layout` does, as data for
//                              DockSnap.snapCommand:
//     { action: "maximize", id }              the "full" thumbnail
//     { action: "reshape", id, shape, zone }  a tile, into a shape of two or three tiles
//     { action: "swap", id, other }           a tile, swapped with the tile clicked
//     { action: "snap", id, zone, others }    a floating Window, sized to the zone;
//                                             `others` are the layout's other zones
//                                             when fillOthers is on, else empty

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

// An Item's Windows: a Window Item has `window`, a Group Item `windows`.
function windowsOf(item) {
  return (item && (item.windows || (item.window ? [item.window] : []))) || [];
}

function isSpecial(workspace) {
  return String(workspace || "").indexOf("special") === 0;
}

// The Window with this address (as `hyprctl` prints it, with or without 0x), if
// it is on an ordinary workspace. Window ids in the Dock have no 0x.
function windowAt(items, address) {
  var wanted = String(address || "").replace(/^0x/, "");
  if (!wanted) return null;
  for (var i = 0; i < (items || []).length; i++) {
    var list = windowsOf(items[i]);
    for (var j = 0; j < list.length; j++) {
      var w = list[j];
      if (w && String(w.id).replace(/^0x/, "") === wanted && !isSpecial(w.workspace)) return w;
    }
  }
  return null;
}

// The Windows on one workspace, from the Dock's Items; special workspaces (the
// scratchpad, Omarchy's minimized) hold none. A Window is counted once.
function windowsOn(items, workspace) {
  var seen = {};
  var found = [];
  var name = String(workspace || "");
  if (!name || isSpecial(name)) return found;
  for (var i = 0; i < (items || []).length; i++) {
    var list = windowsOf(items[i]);
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
// DockSnap.reshapeTiles). Each zone carries its layout's `shape`. dwindle
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

// What a Window's picker shows: a floating Window every layout; a tiled one the
// shapes its workspace's two or three tiles can take, or with more tiles their
// current arrangement (to swap with one); each list ends with "full". A tile
// alone on its workspace, or no Window, gets nothing.
function layoutsFor(items, win) {
  if (!win || !win.id) return [];
  if (win.floating) return LAYOUTS;
  var tiles = tileLayout(items, win.workspace);
  var shapes = shapeLayouts(tiles.length);
  var list = shapes.length > 0 ? shapes : (tiles.length > 0 ? [tiles] : []);
  return list.length > 0 ? list.concat([FULL]) : [];
}

function sameZone(a, b) {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

// What picking `zone` of `layout` does to `win` (see the top of this file). A
// tile never floats: it is reshaped (two or three tiles) or swapped with the
// tile clicked. Zones are matched by value: QML hands out copies, so identity
// does not hold. Lists from QML are array-like, so they are walked by length.
function plan(win, layout, zone, fillOthers) {
  if (!win || !win.id || !zone) return null;
  if (zone.maximize) return { action: "maximize", id: win.id };
  if (!win.floating) {
    if (zone.shape) return { action: "reshape", id: win.id, shape: zone.shape, zone: { x: zone.x, y: zone.y, w: zone.w, h: zone.h } };
    return zone.id ? { action: "swap", id: win.id, other: zone.id } : null;
  }
  var others = [];
  for (var i = 0; fillOthers && layout && i < layout.length; i++) {
    var z = layout[i];
    if (!sameZone(z, zone)) others.push({ x: z.x, y: z.y, w: z.w, h: z.h });
  }
  return { action: "snap", id: win.id, zone: { x: zone.x, y: zone.y, w: zone.w, h: zone.h }, others: others };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    LAYOUTS: LAYOUTS, FULL: FULL, windowsOn: windowsOn, tileLayout: tileLayout, shapeLayouts: shapeLayouts,
    windowAt: windowAt, layoutsFor: layoutsFor, plan: plan,
  };
}
