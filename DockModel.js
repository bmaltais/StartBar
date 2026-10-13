// Pure Dock model (see docs/SPEC.md; vocabulary in
// CONTEXT.md). No Quickshell or QML imports, so the exact same file loads
// as a JS import inside the shell and via `require` under Node for the
// test suite.
//
// Placed positions (CONTEXT.md "Placed"; docs/SPEC.md "Ordering" and
// "Input"): every Item carries a stable `key` ("pin:<appId>" for a Pin
// Item, "window:<windowId>" for a Window Item). `placements` is an
// optional array of `{ key, index }` recording the absolute slot a drag
// dropped that key at; `buildDockItems` applies it as a final pass over
// the Launch-Order/Pin-slot arrangement below, via `applyPlacements`. A
// Placed Pin's `{ key, index }` is meant to be persisted (DockConfig.js)
// so it survives a restart; a Placed Window Item's is meant to be kept
// only in memory for as long as its Window stays open — buildDockItems
// itself doesn't care which, since a placement whose key matches nothing
// currently on the Dock (a closed Window, a Pin not currently shown
// because its App has Windows) is simply ignored, which is exactly what
// lets a Placed Pin's slot reassert itself the moment its bare Pin Item
// reappears. DockConfig.js's "placeItem" intent computes the next persisted
// `placements` for the drag gesture (which lives in Service.qml).
//
// A Window is `{ id, class, workspace, openedAt, title, active, attention }`.
// `openedAt` is a monotonically increasing value (timestamp or counter)
// recording when the Window appeared; it is what Launch Order sorts by.
// `title` is passed through onto the Item for the Quickshell side's
// tooltip; the model itself has no use for it. `active` is true for the
// Active Window (CONTEXT.md); `attention` is true while the Window is
// requesting Attention. Both default to falsy when omitted. `resolveApp(window)`
// returns the matching App (an object with at least an `id`) or a falsy
// value when the Window's App cannot be identified.
//
// `pins` is the Dock's persisted Pins list (CONTEXT.md "Pin"): an ordered
// array of App ids, each holding a slot at its index. `resolveAppById(id)`
// resolves a Pin's own App id directly (as opposed to `resolveApp`, which
// resolves a Window's App from its class) and returns a falsy value when
// that App is no longer installed. Both `pins` and `resolveAppById` are
// optional; omitting them (as every pre-Pins caller does) reproduces the
// exact Launch-Order-only behaviour from before this ticket.
//
// A Pin's slot holds its own Window Items — in Launch Order among
// themselves — for as long as its App has any open Windows, and falls
// back to a single Pin Item (CONTEXT.md "Pin") the moment it doesn't. Pins
// occupy the Dock's leading slots in their persisted order; every Window
// belonging to an unpinned App follows in Launch Order, exactly as
// buildDockItems ordered every Window before Pins existed.

var SPECIAL_WORKSPACE_PREFIX = "special:";

function groupKeyFor(window, app) {
  return app ? "app:" + app.id : "class:" + window.class;
}

// resolveApp(window) is only ever used through this, so every caller sees
// the same falsy-to-null normalization instead of each repeating it.
function resolveWindowApp(window, resolveApp) {
  return resolveApp(window) || null;
}

// The workspace badge (docs/SPEC.md "Indicators"): the workspace name
// as-is for a regular workspace, or the special workspace's own name with
// Hyprland's "special:" prefix stripped.
function badgeFor(workspace) {
  var name = workspace || "";
  if (name.indexOf(SPECIAL_WORKSPACE_PREFIX) === 0) {
    return name.slice(SPECIAL_WORKSPACE_PREFIX.length) || name;
  }
  return name;
}

function toWindowItem(window, app, pinned) {
  return {
    kind: "window",
    key: "window:" + window.id,
    window: window,
    app: app,
    letter: app ? null : window.class ? window.class.charAt(0) : "",
    active: !!window.active,
    attention: !!window.attention,
    badge: badgeFor(window.workspace),
    // A Letter Tile Window can't be pinned (CONTEXT.md "Pin" needs an App
    // to hold a slot for).
    pinnable: !!app,
    // True for a Window Item occupying a Pin's slot (CONTEXT.md "Pin"):
    // its App is already pinned, so the menu shows Unpin rather than Pin.
    pinned: !!pinned,
  };
}

