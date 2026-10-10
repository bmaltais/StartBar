// Pure Dock interaction state (docs/SPEC.md "Reveal", "Input"; vocabulary in
// CONTEXT.md). No Quickshell or QML imports, so the exact same file loads as
// a JS import inside the shell and via `require` under Node for the test
// suite.
//
// Three small state machines that used to be smeared across QObjects, Timers
// and popup handlers in Service.qml: whether the Dock is Revealed, whether a
// hover preview is up, and what a drag decides. Each takes an event and
// returns the next state; Service.qml keeps the state, arms the timers the
// result names and paints.
//
// A transition returns `{ state, timers }`. `timers` maps a timer name to
// "start" (restart it) or "stop"; a timer not named is left alone.

// --- Reveal -----------------------------------------------------------------
//
// Revealed once any of the flags below has held for the reveal delay, and
// Hidden again once none has for the hide delay. `menu` holds the Dock up for
// a whole context-menu visit and `drag` for a whole drag, independent of
// hover, since the pointer leaves both the strip and the Dock then.

var REVEAL_FLAGS = ["strip", "dock", "bar", "start", "preview", "menu", "drag"];

function initialReveal() {
  var flags = {};
  for (var i = 0; i < REVEAL_FLAGS.length; i++) flags[REVEAL_FLAGS[i]] = false;
  return { flags: flags, revealed: false };
}

function isHeld(state) {
  for (var i = 0; i < REVEAL_FLAGS.length; i++) {
    if (state.flags[REVEAL_FLAGS[i]]) return true;
  }
  return false;
}

// A flag changed. Timers only move when "any flag held" itself flips.
function setRevealFlag(state, name, value) {
  if (REVEAL_FLAGS.indexOf(name) < 0) return { state: state, timers: {} };
  var flags = {};
  for (var i = 0; i < REVEAL_FLAGS.length; i++) flags[REVEAL_FLAGS[i]] = state.flags[REVEAL_FLAGS[i]];
  var before = isHeld(state);
  flags[name] = !!value;
  var next = { flags: flags, revealed: state.revealed };
  var after = isHeld(next);
  if (after === before) return { state: next, timers: {} };
  if (after) return { state: next, timers: state.revealed ? { hide: "stop" } : { hide: "stop", reveal: "start" } };
  return { state: next, timers: { reveal: "stop", hide: "start" } };
}

function revealTimerFired(state) {
  return { state: { flags: state.flags, revealed: true }, timers: {} };
}

function hideTimerFired(state) {
  return { state: { flags: state.flags, revealed: false }, timers: {} };
}

// --- Hover preview ----------------------------------------------------------
//
// `hovered` is the Item under the pointer, `shown` the one the popup is up
// for (null while closed). The popup opens after the open delay, closes after
// the leave delay, and moving to a neighbouring Item while it is up swaps the
// shown Item in place.

function initialPreview() {
  return { hovered: null, shown: null };
}

// `enabled` is whether this Item can have a preview at all (taskbar style,
// previews on, a Window Item); `dragging` suppresses it during a drag.
function previewHoverStart(state, item, enabled, dragging) {
  if (dragging || !enabled) return { state: state, timers: {} };
  if (state.shown) return { state: { hovered: item, shown: item }, timers: { leave: "stop" } };
  return { state: { hovered: item, shown: null }, timers: { leave: "stop", open: "start" } };
}

function previewHoverEnd(state) {
  return { state: state, timers: { open: "stop", leave: "start" } };
}

// The pointer entered (true) or left (false) the popup itself.
function previewPopupHover(state, hovered) {
  return { state: state, timers: { leave: hovered ? "stop" : "start" } };
}

function previewOpenFired(state) {
  if (!state.hovered) return { state: state, timers: {} };
  return { state: { hovered: state.hovered, shown: state.hovered }, timers: {} };
}

function previewLeaveFired(state) {
  return { state: { hovered: state.hovered, shown: null }, timers: {} };
}

function previewDismiss(state) {
  return { state: { hovered: state.hovered, shown: null }, timers: { open: "stop", leave: "stop" } };
}

// --- Drag -------------------------------------------------------------------
//
// A drag moves a ghost of the Item. While it is inside the Dock row it names
// the gap it would drop into; once its centre is clear of the row (widened by
// half an icon) the drop is a drag-out: unpin if the Item is pinned, else a
// snap-back with nothing to persist.

function initialDrag() {
  return { key: "", from: -1, gap: -1, outside: false };
}

function dragActive(drag) {
  return drag.key !== "";
}

// `startIndex` is the dragged Item's current slot; the drag begins with its
// insertion gap on that slot's left edge, i.e. "no move".
function dragStart(key, startIndex) {
  return { key: key, from: startIndex, gap: startIndex, outside: false };
}

// The ghost moved. `ghost` is its centre { x, y }; `row` the Dock row's
// rectangle { x, y, width, height }; `step` the distance between Item slots
// (item width plus spacing); `count` how many Items are on the Dock. `gap`
// is the nearest insertion point, 0..count (gap k is the left edge of slot
// k, gap `count` is after the last Item), which is what the drop line shows.
function dragMove(drag, ghost, row, step, iconSize, count) {
  if (!dragActive(drag)) return drag;
  var gap = step > 0 ? Math.round((ghost.x - row.x) / step) : 0;
  return {
    key: drag.key,
    from: drag.from,
    gap: Math.max(0, Math.min(gap, count)),
    outside: isOutsideRow(ghost, row, iconSize),
  };
}

function isOutsideRow(ghost, row, iconSize) {
  var margin = iconSize / 2;
  return ghost.x < row.x - margin || ghost.x > row.x + row.width + margin
    || ghost.y < row.y - margin || ghost.y > row.y + row.height + margin;
}

// Where the drop line is drawn: the insertion gap itself.
function dropGap(drag) {
  return drag.gap;
}

// The slot the Item ends up in when dropped at the current gap. Removing the
// dragged Item shifts everything after it left, so a gap to its right lands
// one slot earlier than the gap number.
function finalIndex(drag) {
  return drag.gap > drag.from ? drag.gap - 1 : drag.gap;
}

// What dropping does. `item` is { pinned } (a pin Item counts as pinned).
// Recomputes "outside" from the ghost's final position rather than trusting
// the last move. Returns { action: "reorder", index } | { action: "unpin" }
// | { action: "none" }; the caller clears the drag state first.
function dragDrop(drag, ghost, row, iconSize, item) {
  if (!dragActive(drag)) return { action: "none" };
  if (isOutsideRow(ghost, row, iconSize)) {
    return item && item.pinned ? { action: "unpin" } : { action: "none" };
  }
  if (drag.gap >= 0) return { action: "reorder", index: finalIndex(drag) };
  return { action: "none" };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    REVEAL_FLAGS: REVEAL_FLAGS,
    initialReveal: initialReveal,
    isHeld: isHeld,
    setRevealFlag: setRevealFlag,
    revealTimerFired: revealTimerFired,
    hideTimerFired: hideTimerFired,
    initialPreview: initialPreview,
    previewHoverStart: previewHoverStart,
    previewHoverEnd: previewHoverEnd,
    previewPopupHover: previewPopupHover,
    previewOpenFired: previewOpenFired,
    previewLeaveFired: previewLeaveFired,
    previewDismiss: previewDismiss,
    initialDrag: initialDrag,
    dragActive: dragActive,
    dragStart: dragStart,
    dragMove: dragMove,
    isOutsideRow: isOutsideRow,
    dropGap: dropGap,
    finalIndex: finalIndex,
    dragDrop: dragDrop,
  };
}
