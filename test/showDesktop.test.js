require("./qmlimport");
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { showDesktop } = require("../DockShowDesktop.js");
const H = require("../DockHyprland.js");

test("showDesktop is a bash -lc argv whose script parses", () => {
  const argv = showDesktop();
  assert.deepEqual(argv.slice(0, 2), ["bash", "-lc"]);
  assert.equal(spawnSync("bash", ["-n"], { input: argv[2] }).status, 0);
});

// A stub hyprctl over a clients file: `dispatch` moves are applied to it and logged.
function session(clients) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "showdesktop-"));
  const file = path.join(dir, "clients.json");
  fs.writeFileSync(file, JSON.stringify(clients));
  fs.writeFileSync(path.join(dir, "monitors.json"), JSON.stringify(MONITORS));
  fs.writeFileSync(path.join(dir, "hyprctl"), `#!/usr/bin/env bash
if [ "$1" = -j ]; then
  case "$2" in
    clients) cat "${file}" ;;
    monitors) cat "${dir}/monitors.json" ;;
    activewindow) echo '{"address":"0xaa"}' ;;
  esac
else
  echo "$2" >> "${dir}/log"
  ws=$(echo "$2" | sed -n 's/.*workspace = "\\([^"]*\\)".*/\\1/p')
  addr=$(echo "$2" | sed -n 's/.*address:\\([0-9a-fx]*\\)".*/\\1/p')
  [ -n "$ws" ] && jq --arg a "$addr" --arg w "$ws" 'map(if .address == $a then .workspace = (if ($w | startswith("special:")) then {id: -99, name: $w} else {id: ($w | tonumber), name: $w} end) else . end)' "${file}" > "${file}.new" && mv "${file}.new" "${file}"
fi
exit 0
`, { mode: 0o755 });
  const run = (argv = showDesktop()) => spawnSync("bash", [...argv.slice(1)], {
    env: { ...process.env, PATH: dir + ":" + process.env.PATH, XDG_RUNTIME_DIR: dir, HYPRLAND_INSTANCE_SIGNATURE: "t" },
  });
  const places = () => Object.fromEntries(JSON.parse(fs.readFileSync(file)).map((c) => [c.address, c.workspace.name]));
  const edit = (fn) => fs.writeFileSync(file, JSON.stringify(fn(JSON.parse(fs.readFileSync(file)))));
  const setMonitors = (list) => fs.writeFileSync(path.join(dir, "monitors.json"), JSON.stringify(list));
  return { run, places, edit, setMonitors, log: path.join(dir, "log") };
}

const mon = (id, name, x, focused = false) => ({ id, name, x, y: 0, width: 1920, height: 1080, scale: 1, focused, activeWorkspace: { id: 7 + id } });
const MONITORS = [mon(0, "M0", 0, true), mon(1, "M1", 1920)];

const w = (address, id, name = String(id), mapped = true) => ({ address, mapped, monitor: id % 2, workspace: { id, name } });

test("the first press hides every window, the second puts back only those", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2), w("0xcc", 3), w("0xdd", -98, "special:scratchpad")]);
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop1", "0xbb": "special:showdesktop0", "0xcc": "special:showdesktop1", "0xdd": "special:scratchpad" });
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "1", "0xbb": "2", "0xcc": "3", "0xdd": "special:scratchpad" });
});

test("a window opened while hidden stays where it opened; one closed is skipped", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  s.edit((c) => c.filter((x) => x.address !== "0xbb").concat(w("0xee", 4)));
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "1", "0xee": "4" });
});

test("with no windows a press saves nothing, so the next press hides again", () => {
  const s = session([]);
  assert.equal(s.run().status, 0);
  assert.equal(s.run().status, 0);
});

test("clicking a hidden window brings back only it; the rest stay hidden until the next press", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2), w("0xcc", 3)]);
  s.run();
  assert.equal(s.run(H.focusWindow("0xbb")).status, 0);
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop1", "0xbb": "2", "0xcc": "special:showdesktop1" });
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "1", "0xbb": "2", "0xcc": "3" });
});

test("clicking the last hidden window forgets the state, so the next press hides again", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  s.run(H.focusWindow("0xaa"));
  s.run(H.focusWindow("0xbb"));
  assert.deepEqual(s.places(), { "0xaa": "1", "0xbb": "2" });
  s.run();
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop1", "0xbb": "special:showdesktop0" });
});

test("hovering a hidden window peeks nothing", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  assert.equal(s.run(H.peekWindow("0xaa")).status, 0);
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop1", "0xbb": "special:showdesktop0" });
});

