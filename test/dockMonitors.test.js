const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const M = require("../DockMonitors.js");
const H = require("../DockHyprland.js");

const SCREENS = [
  { name: "L", x: -515, y: -1080, width: 1920, height: 1080 },
  { name: "M", x: 1405, y: -1080, width: 1920, height: 1080 },
  { name: "R", x: 3325, y: -1080, width: 1920, height: 1080 },
];

test("normalizedAddress agrees with DockHyprland's", () => {
  for (const a of ["56538020a4f0", "0x56538020a4f0", "nope", "", null, 5]) {
    assert.equal(M.normalizedAddress(a), H.normalizedAddress(a));
  }
});

test("moveToMonitor refuses an unusable address or monitor name", () => {
  assert.equal(M.moveToMonitor("zz", "DP-1"), null);
  assert.equal(M.moveToMonitor("0xab", ""), null);
  assert.equal(M.moveToMonitor("0xab", "DP-1; rm -rf ~"), null);
  assert.equal(M.moveToMonitor("0xab", 5), null);
});

test("moveToMonitor is a bash -lc argv whose script parses; the address and name are arguments", () => {
  const argv = M.moveToMonitor("ab12", "DVI-I-2");
  assert.deepEqual(argv.slice(0, 2), ["bash", "-lc"]);
  assert.deepEqual(argv.slice(4), ["0xab12", "DVI-I-2"]);
  assert.equal(spawnSync("bash", ["-n"], { input: argv[2] }).status, 0);
  assert.ok(!argv[2].includes("ab12") && !argv[2].includes("DVI"));
});

// A stub hyprctl: two monitors showing workspaces 2 and 131 (and a special one), logging dispatches.
function run(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mon-"));
  fs.writeFileSync(path.join(dir, "hyprctl"), `#!/usr/bin/env bash
if [ "$1" = -j ]; then
  echo '[{"name":"L","activeWorkspace":{"id":2}},{"name":"M","activeWorkspace":{"id":131}},{"name":"S","activeWorkspace":{"id":-99}}]'
else
  echo "$2" >> "${dir}/log"
fi
exit 0
`, { mode: 0o755 });
  const argv = M.moveToMonitor("0xab12", name);
  spawnSync("bash", argv.slice(1), { env: { ...process.env, PATH: dir + ":" + process.env.PATH } });
  return fs.existsSync(path.join(dir, "log")) ? fs.readFileSync(path.join(dir, "log"), "utf8") : "";
}

test("the Window goes to the workspace the monitor is showing, without following", () => {
  assert.match(run("M"), /window\.move\(\{ workspace = "131", follow = false, window = "address:0xab12" \}\)/);
  assert.match(run("L"), /workspace = "2",/);
});

test("an unknown monitor, or one showing a special workspace, does nothing", () => {
  assert.equal(run("X"), "");
  assert.equal(run("S"), "");
});

test("monitorOf finds the monitor a window is mostly on", () => {
  assert.equal(M.monitorOf({ x: 1417, y: -1042, w: 1896, h: 980 }, SCREENS), "M");
  assert.equal(M.monitorOf({ x: 3300, y: -1000, w: 400, h: 400 }, SCREENS), "R", "its centre decides");
  assert.equal(M.monitorOf(null, SCREENS), "");
  assert.equal(M.monitorOf({ x: 99999, y: 0, w: 10, h: 10 }, SCREENS), "");
});

test("monitorMap lays the monitors out side by side, scaled to the box, the current one marked", () => {
  const map = M.monitorMap(SCREENS, "M", { w: 300, h: 100 }, 4);
  assert.equal(map.rects.length, 3);
  assert.ok(map.width <= 300 && map.height <= 100);
  const [l, m, r] = map.rects;
  assert.ok(l.x < m.x && m.x < r.x, "left to right as on the desk");
  assert.equal(l.y, m.y);
  assert.deepEqual(map.rects.map((x) => x.current), [false, true, false]);
  assert.ok(m.x >= l.x + l.w, "a gap between neighbours");
});

test("monitorMap keeps a stacked arrangement stacked, and copes with none", () => {
  const stacked = [{ name: "A", x: 0, y: 0, width: 1920, height: 1080 }, { name: "B", x: 0, y: 1080, width: 1920, height: 1080 }];
  const map = M.monitorMap(stacked, "", { w: 200, h: 200 }, 0);
  assert.ok(map.rects[1].y > map.rects[0].y);
  assert.deepEqual(M.monitorMap([], "", { w: 200, h: 100 }, 0), { width: 0, height: 0, rects: [] });
});