// The Pin Item shown in place of its Window Items once the last of them
// closes (CONTEXT.md "Pin"). `app` is the Pin's own App resolved directly
// by id, independent of any Window; a falsy `app` means the App is no
// longer installed, so `missing` drives the "missing" tooltip and the
// Letter Tile falls back to the Pin's own id the way a Window's Letter
// Tile falls back to its window class.
function toPinItem(pinId, app) {
  return {
    kind: "pin",
    key: "pin:" + pinId,
    appId: pinId,
    app: app || null,
    letter: app ? null : pinId ? pinId.charAt(0) : "",
    missing: !app,
    active: false,
    attention: false,
    badge: "",
  };
}

// Returns Window Items in Launch Order: windows are replayed oldest
// `openedAt` first, and each new Window is inserted right after the last
// Item of its own App (or, for a Window whose App can't be resolved, the
// last Item sharing its window class) instead of at the end of the list.
function buildWindowItems(windows, resolveApp, pinned, grouped) {
  var ordered = windows.slice().sort(function (a, b) {
    return a.openedAt - b.openedAt;
  });

  var items = [];
  var groupEnd = {};

  for (var i = 0; i < ordered.length; i++) {
    var window = ordered[i];
    var app = resolveWindowApp(window, resolveApp);
    var groupKey = groupKeyFor(window, app);
    var item = toWindowItem(window, app, pinned);

    var insertAt =
      groupKey in groupEnd ? groupEnd[groupKey] + 1 : items.length;
    items.splice(insertAt, 0, item);

    for (var key in groupEnd) {
      if (groupEnd[key] >= insertAt) {
        groupEnd[key] += 1;
      }
    }
    groupEnd[groupKey] = insertAt;
  }

  return grouped ? groupWindowItems(items) : items;
}

// Folds the Window Items of one App into a single Group Item (docs/SPEC.md
// "Grouping"). Launch Order keeps an App's Windows adjacent, so merging
// neighbours that share a group key is enough. Every Item gains `windows`
// (its Windows in Launch Order) and `count`. A Group Item of several
// Windows is keyed "group:<group key>" and stands for its Active Window, or
// else its most recently opened one; it is active or in Attention when any
// of its Windows is, and wears a workspace badge only when they all share
// one. A lone Window keeps its plain Window Item key.
function groupWindowItems(items) {
  var result = [];
  var i = 0;
  while (i < items.length) {
    var first = items[i];
    var key = groupKeyFor(first.window, first.app);
    var members = [first];
    while (
      i + members.length < items.length &&
      groupKeyFor(items[i + members.length].window, items[i + members.length].app) === key
    ) {
      members.push(items[i + members.length]);
    }
    i += members.length;

    var windows = members.map(function (m) {
      return m.window;
    });
    if (members.length === 1) {
      first.windows = windows;
      first.count = 1;
      result.push(first);
      continue;
    }

    var rep = members[members.length - 1];
    for (var m = 0; m < members.length; m++) {
      if (members[m].active) rep = members[m];
    }
    var badge = members.every(function (x) {
      return x.badge === first.badge;
    })
      ? first.badge
      : "";
    var group = Object.assign({}, rep, {
      key: "group:" + key,
      windows: windows,
      count: members.length,
      active: members.some(function (x) {
        return x.active;
      }),
      attention: members.some(function (x) {
        return x.attention;
      }),
      badge: badge,
    });
    result.push(group);
  }
  return result;
}

// Splits windows into the ones whose App is a Pin (bucketed by which Pin,
// preserving Pins' own order) and the rest, by resolved App id — the same
// identity buildWindowItems's own grouping already keys Window Items on.
function partitionByPin(windows, resolveApp, pinIds) {
  var slotIndexById = {};
  for (var i = 0; i < pinIds.length; i++) slotIndexById[pinIds[i]] = i;

  var pinnedSlots = pinIds.map(function () {
    return [];
  });
  var unpinned = [];

  for (var w = 0; w < windows.length; w++) {
    var window = windows[w];
    var app = resolveWindowApp(window, resolveApp);
    var slot = app ? slotIndexById[app.id] : undefined;
    if (slot !== undefined) pinnedSlots[slot].push(window);
    else unpinned.push(window);
  }

  return { pinnedSlots: pinnedSlots, unpinned: unpinned };
}

