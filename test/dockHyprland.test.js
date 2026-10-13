const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const H = require("../DockHyprland.js");
const { windowActions } = require("../DockModel.js");

const ADDR = "0x56538020a4f0";
const scriptOf = (argv) => argv[2];

// Every command the module can produce, for the syntax check.
const all = {
  focusWindow: H.focusWindow(ADDR),
  focusWindowAndWarp: H.focusWindowAndWarp(ADDR),
  closeWindow: H.closeWindow(ADDR),
  peekWindow: H.peekWindow(ADDR),
  peekRestore: H.peekRestore(),
  peekCommit: H.peekCommit(),
  openOnOwnWorkspace: H.openOnOwnWorkspace(ADDR, "maximized"),
  openOnOwnWorkspaceFullscreen: H.openOnOwnWorkspace(ADDR, "fullscreen"),
  openOnOwnWorkspaceNormal: H.openOnOwnWorkspace(ADDR, "normal"),
};
for (const id of H.windowActionIds) all["windowAction " + id] = H.windowAction(id, ADDR);

for (const [name, argv] of Object.entries(all)) {
  test(`${name} is a bash -lc argv whose script parses`, () => {
    assert.deepEqual(argv.slice(0, 2), ["bash", "-lc"]);
    assert.equal(argv[3], "bash");
    const result = spawnSync("bash", ["-n"], { input: scriptOf(argv) });
    assert.equal(result.status, 0, result.stderr.toString());
  });
}

test("addresses are normalized and never spliced into a script", () => {
  assert.equal(H.normalizedAddress("56538020a4f0"), ADDR);
  assert.equal(H.normalizedAddress(ADDR), ADDR);
  assert.equal(H.normalizedAddress("0x"), null);
  assert.equal(H.normalizedAddress("x; rm -rf ~"), null);
  assert.equal(H.normalizedAddress(null), null);
  const argv = H.focusWindow("56538020a4f0");
  assert.equal(argv[4], ADDR);
  assert.ok(!scriptOf(argv).includes("56538020a4f0"));
});

test("a bad address produces no command", () => {
  for (const fn of [H.focusWindow, H.focusWindowAndWarp, H.closeWindow, H.peekWindow]) {
    assert.equal(fn("not hex"), null);
  }
  assert.equal(H.windowAction("maximize", "nope"), null);
});

test("focusing keeps the pointer put and raises a floating Window", () => {
  const script = scriptOf(all.focusWindow);
  assert.match(script, /no_warps = true/);
  assert.match(script, /hl\.dsp\.focus\(\{ window = \\"address:\$addr\\" \}\)/);
  assert.match(script, /raise "\$addr"/);
  assert.match(script, /no_warps = \$orig/);
});

test("focus-and-warp moves the pointer to the Window instead", () => {
  const script = scriptOf(all.focusWindowAndWarp);
  assert.match(script, /hl\.dsp\.cursor\.move/);
  assert.doesNotMatch(script, /no_warps/);
});

test("every Window-state row has a dispatch aimed by address, and no others exist", () => {
  const ids = new Set();
  for (const window of [
    { fullscreen: 0, floating: false, workspace: "1" },
    { fullscreen: 1, floating: true, pinned: true, workspace: "1" },
    { fullscreen: 2, floating: true, workspace: "special:scratchpad" },
  ]) for (const a of windowActions(window)) ids.add(a.id);
  assert.deepEqual([...ids].sort(), [...H.windowActionIds].sort());
  for (const id of ids) {
    const argv = H.windowAction(id, ADDR);
    assert.ok(argv[4].includes(`window = "address:${ADDR}"`), id);
    assert.match(argv[4], /^hl\.dsp\.window\./);
  }
  assert.equal(H.windowAction("rm -rf", ADDR), null);
  assert.equal(H.windowAction("constructor", ADDR), null);
});

test("close dispatches window.close at the address argument", () => {
  assert.match(scriptOf(all.closeWindow), /hl\.dsp\.window\.close/);
});

test("peek scripts share one lock and one state file", () => {
  for (const name of ["peekWindow", "peekRestore", "peekCommit"]) {
    assert.match(scriptOf(all[name]), /startbar-peek\.lock/, name);
    assert.match(scriptOf(all[name]), /startbar-peek"/, name);
  }
});

test("a first peek saves state, a later one undoes the previous peek first", () => {
  const script = scriptOf(all.peekWindow);
  assert.match(script, /if \[ -f "\$state" \]/);
  assert.ok(script.indexOf("undo\n") < script.indexOf("} > \"$state\""));
});

test("restore puts back state and focus, commit only drops the state", () => {
  const restore = scriptOf(all.peekRestore);
  assert.match(restore, /rm -f "\$state"/);
  assert.match(restore, /focus\(\{ window = \\"address:\$prev\\"/);
  const commit = scriptOf(all.peekCommit);
  assert.match(commit, /flock 9; rm -f /);
  assert.doesNotMatch(commit, /hyprctl/);
});

for (const name of ["focusWindow", "focusWindowAndWarp"]) {
  test(`${name} brings a Window minimized to special:minimized back before focusing it`, () => {
    const script = scriptOf(all[name]);
    assert.match(script, /special:minimized/);
    assert.ok(script.indexOf('restore "$addr"') < script.indexOf("hl.dsp.focus({ window"));
  });
}

test("openOnOwnWorkspace refuses a mode it does not know", () => {
  assert.equal(H.openOnOwnWorkspace(ADDR, "off"), null);
  assert.equal(H.openOnOwnWorkspace(ADDR, "x; rm -rf ~"), null);
  assert.equal(H.openOnOwnWorkspace(ADDR), null);
});
