require("./qmlimport");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { LAYOUTS } = require("../SnapLayouts.js");
const H = require("../DockSnap.js");

const ADDR = "0x56538020a4f0";
const HALVES = LAYOUTS.find((l) => l.length === 2 && l[0].h === 1);
const QUARTERS = LAYOUTS.find((l) => l.length === 4);

test("every zone of every layout lies inside the area", () => {
  assert.ok(LAYOUTS.length > 0);
  for (const layout of LAYOUTS) {
    for (const z of layout) {
      assert.ok(z.x >= 0 && z.y >= 0 && z.w > 0 && z.h > 0, JSON.stringify(z));
      assert.ok(z.x + z.w <= 1 + 1e-9 && z.y + z.h <= 1 + 1e-9, JSON.stringify(z));
    }
  }
});

test("the zones of a layout tile the area: no overlap, no gap", () => {
  for (const layout of LAYOUTS) {
    const area = layout.reduce((sum, z) => sum + z.w * z.h, 0);
    assert.ok(Math.abs(area - 1) < 1e-9, "areas add up to " + area);
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i], b = layout[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(overlapX <= 1e-9 || overlapY <= 1e-9, "zones " + i + " and " + j + " overlap");
      }
    }
  }
});

test("the menu offers two stacked, and one on top with two below", () => {
  assert.ok(LAYOUTS.some((l) => l.length === 2 && l[0].w === 1 && l[0].h === 0.5), "two stacked");
  assert.ok(LAYOUTS.some((l) => l.length === 3 && l[0].w === 1 && l[1].w === 0.5 && l[2].w === 0.5), "one on top, two below");
});

test("snapWindow refuses a bad address or zone", () => {
  assert.equal(H.snapWindow("nope", HALVES[0]), null);
  assert.equal(H.snapWindow(ADDR, null), null);
  assert.equal(H.snapWindow(ADDR, { x: "a", y: 0, w: 1, h: 1 }), null);
});

// Runs snapWindow's script against a stand-in hyprctl that answers the two
// queries from the given JSON and records every dispatch.
function snap(zone, client, monitor, layers = {}, others, extra = [], option) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  const log = path.join(dir, "log");
  fs.writeFileSync(path.join(dir, "clients.json"), JSON.stringify([client, ...extra]));
  fs.writeFileSync(path.join(dir, "monitors.json"), JSON.stringify([monitor]));
  fs.writeFileSync(path.join(dir, "layers.json"), JSON.stringify(layers));
  if (option) fs.writeFileSync(path.join(dir, "getoption.json"), JSON.stringify(option));
  fs.writeFileSync(path.join(dir, "hyprctl"), [
    "#!/bin/bash",
    'if [ "$1" = -j ]; then cat "$(dirname "$0")/$2.json"; exit 0; fi',
    `echo "$2" >> ${log}`,
  ].join("\n"), { mode: 0o755 });
  const argv = H.snapWindow(ADDR, zone, others);
  const result = spawnSync(argv[0], argv.slice(1), { env: { ...process.env, PATH: dir + ":" + process.env.PATH } });
  assert.equal(result.status, 0, String(result.stderr));
  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
  fs.rmSync(dir, { recursive: true });
  return calls;
}

const client = { address: ADDR, monitor: 0, floating: true, fullscreen: 0, at: [100, 100] };
const monitor = { id: 0, name: "M-1", x: 0, y: 0, width: 1280, height: 800, scale: 1, reserved: [0, 26, 0, 0] };
const resizeOf = (c) => c.find((x) => x.includes("window.resize"));
const moveOf = (c) => c.find((x) => x.includes("window.move"));

test("the right half goes beside the left, inside the reserved space and a 6 px margin", () => {
  const calls = snap(HALVES[1], client, monitor);
  assert.match(resizeOf(calls), /x = 628, y = 756, exact = true/);
  assert.match(moveOf(calls), /x = 643, y = 35,/);
  assert.equal(calls.length, 2, "a floating window only needs resize and move");
});

