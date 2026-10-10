// Dock settings (see docs/SPEC.md "Configuration"; vocabulary in CONTEXT.md).
// No Quickshell or QML imports, so the exact same file loads as a JS import
// inside the shell and via `require` under Node for the test suite, same as
// DockModel.js.
//
// Settings live in the Dock's own entry in the shell config's `plugins[]`
// array: `{ id: "io.github.bmaltais.startbar", iconSize, revealDelayMs, hideDelayMs, pins,
// placements, startPins, recentApps, startPlaces, ...bar settings }`.
// This file is the one place that knows those keys and their defaults, and
// its interface is two functions:
//
//   effectiveView(entry)       the raw entry -> everything any reader needs
//                              (settings, taskbar, Pins, Placed positions,
//                              Start pins, recent apps, Start places),
//                              defaulting anything missing or hand-edited
//                              into something unusable.
//   applyIntent(entry, intent) a named intent -> the next entry. Callers
//                              say what happened ("pinApp", "placeItem",
//                              "setSettings"...), never which keys change.
//
// findPluginEntry locates the entry (or null if the Dock has never been
// enabled or the config can't be read). An intent folds onto the whole
// entry rather than replacing it, so keys it doesn't mention survive a
// write-back. A Placed Pin's `{ key, index }` (CONTEXT.md "Placed") is the
// only placement persisted: a Placed Window Item's position (docs/SPEC.md
// "Ordering") lives in memory for as long as its Window stays open.

var DEFAULT_ICON_SIZE = 48;
var DEFAULT_REVEAL_DELAY_MS = 200;
var DEFAULT_HIDE_DELAY_MS = 300;

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
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

