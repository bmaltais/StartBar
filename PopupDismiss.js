// When a popup goes away because the pointer left it (docs/SPEC.md "Input").
// No Quickshell or QML imports, so the same file loads in the shell and under
// Node, like DockPreview.js.
//
// The Item menu (and the Preview menu, the same popup) as a state machine:
// `transition(state, event)` returns `{ state, timers, effects }` and
// Service.qml only keeps the state, arms the timers and closes the menu.
//
// The rule: the menu stays open until a row is chosen, an outside click closes
// it, or the pointer leaves it. Leaving only counts once the pointer has been
// on the menu (`entered`), so a pointer still travelling up from the
// right-clicked Item never closes it, however long that takes. Leaving closes
// after the leave timer (the Dock's hide delay), so a brief crossing between
// rows does not.
//
// The compositor's grab moves pointer focus to the popup the moment it opens
// and sends an enter at the popup's corner before the popup is placed, wherever
// the pointer is. On a Dock at the top or left edge that read as entering and
// then leaving the menu, which closed it at once (#87). So hover changes in the
// first SETTLE_MS (`settling`) do not count; when that time is up, a pointer
// that is on the menu counts as having entered it.
//
// STATE (plain data, never mutated): { open, settling, entered }
//
// EVENTS:
//   opened, closed            the popup was shown or hidden
//   hover {hovered}           the pointer came onto or left the popup
//   settleFired {hovered}     the settle timer ran out; hovered: the pointer is on it now
//   leaveFired                the leave timer ran out
//
// TIMERS: { settle, leave } -> "start" (restart) | "stop"; absent = leave alone.
//
// EFFECTS: { type: "close" }  hide the popup.

var SETTLE_MS = 250;

function initial() {
  return { open: false, settling: false, entered: false };
}

function result(state, timers, effects) {
  return { state: state, timers: timers || {}, effects: effects || [] };
}

function transition(state, event) {
  var s = state || initial();
  switch (event && event.type) {
  case "opened":
    return result({ open: true, settling: true, entered: false }, { settle: "start", leave: "stop" });
  case "closed":
    return result({ open: false, settling: false, entered: false }, { settle: "stop", leave: "stop" });
  case "hover":
    if (s.settling || !s.open) return result(s);
    if (event.hovered) return result({ open: s.open, settling: false, entered: true }, { leave: "stop" });
    return result(s, s.entered ? { leave: "start" } : {});
  case "settleFired":
    if (!s.open) return result(s);
    return result({ open: true, settling: false, entered: s.entered || !!event.hovered });
  case "leaveFired":
    return result(s, {}, s.open ? [{ type: "close" }] : []);
  }
  return result(s);
}

// The snap popup's own rule: it goes away once a moving pointer is more than
// `far` px outside `rect` ({x, y, width, height}), measured from its nearest edge.
function farOutside(rect, point, far) {
  var dx = Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width));
  var dy = Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height));
  return dx > far || dy > far;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { SETTLE_MS: SETTLE_MS, initial: initial, transition: transition, farOutside: farOutside };
}
