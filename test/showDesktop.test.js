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
  fs.writeFileSync(path.join(dir, "hyprctl"), `#!/usr/bin/env bash
if [ "$1" = -j ]; then
  case "$2" in
    clients) cat "${file}" ;;
    monitors) echo '[{"id":0,"name":"M0","focused":true,"activeWorkspace":{"id":7}}]' ;;
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
  return { run, places, edit, log: path.join(dir, "log") };
}

const w = (address, id, name = String(id), mapped = true) => ({ address, mapped, workspace: { id, name } });

test("the first press hides every window, the second puts back only those", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2), w("0xcc", 3), w("0xdd", -98, "special:scratchpad")]);
  assert.equal(s.run().status, 0);
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop", "0xbb": "special:showdesktop", "0xcc": "special:showdesktop", "0xdd": "special:scratchpad" });
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
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop", "0xbb": "2", "0xcc": "special:showdesktop" });
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
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop", "0xbb": "special:showdesktop" });
});

test("hovering a hidden window peeks nothing", () => {
  const s = session([w("0xaa", 1), w("0xbb", 2)]);
  s.run();
  assert.equal(s.run(H.peekWindow("0xaa")).status, 0);
  assert.deepEqual(s.places(), { "0xaa": "special:showdesktop", "0xbb": "special:showdesktop" });
});

test("DockHyprland's place() is a copy of DockShowDesktop's", () => {
  assert.equal(H.SHOWDESKTOP_PLACE, require("../DockShowDesktop.js").PLACE);
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
