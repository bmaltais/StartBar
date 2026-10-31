require("./qmlimport");
const test = require("node:test");
const assert = require("node:assert/strict");
const K = require("../CommandKeys.js");

test("normalize: canonical order, aliases, needs a real modifier", () => {
  assert.equal(K.normalize("Super+Z"), "super+z");
  assert.equal(K.normalize("shift+ctrl+meta+u"), "super+ctrl+shift+u");
  assert.equal(K.normalize("Ctrl+U"), "ctrl+u");
  assert.equal(K.normalize("win+d"), "super+d");
  assert.equal(K.normalize(""), "");
  assert.equal(K.normalize("z"), null);
  assert.equal(K.normalize("shift+z"), null);
  assert.equal(K.normalize("super+nope"), null);
  assert.equal(K.normalize(5), null);
});

test("valueOr: absent is the default, empty is unbound, junk is the default", () => {
  assert.equal(K.valueOr(undefined, "super+z"), "super+z");
  assert.equal(K.valueOr("", "super+z"), "");
  assert.equal(K.valueOr("z", "super+z"), "super+z");
  assert.equal(K.valueOr("CTRL+U", "super+z"), "ctrl+u");
});

test("capture spelling round-trips with SnapKeys", () => {
  assert.equal(K.fromChord("ctrl+meta+u"), "ctrl+super+u");
  assert.equal(K.toChord("super+z"), "meta+z");
});

test("desired: defaults, and the snap picker follows snapLayouts", () => {
  const by = (t) => Object.fromEntries(K.desired(t).map((d) => [d.command, d.chord]));
  assert.deepEqual(by({ snapLayouts: true }), { snapPicker: "super+z", showDesktop: "super+d", startMenu: "", settings: "" });
  assert.equal(by({ snapLayouts: false }).snapPicker, "");
  assert.equal(by({ snapLayouts: true, keyShowDesktop: "" }).showDesktop, "");
  assert.equal(by({ snapLayouts: true, keyStartMenu: "ctrl+u" }).startMenu, "ctrl+u");
});

test("hyprKey and modmask", () => {
  assert.equal(K.hyprKey("super+z"), "SUPER + Z");
  assert.equal(K.hyprKey("super+shift+f5"), "SUPER + SHIFT + F5");
  assert.equal(K.hyprKey("ctrl+u"), "CTRL + U");
  assert.equal(K.hyprKey("super+pageup"), "SUPER + Prior");
  assert.equal(K.hyprKey("super+plus"), "SUPER + plus");
  assert.equal(K.modmask("super+ctrl+u"), 68);
  assert.equal(K.modmask("ctrl+alt+shift+x"), 13);
});

const bind = (modmask, key, description, extra) => Object.assign({ modmask, key, description, submap: "", dispatcher: "__lua", arg: "1" }, extra);
const want = (t) => K.desired(Object.assign({ snapLayouts: true }, t));

test("reconcile: binds free keys", () => {
  const plan = K.reconcile(want(), []);
  assert.deepEqual(plan.bind.map((b) => b.command), ["snapPicker", "showDesktop"]);
  assert.deepEqual(plan.unbind, []);
  assert.deepEqual(plan.taken, {});
});

test("reconcile: already bound by us is left alone", () => {
  const plan = K.reconcile(want(), [bind(64, "Z", "StartBar: Snap picker"), bind(64, "D", "StartBar: Show desktop")]);
  assert.deepEqual(plan, { unbind: [], bind: [], taken: {} });
});

test("reconcile: a changed or cleared key unbinds the old one", () => {
  const binds = [bind(64, "Z", "StartBar: Snap picker"), bind(64, "D", "StartBar: Show desktop")];
  const moved = K.reconcile(want({ keySnapPicker: "ctrl+u", keyShowDesktop: "" }), binds);
  assert.deepEqual(moved.unbind, [{ modmask: 64, key: "Z" }, { modmask: 64, key: "D" }]);
  assert.deepEqual(moved.bind.map((b) => b.chord), ["ctrl+u"]);
  const off = K.reconcile(K.desired({ snapLayouts: false }), binds);
  assert.deepEqual(off.unbind, [{ modmask: 64, key: "Z" }, { modmask: 64, key: "D" }].slice(0, 1));
});

test("reconcile: a key held by someone else is not bound, and says who", () => {
  const plan = K.reconcile(want(), [bind(64, "z", "Zoom"), bind(64, "D", "", { dispatcher: "exec", arg: "foo" })]);
  assert.deepEqual(plan.bind, []);
  assert.deepEqual(plan.taken, { keySnapPicker: "Zoom", keyShowDesktop: "exec foo" });
});

test("reconcile: never unbinds a key someone else shares; ignores other submaps", () => {
  const plan = K.reconcile(want({ keySnapPicker: "ctrl+u" }), [bind(64, "Z", "StartBar: Snap picker"), bind(64, "Z", "Zoom"), bind(4, "U", "x", { submap: "resize" })]);
  assert.deepEqual(plan.unbind, []);
  assert.deepEqual(plan.bind.map((b) => b.chord), ["ctrl+u", "super+d"]);
});

test("reconcile: two commands on one key, the first keeps it", () => {
  const plan = K.reconcile(want({ keyShowDesktop: "super+z" }), []);
  assert.deepEqual(plan.bind.map((b) => b.command), ["snapPicker"]);
  assert.equal(plan.taken.keyShowDesktop, "StartBar: Snap picker");
});

test("luaFor: the eval chunk", () => {
  const plan = K.reconcile(want({ keySnapPicker: "ctrl+u" }), [bind(64, "Z", "StartBar: Snap picker")]);
  assert.equal(K.luaFor(plan),
    "hl.unbind('SUPER + Z'); hl.bind('CTRL + U', hl.dsp.exec_cmd('omarchy-shell io.github.bmaltais.startbar openSnapPicker'), { description = 'StartBar: Snap picker' }); "
    + "hl.bind('SUPER + D', hl.dsp.exec_cmd('omarchy-shell io.github.bmaltais.startbar showDesktop'), { description = 'StartBar: Show desktop' })");
  assert.equal(K.luaFor({ unbind: [], bind: [], taken: {} }), "");
});
