// Dock settings (see docs/SPEC.md "Configuration"; vocabulary in CONTEXT.md).
// No Quickshell or QML imports, so the exact same file loads as a JS import
// inside the shell and via `require` under Node for the test suite, same as
// DockModel.js.
//
// Settings live in the Dock's own entry in the shell config's `plugins[]`
// array: `{ id: "bernard.dock", iconSize, revealDelayMs, hideDelayMs, pins }`.
// findPluginEntry locates that entry (or null if the Dock has never been
// enabled or the config can't be read); effectiveSettings turns it into the
// three settings the Dock actually uses, defaulting anything missing or not
// a usable positive number. effectivePins reads the same entry's `pins`
// (the ordered array of App ids DockModel.js's buildDockItems takes),
// cleaned of anything a hand edit could leave unusable — not a string, or
// a duplicate that would give two slots to the same App. effectivePlacements
// reads the entry's `placements` (a Placed Pin's `{ key, index }`,
// CONTEXT.md "Placed"; DockModel.js's placeAt/unplace compute the next
// value for a write-back) — only entries keyed "pin:...", since a Placed
// Window Item's position (docs/SPEC.md "Ordering") lives only in memory
// for as long as its Window stays open and is never written here.
// mergeSettings folds a settings change onto the raw entry rather than
// replacing it outright, so keys a change doesn't mention (pins and
// placements included, when the change is only to icon size or a delay)
// survive a write-back.

var DEFAULT_ICON_SIZE = 48;
var DEFAULT_REVEAL_DELAY_MS = 200;
var DEFAULT_HIDE_DELAY_MS = 300;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function positiveNumberOr(value, fallback) {
  var number = Number(value);
  return isFinite(number) && number > 0 ? number : fallback;
}

function findPluginEntry(shellConfig, pluginId) {
  var plugins =
    isPlainObject(shellConfig) && Array.isArray(shellConfig.plugins)
      ? shellConfig.plugins
      : [];
  for (var i = 0; i < plugins.length; i++) {
    if (isPlainObject(plugins[i]) && plugins[i].id === pluginId) {
      return plugins[i];
    }
  }
  return null;
}

function effectiveSettings(entry) {
  var source = isPlainObject(entry) ? entry : {};
  return {
    iconSize: positiveNumberOr(source.iconSize, DEFAULT_ICON_SIZE),
    revealDelayMs: positiveNumberOr(
      source.revealDelayMs,
      DEFAULT_REVEAL_DELAY_MS,
    ),
    hideDelayMs: positiveNumberOr(source.hideDelayMs, DEFAULT_HIDE_DELAY_MS),
  };
}

function effectivePins(entry) {
  var source = isPlainObject(entry) ? entry : {};
  var rawPins = Array.isArray(source.pins) ? source.pins : [];
  var seen = {};
  var pins = [];
  for (var i = 0; i < rawPins.length; i++) {
    var id = rawPins[i];
    if (typeof id === "string" && id.length > 0 && !seen[id]) {
      seen[id] = true;
      pins.push(id);
    }
  }
  return pins;
}

function effectivePlacements(entry) {
  var source = isPlainObject(entry) ? entry : {};
  var rawPlacements = Array.isArray(source.placements) ? source.placements : [];
  var seen = {};
  var placements = [];
  for (var i = 0; i < rawPlacements.length; i++) {
    var candidate = rawPlacements[i];
    if (!isPlainObject(candidate)) continue;
    var key = candidate.key;
    var index = Number(candidate.index);
    if (typeof key !== "string" || key.indexOf("pin:") !== 0) continue;
    if (seen[key]) continue;
    if (!isFinite(index) || index < 0) continue;
    seen[key] = true;
    placements.push({ key: key, index: Math.floor(index) });
  }
  return placements;
}

// Taskbar style (docs/SPEC.md "Taskbar style"). `style` picks between the
// original floating dock and the Windows-11-like bar; everything else here
// only matters to the bar, except autoHide, which the dock always has.
var DEFAULT_BAR_HEIGHT = 48;
var DEFAULT_OPACITY = 0.9;
var DEFAULT_START_COMMAND = "omarchy-menu toggle apps";
var DEFAULT_START_ICON = "grid";

function oneOf(value, allowed, fallback) {
  return allowed.indexOf(value) >= 0 ? value : fallback;
}

