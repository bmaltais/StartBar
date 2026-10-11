const test = require("node:test");
const assert = require("node:assert/strict");
const DI = require("../DockInteraction.js");

test("DockInteraction has no Quickshell or QML imports, so Node can load it directly", () => {
  assert.equal(typeof DI.setRevealFlag, "function");
});

test("the first held flag arms the reveal timer and stops the hide timer", () => {
  const r = DI.setRevealFlag(DI.initialReveal(), "strip", true);
  assert.deepEqual(r.timers, { hide: "stop", reveal: "start" });
  assert.equal(r.state.revealed, false);
  assert.equal(DI.revealTimerFired(r.state).state.revealed, true);
});

test("a second flag while one is held leaves the timers alone", () => {
  let s = DI.setRevealFlag(DI.initialReveal(), "strip", true).state;
  const r = DI.setRevealFlag(s, "dock", true);
  assert.deepEqual(r.timers, {});
  // dropping one of two doesn't start hiding
  s = r.state;
  assert.deepEqual(DI.setRevealFlag(s, "strip", false).timers, {});
});

test("when the last flag drops, reveal stops and hide starts, then Hidden", () => {
  let s = DI.revealTimerFired(DI.setRevealFlag(DI.initialReveal(), "dock", true).state).state;
  const r = DI.setRevealFlag(s, "dock", false);
  assert.deepEqual(r.timers, { reveal: "stop", hide: "start" });
  assert.equal(DI.hideTimerFired(r.state).state.revealed, false);
});

test("holding again while already Revealed only stops the hide timer", () => {
  let s = DI.revealTimerFired(DI.setRevealFlag(DI.initialReveal(), "dock", true).state).state;
  s = DI.setRevealFlag(s, "dock", false).state;
  assert.deepEqual(DI.setRevealFlag(s, "bar", true).timers, { hide: "stop" });
});

test("menu and drag hold the Dock up with no hover at all", () => {
  let s = DI.setRevealFlag(DI.initialReveal(), "menu", true).state;
  assert.equal(DI.isHeld(s), true);
  s = DI.setRevealFlag(s, "drag", true).state;
  s = DI.setRevealFlag(s, "menu", false).state;
  assert.equal(DI.isHeld(s), true);
  assert.deepEqual(DI.setRevealFlag(s, "drag", false).timers, { reveal: "stop", hide: "start" });
});

test("each holder of the Dock keeps its own hold: one closing does not drop another's", () => {
  let s = DI.setRevealFlag(DI.initialReveal(), "barMenu", true).state;
  s = DI.setRevealFlag(s, "startMenu", true).state;
  s = DI.setRevealFlag(s, "startMenu", false).state;
  assert.equal(DI.isHeld(s), true);
  assert.deepEqual(DI.setRevealFlag(s, "barMenu", false).timers, { reveal: "stop", hide: "start" });
});

test("setting a flag to its current value, or an unknown flag, changes nothing", () => {
  const s = DI.initialReveal();
  assert.deepEqual(DI.setRevealFlag(s, "strip", false).timers, {});
  assert.deepEqual(DI.setRevealFlag(s, "nope", true).timers, {});
  assert.equal(DI.isHeld(DI.setRevealFlag(s, "nope", true).state), false);
});

const row = { x: 100, y: 500, width: 400, height: 60 };

test("dragMove names the nearest insertion gap, including after the last Item", () => {
  const d = DI.dragStart("pin:x", 0);
  // 4 Items, 50px apart from x=100: gaps sit at 100, 150, 200, 250, 300
  assert.equal(DI.dragMove(d, { x: 100 + 10, y: 530 }, row, 50, 40, 4).gap, 0);
  assert.equal(DI.dragMove(d, { x: 100 + 2 * 50 + 10, y: 530 }, row, 50, 40, 4).gap, 2);
  assert.equal(DI.dragMove(d, { x: 100 + 3 * 50 + 30, y: 530 }, row, 50, 40, 4).gap, 4);
  assert.equal(DI.dragMove(d, { x: 100 + 900, y: 530 }, row, 50, 40, 4).gap, 4);
  assert.equal(DI.dragMove(d, { x: 100 - 30, y: 530 }, row, 50, 40, 4).gap, 0);
  assert.equal(DI.dragMove(d, { x: 300, y: 530 }, row, 0, 40, 4).gap, 0);
});

test("dragging icon 1 of 4 between icons 3 and 4 lands it third, not last", () => {
  const d = DI.dragMove(DI.dragStart("pin:a", 0), { x: 100 + 3 * 50, y: 530 }, row, 50, 40, 4);
  assert.equal(DI.dropGap(d), 3);
  assert.equal(DI.finalIndex(d), 2);
  assert.deepEqual(DI.dragDrop(d, { x: 250, y: 530 }, row, 40, { pinned: true }), { action: "reorder", index: 2 });
});

test("dropping after the last Item makes it last; moving left lands on the gap itself", () => {
  const end = DI.dragMove(DI.dragStart("pin:a", 0), { x: 100 + 4 * 50, y: 530 }, row, 50, 40, 4);
  assert.equal(DI.finalIndex(end), 3);
  const left = DI.dragMove(DI.dragStart("pin:d", 3), { x: 100 + 1 * 50, y: 530 }, row, 50, 40, 4);
  assert.equal(DI.finalIndex(left), 1);
  // a gap beside the Item's own slot is a no-op
  assert.equal(DI.finalIndex(DI.dragMove(DI.dragStart("pin:b", 1), { x: 100 + 2 * 50, y: 530 }, row, 50, 40, 4)), 1);
  assert.equal(DI.finalIndex(DI.dragStart("pin:b", 1)), 1);
});

test("a drag is outside once the ghost centre clears the row by half an icon", () => {
  const d = DI.dragStart("pin:x", 1);
  assert.equal(DI.dragMove(d, { x: 300, y: 530 }, row, 50, 40, 5).outside, false);
  assert.equal(DI.dragMove(d, { x: 300, y: 500 - 20 }, row, 50, 40, 5).outside, false);
  assert.equal(DI.dragMove(d, { x: 300, y: 500 - 21 }, row, 50, 40, 5).outside, true);
  assert.equal(DI.dragMove(d, { x: 100 + 400 + 21, y: 530 }, row, 50, 40, 5).outside, true);
});

test("dragMove with no drag in progress returns the idle drag unchanged", () => {
  const idle = DI.initialDrag();
  assert.equal(DI.dragMove(idle, { x: 0, y: 0 }, row, 50, 40, 5), idle);
  assert.equal(DI.dragActive(idle), false);
});

test("dropping inside reorders to the previewed index", () => {
  const d = DI.dragMove(DI.dragStart("pin:x", 3), { x: 200, y: 530 }, row, 50, 40, 5);
  assert.deepEqual(DI.dragDrop(d, { x: 200, y: 530 }, row, 40, { pinned: true }), { action: "reorder", index: 2 });
});

test("dropping outside unpins a pinned Item and snaps an unpinned one back", () => {
  const d = DI.dragStart("pin:x", 1);
  const far = { x: 300, y: 100 };
  assert.deepEqual(DI.dragDrop(d, far, row, 40, { pinned: true }), { action: "unpin" });
  assert.deepEqual(DI.dragDrop(d, far, row, 40, { pinned: false }), { action: "none" });
});

test("dropping with no drag in progress does nothing", () => {
  assert.deepEqual(DI.dragDrop(DI.initialDrag(), { x: 200, y: 530 }, row, 40, { pinned: true }), { action: "none" });
});
