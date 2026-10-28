// Pure Start menu Places (docs/SPEC.md "Start menu"; vocabulary in
// CONTEXT.md). No Quickshell or QML imports, so the exact same file loads as a
// JS import inside the shell and via `require` under Node for the test suite.
//
// The folders the Start menu lists beside the power button: the user's XDG
// folders from `user-dirs.dirs`, or a `startPlaces` list from the settings.

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
function effectivePlaces(startPlaces, userDirsText, home) {
  if (Array.isArray(startPlaces)) {
    var seen = {};
    var custom = [];
    for (var i = 0; i < startPlaces.length; i++) {
      var raw = startPlaces[i];
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    effectivePlaces: effectivePlaces,
  };
}