function booleanOr(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function nonBlankStringOr(value, fallback) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function opacityOr(value, fallback) {
  if (typeof value !== "number" || !isFinite(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

function effectiveTaskbar(entry) {
  var source = isPlainObject(entry) ? entry : {};
  var style = oneOf(source.style, ["dock", "taskbar"], "dock");
  return {
    style: style,
    alignment: oneOf(source.alignment, ["center", "left"], "center"),
    colorScheme: oneOf(source.colorScheme, ["theme", "dark", "light"], "theme"),
    autoHide: style === "dock" ? true : booleanOr(source.autoHide, false),
    barHeight: positiveNumberOr(source.barHeight, DEFAULT_BAR_HEIGHT),
    opacity: opacityOr(source.opacity, DEFAULT_OPACITY),
    transparent: booleanOr(source.transparent, false),
    showStart: booleanOr(source.showStart, true),
    startCommand: nonBlankStringOr(source.startCommand, DEFAULT_START_COMMAND),
    startIcon: nonBlankStringOr(source.startIcon, DEFAULT_START_ICON),
    showClock: booleanOr(source.showClock, true),
    showPreviews: booleanOr(source.showPreviews, true),
    previewWarpPointer: booleanOr(source.previewWarpPointer, true),
    showWorkspaceBadge: booleanOr(source.showWorkspaceBadge, false),
  };
}

// null means "use the Omarchy theme"; otherwise a fixed palette in the same
// roles the bar reads from the theme.
function schemeColors(scheme) {
  if (scheme === "dark") {
    return { background: "#202020", foreground: "#ffffff", muted: "#3b3b3b", accent: "#60cdff", border: "#2f2f2f" };
  }
  if (scheme === "light") {
    return { background: "#f3f3f3", foreground: "#1a1a1a", muted: "#d9d9d9", accent: "#005fb8", border: "#e0e0e0" };
  }
  return null;
}

var ICON_ALIASES = { arch: "archlinux", linux: "tux" };

function resolveStartIcon(value) {
  var name = nonBlankStringOr(value, DEFAULT_START_ICON);
  if (name === "grid") return { kind: "grid" };
  if (name.charAt(0) === "/") return { kind: "path", value: name };
  return { kind: "icon", value: ICON_ALIASES[name] || name };
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

// The rows of the bar's right-click menu (docs/SPEC.md "Taskbar style"): each
// is { label, checked, patch, group }, where patch is what to hand to
// mergeSettings/write when it's chosen and group lets the menu draw a
// divider between runs of related rows.
// Opens the full settings window (docs/SPEC.md "Settings window"): an
// `action` rather than a `patch`, since there is no single setting to write.
var SETTINGS_ROW = { label: "Settings\u2026", checked: false, action: "settings", group: 9 };

function barMenuRows(taskbar) {
  function toggle(label, key, group) {
    var patch = {};
    patch[key] = !taskbar[key];
    return { label: label, checked: !!taskbar[key], patch: patch, group: group };
  }
  function choice(label, key, value, group) {
    var patch = {};
    patch[key] = value;
    return { label: label, checked: taskbar[key] === value, patch: patch, group: group };
  }
  if (taskbar.style !== "taskbar") {
    return [
      { label: "Switch to taskbar style", checked: false, patch: { style: "taskbar" }, group: 0 },
      SETTINGS_ROW,
    ];
  }
  return [
    choice("Center icons", "alignment", "center", 0),
    choice("Left-align icons", "alignment", "left", 0),
    choice("Theme colors", "colorScheme", "theme", 1),
    choice("Dark colors", "colorScheme", "dark", 1),
    choice("Light colors", "colorScheme", "light", 1),
    {
      label: "Built-in Start menu",
      checked: taskbar.startCommand === "builtin",
      patch: { startCommand: "builtin" },
      group: 2,
    },
    {
      label: "Omarchy menu on Start",
      checked: taskbar.startCommand !== "builtin",
      patch: { startCommand: DEFAULT_START_COMMAND },
      group: 2,
    },
    toggle("Auto-hide", "autoHide", 2),
    toggle("Start button", "showStart", 2),
    toggle("Clock", "showClock", 2),
    toggle("Window previews", "showPreviews", 2),
    toggle("Pointer follows preview click", "previewWarpPointer", 2),
    toggle("Workspace badge", "showWorkspaceBadge", 2),
    toggle("Transparent background", "transparent", 2),
    SETTINGS_ROW,
  ];
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

function mergeSettings(entry, patch) {
  var next = {};
  var source = isPlainObject(entry) ? entry : {};
  var updates = isPlainObject(patch) ? patch : {};
  for (var key in source) next[key] = source[key];
  // A patched value of undefined or null removes the key, so a setting can
  // be put back to its default (the settings window's reset).
  for (var patchKey in updates) {
    if (updates[patchKey] === undefined || updates[patchKey] === null) delete next[patchKey];
    else next[patchKey] = updates[patchKey];
  }
  return next;
}


// The settings window's contents (docs/SPEC.md "Settings window"): groups of
// fields, each { key, label, type, ... } with type one of bool, choice
// (options: [{ value, label }]), int and slider (min, max, step), text and
// list. Pins, Placed positions, startPins and recentApps are not here: the
// Dock and Start menu manage those themselves. A test checks this covers
// exactly the keys effectiveSettings/effectiveTaskbar understand.
function settingsSchema() {
  return [
    {
      title: "Appearance",
      fields: [
        {
          key: "style", label: "Style", type: "choice",
          options: [{ value: "dock", label: "Dock" }, { value: "taskbar", label: "Taskbar" }],
          hint: "Floating dock, or a full-width Windows 11-style bar",
        },
        {
          key: "alignment", label: "Icon alignment", type: "choice",
          options: [{ value: "center", label: "Center" }, { value: "left", label: "Left" }],
          hint: "Taskbar only",
        },
        {
          key: "colorScheme", label: "Colors", type: "choice",
          options: [{ value: "theme", label: "Theme" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }],
          hint: "Follow the Omarchy theme, or a fixed palette",
        },
        { key: "barHeight", label: "Bar height", type: "int", min: 24, max: 96, step: 2, unit: "px", hint: "Taskbar only" },
        { key: "iconSize", label: "Icon size", type: "int", min: 16, max: 128, step: 2, unit: "px" },
        { key: "opacity", label: "Bar opacity", type: "slider", min: 0, max: 1, step: 0.05, hint: "Taskbar only" },
        { key: "transparent", label: "Transparent bar", type: "bool", hint: "Icons only, no background (taskbar)" },
        { key: "showWorkspaceBadge", label: "Workspace badge", type: "bool", hint: "Workspace number or name over each icon" },
      ],
    },
    {
      title: "Behavior",
      fields: [
        { key: "autoHide", label: "Auto-hide", type: "bool", hint: "Taskbar only; the dock always auto-hides" },
        { key: "revealDelayMs", label: "Reveal delay", type: "int", min: 50, max: 2000, step: 50, unit: "ms", hint: "Pointer rests on the edge this long" },
        { key: "hideDelayMs", label: "Hide delay", type: "int", min: 50, max: 3000, step: 50, unit: "ms", hint: "After the pointer leaves" },
        { key: "showClock", label: "Clock", type: "bool", hint: "Taskbar only" },
        { key: "showPreviews", label: "Window previews", type: "bool", hint: "Hover thumbnails (taskbar)" },
        { key: "previewWarpPointer", label: "Pointer follows preview click", type: "bool", hint: "Move the pointer into the window you click" },
      ],
    },
    {
      title: "Start menu",
      fields: [
        { key: "showStart", label: "Start button", type: "bool", hint: "Taskbar only" },
        { key: "startCommand", label: "Start button action", type: "text", hint: "\"builtin\" for the built-in menu, or a shell command" },
        { key: "startIcon", label: "Start icon", type: "text", hint: "grid, omarchy, arch, linux, an icon name, or an image path" },
        { key: "startPlaces", label: "Places", type: "list", hint: "Folders in the Start menu's left column" },
      ],
    },
  ];
}

// Every schema field's current effective value for a config entry. Unset
// startPlaces stays null: the Start menu then uses the XDG folders.
function settingsValues(entry) {
  var values = {};
  var base = effectiveSettings(entry);
  var bar = effectiveTaskbar(entry);
  for (var k in base) values[k] = base[k];
  for (var t in bar) values[t] = bar[t];
  var source = isPlainObject(entry) ? entry : {};
  values.startPlaces = Array.isArray(source.startPlaces) ? uniqueStrings(source.startPlaces) : null;
  return values;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_ICON_SIZE: DEFAULT_ICON_SIZE,
    DEFAULT_REVEAL_DELAY_MS: DEFAULT_REVEAL_DELAY_MS,
    DEFAULT_HIDE_DELAY_MS: DEFAULT_HIDE_DELAY_MS,
    findPluginEntry: findPluginEntry,
    effectiveSettings: effectiveSettings,
    effectivePins: effectivePins,
    effectivePlacements: effectivePlacements,
    mergeSettings: mergeSettings,
    effectiveTaskbar: effectiveTaskbar,
    schemeColors: schemeColors,
    resolveStartIcon: resolveStartIcon,
    barMenuRows: barMenuRows,
    settingsSchema: settingsSchema,
    settingsValues: settingsValues,
    effectiveStartPins: effectiveStartPins,
    effectiveRecent: effectiveRecent,
    startPowerActions: startPowerActions,
    startUserActions: startUserActions,
    effectivePlaces: effectivePlaces,
  };
}
