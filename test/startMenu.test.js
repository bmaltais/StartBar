const test = require("node:test");
const assert = require("node:assert/strict");
const { filterApps } = require("../DockModel.js");

const apps = [
  { id: "org.gnome.Calculator", name: "Calculator", genericName: "", keywords: ["math"] },
  { id: "firefox", name: "Firefox", genericName: "Web Browser", keywords: ["internet"] },
  { id: "alacritty", name: "Alacritty", genericName: "Terminal", keywords: [] },
  { id: "hidden", name: "Secret", noDisplay: true },
  { id: "chromium", name: "Chromium", genericName: "Web Browser", keywords: [] },
];

const ids = (list) => list.map((a) => a.id);

test("an empty query lists every displayable app, alphabetically by name", () => {
  assert.deepEqual(ids(filterApps(apps, "")), ["alacritty", "org.gnome.Calculator", "chromium", "firefox"]);
  assert.deepEqual(ids(filterApps(apps, "   ")), ids(filterApps(apps, "")));
});

test("name prefix matches rank first, then name substrings, then generic name/keywords/id; ties alphabetical", () => {
  assert.deepEqual(ids(filterApps(apps, "c")), ["org.gnome.Calculator", "chromium", "alacritty"]);
  assert.deepEqual(ids(filterApps(apps, "web")), ["chromium", "firefox"]);
});

test("matching is case-insensitive and also checks keywords and the id", () => {
  assert.deepEqual(ids(filterApps(apps, "FIRE")), ["firefox"]);
  assert.deepEqual(ids(filterApps(apps, "math")), ["org.gnome.Calculator"]);
  assert.deepEqual(ids(filterApps(apps, "internet")), ["firefox"]);
});

test("apps with noDisplay never appear, and no match gives an empty list", () => {
  assert.deepEqual(ids(filterApps(apps, "secret")), []);
  assert.deepEqual(ids(filterApps(apps, "zzz")), []);
  assert.deepEqual(filterApps(null, "x"), []);
});

const { groupAlphabetically, pushRecent } = require("../DockModel.js");
const { effectiveStartPins, effectiveRecent, startPowerActions } = require("../DockConfig.js");

test("groupAlphabetically sections apps by first letter, non-letters under #", () => {
  const list = [
    { id: "b", name: "Beta" },
    { id: "a2", name: "avocado" },
    { id: "a1", name: "Alpha" },
    { id: "n", name: "7zip" },
    { id: "h", name: "Hidden", noDisplay: true },
  ];
  const groups = groupAlphabetically(list);
  assert.deepEqual(groups.map((g) => g.letter), ["#", "A", "B"]);
  assert.deepEqual(groups[1].apps.map((a) => a.id), ["a1", "a2"]);
  assert.deepEqual(groupAlphabetically(null), []);
});

test("pushRecent moves an app to the front, de-duplicates and caps the list", () => {
  assert.deepEqual(pushRecent(["a", "b"], "c", 3), ["c", "a", "b"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "b", 3), ["b", "a", "c"]);
  assert.deepEqual(pushRecent(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
  assert.deepEqual(pushRecent(null, "a"), ["a"]);
  assert.deepEqual(pushRecent(["a"], ""), ["a"]);
});

test("effectiveStartPins uses the entry's own list, else falls back to the dock's Pins", () => {
  assert.deepEqual(effectiveStartPins({ startPins: ["x", "y", "x", 3, ""] }, ["d"]), ["x", "y"]);
  assert.deepEqual(effectiveStartPins({ startPins: [] }, ["d"]), []);
  assert.deepEqual(effectiveStartPins({}, ["d"]), ["d"]);
  assert.deepEqual(effectiveStartPins(null, ["d"]), ["d"]);
});

test("effectiveRecent keeps only unique non-empty strings", () => {
  assert.deepEqual(effectiveRecent({ recentApps: ["a", "a", 1, "b"] }), ["a", "b"]);
  assert.deepEqual(effectiveRecent({}), []);
});

test("startPowerActions names each action and the command it runs", () => {
  const actions = startPowerActions();
  assert.deepEqual(actions.map((a) => a.label), ["Sleep", "Restart", "Shut down"]);
  for (const a of actions) assert.equal(typeof a.command, "string");
  assert.equal(actions[2].command, "omarchy-system-shutdown");
});

const { effectivePlaces } = require("../DockConfig.js");

const userDirs = [
  "# comment",
  'XDG_DESKTOP_DIR="$HOME/"',
  'XDG_DOWNLOAD_DIR="$HOME/Downloads"',
  'XDG_DOCUMENTS_DIR="$HOME/Documents"',
  'XDG_MUSIC_DIR="$HOME/Music"',
  'XDG_PICTURES_DIR="$HOME/Pictures"',
  'XDG_VIDEOS_DIR="$HOME/Videos"',
  'XDG_PROJECTS_DIR="$HOME/Projects"',
].join("\n");

test("effectivePlaces starts with Home, then the user's XDG folders, skipping any that are Home itself", () => {
  const places = effectivePlaces(null, userDirs, "/home/u");
  assert.deepEqual(places.map((p) => p.label), ["Home", "Documents", "Downloads", "Pictures", "Music", "Videos"]);
  assert.equal(places[0].path, "/home/u");
  assert.equal(places[2].path, "/home/u/Downloads");
  assert.equal(places[2].icon, "folder-download");
});

test("effectivePlaces falls back to conventional names when user-dirs.dirs is unreadable", () => {
  const places = effectivePlaces(null, "", "/home/u");
  assert.deepEqual(places.map((p) => p.path), [
    "/home/u", "/home/u/Documents", "/home/u/Downloads", "/home/u/Pictures", "/home/u/Music", "/home/u/Videos",
  ]);
});

test("a startPlaces list replaces the defaults; ~ expands, labels come from the folder name", () => {
  const places = effectivePlaces({ startPlaces: ["~/Projects", "/mnt/data", "", 5, "~/Projects"] }, userDirs, "/home/u");
  assert.deepEqual(places.map((p) => [p.label, p.path]), [
    ["Projects", "/home/u/Projects"],
    ["data", "/mnt/data"],
  ]);
  assert.equal(places[0].icon, "folder");
});

test("an empty startPlaces list hides the Places column", () => {
  assert.deepEqual(effectivePlaces({ startPlaces: [] }, userDirs, "/home/u"), []);
});

const { startUserActions } = require("../DockConfig.js");

test("startUserActions are the account actions behind the user's name: Lock and Sign out", () => {
  const actions = startUserActions();
  assert.deepEqual(actions.map((a) => a.label), ["Lock", "Sign out"]);
  assert.deepEqual(actions.map((a) => a.command), ["omarchy-system-lock", "omarchy-system-logout"]);
});