test("a monitor's scale and offset are respected", () => {
  const calls = snap(QUARTERS[3], client, { ...monitor, x: 1920, y: 100, width: 3840, height: 2160, scale: 2, reserved: [0, 0, 0, 40] });
  // usable 1920x1040 less a 6 px margin: 1908 x 1028; a quarter is 948 x 508 (half the area less the margin); its corner is 6 + 954 + 3 in, and 6 + 514 + 3 down.
  assert.match(resizeOf(calls), /x = 948, y = 508, exact = true/);
  assert.match(moveOf(calls), /x = 2883, y = 623,/);
});

test("a tiled or full screen window is floated first, and leaves full screen", () => {
  const calls = snap(HALVES[0], { ...client, floating: false, fullscreen: 2 }, monitor);
  // The unset names the mode, so both are sent: maximized and full screen.
  assert.match(calls[0], /window\.fullscreen\(.*mode = "maximized".*action = "unset"/);
  assert.match(calls[1], /window\.fullscreen\(.*mode = "fullscreen".*action = "unset"/);
  assert.match(calls[2], /window\.float\(.*action = "set"/);
  assert.match(calls[3], /window\.resize/);
});

test("a window the compositor does not know does nothing", () => {
  const calls = snap(HALVES[0], { ...client, address: "0xdead" }, monitor);
  assert.deepEqual(calls, []);
});

const bar = (y, h) => ({ "M-1": { levels: { 3: [{ namespace: "omarchy-bar", y, h }] } } });

test("the Omarchy bar's layer keeps the window below it when Hyprland reserves nothing for it", () => {
  const calls = snap(HALVES[0], client, { ...monitor, reserved: [0, 0, 0, 0] }, bar(0, 30));
  // usable top is 30; the zone starts 6 + 3 below it.
  assert.match(moveOf(calls), /x = 9, y = 39,/);
  assert.match(resizeOf(calls), /y = 752,/); // 800 less the bar, less 12, less the gap
});

test("a bar layer that covers the whole monitor is ignored: Hyprland's reserved top is used", () => {
  const calls = snap(HALVES[0], client, monitor, bar(0, 800));
  assert.match(moveOf(calls), /x = 9, y = 35,/); // reserved top 26, plus 6 and 3
  assert.match(resizeOf(calls), /y = 7\d\d,/);
});

test("an area too small to use leaves the window alone", () => {
  const calls = snap(HALVES[0], client, { ...monitor, height: 150 });
  assert.deepEqual(calls, []);
});

test("with no bar showing the whole reserved-free area is used", () => {
  const calls = snap(HALVES[0], client, { ...monitor, reserved: [0, 0, 0, 0] });
  assert.match(moveOf(calls), /x = 9, y = 9,/);
});

test("a window an app moved above the bar is put back below it", () => {
  const calls = snap(HALVES[0], { ...client, at: [9, 4] }, monitor, bar(0, 26));
  const moves = calls.filter((c) => c.includes("window.move"));
  assert.equal(moves.length, 2, "the placement, then the correction");
  assert.match(moves[1], /x = 9, y = 35,/);
});

test("a window already below the bar is left alone", () => {
  const calls = snap(HALVES[0], { ...client, at: [9, 35] }, monitor, bar(0, 26));
  assert.equal(calls.filter((c) => c.includes("window.move")).length, 1);
});

const peer = (n, focus, over = {}) => ({ address: "0x" + n, monitor: 0, floating: false, fullscreen: 0, mapped: true, hidden: false,
  workspace: { id: 1 }, focusHistoryID: focus, at: [100, 100], ...over });
const main = { ...client, mapped: true, hidden: false, workspace: { id: 1 }, focusHistoryID: 0 };
const addr = (c) => (c.match(/address:(0x\w+)/) || [])[1];

test("the other windows of the workspace take the remaining zones, most recent first", () => {
  const calls = snap(HALVES[0], main, monitor, {}, [HALVES[1]], [peer("b1", 2), peer("b2", 1)]);
  const moved = calls.filter((c) => c.includes("window.move")).map(addr);
  assert.deepEqual(moved, [ADDR, "0xb2"], "the more recent one (b2) fills the one remaining zone");
});

test("more zones than windows leave zones empty; more windows than zones leave the rest alone", () => {
  const three = LAYOUTS.find((l) => l.length === 3 && l[0].h === 1 && l[1].h === 1);
  const rest = three.slice(1);
  let calls = snap(three[0], main, monitor, {}, rest, [peer("b1", 1)]);
  assert.deepEqual(calls.filter((c) => c.includes("window.move")).map(addr), [ADDR, "0xb1"]);
  calls = snap(three[0], main, monitor, {}, rest, [peer("b1", 1), peer("b2", 2), peer("b3", 3)]);
  assert.deepEqual(calls.filter((c) => c.includes("window.move")).map(addr), [ADDR, "0xb1", "0xb2"]);
});

test("windows on another workspace or monitor, hidden ones and special workspaces are not placed", () => {
  const calls = snap(HALVES[0], main, monitor, {}, [HALVES[1]], [
    peer("c1", 1, { workspace: { id: 2 } }), peer("c2", 2, { monitor: 1 }), peer("c3", 3, { hidden: true }),
    peer("c4", 4, { workspace: { id: -98 } }), peer("c5", 5, { mapped: false }),
  ]);
  assert.deepEqual(calls.filter((c) => c.includes("window.move")).map(addr), [ADDR]);
});

test("without other zones only the chosen window is placed", () => {
  const calls = snap(HALVES[0], main, monitor, {}, [], [peer("d1", 1)]);
  assert.deepEqual(calls.filter((c) => c.includes("window.move")).map(addr), [ADDR]);
});

test("snapWindow refuses a bad other zone", () => {
  assert.equal(H.snapWindow(ADDR, HALVES[0], [{ x: "a", y: 0, w: 1, h: 1 }]), null);
});

test("snapWindow reads an array-like list of other zones, as QML hands it over", () => {
  const arrayLike = { 0: HALVES[1], length: 1 };
  const a = H.snapWindow(ADDR, HALVES[0], arrayLike);
  const b = H.snapWindow(ADDR, HALVES[0], [HALVES[1]]);
  assert.deepEqual(a, b);
  assert.notEqual(a[a.length - 1], "[]");
});

const { windowsOn, tileLayout } = require("../SnapLayouts.js");

test("a tiled workspace is offered its own tile arrangement, normalised, tiles only", () => {
  const t = (id, x, y, w, h, floating) => ({ window: { id, workspace: "1", floating: !!floating, rect: { x, y, w, h } } });
  const items = [t("a", 10, 30, 400, 800), t("b", 410, 30, 400, 400), t("c", 410, 430, 400, 400), t("f", 0, 0, 50, 50, true)];
  assert.deepEqual(tileLayout(items, "1"), [
    { x: 0, y: 0, w: 0.5, h: 1, id: "a" },
    { x: 0.5, y: 0, w: 0.5, h: 0.5, id: "b" },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5, id: "c" },
  ]);
  assert.deepEqual(tileLayout([t("a", 0, 0, 10, 10)], "1"), [], "one tile has nothing to swap with");
  assert.deepEqual(tileLayout([{ window: { id: "a", workspace: "1" } }, t("b", 0, 0, 5, 5)], "1"), [], "no rectangle known");
});

test("swapTiles dispatches a swap of two valid addresses", () => {
  const cmd = H.swapTiles("0xab", "cd");
  assert.match(cmd[2], /action = \\"unset\\"/, "leaves full screen first");
  assert.ok(cmd[2].startsWith("a=0xab\n"));
  assert.match(cmd[2], /hl\.dsp\.window\.swap\(\{ target = \\"address:0xcd\\", window = \\"address:\$a\\" \}\)/);
  assert.equal(H.swapTiles("0xab", "0xab"), null);
  assert.equal(H.swapTiles("0xab", "x; rm"), null);
});

test("windowsOn counts a workspace's windows once, across Window and Group Items, and none on a special one", () => {
  const w = (id, workspace) => ({ id, workspace });
  const items = [
    { window: w("a", "2") },
    { windows: [w("b", "2"), w("c", "3")] },
    { window: w("b", "2") },
    { window: w("d", "special:scratchpad") },
    { windows: [] },
  ];
  assert.deepEqual(windowsOn(items, "2").map((x) => x.id), ["a", "b"]);
  assert.deepEqual(windowsOn(items, "special:scratchpad"), []);
  assert.deepEqual(windowsOn(items, ""), []);
  assert.deepEqual(windowsOn(null, "2"), []);
});

test("shapeLayouts offers every shape for two and three tiles, each tiling the area, and none for other counts", () => {
  const { shapeLayouts } = require("../SnapLayouts.js");
  assert.deepEqual(shapeLayouts(2).map((l) => l[0].shape), ["H", "V"]);
  assert.deepEqual(shapeLayouts(3).map((l) => l[0].shape), ["HV", "HH", "VH", "VV"]);
  assert.deepEqual([shapeLayouts(1), shapeLayouts(4)], [[], []]);
  for (const layout of [...shapeLayouts(2), ...shapeLayouts(3)]) {
    assert.ok(Math.abs(layout.reduce((sum, z) => sum + z.w * z.h, 0) - 1) < 1e-9);
  }
});

test("the jq that reads a workspace's shape tells two and three tiles' shapes apart", () => {
  const c = (address, x, y, w, h) => ({ address, at: [x, y], size: [w, h], floating: false, mapped: true, hidden: false, monitor: 0, workspace: { id: 1 } });
  const shapeOf = (clients) => JSON.parse(spawnSync("jq", ["-c", "--arg", "a", "a", H.TILE_SHAPE + "tiles($a) | shape"], { input: JSON.stringify(clients), encoding: "utf8" }).stdout);
  assert.equal(shapeOf([c("a", 0, 0, 400, 800), c("b", 400, 0, 400, 800)]).shape, "H");
  assert.equal(shapeOf([c("a", 0, 0, 800, 400), c("b", 0, 400, 800, 400)]).shape, "V");
  assert.equal(shapeOf([c("a", 0, 0, 400, 800), c("b", 400, 0, 400, 400), c("c", 400, 400, 400, 400)]).shape, "HV");
  assert.equal(shapeOf([c("a", 0, 0, 400, 800), c("b", 400, 0, 200, 800), c("c", 600, 0, 200, 800)]).shape, "HH");
  assert.equal(shapeOf([c("a", 0, 0, 800, 400), c("b", 0, 400, 400, 400), c("c", 400, 400, 400, 400)]).shape, "VH");
  assert.equal(shapeOf([c("a", 0, 0, 800, 400), c("b", 0, 400, 800, 200), c("c", 0, 600, 800, 200)]).shape, "VV");
  const lone = shapeOf([c("a", 400, 0, 400, 800), c("b", 0, 0, 400, 400), c("c", 0, 400, 400, 400)]);
  assert.equal(lone.lone, "a");
  assert.equal(lone.first, false, "the lone window sits right of its pair");
  assert.equal(shapeOf([c("a", 0, 0, 800, 400), c("b", 0, 400, 400, 400), c("c", 400, 400, 400, 400)]).first, true);
  assert.equal(shapeOf([{ ...c("a", 0, 0, 800, 800), floating: true }, c("b", 0, 0, 400, 400)]).n, 1, "floating windows are not tiles");
});

test("reshapeTiles refuses a bad address, shape or zone", () => {
  const z = { x: 0, y: 0, w: 0.5, h: 1 };
  assert.equal(H.reshapeTiles("nope", "H", z), null);
  assert.equal(H.reshapeTiles(ADDR, "X", z), null);
  assert.equal(H.reshapeTiles(ADDR, "H", null), null);
  assert.equal(H.reshapeTiles(ADDR, "H", { x: "a", y: 0, w: 1, h: 1 }), null);
  assert.equal(H.reshapeTiles(ADDR, "HV", z)[3], "bash");
});

test("the picker ends with a full layout that maximizes, and maximizeWindow sets rather than toggles", () => {
  const { FULL } = require("../SnapLayouts.js");
  assert.deepEqual(LAYOUTS[LAYOUTS.length - 1], FULL);
  assert.deepEqual(FULL, [{ x: 0, y: 0, w: 1, h: 1, maximize: true }]);
  const cmd = H.maximizeWindow("0xab");
  assert.match(cmd[2], /mode = \\"maximized\\", action = \\"set\\"/);
  assert.equal(cmd[4], "0xab");
  assert.equal(H.maximizeWindow("nope"), null);
});

test("the menu offers wide and narrow side by side, 2/3 and 1/3", () => {
  const wn = LAYOUTS.find((l) => l.length === 2 && Math.abs(l[0].w - 2 / 3) < 1e-9);
  assert.ok(wn, "wide and narrow");
  assert.ok(Math.abs(wn[1].x - 2 / 3) < 1e-9 && Math.abs(wn[1].w - 1 / 3) < 1e-9 && wn.every((z) => z.h === 1));
});

test("a window-mode window leaves room for its titlebar above the zone; others and a disabled plugin do not", () => {
  const modeWindow = { ...client, tags: ["omarchy-floating-workspace"] };
  const bar = { int: 30, bool: true };
  // The zone starts 6 + 3 below the reserved 26, and the titlebar takes 30 of it.
  const calls = snap(HALVES[0], modeWindow, monitor, {}, undefined, [], bar);
  assert.match(moveOf(calls), /x = 9, y = 65,/);
  assert.match(resizeOf(calls), /y = 726, exact = true/);
  const plain = snap(HALVES[0], client, monitor, {}, undefined, [], bar);
  assert.match(moveOf(plain), /y = 35,/, "a window not on a window-mode workspace has no titlebar");
  const off = snap(HALVES[0], modeWindow, monitor, {}, undefined, [], { int: 30, bool: false });
  assert.match(moveOf(off), /y = 35,/, "the plugin is off");
  const absent = snap(HALVES[0], modeWindow, monitor);
  assert.match(moveOf(absent), /y = 35,/, "the plugin is not there");
});

// --- What a Window is offered and what a pick does (layoutsFor, windowAt, plan) ---

const { layoutsFor, windowAt, plan, FULL } = require("../SnapLayouts.js");

// Tiles of workspace "1", laid out as `n` columns of 100 px, plus extras.
function tiles(n, extra = []) {
  const items = [];
  for (let i = 0; i < n; i++) {
    items.push({ window: { id: "t" + i, workspace: "1", floating: false, rect: { x: i * 100, y: 0, w: 100, h: 800 } } });
  }
  return items.concat(extra);
}

test("layoutsFor: a floating Window is offered every layout, ending with full", () => {
  const win = { id: "f", workspace: "1", floating: true };
  assert.equal(layoutsFor([], win), LAYOUTS);
  assert.equal(LAYOUTS[LAYOUTS.length - 1], FULL);
});

test("layoutsFor: two or three tiles are offered their shapes then full; more, their arrangement then full", () => {
  const two = tiles(2);
  assert.deepEqual(layoutsFor(two, two[0].window).map((l) => l[0].shape || (l[0].maximize ? "full" : "?")), ["H", "V", "full"]);
  const three = tiles(3);
  assert.deepEqual(layoutsFor(three, three[1].window).map((l) => l[0].shape || (l[0].maximize ? "full" : "?")), ["HV", "HH", "VH", "VV", "full"]);
  const four = tiles(4);
  const offered = layoutsFor(four, four[0].window);
  assert.equal(offered.length, 2);
  assert.deepEqual(offered[0].map((z) => z.id), ["t0", "t1", "t2", "t3"], "the tiles as they are, to swap with");
  assert.equal(offered[1], FULL);
});

test("layoutsFor: a lone tile, no Window, or one without an id gets no picker", () => {
  const one = tiles(1);
  assert.deepEqual(layoutsFor(one, one[0].window), []);
  assert.deepEqual(layoutsFor(one, null), []);
  assert.deepEqual(layoutsFor(one, { floating: true }), []);
  assert.deepEqual(layoutsFor(one, { id: "x" }), [], "a Preview menu's unknown Window: not floating, no workspace");
});

test("layoutsFor: floating Windows on a tiled workspace do not count as tiles", () => {
  const items = tiles(2, [{ window: { id: "f", workspace: "1", floating: true, rect: { x: 0, y: 0, w: 10, h: 10 } } }]);
  assert.deepEqual(layoutsFor(items, items[0].window).map((l) => l[0].shape || "full"), ["H", "V", "full"]);
});

test("windowAt finds a Window by address with or without 0x, in Window and Group Items, never on a special workspace", () => {
  const items = [
    { window: { id: "aa11", workspace: "1" } },
    { windows: [{ id: "bb22", workspace: "2" }, { id: "cc33", workspace: "special:minimized" }] },
  ];
  assert.equal(windowAt(items, "0xaa11").id, "aa11");
  assert.equal(windowAt(items, "bb22").id, "bb22");
  assert.equal(windowAt(items, "0xcc33"), null);
  assert.equal(windowAt(items, ""), null);
  assert.equal(windowAt(items, "0xdead"), null);
  assert.equal(windowAt(null, "aa11"), null);
});

test("plan: the full thumbnail maximizes, floating or tiled", () => {
  assert.deepEqual(plan({ id: "f", floating: true }, FULL, FULL[0], true), { action: "maximize", id: "f" });
  assert.deepEqual(plan({ id: "t", floating: false }, FULL, FULL[0], true), { action: "maximize", id: "t" });
});

test("plan: a tile is reshaped into a shape, or swapped with the tile clicked, and never filled or floated", () => {
  const two = tiles(2);
  const [h] = layoutsFor(two, two[0].window);
  assert.deepEqual(plan(two[0].window, h, h[1], true),
    { action: "reshape", id: "t0", shape: "H", zone: { x: 0.5, y: 0, w: 0.5, h: 1 } });
  const four = tiles(4);
  const [arrangement] = layoutsFor(four, four[0].window);
  assert.deepEqual(plan(four[0].window, arrangement, arrangement[2], true), { action: "swap", id: "t0", other: "t2" });
});

test("plan: a floating Window snaps to the zone, filling the layout's other zones only with fillOthers", () => {
  const win = { id: "f", floating: true };
  const quarters = LAYOUTS.find((l) => l.length === 4);
  // A copy of the zone, as QML hands it over: matched by value.
  const picked = { ...quarters[1] };
  assert.deepEqual(plan(win, quarters, picked, false),
    { action: "snap", id: "f", zone: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, others: [] });
  assert.deepEqual(plan(win, quarters, picked, true).others,
    [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }]);
});

test("plan: nothing without a Window, an id or a zone", () => {
  assert.equal(plan(null, FULL, FULL[0], false), null);
  assert.equal(plan({ floating: true }, FULL, FULL[0], false), null);
  assert.equal(plan({ id: "f", floating: true }, FULL, null, false), null);
  assert.equal(plan({ id: "t", floating: false }, [], { x: 0, y: 0, w: 1, h: 1 }, false), null, "a tile zone with neither shape nor id");
});

test("snapCommand turns each plan into its DockSnap command", () => {
  const z = { x: 0, y: 0, w: 0.5, h: 1 };
  assert.deepEqual(H.snapCommand({ action: "maximize", id: ADDR }), H.maximizeWindow(ADDR));
  assert.deepEqual(H.snapCommand({ action: "reshape", id: ADDR, shape: "H", zone: z }), H.reshapeTiles(ADDR, "H", z));
  assert.deepEqual(H.snapCommand({ action: "swap", id: ADDR, other: "0xcd" }), H.swapTiles(ADDR, "0xcd"));
  assert.deepEqual(H.snapCommand({ action: "snap", id: ADDR, zone: z, others: [] }), H.snapWindow(ADDR, z, []));
  assert.equal(H.snapCommand(null), null);
  assert.equal(H.snapCommand({ action: "nope", id: ADDR }), null);
});

// A maximized Window on a window-mode (floating) workspace stays tiled: Omarchy
// leaves a fullscreen or maximized Window as it is. It is still that mode's Window.
const modeWin = (over = {}) => ({ id: "0xaa", workspace: "131", floating: false, fullscreen: 1, windowMode: true, rect: { x: 0, y: 0, w: 1900, h: 980 }, ...over });
const SL = require("../SnapLayouts.js");

test("a tiled Window on a window-mode workspace is offered the floating layouts, even alone", () => {
  const win = modeWin();
  assert.equal(SL.layoutsFor([{ kind: "window", window: win }], win), SL.LAYOUTS);
  assert.equal(SL.floats(win), true);
});

test("a lone tiled Window on a tiled workspace still has no layouts", () => {
  const win = modeWin({ windowMode: false });
  assert.deepEqual(SL.layoutsFor([{ kind: "window", window: win }], win), []);
  assert.equal(SL.floats(win), false);
});

test("a zone picked for a tiled Window on a window-mode workspace snaps it (floating it), not a tile reshape", () => {
  const action = SL.plan(modeWin(), SL.LAYOUTS[0], SL.LAYOUTS[0][0], false);
  assert.equal(action.action, "snap");
  assert.equal(action.id, "0xaa");
});
