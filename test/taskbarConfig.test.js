const test = require("node:test");
const assert = require("node:assert/strict");
const {
  effectiveTaskbar,
  schemeColors,
  resolveStartIcon,
} = require("../DockConfig.js");

test("effectiveTaskbar defaults to the original floating, auto-hiding dock", () => {
  for (const entry of [null, {}, { style: "nonsense" }]) {
    const s = effectiveTaskbar(entry);
    assert.equal(s.style, "dock");
    assert.equal(s.autoHide, true);
  }
});

test("dock style always auto-hides, whatever autoHide says", () => {
  assert.equal(effectiveTaskbar({ style: "dock", autoHide: false }).autoHide, true);
});

test("taskbar style defaults: always visible, centred, theme colours, Start and clock shown", () => {
  assert.deepEqual(effectiveTaskbar({ style: "taskbar" }), {
    style: "taskbar",
    alignment: "center",
    colorScheme: "theme",
    autoHide: false,
    barHeight: 48,
    opacity: 0.9,
    transparent: false,
    showStart: true,
    startCommand: "omarchy-menu toggle apps",
    startIcon: "grid",
    showClock: true,
    showPreviews: true,
    previewWarpPointer: true,
    showWorkspaceBadge: false,
  });
});

test("taskbar style honours valid values and autoHide", () => {
  const s = effectiveTaskbar({
    style: "taskbar",
    alignment: "left",
    colorScheme: "dark",
    autoHide: true,
    barHeight: 40,
    opacity: 0.5,
    transparent: true,
    showStart: false,
    startCommand: "walker",
    startIcon: "omarchy",
    showClock: false,
    showPreviews: false,
  });
  assert.equal(s.alignment, "left");
  assert.equal(s.colorScheme, "dark");
  assert.equal(s.autoHide, true);
  assert.equal(s.barHeight, 40);
  assert.equal(s.opacity, 0.5);
  assert.equal(s.transparent, true);
  assert.equal(s.showStart, false);
  assert.equal(s.startCommand, "walker");
  assert.equal(s.startIcon, "omarchy");
  assert.equal(s.showClock, false);
  assert.equal(s.showPreviews, false);
  assert.equal(effectiveTaskbar({ style: "taskbar", showWorkspaceBadge: true }).showWorkspaceBadge, true);
  assert.equal(effectiveTaskbar({ style: "dock", showWorkspaceBadge: true }).showWorkspaceBadge, true);
  assert.equal(effectiveTaskbar({ style: "taskbar", showWorkspaceBadge: "yes" }).showWorkspaceBadge, false);
  assert.equal(effectiveTaskbar({ style: "taskbar", previewWarpPointer: false }).previewWarpPointer, false);
  assert.equal(effectiveTaskbar({ style: "taskbar", previewWarpPointer: "no" }).previewWarpPointer, true);
});

test("unusable taskbar values fall back to defaults; opacity is clamped to 0..1", () => {
  const s = effectiveTaskbar({
    style: "taskbar",
    alignment: "right",
    colorScheme: "blue",
    barHeight: -3,
    opacity: 7,
    startCommand: "   ",
    startIcon: 5,
    showStart: "yes",
  });
  assert.equal(s.alignment, "center");
  assert.equal(s.colorScheme, "theme");
  assert.equal(s.barHeight, 48);
  assert.equal(s.opacity, 1);
  assert.equal(s.startCommand, "omarchy-menu toggle apps");
  assert.equal(s.startIcon, "grid");
  assert.equal(s.showStart, true);
  assert.equal(effectiveTaskbar({ style: "taskbar", opacity: 0 }).opacity, 0);
  assert.equal(effectiveTaskbar({ style: "taskbar", opacity: -1 }).opacity, 0);
});

