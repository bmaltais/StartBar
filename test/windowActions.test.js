require("./qmlimport");
const test = require("node:test");
const assert = require("node:assert/strict");
const { windowActions } = require("../DockModel.js");

const ids = (list) => list.map((a) => a.id);
const label = (list, id) => list.find((a) => a.id === id).label;

test("a tiled window offers maximize, full screen, float and scratchpad", () => {
  const actions = windowActions({ fullscreen: 0, floating: false, pinned: false, workspace: "1" });
  assert.deepEqual(ids(actions), ["maximize", "fullscreen", "float", "scratchpad"]);
  assert.equal(label(actions, "maximize"), "Maximize");
  assert.equal(label(actions, "fullscreen"), "Full screen");
  assert.equal(label(actions, "float"), "Float");
});

test("labels flip to their undo while the state is active", () => {
  const maxed = windowActions({ fullscreen: 1, floating: false, workspace: "1" });
  assert.equal(label(maxed, "maximize"), "Restore");
  assert.equal(label(maxed, "fullscreen"), "Full screen");

  const full = windowActions({ fullscreen: 2, floating: false, workspace: "1" });
  assert.equal(label(full, "fullscreen"), "Exit full screen");
  assert.equal(label(full, "maximize"), "Maximize");
});

test("a floating window also offers Center and Pin on top; Tile replaces Float", () => {
  const actions = windowActions({ fullscreen: 0, floating: true, pinned: false, workspace: "2" });
  assert.deepEqual(ids(actions), ["maximize", "fullscreen", "float", "center", "pin", "scratchpad"]);
  assert.equal(label(actions, "float"), "Tile");
  assert.equal(label(actions, "pin"), "Pin on top");
  assert.equal(label(windowActions({ floating: true, pinned: true, workspace: "2" }), "pin"), "Unpin from top");
});

test("a window already in the scratchpad offers restore instead of move", () => {
  const actions = windowActions({ floating: false, workspace: "special:scratchpad" });
  assert.equal(ids(actions).includes("scratchpad"), false);
  assert.equal(ids(actions).at(-1), "unscratchpad");
});

test("missing fields are treated as off", () => {
  assert.deepEqual(ids(windowActions({})), ["maximize", "fullscreen", "float", "scratchpad"]);
  assert.deepEqual(windowActions(null), []);
});

test("with moving on, a tiled window can be sent left, right, up or down; a floating one cannot", () => {
  const tiled = windowActions({ floating: false, workspace: "1" }, { move: true });
  assert.deepEqual(ids(tiled), ["maximize", "fullscreen", "float", "moveLeft", "moveRight", "moveUp", "moveDown", "scratchpad"]);
  assert.equal(label(tiled, "moveLeft"), "Move left");
  assert.equal(ids(windowActions({ floating: true, workspace: "1" }, { move: true })).includes("moveLeft"), false);
  assert.equal(ids(windowActions({ floating: false, workspace: "1" })).includes("moveLeft"), false, "off by default");
});

test("with more than one monitor a flyout row sits above the scratchpad row", () => {
  const tiled = windowActions({ floating: false, workspace: "1" }, { monitors: true });
  assert.deepEqual(ids(tiled), ["maximize", "fullscreen", "float", "monitor", "scratchpad"]);
  assert.equal(tiled.find((a) => a.id === "monitor").flyout, true);
  assert.deepEqual(ids(windowActions({ floating: false, workspace: "special:scratchpad" }, { monitors: true })).slice(-2), ["monitor", "unscratchpad"]);
  assert.equal(ids(windowActions({ floating: false, workspace: "1" })).includes("monitor"), false, "one monitor: no row");
});
