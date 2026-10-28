// Pure Start menu app list (docs/SPEC.md "Start menu"; vocabulary in
// CONTEXT.md). No Quickshell or QML imports, so the exact same file loads as a
// JS import inside the shell and via `require` under Node for the test suite.
//
// What the view lists: search results (`filterApps`), the A-Z groups and jump
// letters, and the saved pins and recents mapped to installed Apps (`catalog`,
// `resolveApps`). StartMenu.js decides what the menu does with them.

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

// --- Catalog ----------------------------------------------------------------
//
// What the view lists, derived from the flattened desktop entries. Built once
// per app-list change; `resolveApps` then maps saved ids (pins, recents) to
// the Apps that are still installed.

function catalog(apps) {
  var list = Array.isArray(apps) ? apps : [];
  var byId = {};
  for (var i = 0; i < list.length; i++) byId[list[i].id] = list[i];
  var groups = groupAlphabetically(list);
  var allFlat = [];
  for (var g = 0; g < groups.length; g++) {
    for (var a = 0; a < groups[g].apps.length; a++) {
      var app = groups[g].apps[a];
      allFlat.push({ id: app.id, name: app.name, icon: app.icon, entry: app.entry, letter: groups[g].letter });
    }
  }
  return { byId: byId, allFlat: allFlat, letterRows: letterIndex(allFlat) };
}

function resolveApps(cat, ids) {
  var out = [];
  var list = Array.isArray(ids) ? ids : [];
  for (var i = 0; i < list.length; i++) {
    if (cat.byId[list[i]]) out.push(cat.byId[list[i]]);
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    catalog: catalog,
    resolveApps: resolveApps,
    filterApps: filterApps,
  };
}
