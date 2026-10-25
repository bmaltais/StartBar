const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { LAYOUTS } = require("../SnapLayouts.js");
const H = require("../DockHyprland.js");

const ADDR = "0x56538020a4f0";

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

test("snapWindow refuses a bad address or zone", () => {
  assert.equal(H.snapWindow("nope", LAYOUTS[0][0]), null);
  assert.equal(H.snapWindow(ADDR, null), null);
  assert.equal(H.snapWindow(ADDR, { x: "a", y: 0, w: 1, h: 1 }), null);
});

// Runs snapWindow's script against a stand-in hyprctl that answers the two
// queries from the given JSON and records every dispatch.
function snap(zone, client, monitor) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snap-"));
  const log = path.join(dir, "log");
  fs.writeFileSync(path.join(dir, "clients.json"), JSON.stringify([client]));
  fs.writeFileSync(path.join(dir, "monitors.json"), JSON.stringify([monitor]));
  fs.writeFileSync(path.join(dir, "hyprctl"), [
    "#!/bin/bash",
    'if [ "$1" = -j ]; then cat "$(dirname "$0")/$2.json"; exit 0; fi',
    `echo "$2" >> ${log}`,
  ].join("\n"), { mode: 0o755 });
  const argv = H.snapWindow(ADDR, zone);
  const result = spawnSync(argv[0], argv.slice(1), { env: { ...process.env, PATH: dir + ":" + process.env.PATH } });
  assert.equal(result.status, 0, String(result.stderr));
  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n") : [];
  fs.rmSync(dir, { recursive: true });
  return calls;
}

const client = { address: ADDR, monitor: 0, floating: true, fullscreen: 0 };
const monitor = { id: 0, x: 0, y: 0, width: 1280, height: 800, scale: 1, reserved: [0, 26, 0, 0] };
const resizeOf = (c) => c.find((x) => x.includes("window.resize"));
const moveOf = (c) => c.find((x) => x.includes("window.move"));

test("the right half goes beside the left, inside the reserved space and a 6 px margin", () => {
  const calls = snap(LAYOUTS[0][1], client, monitor);
  assert.match(resizeOf(calls), /x = 628, y = 756, exact = true/);
  assert.match(moveOf(calls), /x = 643, y = 35,/);
  assert.equal(calls.length, 2, "a floating window only needs resize and move");
});

test("a monitor's scale and offset are respected", () => {
  const calls = snap(LAYOUTS[2][3], client, { ...monitor, x: 1920, y: 100, width: 3840, height: 2160, scale: 2, reserved: [0, 0, 0, 40] });
  // usable 1920x1040 less a 6 px margin: 1908 x 1028; a quarter is 948 x 508 (half the area less the margin); its corner is 6 + 954 + 3 in, and 6 + 514 + 3 down.
  assert.match(resizeOf(calls), /x = 948, y = 508, exact = true/);
  assert.match(moveOf(calls), /x = 2883, y = 623,/);
});

test("a tiled or full screen window is floated first, and leaves full screen", () => {
  const calls = snap(LAYOUTS[0][0], { ...client, floating: false, fullscreen: 2 }, monitor);
  assert.match(calls[0], /window\.fullscreen\(.*action = "unset"/);
  assert.match(calls[1], /window\.float\(.*action = "set"/);
  assert.match(calls[2], /window\.resize/);
});

test("a window the compositor does not know does nothing", () => {
  const calls = snap(LAYOUTS[0][0], { ...client, address: "0xdead" }, monitor);
  assert.deepEqual(calls, []);
});
