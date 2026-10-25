// The layouts the Item menu offers for a floating Window (docs/SPEC.md "Snap
// layouts"). Each layout is a list of zones, each zone a rectangle given as
// fractions of a monitor's usable area: x and y from its top-left corner, w and
// h its size. DockHyprland.snapWindow turns a zone into pixels. No Quickshell
// or QML imports, so the same file loads in the shell and under Node.

var THIRD = 1 / 3;

var LAYOUTS = [
  // Halves.
  [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  // Thirds.
  [{ x: 0, y: 0, w: THIRD, h: 1 }, { x: THIRD, y: 0, w: THIRD, h: 1 }, { x: 2 * THIRD, y: 0, w: THIRD, h: 1 }],
  // Quarters.
  [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 },
   { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }],
  // A main pane with two stacked beside it.
  [{ x: 0, y: 0, w: 2 * THIRD, h: 1 }, { x: 2 * THIRD, y: 0, w: THIRD, h: 0.5 }, { x: 2 * THIRD, y: 0.5, w: THIRD, h: 0.5 }],
];

if (typeof module !== "undefined" && module.exports) {
  module.exports = { LAYOUTS: LAYOUTS };
}
