// Pure Start menu logic (docs/SPEC.md "Start menu"; vocabulary in CONTEXT.md).
// No Quickshell or QML imports, so the exact same file loads as a JS import
// inside the shell and via `require` under Node for the test suite.
//
// The built-in Start menu as one state machine, the way DockInteraction.js
// does the Reveal Strip and hover previews: `transition(state, event, ctx)`
// returns `{ state, timers, effects, handled }` and the QML view only keeps
// the state, arms the timers, carries out the effects and paints. Everything
// the menu decides lives here: open, close and toggle (button click,
// keyboard command, hover rest, pointer leaving, click-away, a hover preview
// taking over), hover mode vs. stay-open mode, the view/layer stack and
// Escape's order through it, selection, what Enter launches, overlay menus
// and the pinned-grid drag. Grid navigation and reorder geometry are internals
// of this file. The lists the view paints come from StartMenuApps.js (search,
// A-Z groups, pins and recents), StartPlaces.js and StartMenuActions.js (the
// overlay rows); the view reads `overlayRows` and the drag geometry from here.
//
// STATE (plain data, never mutated):
//   open        the menu is showing
//   hover       it was opened by resting on the Start button and has not been
//               used yet ("hover mode"): it closes when the pointer is on
//               neither the button nor the menu, and a click-away does not
//               dismiss it. A key press or a click in the search box ends it.
//   query       what is typed in the search box
//   view        "home" (Pinned + Recommended) | "all" (A-Z list)
//   letters     the A-Z jump grid is up (only meaningful in "all")
//   overlay     null | { kind: "app", app, x, y } | { kind: "user" } | { kind: "power" }
//   nav         { section: "pinned" | "recent" | "", index } arrow selection on home
//   resultIndex highlighted search result; allIndex highlighted All apps row (-1 none)
//   drag        { id, slot }: the pinned app being dragged and the slot under it
//
// EVENTS (`type` plus fields):
//   command {action: "toggle"|"close"}   keyboard/IPC command
//   buttonClick, buttonHover {hovered}, hoverOpenFired      the Start button
//   menuHover {hovered}, leaveFired {pointerAround}         the menu / its timer
//   dismiss                              click outside a stay-open menu
//   itemHovered                          the pointer reached another Item
//   searchPressed                        click in the search box
//   queryChanged {text}, key {key}       key: left|right|up|down|enter|escape|other
//   showView {view}, letters {open}, jumpTo {letter}
//   appMenu {app, x, y}, toggleOverlay {kind}, closeOverlay, choose {row}
//   launch {app}, openPlace {path}
//   pinDragStart {id}, pinDragMove {point, grid}, pinDragEnd
//
// CTX (what the view knows that the state does not): { command, hoverOpen,
// results, pinned, recent, allFlat, letterRows, startPinIds, dockPinIds }.
//
// TIMERS: { hoverOpen, leave } -> "start" (restart) | "stop"; absent = leave alone.
//
// EFFECTS (data for the view to carry out):
//   { type: "holdDock", held }   keep the Dock Revealed while the menu is up
//   { type: "setQuery", text }   put text in the search box
//   { type: "focusSearch", deferred? }
//   { type: "scrollPinned", index } | { type: "scrollAll", index, position }
//   { type: "launch", app }      launch the App
//   { type: "apply", intent }    a settings intent for dockSettings.apply
//   { type: "run", command }     bash -lc command, detached
//   { type: "open", path }       xdg-open path
//   { type: "togglePin", appId, pinned }   Pin/Unpin on the Dock

// `list` with the entry at `from` moved to index `to` (clamped), for dragging
// a pinned app to a new place in the Start menu. Returns a new array; a bad
// `from` leaves the order alone.
function moveItem(list, from, to) {
  var items = Array.isArray(list) ? list.slice() : [];
  if (from < 0 || from >= items.length) return items;
  var target = Math.max(0, Math.min(to, items.length - 1));
  var moved = items.splice(from, 1)[0];
  items.splice(target, 0, moved);
  return items;
}

