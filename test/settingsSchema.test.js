const test = require("node:test");
const assert = require("node:assert/strict");
const {
  settingsSchema,
  effectiveView,
  applyIntent,
  barMenuRows,
} = require("../DockConfig.js");

const settingsValues = (entry) => effectiveView(entry).values;
const effectiveTaskbar = (entry) => effectiveView(entry).taskbar;

const fields = () => settingsSchema().flatMap((g) => g.fields);
const TYPES = ["bool", "choice", "int", "slider", "text", "list"];

test("every field has a unique key, a label and a known widget type", () => {
  const keys = fields().map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const f of fields()) {
    assert.ok(f.label, f.key);
    assert.ok(TYPES.includes(f.type), `${f.key}: ${f.type}`);
    if (f.type === "choice") assert.ok(f.options.length >= 2, f.key);
    if (f.type === "int" || f.type === "slider") {
      assert.ok(f.min < f.max && f.step > 0, f.key);
    }
  }
});

test("the schema covers every setting the config module understands, and nothing else", () => {
  const known = new Set([
    ...Object.keys(effectiveView(null).settings),
    ...Object.keys(effectiveView(null).taskbar),
    "startPlaces",
  ]);
  const schemaKeys = new Set(fields().map((f) => f.key));
  assert.deepEqual([...schemaKeys].sort(), [...known].sort());
});

test("settingsValues gives every field its effective value, defaults when unset", () => {
  const values = settingsValues(null);
  for (const f of fields()) assert.ok(f.key in values, f.key);
  assert.equal(values.style, "dock");
  assert.equal(values.iconSize, 48);
  assert.equal(values.startPlaces, null);
  assert.equal(values.showWorkspaceBadge, false);
});

test("settingsValues reflects the entry, including a custom startPlaces list", () => {
  const values = settingsValues({ style: "taskbar", alignment: "left", iconSize: 64, startPlaces: ["~/a", "~/b"] });
  assert.equal(values.style, "taskbar");
  assert.equal(values.alignment, "left");
  assert.equal(values.iconSize, 64);
  assert.deepEqual(values.startPlaces, ["~/a", "~/b"]);
});

test("a choice field's options are exactly the values the config accepts", () => {
  for (const f of fields().filter((x) => x.type === "choice")) {
    for (const o of f.options) {
      const entry = { style: "taskbar", [f.key]: o.value };
      assert.equal(settingsValues(entry)[f.key], o.value, `${f.key}=${o.value}`);
    }
  }
});

test("int and slider ranges sit inside what the config accepts as usable", () => {
  for (const f of fields().filter((x) => x.type === "int" || x.type === "slider")) {
    for (const v of [f.min, f.max]) {
      const got = settingsValues({ style: "taskbar", [f.key]: v })[f.key];
      assert.equal(got, v, `${f.key}=${v}`);
    }
  }
});

test("setSettings removes a key when its patched value is undefined or null", () => {
  assert.deepEqual(applyIntent({ a: 1, b: 2 }, { type: "setSettings", patch: { a: undefined } }), { b: 2 });
  assert.deepEqual(applyIntent({ a: 1, b: 2 }, { type: "setSettings", patch: { b: null } }), { a: 1 });
  assert.deepEqual(applyIntent({ a: 1 }, { type: "setSettings", patch: { a: 0 } }), { a: 0 });
});

test("both quick menus end with a Settings... row that opens the settings window", () => {
  for (const style of ["dock", "taskbar"]) {
    const rows = barMenuRows(effectiveTaskbar({ style }));
    const last = rows[rows.length - 1];
    assert.equal(last.label, "Settings\u2026");
    assert.equal(last.action, "settings");
  }
});