// The bar's settings (docs/SPEC.md "The bar").
var DEFAULT_BAR_HEIGHT = 48;
var DEFAULT_OPACITY = 0.9;
var DEFAULT_START_COMMAND = "builtin";
var OMARCHY_MENU_COMMAND = "omarchy-menu toggle apps";
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
  return {
    alignment: oneOf(source.alignment, ["center", "left"], "center"),
    colorScheme: oneOf(source.colorScheme, ["theme", "dark", "light"], "theme"),
    autoHide: booleanOr(source.autoHide, false),
    barHeight: positiveNumberOr(source.barHeight, DEFAULT_BAR_HEIGHT),
    opacity: opacityOr(source.opacity, DEFAULT_OPACITY),
    transparent: booleanOr(source.transparent, false),
    showStart: booleanOr(source.showStart, true),
    startCommand: nonBlankStringOr(source.startCommand, DEFAULT_START_COMMAND),
    startIcon: nonBlankStringOr(source.startIcon, DEFAULT_START_ICON),
    showClock: booleanOr(source.showClock, false),
    showPreviews: booleanOr(source.showPreviews, true),
    previewWarpPointer: booleanOr(source.previewWarpPointer, true),
    showWorkspaceBadge: booleanOr(source.showWorkspaceBadge, false),
    startHoverOpen: booleanOr(source.startHoverOpen, true),
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


// The longest label among menu rows (objects with a `label`) or plain strings,
// so a menu can be sized to fit it. By character count: Omarchy's menu font is
// monospace, and a proportional one only needs the width as a close estimate
// (Service.qml adds slack).
function longestLabel(items) {
  var list = Array.isArray(items) ? items : [];
  var best = "";
  for (var i = 0; i < list.length; i++) {
    var item = list[i];
    var text = typeof item === "string" ? item : item && typeof item.label === "string" ? item.label : "";
    if (text.length > best.length) best = text;
  }
  return best;
}

// The rows of the bar's right-click menu (docs/SPEC.md "The bar"): each
// is { label, checked, patch, group }, where patch is the `setSettings` patch
// to apply when it's chosen and group lets the menu draw a
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
  return [
    choice("Center icons", "alignment", "center", 0),
    choice("Left-align icons", "alignment", "left", 0),
    choice("Theme colors", "colorScheme", "theme", 1),
    choice("Dark colors", "colorScheme", "dark", 1),
    choice("Light colors", "colorScheme", "light", 1),
    toggle("Start button", "showStart", 2),
    {
      label: "Built-in Start menu",
      checked: taskbar.startCommand === "builtin",
      patch: { startCommand: "builtin" },
      group: 2,
    },
    {
      label: "Omarchy menu on Start",
      checked: taskbar.startCommand !== "builtin",
      patch: { startCommand: OMARCHY_MENU_COMMAND },
      group: 2,
    },
    toggle("Start menu opens on hover", "startHoverOpen", 2),
    toggle("Auto-hide", "autoHide", 3),
    toggle("Clock", "showClock", 3),
    toggle("Window previews", "showPreviews", 3),
    toggle("Pointer follows preview click", "previewWarpPointer", 3),
    toggle("Workspace badge", "showWorkspaceBadge", 3),
    toggle("Transparent background", "transparent", 3),
    SETTINGS_ROW,
  ];
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
// exactly the keys effectiveView understands.
function settingsSchema() {
  return [
    {
      title: "Appearance",
      fields: [
        {
          key: "alignment", label: "Icon alignment", type: "choice",
          options: [{ value: "center", label: "Center" }, { value: "left", label: "Left" }],
        },
        {
          key: "colorScheme", label: "Colors", type: "choice",
          options: [{ value: "theme", label: "Theme" }, { value: "dark", label: "Dark" }, { value: "light", label: "Light" }],
          hint: "Follow the Omarchy theme, or a fixed palette",
        },
        { key: "barHeight", label: "Bar height", type: "int", min: 24, max: 96, step: 2, unit: "px" },
        { key: "iconSize", label: "Icon size", type: "int", min: 16, max: 128, step: 2, unit: "px", hint: "Largest icon; icons also fit inside the bar height" },
        { key: "opacity", label: "Bar opacity", type: "slider", min: 0, max: 1, step: 0.05 },
        { key: "transparent", label: "Transparent bar", type: "bool", hint: "Icons only, no background" },
        { key: "showWorkspaceBadge", label: "Workspace badge", type: "bool", hint: "Workspace number or name over each icon" },
      ],
    },
    {
      title: "Behavior",
      fields: [
        { key: "autoHide", label: "Auto-hide", type: "bool", hint: "Hide the bar until the pointer rests on the bottom edge" },
        { key: "revealDelayMs", label: "Reveal delay", type: "int", min: 50, max: 2000, step: 50, unit: "ms", hint: "Pointer rests on the edge this long" },
        { key: "hideDelayMs", label: "Hide delay", type: "int", min: 50, max: 3000, step: 50, unit: "ms", hint: "After the pointer leaves" },
        { key: "showClock", label: "Clock", type: "bool" },
        { key: "showPreviews", label: "Window previews", type: "bool", hint: "Hover thumbnails" },
        { key: "previewWarpPointer", label: "Pointer follows preview click", type: "bool", hint: "Move the pointer into the window you click" },
      ],
    },
    {
      title: "Start menu",
      fields: [
        { key: "showStart", label: "Start button", type: "bool" },
        { key: "startHoverOpen", label: "Open built-in menu on hover", type: "bool", hint: "Rest the pointer on the Start button to open it (built-in menu only)" },
        { key: "startCommand", label: "Start button action", type: "text", hint: "\"builtin\" for the built-in menu, or a shell command" },
        { key: "startIcon", label: "Start icon", type: "text", hint: "grid, omarchy, arch, linux, an icon name, or an image path" },
        { key: "startPlaces", label: "Places", type: "list", hint: "Folders in the Start menu's left column" },
      ],
    },
  ];
}

// The complete effective view of a config entry (see the header). `settings`
// and `taskbar` are the Dock's own values; `values` is every settings-window
// field's current value in one object, with an unset startPlaces left null
// (the Start menu then uses the XDG folders, as `startPlaces` does here).
// A Start menu with no `startPins` of its own starts out showing the Pins.
function effectiveView(entry) {
  var source = isPlainObject(entry) ? entry : {};
  var settings = effectiveSettings(source);
  var taskbar = effectiveTaskbar(source);
  var pins = uniqueStrings(source.pins);
  var startPlaces = Array.isArray(source.startPlaces) ? uniqueStrings(source.startPlaces) : null;
  var values = {};
  for (var k in settings) values[k] = settings[k];
  for (var t in taskbar) values[t] = taskbar[t];
  values.startPlaces = startPlaces;
  return {
    settings: settings,
    taskbar: taskbar,
    pins: pins,
    placements: effectivePlacements(source),
    startPins: Array.isArray(source.startPins) ? uniqueStrings(source.startPins) : pins.slice(),
    recentApps: uniqueStrings(source.recentApps),
    startPlaces: startPlaces,
    values: values,
  };
}

var MAX_RECENT_APPS = 6;

// `list` with `id` added at the end, unless it is already there.
function withId(list, id) {
  return list.indexOf(id) === -1 ? list.concat([id]) : list.slice();
}

// `list` without `id`; a no-op when it isn't there.
function withoutId(list, id) {
  return list.filter(function (other) { return other !== id; });
}

// `placements` with `key` recorded at `index`: a re-drag of an already-Placed
// Item moves it rather than stacking a second entry.
function placedAt(placements, key, index) {
  var list = unplaced(placements, key);
  list.push({ key: key, index: index });
  return list;
}

// `placements` without `key`'s Placed position; a no-op when never Placed.
function unplaced(placements, key) {
  return placements.filter(function (placement) { return placement.key !== key; });
}

// The Start menu's Recommended list after launching `appId`: most recent
// first, no duplicates, at most MAX_RECENT_APPS.
function pushedRecent(recent, appId) {
  return [appId].concat(withoutId(recent, appId)).slice(0, MAX_RECENT_APPS);
}

// The next entry after a named intent (see the header). Intents:
//   { type: "pinApp", appId } / { type: "unpinApp", appId }
//       add to / remove from the Dock's Pins; a no-op when already so.
//   { type: "unpinAppFromDrag", appId }
//       unpin, and drop that Pin's Placed position in the same entry
//       (docs/SPEC.md "Input": drag out of the Dock).
//   { type: "placeItem", key, index }
//       a Pin Item's drop within the Dock (key is "pin:<appId>").
//   { type: "pinStartApp", appId } / { type: "unpinStartApp", appId }
//       the same for the Start menu's own pinned list.
//   { type: "reorderStartPins", order }
//       the Start menu's pinned list, in a new order.
//   { type: "pushRecentApp", appId }
//       an App was launched from the Start menu.
//   { type: "setSettings", patch }
//       settings changed; a patched value of undefined or null puts that
//       setting back to its default. { type: "setSetting", key, value } is
//       the one-setting form.
//   { type: "resetSettings" }
//       every settings-window field back to its default; Pins, their Placed
//       positions, Start pins and recent apps are left alone.
// An intent folds onto `entry` and returns a new object; to apply several in
// a row, fold each onto the previous result. An unknown intent or one with
// no usable App id changes nothing.
function applyIntent(entry, intent) {
  var view = effectiveView(entry);
  var kind = isPlainObject(intent) ? intent.type : null;
  var appId = isPlainObject(intent) && typeof intent.appId === "string" && intent.appId.length > 0 ? intent.appId : null;
  var patch = {};
  if (kind === "pinApp" && appId) patch.pins = withId(view.pins, appId);
  else if (kind === "unpinApp" && appId) patch.pins = withoutId(view.pins, appId);
  else if (kind === "unpinAppFromDrag" && appId) {
    patch.pins = withoutId(view.pins, appId);
    patch.placements = unplaced(view.placements, "pin:" + appId);
  } else if (kind === "placeItem" && typeof intent.key === "string" && intent.key.indexOf("pin:") === 0) {
    patch.placements = placedAt(view.placements, intent.key, intent.index);
  } else if (kind === "pinStartApp" && appId) patch.startPins = withId(view.startPins, appId);
  else if (kind === "unpinStartApp" && appId) patch.startPins = withoutId(view.startPins, appId);
  else if (kind === "reorderStartPins") patch.startPins = uniqueStrings(intent.order);
  else if (kind === "pushRecentApp" && appId) patch.recentApps = pushedRecent(view.recentApps, appId);
  else if (kind === "setSettings") patch = intent.patch;
  else if (kind === "setSetting" && typeof intent.key === "string") patch[intent.key] = intent.value;
  else if (kind === "resetSettings") {
    var groups = settingsSchema();
    for (var g = 0; g < groups.length; g++) {
      for (var f = 0; f < groups[g].fields.length; f++) patch[groups[g].fields[f].key] = undefined;
    }
  }
  return mergeSettings(entry, patch);
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_ICON_SIZE: DEFAULT_ICON_SIZE,
    DEFAULT_REVEAL_DELAY_MS: DEFAULT_REVEAL_DELAY_MS,
    DEFAULT_HIDE_DELAY_MS: DEFAULT_HIDE_DELAY_MS,
    findPluginEntry: findPluginEntry,
    effectiveView: effectiveView,
    applyIntent: applyIntent,
    schemeColors: schemeColors,
    resolveStartIcon: resolveStartIcon,
    barMenuRows: barMenuRows,
    longestLabel: longestLabel,
    settingsSchema: settingsSchema,
  };
}