// Arrow-key movement on the Start menu's home screen, which is two grids
// stacked: Pinned (six columns) over Recommended (two). `sel` is
// { section: "pinned" | "recent" | "", index }, `counts` { pinned, recent },
// `key` one of left/right/up/down. Moving off an edge stays put, except
// down from the last Pinned row into Recommended and up back out of it.
// With nothing selected, any key selects the first app.
var PINNED_COLUMNS = 6;
var RECENT_COLUMNS = 2;

function moveSelection(sel, key, counts) {
  var pinned = (counts && counts.pinned) || 0;
  var recent = (counts && counts.recent) || 0;
  var section = sel && sel.section;
  var index = sel ? sel.index : -1;

  if (section !== "pinned" && section !== "recent") {
    if (pinned > 0) return { section: "pinned", index: 0 };
    if (recent > 0) return { section: "recent", index: 0 };
    return { section: "", index: -1 };
  }

  var size = section === "pinned" ? pinned : recent;
  if (size === 0) return moveSelection({ section: "", index: -1 }, key, counts);
  index = Math.max(0, Math.min(index, size - 1));

  if (section === "pinned") {
    if (key === "left") return { section: "pinned", index: Math.max(0, index - 1) };
    if (key === "right") return { section: "pinned", index: Math.min(pinned - 1, index + 1) };
    if (key === "up") return { section: "pinned", index: index - PINNED_COLUMNS >= 0 ? index - PINNED_COLUMNS : index };
    if (key === "down") {
      if (index + PINNED_COLUMNS < pinned) return { section: "pinned", index: index + PINNED_COLUMNS };
      if (recent > 0) {
        var column = index % PINNED_COLUMNS < PINNED_COLUMNS / 2 ? 0 : 1;
        return { section: "recent", index: Math.min(recent - 1, column) };
      }
      return { section: "pinned", index: index };
    }
  } else {
    if (key === "left") return { section: "recent", index: index % RECENT_COLUMNS === 1 ? index - 1 : index };
    if (key === "right") {
      return { section: "recent", index: index % RECENT_COLUMNS === 0 && index + 1 < recent ? index + 1 : index };
    }
    if (key === "down") return { section: "recent", index: index + RECENT_COLUMNS < recent ? index + RECENT_COLUMNS : index };
    if (key === "up") {
      if (index - RECENT_COLUMNS >= 0) return { section: "recent", index: index - RECENT_COLUMNS };
      if (pinned > 0) {
        var lastRow = Math.floor((pinned - 1) / PINNED_COLUMNS) * PINNED_COLUMNS;
        var offset = index % RECENT_COLUMNS === 0 ? 1 : 4;
        return { section: "pinned", index: Math.min(pinned - 1, lastRow + offset) };
      }
      return { section: "recent", index: index };
    }
  }
  return { section: section, index: index };
}

// Drag to reorder a pinned app. `point` is the pointer's position in the
// grid's own coordinates ({ x, y }); `grid` is { width, height, cellWidth,
// cellHeight, contentY } with contentY the scroll offset. Returns the slot
// under it, held to the pins shown (past an edge it names the nearest slot,
// as the Dock's ends do), or -1 once it is a cell or more beyond the grid.
function pinSlotAt(point, grid, count, columns) {
  var cols = columns > 0 ? columns : PINNED_COLUMNS;
  if (!point || !grid || !(count > 0)) return -1;
  if (point.x < -grid.cellWidth || point.x >= grid.width + grid.cellWidth
    || point.y < -grid.cellHeight || point.y >= grid.height + grid.cellHeight) return -1;
  var column = Math.max(0, Math.min(cols - 1, Math.floor(point.x / grid.cellWidth)));
  var row = Math.max(0, Math.floor((point.y + (grid.contentY || 0)) / grid.cellHeight));
  return Math.max(0, Math.min(count - 1, row * cols + column));
}