test("floating windows come back floating at their saved position and size", () => {
  const s = session([{ ...w("0xaa", 1), floating: true, at: [10, 20], size: [300, 200] }, w("0xbb", 2)]);
  s.run();
  s.run();
  const log = fs.readFileSync(s.log, "utf8");
  assert.match(log, /resize\(\{ x = 300, y = 200, exact = true, window = "address:0xaa"/);
  assert.match(log, /move\(\{ x = 10, y = 20, window = "address:0xaa"/);
  assert.doesNotMatch(log, /resize.*0xbb/);
});

test("each window is hidden on its own monitor's workspace, monitors are focused to do it, and no window is refocused afterwards", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  const log = fs.readFileSync(s.log, "utf8");
  assert.match(log, /focus\(\{ monitor = "M1" \}\)/);
  assert.match(log, /focus\(\{ monitor = "M0" \}\)/);
  assert.doesNotMatch(log, /focus\(\{ window/, "refocusing a hidden window would show its workspace again");
  // The monitor that was focused (M0) gets the focus back, last.
  const focuses = log.split("\n").filter((l) => l.includes("hl.dsp.focus"));
  assert.match(focuses[focuses.length - 1], /monitor = "M0"/);
});

test("a floating window's saved spot on a monitor that was unplugged while hidden is not applied", () => {
  const spot = { floating: true, at: [2000, 20], size: [300, 200] }; // on M1
  const s = session([{ ...w("0xaa", 1), ...spot }, { ...w("0xbb", 2), floating: true, at: [10, 20], size: [300, 200] }]);
  s.run();
  s.setMonitors([mon(0, "M0", 0, true)]); // M1 is gone
  assert.equal(s.run().status, 0);
  const log = fs.readFileSync(s.log, "utf8");
  assert.doesNotMatch(log, /resize.*0xaa/, "no resize to a spot on no monitor");
  assert.doesNotMatch(log, /move\(\{ x = 2000/, "no move to a spot on no monitor");
  assert.match(log, /resize.*0xbb/, "a spot still on a monitor is applied");
  assert.equal(s.places()["0xaa"], "1", "the window itself still goes back to its workspace");
});

test("windows come back after a monitor was added while hidden, which they never meant to use", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.setMonitors([mon(0, "M0", 0, true)]);
  s.run();
  s.setMonitors([mon(0, "M0", 0, true), mon(1, "M1", 1920), mon(2, "M2", 3840)]);
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "1", "0xbb": "2" });
});

test("restore does not depend on the hidden workspace's monitor still existing", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  s.setMonitors([mon(1, "M1", 0, true)]); // monitor 0 is gone; the old names are stale
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "1", "0xbb": "2" });
});

test("a hidden workspace left showing on a monitor is closed at the end of a restore", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  // Monitor M1 is showing the (now empty) hidden workspace: the dimmed, blurred look.
  s.setMonitors([mon(0, "M0", 0, true), { ...mon(1, "M1", 1920), specialWorkspace: { name: "special:showdesktop0" } }]);
  assert.equal(s.run().status, 0);
  const log = fs.readFileSync(s.log, "utf8");
  assert.match(log, /focus\(\{ monitor = "M1" \}\)[\s\S]*toggle_special\("showdesktop0"\)/, "focus the monitor that shows it, then toggle it");
  const last = log.split("\n").filter((l) => l.includes("hl.dsp.focus")).pop();
  assert.match(last, /window = "address:0xaa"|monitor = "M0"/, "focus goes back where it was");
});

test("with nothing left showing, no hidden workspace is toggled", () => {
  const s = session([w("0xaa", 1)]);
  s.run();
  s.run();
  assert.doesNotMatch(fs.readFileSync(s.log, "utf8"), /toggle_special/);
});

const Hidden = require("../HiddenWindows.js");

test("kind names how a workspace hides a Window", () => {
  assert.equal(Hidden.kind("special:scratchpad"), "scratchpad");
  assert.equal(Hidden.kind("special:minimized"), "minimized");
  assert.equal(Hidden.kind(Hidden.showDesktopWorkspace(1)), "showdesktop");
  assert.equal(Hidden.kind("special:other"), "special");
  assert.equal(Hidden.kind("3"), "visible");
  assert.equal(Hidden.kind(undefined), "visible");
  assert.equal(Hidden.isSpecial("special:other"), true);
  assert.equal(Hidden.isSpecial("3"), false);
});

test("the click path and Show desktop share one place() and one state file", () => {
  assert.ok(Hidden.RESTORE.startsWith(Hidden.PLACE));
  assert.ok(showDesktop()[2].includes(Hidden.PLACE));
  assert.ok(showDesktop()[2].includes(`state=${Hidden.STATE}`));
  assert.ok(Hidden.RESTORE.includes(`state=${Hidden.STATE}`));
});