// Applies Placed positions (CONTEXT.md "Placed") as a final pass over an
// already-ordered Items array. Each `{ key, index }` in `placements` whose
// key matches a current Item pulls that Item out of its default slot;
// every such Item is then reinserted, ascending by its recorded `index`
// (ties keep `placements`' own order), clamped to the list's bounds so a
// stale index from before other Items came or went still lands somewhere
// sane rather than being dropped. Items with no matching placement keep
// their existing relative order around the reinserted ones. A placement
// whose key matches nothing (a closed Window, a Pin currently hidden
// behind its App's own Window Items) is silently ignored — this is what
// lets a Placed Pin's slot reassert itself the moment the bare Pin Item
// reappears, with no restart-detection logic needed here at all.
function applyPlacements(items, placements) {
  var list = Array.isArray(placements) ? placements : [];
  if (list.length === 0) return items;

  var byKey = {};
  for (var i = 0; i < items.length; i++) byKey[items[i].key] = items[i];

  var placedEntries = [];
  for (var p = 0; p < list.length; p++) {
    var entry = list[p];
    var item = entry && typeof entry.key === "string" ? byKey[entry.key] : null;
    if (item) placedEntries.push({ item: item, index: Number(entry.index) || 0 });
  }
  if (placedEntries.length === 0) return items;

  placedEntries.sort(function (a, b) {
    return a.index - b.index;
  });

  var placedKeys = {};
  for (var k = 0; k < placedEntries.length; k++) {
    placedKeys[placedEntries[k].item.key] = true;
  }

  var result = [];
  for (var r = 0; r < items.length; r++) {
    if (!placedKeys[items[r].key]) result.push(items[r]);
  }

  for (var e = 0; e < placedEntries.length; e++) {
    var target = Math.max(0, Math.min(placedEntries[e].index, result.length));
    result.splice(target, 0, placedEntries[e].item);
  }

  return result;
}

// Builds the Dock's Items: a Pin Item, or its App's own Window Items in
// Launch Order, for every Pin in the order `pins` lists them, followed by
// every other Window in Launch Order (docs/SPEC.md, "Ordering") — then
// `placements` (CONTEXT.md "Placed") is applied over that as a final pass.
// `pins`, `resolveAppById`, and `placements` are all optional; without
// them this is Launch Order alone, unchanged from before Pins existed.
// `grouped` (the `groupWindows` setting) folds each App's Windows into one
// Group Item.
function buildDockItems(windows, resolveApp, pins, resolveAppById, placements, grouped) {
  var pinIds = Array.isArray(pins) ? pins : [];
  var items;

  if (pinIds.length === 0) {
    items = buildWindowItems(windows, resolveApp, false, grouped);
  } else {
    var resolvePinnedApp = typeof resolveAppById === "function"
      ? resolveAppById
      : function () {
          return null;
        };
    var partitioned = partitionByPin(windows, resolveApp, pinIds);

    items = [];
    for (var s = 0; s < pinIds.length; s++) {
      var windowsForSlot = partitioned.pinnedSlots[s];
      if (windowsForSlot.length > 0) {
        items = items.concat(buildWindowItems(windowsForSlot, resolveApp, true, grouped));
      } else {
        items.push(toPinItem(pinIds[s], resolvePinnedApp(pinIds[s])));
      }
    }

    items = items.concat(buildWindowItems(partitioned.unpinned, resolveApp, false, grouped));
  }

  return applyPlacements(items, placements);
}