// Where the dragged tile is drawn, for its top-left `topLeft` in the grid's
// coordinates: held to the cells that hold a pin, so it stops at the first and
// last slot however far the pointer goes on.
function clampPinGhost(topLeft, grid, count, columns) {
  var cols = columns > 0 ? columns : PINNED_COLUMNS;
  var scroll = grid.contentY || 0;
  var lastRow = Math.max(0, Math.ceil(count / cols) - 1);
  var lastCol = Math.max(0, count - 1 - lastRow * cols);
  var y = Math.max(0, Math.min(topLeft.y + scroll, lastRow * grid.cellHeight));
  var maxCol = y + grid.cellHeight / 2 >= lastRow * grid.cellHeight ? lastCol : cols - 1;
  return { x: Math.max(0, Math.min(topLeft.x, maxCol * grid.cellWidth)), y: y - scroll };
}

// How far the tile at `index` is drawn from its own cell while a drag is on:
// one slot toward the dragged tile's vacated one for each tile it has passed.
function pinTileShift(drag, index, grid, columns) {
  var cols = columns > 0 ? columns : PINNED_COLUMNS;
  var none = { x: 0, y: 0 };
  if (drag.id === "" || drag.slot < 0 || index === drag.from) return none;
  var to = -1;
  if (drag.from < drag.slot && index > drag.from && index <= drag.slot) to = index - 1;
  else if (drag.slot < drag.from && index >= drag.slot && index < drag.from) to = index + 1;
  if (to < 0) return none;
  return {
    x: ((to % cols) - (index % cols)) * grid.cellWidth,
    y: (Math.floor(to / cols) - Math.floor(index / cols)) * grid.cellHeight,
  };
}

// On release: the new saved order, or null if nothing changes. The grid
// skips pins whose app is gone, so `shownIds` (what the grid displays) maps
// the slot back to a position in the saved `pinIds` by app id.
function reorderedPins(pinIds, shownIds, draggedId, slot) {
  if (!(slot >= 0) || slot >= shownIds.length) return null;
  var from = pinIds.indexOf(draggedId);
  var to = pinIds.indexOf(shownIds[slot]);
  if (from < 0 || to < 0 || from === to) return null;
  return moveItem(pinIds, from, to);
}

// --- State machine ----------------------------------------------------------

var HOVER_OPEN_DELAY_MS = 400;
var LEAVE_DELAY_MS = 500;

var NO_NAV = { section: "", index: -1 };

function initial() {
  return {
    open: false,
    hover: false,
    query: "",
    view: "home",
    letters: false,
    overlay: null,
    nav: NO_NAV,
    resultIndex: 0,
    allIndex: -1,
    drag: { id: "", from: -1, slot: -1 },
  };
}

function isSearching(state) {
  return state.query.trim().length > 0;
}

function patch(state, changes) {
  var next = {};
  var key;
  for (key in state) next[key] = state[key];
  for (key in changes) next[key] = changes[key];
  return next;
}

function out(state, timers, effects, handled) {
  return { state: state, timers: timers || {}, effects: effects || [], handled: !!handled };
}

// A fresh menu: nothing typed, home view, nothing selected, no overlay.
function openMenu(state, hover) {
  var next = patch(state, {
    open: true, hover: hover, query: "", view: "home", letters: false, overlay: null,
    nav: NO_NAV, resultIndex: 0, allIndex: -1,
  });
  return out(next, {}, [
    { type: "holdDock", held: true },
    { type: "setQuery", text: "" },
    { type: "focusSearch" },
  ]);
}

// Close, then carry out `after`. Closing an already closed menu does nothing.
function closeMenu(state, after, handled) {
  if (!state.open) return out(state, {}, [], handled);
  var next = patch(state, { open: false, hover: false });
  return out(next, { leave: "stop" }, [{ type: "holdDock", held: false }].concat(after || []), handled);
}

// Typing (or clearing) the query drops the overlay, the arrow selection and
// the jump grid, and puts the result highlight back on the first row.
function withQuery(state, text) {
  return patch(state, {
    query: text, resultIndex: 0, overlay: null, nav: NO_NAV, allIndex: -1, letters: false,
  });
}

