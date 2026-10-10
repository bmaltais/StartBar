// Pure Start menu logic (docs/SPEC.md "Start menu"; vocabulary in CONTEXT.md).
// No Quickshell or QML imports, so the exact same file loads as a JS import
// inside the shell and via `require` under Node for the test suite.
//
// Everything the built-in Start menu decides without touching the screen:
// search and A-Z grouping, keyboard selection, the pinned-grid drag (slot
// under the ghost, then the reordered list), recents, the Places column and
// the user/power menus. Service.qml only reads the results and paints them.

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(value) {
  var raw = Array.isArray(value) ? value : [];
  var seen = {};
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    if (typeof raw[i] === "string" && raw[i].length > 0 && !seen[raw[i]]) {
      seen[raw[i]] = true;
      out.push(raw[i]);
    }
  }
  return out;
}

// The built-in Start menu's app list (docs/SPEC.md "Start menu"): `apps` are
// plain { id, name, genericName, keywords, noDisplay } objects (Service.qml
// flattens DesktopEntries into them); `query` is what the user typed.
// Hidden entries never show. Ranking: name prefix, then name substring,
// then generic name / keyword / id substring; ties alphabetical by name.
// An empty query lists everything alphabetically.
function filterApps(apps, query) {
  var list = Array.isArray(apps) ? apps : [];
  var needle = String(query || "").trim().toLowerCase();
  var scored = [];
  for (var i = 0; i < list.length; i++) {
    var app = list[i];
    if (!app || app.noDisplay) continue;
    var name = String(app.name || "").toLowerCase();
    var rank = 0;
    if (needle) {
      if (name.indexOf(needle) === 0) rank = 0;
      else if (name.indexOf(needle) > 0) rank = 1;
      else {
        var haystack = [app.genericName, app.id].concat(app.keywords || []).join("\n").toLowerCase();
        if (haystack.indexOf(needle) < 0) continue;
        rank = 2;
      }
    }
    scored.push({ app: app, rank: rank, name: name });
  }
  scored.sort(function (a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  return scored.map(function (entry) { return entry.app; });
}

// The Start menu's "All apps" view: displayable apps grouped under their
// first letter (non-letters under "#"), "#" first, apps alphabetical.
function groupAlphabetically(apps) {
  var list = Array.isArray(apps) ? apps : [];
  var buckets = {};
  for (var i = 0; i < list.length; i++) {
    var app = list[i];
    if (!app || app.noDisplay) continue;
    var first = String(app.name || "").charAt(0).toUpperCase();
    var letter = /[A-Z]/.test(first) ? first : "#";
    if (!buckets[letter]) buckets[letter] = [];
    buckets[letter].push(app);
  }
  return Object.keys(buckets).sort().map(function (letter) {
    buckets[letter].sort(function (a, b) {
      var x = String(a.name).toLowerCase();
      var y = String(b.name).toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    });
    return { letter: letter, apps: buckets[letter] };
  });
}

// The Start menu's Recommended list after launching `appId`: most recent
// first, no duplicates, at most `max` (default 6).
function pushRecent(recent, appId, max) {
  var list = Array.isArray(recent) ? recent.slice() : [];
  if (typeof appId !== "string" || appId.length === 0) return list;
  list = list.filter(function (id) { return id !== appId; });
  list.unshift(appId);
  return list.slice(0, max || 6);
}

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

// For the All apps A-Z jump: each letter's first position in the flattened
// list (`flat` entries carry a `letter`, as Service.qml builds them).
function letterIndex(flat) {
  var list = Array.isArray(flat) ? flat : [];
  var map = {};
  for (var i = 0; i < list.length; i++) {
    if (!(list[i].letter in map)) map[list[i].letter] = i;
  }
  return map;
}

// The account's real name from a `getent passwd` line (the fifth,
// comma-separated field's first part), else `fallback`.
function parseFullName(passwdLine, fallback) {
  var line = String(passwdLine || "").split("\n")[0];
  var fields = line.split(":");
  var name = fields.length > 4 ? fields[4].split(",")[0].trim() : "";
  return name.length > 0 ? name : fallback;
}

// The Start menu's own pinned list (separate from the Dock's Pins); an entry
// with no `startPins` key starts out showing the Dock's Pins.
function effectiveStartPins(entry, dockPins) {
  var source = isPlainObject(entry) ? entry : {};
  return Array.isArray(source.startPins) ? uniqueStrings(source.startPins) : uniqueStrings(dockPins);
}

function effectiveRecent(entry) {
  return uniqueStrings(isPlainObject(entry) ? entry.recentApps : null);
}

// The menu behind the user's name in the Start menu (Windows 11 offers lock
// and sign out there).
function startUserActions() {
  return [
    { label: "Lock", command: "omarchy-system-lock" },
    { label: "Sign out", command: "omarchy-system-logout" },
  ];
}

function startPowerActions() {
  return [
    { label: "Sleep", command: "systemctl suspend" },
    { label: "Restart", command: "omarchy-system-reboot" },
    { label: "Shut down", command: "omarchy-system-shutdown" },
  ];
}

var PLACE_DEFAULTS = [
  { key: "XDG_DOCUMENTS_DIR", label: "Documents", folder: "Documents", icon: "folder-documents" },
  { key: "XDG_DOWNLOAD_DIR", label: "Downloads", folder: "Downloads", icon: "folder-download" },
  { key: "XDG_PICTURES_DIR", label: "Pictures", folder: "Pictures", icon: "folder-pictures" },
  { key: "XDG_MUSIC_DIR", label: "Music", folder: "Music", icon: "folder-music" },
  { key: "XDG_VIDEOS_DIR", label: "Videos", folder: "Videos", icon: "folder-videos" },
];

function trimSlashes(path) {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function parseUserDirs(text, home) {
  var dirs = {};
  var lines = String(text || "").split("\n");
  for (var i = 0; i < lines.length; i++) {
    var match = /^\s*(XDG_[A-Z]+_DIR)="(.*)"\s*$/.exec(lines[i]);
    if (match) dirs[match[1]] = trimSlashes(match[2].replace(/\$HOME/g, home));
  }
  return dirs;
}

// The Start menu's Places column (docs/SPEC.md "Start menu"): Home plus the
// user's XDG folders, each { label, path, icon }. A `startPlaces` list of
// paths (~ allowed) replaces the defaults; an empty one hides the column.
// XDG folders that are just Home itself (an unset Desktop, say) are skipped.
function effectivePlaces(entry, userDirsText, home) {
  var source = isPlainObject(entry) ? entry : {};
  if (Array.isArray(source.startPlaces)) {
    var seen = {};
    var custom = [];
    for (var i = 0; i < source.startPlaces.length; i++) {
      var raw = source.startPlaces[i];
      if (typeof raw !== "string" || raw.trim().length === 0) continue;
      var path = trimSlashes(raw.trim().replace(/^~(?=\/|$)/, home));
      if (seen[path]) continue;
      seen[path] = true;
      custom.push({ label: path.split("/").pop() || path, path: path, icon: "folder" });
    }
    return custom;
  }
  var dirs = parseUserDirs(userDirsText, home);
  var places = [{ label: "Home", path: home, icon: "user-home" }];
  for (var j = 0; j < PLACE_DEFAULTS.length; j++) {
    var d = PLACE_DEFAULTS[j];
    var dir = dirs[d.key] || home + "/" + d.folder;
    if (dir === home) continue;
    places.push({ label: d.label, path: dir, icon: d.icon });
  }
  return places;
}

// Drag to reorder a pinned app. `point` is the ghost's centre in the grid's
// own coordinates ({ x, y }); `grid` is { width, height, cellWidth,
// cellHeight, contentY } with contentY the scroll offset. Returns the slot
// under it, clamped to the pins shown, or -1 outside the grid.
function pinSlotAt(point, grid, count, columns) {
  var cols = columns > 0 ? columns : PINNED_COLUMNS;
  if (!point || !grid || !(count > 0)) return -1;
  if (point.x < 0 || point.x >= grid.width || point.y < 0 || point.y >= grid.height) return -1;
  var column = Math.floor(point.x / grid.cellWidth);
  var row = Math.floor((point.y + (grid.contentY || 0)) / grid.cellHeight);
  return Math.max(0, Math.min(count - 1, row * cols + column));
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PINNED_COLUMNS: PINNED_COLUMNS,
    filterApps: filterApps,
    groupAlphabetically: groupAlphabetically,
    pushRecent: pushRecent,
    moveItem: moveItem,
    moveSelection: moveSelection,
    letterIndex: letterIndex,
    parseFullName: parseFullName,
    pinSlotAt: pinSlotAt,
    reorderedPins: reorderedPins,
    effectiveStartPins: effectiveStartPins,
    effectiveRecent: effectiveRecent,
    startUserActions: startUserActions,
    startPowerActions: startPowerActions,
    effectivePlaces: effectivePlaces,
  };
}