test("schemeColors is null for the theme and a full palette for dark and light", () => {
  assert.equal(schemeColors("theme"), null);
  const keys = ["background", "foreground", "muted", "accent", "border"];
  for (const scheme of ["dark", "light"]) {
    const palette = schemeColors(scheme);
    for (const key of keys) assert.match(palette[key], /^#[0-9a-f]{6}$/i);
  }
  assert.notEqual(schemeColors("dark").background, schemeColors("light").background);
});

test("resolveStartIcon: grid, an absolute image path, or an icon-theme name", () => {
  assert.deepEqual(resolveStartIcon("grid"), { kind: "grid" });
  assert.deepEqual(resolveStartIcon("/home/u/logo.png"), { kind: "path", value: "/home/u/logo.png" });
  assert.deepEqual(resolveStartIcon("omarchy"), { kind: "icon", value: "omarchy" });
  assert.deepEqual(resolveStartIcon("arch"), { kind: "icon", value: "archlinux" });
  assert.deepEqual(resolveStartIcon("linux"), { kind: "icon", value: "tux" });
  assert.deepEqual(resolveStartIcon("folder"), { kind: "icon", value: "folder" });
  assert.deepEqual(resolveStartIcon(""), { kind: "grid" });
});

const { barMenuRows } = require("../DockConfig.js");

test("barMenuRows lists the bar's options with the current choice checked", () => {
  const rows = barMenuRows(effectiveTaskbar({ style: "taskbar", alignment: "left", colorScheme: "dark" }));
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));

  assert.equal(byLabel["Center icons"].checked, false);
  assert.equal(byLabel["Left-align icons"].checked, true);
  assert.equal(byLabel["Dark colors"].checked, true);
  assert.equal(byLabel["Theme colors"].checked, false);
  assert.equal(byLabel["Auto-hide"].checked, false);
  assert.equal(byLabel["Start button"].checked, true);
});

test("each row's patch sets its own key; toggles flip the current value", () => {
  const rows = barMenuRows(effectiveTaskbar({ style: "taskbar", showClock: true, autoHide: false }));
  const patch = (label) => rows.find((r) => r.label === label).patch;

  assert.deepEqual(patch("Center icons"), { alignment: "center" });
  assert.deepEqual(patch("Light colors"), { colorScheme: "light" });
  assert.deepEqual(patch("Auto-hide"), { autoHide: true });
  assert.deepEqual(patch("Clock"), { showClock: false });
  assert.deepEqual(patch("Window previews"), { showPreviews: false });
  assert.deepEqual(patch("Pointer follows preview click"), { previewWarpPointer: false });
  assert.deepEqual(patch("Workspace badge"), { showWorkspaceBadge: true });
  assert.deepEqual(patch("Transparent background"), { transparent: true });
  assert.deepEqual(patch("Start button"), { showStart: false });
  assert.equal(rows.find((r) => r.label === "Switch to dock style"), undefined);
});

test("groups are marked so the menu can draw a divider before each new one", () => {
  const rows = barMenuRows(effectiveTaskbar({ style: "taskbar" }));
  const groups = rows.map((r) => r.group);
  assert.deepEqual(groups, [...groups].sort((a, b) => a - b));
  assert.ok(new Set(groups).size >= 3);
});

test("in dock style the menu offers only the way to the taskbar style", () => {
  const rows = barMenuRows(effectiveTaskbar({ style: "dock" }));
  assert.deepEqual(rows, [
    { label: "Switch to taskbar style", checked: false, patch: { style: "taskbar" }, group: 0 },
  ]);
});

test("the menu can switch the Start button between the built-in menu and the Omarchy menu", () => {
  const omarchy = barMenuRows(effectiveTaskbar({ style: "taskbar" }));
  assert.equal(omarchy.find((r) => r.label === "Built-in Start menu").checked, false);
  assert.equal(omarchy.find((r) => r.label === "Omarchy menu on Start").checked, true);
  assert.deepEqual(omarchy.find((r) => r.label === "Built-in Start menu").patch, { startCommand: "builtin" });

  const builtin = barMenuRows(effectiveTaskbar({ style: "taskbar", startCommand: "builtin" }));
  assert.equal(builtin.find((r) => r.label === "Built-in Start menu").checked, true);
  assert.deepEqual(builtin.find((r) => r.label === "Omarchy menu on Start").patch, { startCommand: "omarchy-menu toggle apps" });
});