// Switching between home and All apps drops the selection and the jump grid.
function withView(state, view) {
  if (state.view === view) return state;
  return patch(state, { view: view, letters: false, nav: NO_NAV, allIndex: -1 });
}

function launchApp(state, app, handled) {
  if (!app) return out(state, {}, [], handled);
  return closeMenu(state, [
    { type: "launch", app: app },
    { type: "apply", intent: { type: "pushRecentApp", appId: app.id } },
  ], handled);
}

// The app Enter launches outside search: the highlighted All apps row, else
// the arrow-selected Pinned / Recommended one.
function selectedApp(state, ctx) {
  if (state.view === "all") return ctx.allFlat[state.allIndex] || null;
  if (state.nav.section === "pinned") return ctx.pinned[state.nav.index] || null;
  if (state.nav.section === "recent") return ctx.recent[state.nav.index] || null;
  return null;
}

var ARROWS = { left: true, right: true, up: true, down: true };

// One key press in the search box. Any key ends hover mode (using the
// keyboard means you want the menu); then the first matching branch wins,
// and a key no branch takes (`handled` false) goes into the search box.
function onKey(state, key, ctx) {
  if (!state.open) return out(state);
  var effects = [];
  var s = state;
  if (s.hover) {
    s = patch(s, { hover: false });
    effects.push({ type: "focusSearch", deferred: true });
  }
  var searching = isSearching(s);
  var enter = key === "enter";

  if (key === "down" && searching) {
    return out(patch(s, { resultIndex: Math.min(ctx.results.length - 1, s.resultIndex + 1) }), {}, effects, true);
  }
  if (key === "up" && searching) {
    return out(patch(s, { resultIndex: Math.max(0, s.resultIndex - 1) }), {}, effects, true);
  }
  if (enter && searching) {
    var hit = launchApp(s, ctx.results[s.resultIndex], true);
    return out(hit.state, hit.timers, effects.concat(hit.effects), true);
  }
  if (!searching && s.view === "home" && ARROWS[key]) {
    var next = moveSelection(s.nav, key, { pinned: ctx.pinned.length, recent: ctx.recent.length });
    if (next.section === "pinned") effects.push({ type: "scrollPinned", index: next.index });
    return out(patch(s, { nav: next }), {}, effects, true);
  }
  if (!searching && s.view === "all" && !s.letters && (key === "down" || key === "up")) {
    var row = s.allIndex + (key === "down" ? 1 : -1);
    row = Math.max(0, Math.min(ctx.allFlat.length - 1, row));
    effects.push({ type: "scrollAll", index: row, position: "contain" });
    return out(patch(s, { allIndex: row }), {}, effects, true);
  }
  if (enter && !searching) {
    var pick = launchApp(s, selectedApp(s, ctx), true);
    return out(pick.state, pick.timers, effects.concat(pick.effects), true);
  }
  if (key === "escape") {
    // Back out one layer at a time: overlay, jump grid, search, All apps, menu.
    if (s.overlay) return out(patch(s, { overlay: null }), {}, effects, true);
    if (s.letters) return out(patch(s, { letters: false }), {}, effects, true);
    if (searching) {
      effects.push({ type: "setQuery", text: "" });
      return out(withQuery(s, ""), {}, effects, true);
    }
    if (s.view === "all") return out(withView(s, "home"), {}, effects, true);
    var gone = closeMenu(s, [], true);
    return out(gone.state, gone.timers, effects.concat(gone.effects), true);
  }
  return out(s, {}, effects, false);
}

// The dragged app starts on its own slot, i.e. "no move".
function onPinDragStart(state, id, ctx) {
  var from = -1;
  for (var i = 0; i < ctx.pinned.length; i++) if (ctx.pinned[i].id === id) from = i;
  return out(patch(state, { drag: { id: id, from: from, slot: from } }));
}

function onPinDragMove(state, point, grid, ctx) {
  if (state.drag.id === "") return out(state);
  var slot = pinSlotAt(point, grid, ctx.pinned.length, PINNED_COLUMNS);
  return out(patch(state, { drag: { id: state.drag.id, from: state.drag.from, slot: slot } }));
}