// The context menu's state for an Item (docs/SPEC.md "Input": "Right
// click: menu with exactly Pin/Unpin, New Window, Close Window. Pin is
// disabled on Letter Tile Items"). `pinned` tells Pin from Unpin: always
// true for a Pin Item (CONTEXT.md "Pin"), true for a Window Item occupying
// one's slot. `canPin` is false only for a Letter Tile Window Item, which
// has no App to hold a slot for — a Pin keeps Unpin enabled even once its
// own App goes missing, since Unpin is the only way to remove it.
// `canLaunch` mirrors "New Window launches another instance": there must
// be a resolved App to launch. `canClose` is true only for a Window Item;
// a bare Pin has no Window to close.
function menuFor(item) {
  var pinned = item.kind === "pin" || !!item.pinned;
  return {
    pinned: pinned,
    canPin: item.kind === "pin" ? true : !!item.pinnable,
    canLaunch: !!item.app,
    canClose: item.kind === "window",
  };
}

// The Window-state rows of an Item's context menu (docs/SPEC.md "Input"):
// each is { id, label }, in menu order. Labels flip to their undo while the
// state is on (Maximize/Restore, Full screen/Exit full screen, Float/Tile,
// Pin on top/Unpin from top). Center and Pin on top only make sense for a
// floating window; Move to scratchpad is hidden once there. Service.qml
// maps each id to its Hyprland dispatch.
function windowActions(window) {
  if (!window) return [];
  var fullscreen = Number(window.fullscreen) || 0;
  var actions = [
    { id: "maximize", label: fullscreen === 1 ? "Restore" : "Maximize" },
    { id: "fullscreen", label: fullscreen === 2 ? "Exit full screen" : "Full screen" },
    { id: "float", label: window.floating ? "Tile" : "Float" },
  ];
  if (window.floating) {
    actions.push({ id: "center", label: "Center" });
    actions.push({ id: "pin", label: window.pinned ? "Unpin from top" : "Pin on top" });
  }
  if (String(window.workspace || "") !== "special:scratchpad") {
    actions.push({ id: "scratchpad", label: "Move to scratchpad" });
  }
  return actions;
}

// The Placed positions after dropping the Item `key` at slot `index` of the
// Items as shown. Every Placed position is an index into the finished list, so
// moving one Item shifts the others: each Item that is Placed is rewritten to
// the slot it has now, which is what keeps a rebuild showing the order the
// drop made. A Placed position whose Item is not shown (a closed Window, a Pin
// behind its App's Windows) is kept as it is.
function movedPlacements(items, placements, key, index) {
  var order = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].key !== key) order.push(items[i].key);
  }
  order.splice(Math.max(0, Math.min(index, order.length)), 0, key);

  var slotOf = {};
  for (var s = 0; s < order.length; s++) slotOf[order[s]] = s;

  var result = [];
  var list = Array.isArray(placements) ? placements : [];
  for (var p = 0; p < list.length; p++) {
    var entry = list[p];
    if (!entry || entry.key === key) continue;
    result.push(slotOf[entry.key] === undefined ? entry : { key: entry.key, index: slotOf[entry.key] });
  }
  result.push({ key: key, index: slotOf[key] });
  return result;
}

// Any app can set its window's title and class to anything, however long, and
// the Dock lays them out in tooltips and Previews: cap what it takes in.
var MAX_WINDOW_TEXT = 256;

function clipText(text, max) {
  var s = typeof text === "string" ? text : "";
  var limit = max === undefined ? MAX_WINDOW_TEXT : max;
  return s.length > limit ? s.slice(0, limit) : s;
}

// A Chromium-family browser's web app Window (Omarchy's Super+Space "X",
// "YouTube"...) is classed "<browser>-<host>__<path>-<profile>", but Omarchy's
// own desktop entries always say StartupWMClass=chrome-..., whatever the
// browser. So an Edge web app's "msedge-x.com__-Default" matches nothing until
// it is looked up as "chrome-x.com__-Default". null for any other class.
var BROWSER_APP_CLASS = /^(?:msedge|microsoft-edge|brave|vivaldi|opera|helium|google-chrome|chromium)-([^_]+__.*)$/;

function chromeAppClass(windowClass) {
  var match = BROWSER_APP_CLASS.exec(String(windowClass || ""));
  return match ? "chrome-" + match[1] : null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    chromeAppClass: chromeAppClass,
    MAX_WINDOW_TEXT: MAX_WINDOW_TEXT,
    clipText: clipText,
    buildDockItems: buildDockItems,
    windowActions: windowActions,
    movedPlacements: movedPlacements,
    menuFor: menuFor,
  };
}
