// The Dock's Bar menu (docs/SPEC.md "The bar"; vocabulary in CONTEXT.md). No
// Quickshell or QML imports, so the exact same file loads as a JS import
// inside the shell and via `require` under Node for the test suite.
//
// What the bar's right-click menu lists (`barMenuRows`) and how wide it and its
// submenu must be to fit it (`barMenuLabels`, `barSubmenuLabels`,
// `longestLabel`). Each row's `patch` is a `setSettings` patch that DockConfig.js
// folds onto the config entry.

var OMARCHY_MENU_COMMAND = "omarchy-menu toggle apps";

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
var SETTINGS_ROW = { label: "Settings\u2026", checked: false, action: "settings", group: 9, enabled: true };

function barMenuRows(taskbar) {
  function toggle(label, key, group, enabled) {
    var patch = {};
    patch[key] = !taskbar[key];
    return { label: label, checked: !!taskbar[key], patch: patch, group: group, enabled: enabled !== false };
  }
  function choice(label, key, value, group, enabled) {
    var patch = {};
    patch[key] = value;
    return { label: label, checked: taskbar[key] === value, patch: patch, group: group, enabled: enabled !== false };
  }
  // A row that opens a submenu of `children`.
  function section(label, group, children) {
    return { label: label, group: group, children: children, enabled: true };
  }
  var builtin = taskbar.startCommand === "builtin";
  var previews = !!taskbar.showPreviews;
  return [
    section("Icon alignment", 0, [
      choice("Left", "alignment", "left", 0),
      choice("Center", "alignment", "center", 0),
    ]),
    section("Position", 0, [
      choice("Top", "position", "top", 0),
      choice("Left", "position", "left", 0),
      choice("Right", "position", "right", 0),
      choice("Bottom", "position", "bottom", 0),
    ]),
    section("Colors", 0, [
      choice("Theme", "colorScheme", "theme", 0),
      choice("Dark", "colorScheme", "dark", 0),
      choice("Light", "colorScheme", "light", 0),
    ]),
    section("Start button", 1, [
      toggle("Show Start button", "showStart", 1),
      {
        label: "Open the built-in menu",
        checked: builtin,
        patch: { startCommand: "builtin" },
        group: 1,
        enabled: !!taskbar.showStart,
      },
      {
        label: "Open the Omarchy menu",
        checked: !builtin,
        patch: { startCommand: OMARCHY_MENU_COMMAND },
        group: 1,
        enabled: !!taskbar.showStart,
      },
      toggle("Open on hover", "startHoverOpen", 1, !!taskbar.showStart && builtin),
    ]),
    section("Window previews", 1, [
      toggle("Show previews", "showPreviews", 1),
      toggle("Show window on hover", "previewPeek", 1, previews),
      toggle("Pointer follows click", "previewWarpPointer", 1, previews),
    ]),
    toggle("Auto-hide", "autoHide", 2),
    toggle("Clock", "showClock", 2),
    toggle("Group windows of one app", "groupWindows", 2),
    toggle("Workspace badge", "showWorkspaceBadge", 2),
    toggle("Transparent background", "transparent", 2),
    SETTINGS_ROW,
  ];
}

// Every label the Bar menu itself can show, for sizing it.
function barMenuLabels(rows) {
  var labels = [];
  for (var i = 0; i < rows.length; i++) {
    labels.push(rows[i].label);
  }
  return labels;
}

// The labels of every section's choices, for sizing the submenu.
function barSubmenuLabels(rows) {
  var labels = [];
  for (var i = 0; i < rows.length; i++) {
    var kids = rows[i].children || [];
    for (var c = 0; c < kids.length; c++) labels.push(kids[c].label);
  }
  return labels;
}


if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    barMenuRows: barMenuRows,
    barMenuLabels: barMenuLabels,
    barSubmenuLabels: barSubmenuLabels,
    longestLabel: longestLabel,
  };
}