// On release: the new saved order, mapped back by app id (the grid skips pins
// whose app is gone), or nothing if the order is unchanged.
function onPinDragEnd(state, ctx) {
  var drag = state.drag;
  var next = patch(state, { drag: { id: "", from: -1, slot: -1 } });
  if (drag.id === "") return out(state);
  var shown = ctx.pinned.map(function (app) { return app.id; });
  var order = reorderedPins(ctx.startPinIds, shown, drag.id, drag.slot);
  return out(next, {}, order ? [{ type: "apply", intent: { type: "reorderStartPins", order: order } }] : []);
}

function transition(state, event, ctx) {
  var builtin = ctx.command === "builtin";
  switch (event.type) {
    case "command":
      if (!builtin) return out(state, {}, event.action === "toggle" ? [{ type: "run", command: ctx.command }] : []);
      if (event.action === "close" || state.open) return closeMenu(state);
      return openMenu(state, false);

    case "buttonClick":
      if (!builtin) return out(state, {}, [{ type: "run", command: ctx.command }]);
      // A menu that hover opened stays a hover menu: a click on the button
      // does not make it permanent.
      if (state.open && state.hover) return out(state);
      if (state.open) return closeMenu(state);
      return openMenu(state, false);

    case "buttonHover":
      return out(state, event.hovered ? { hoverOpen: "start" } : { hoverOpen: "stop", leave: "start" });

    case "hoverOpenFired":
      if (builtin && ctx.hoverOpen && !state.open) return openMenu(state, true);
      return out(state);

    case "menuHover":
      return out(state, event.hovered ? {} : { leave: "start" });

    case "leaveFired":
      if (state.open && state.hover && !event.pointerAround) return closeMenu(state);
      return out(state);

    case "dismiss":
      return state.hover ? out(state) : closeMenu(state);

    case "itemHovered":
      return state.open && state.hover ? closeMenu(state) : out(state);

    case "searchPressed":
      if (!state.hover) return out(state);
      return out(patch(state, { hover: false }), {}, [{ type: "focusSearch", deferred: true }]);

    case "queryChanged":
      return out(withQuery(state, event.text));

    case "key":
      return onKey(state, event.key, ctx);

    case "showView":
      return out(withView(state, event.view));

    case "letters":
      return out(patch(state, { letters: !!event.open }));

    case "jumpTo": {
      var row = ctx.letterRows[event.letter];
      return out(patch(state, { letters: false }), {}, row === undefined ? [] : [{ type: "scrollAll", index: row, position: "beginning" }]);
    }

    case "appMenu":
      return out(patch(state, { overlay: { kind: "app", app: event.app, x: event.x, y: event.y } }));

    case "toggleOverlay":
      return out(patch(state, { overlay: state.overlay && state.overlay.kind === event.kind ? null : { kind: event.kind } }));

    case "closeOverlay":
      return out(patch(state, { overlay: null }));

    case "choose": {
      var closed = patch(state, { overlay: null });
      var action = event.row.action;
      if (action.type === "launch") return launchApp(closed, action.app);
      if (action.type === "run") return closeMenu(closed, [action]);
      return out(closed, {}, [action]);
    }

    case "launch":
      return launchApp(state, event.app);

    case "openPlace":
      return closeMenu(state, [{ type: "open", path: event.path }]);

    case "pinDragStart":
      return onPinDragStart(state, event.id, ctx);

    case "pinDragMove":
      return onPinDragMove(state, event.point, event.grid, ctx);

    case "pinDragEnd":
      return onPinDragEnd(state, ctx);
  }
  return out(state);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PINNED_COLUMNS: PINNED_COLUMNS,
    RECENT_COLUMNS: RECENT_COLUMNS,
    HOVER_OPEN_DELAY_MS: HOVER_OPEN_DELAY_MS,
    LEAVE_DELAY_MS: LEAVE_DELAY_MS,
    initial: initial,
    transition: transition,
    isSearching: isSearching,
    clampPinGhost: clampPinGhost,
    pinTileShift: pinTileShift,
  };
}
