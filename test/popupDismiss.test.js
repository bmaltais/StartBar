const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../PopupDismiss.js");

// Feeds events in order and returns the last result plus every close asked for.
function run(events) {
  let state = D.initial();
  let last = null;
  let closes = 0;
  for (const event of events) {
    last = D.transition(state, event);
    state = last.state;
    closes += last.effects.filter((e) => e.type === "close").length;
  }
  return { state, last, closes };
}

test("opening starts the settle timer and stops the leave timer", () => {
  const { state, last } = run([{ type: "opened" }]);
  assert.deepEqual(state, { open: true, settling: true, entered: false });
  assert.deepEqual(last.timers, { settle: "start", leave: "stop" });
});

test("#87: the grab's enter and leave while settling do not count, so the menu stays open", () => {
  const { state, closes, last } = run([
    { type: "opened" },
    { type: "hover", hovered: true },
    { type: "hover", hovered: false },
    { type: "settleFired", hovered: false },
  ]);
  assert.equal(state.entered, false);
  assert.equal(state.settling, false);
  assert.deepEqual(last.timers, {}, "no leave timer armed");
  assert.equal(closes, 0);
});

test("a pointer on the menu when the settle time is up counts as having entered", () => {
  const { state } = run([{ type: "opened" }, { type: "settleFired", hovered: true }]);
  assert.equal(state.entered, true);
});

test("a pointer still travelling to the menu never closes it: leaving counts only after entering", () => {
  const { last } = run([{ type: "opened" }, { type: "settleFired", hovered: false }, { type: "hover", hovered: false }]);
  assert.deepEqual(last.timers, {});
});

test("entering then leaving arms the leave timer; coming back stops it", () => {
  const base = [{ type: "opened" }, { type: "settleFired", hovered: false }, { type: "hover", hovered: true }];
  assert.deepEqual(run([...base, { type: "hover", hovered: false }]).last.timers, { leave: "start" });
  assert.deepEqual(run([...base, { type: "hover", hovered: false }, { type: "hover", hovered: true }]).last.timers, { leave: "stop" });
});

test("the leave timer closes an open menu, and does nothing to a closed one", () => {
  const open = run([{ type: "opened" }, { type: "settleFired", hovered: true }, { type: "hover", hovered: false }, { type: "leaveFired" }]);
  assert.equal(open.closes, 1);
  assert.equal(run([{ type: "leaveFired" }]).closes, 0);
  assert.equal(run([{ type: "opened" }, { type: "closed" }, { type: "leaveFired" }]).closes, 0);
});

test("closing resets everything and stops both timers", () => {
  const { state, last } = run([{ type: "opened" }, { type: "settleFired", hovered: true }, { type: "closed" }]);
  assert.deepEqual(state, D.initial());
  assert.deepEqual(last.timers, { settle: "stop", leave: "stop" });
});

test("hover and settle events on a closed menu change nothing", () => {
  const { state } = run([{ type: "hover", hovered: true }, { type: "settleFired", hovered: true }]);
  assert.deepEqual(state, D.initial());
});

test("reopening starts from scratch: entering the last menu does not carry over", () => {
  const { state } = run([{ type: "opened" }, { type: "settleFired", hovered: true }, { type: "closed" }, { type: "opened" }]);
  assert.equal(state.entered, false);
  assert.equal(state.settling, true);
});

test("farOutside: only a pointer more than `far` px from the card's nearest edge", () => {
  const card = { x: 100, y: 100, width: 200, height: 100 };
  assert.equal(D.farOutside(card, { x: 150, y: 150 }, 48), false, "on the card");
  assert.equal(D.farOutside(card, { x: 150, y: 60 }, 48), false, "40 px above");
  assert.equal(D.farOutside(card, { x: 150, y: 40 }, 48), true, "60 px above");
  assert.equal(D.farOutside(card, { x: 349, y: 150 }, 48), true, "49 px right");
  assert.equal(D.farOutside(card, { x: 340, y: 240 }, 48), false, "40 px right, 40 px below");
});
