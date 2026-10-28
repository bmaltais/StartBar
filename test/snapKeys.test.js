const test = require("node:test");
const assert = require("node:assert/strict");
const { chordOf, normalize, label } = require("../SnapKeys.js");

const CTRL = 0x04000000, ALT = 0x08000000, SHIFT = 0x02000000, META = 0x10000000;

test("a key event makes a canonical chord", () => {
  assert.equal(chordOf(0x46, 0), "f"); // Key_F
  assert.equal(chordOf(0x4d, CTRL), "ctrl+m");
  assert.equal(chordOf(0x4d, SHIFT | META | CTRL | ALT), "ctrl+alt+shift+meta+m");
  assert.equal(chordOf(0x01000013, 0), "up");
  assert.equal(chordOf(0x01000030, SHIFT), "shift+f1");
  assert.equal(chordOf(0x20, 0), "space");
  assert.equal(chordOf(0x2b, CTRL), "ctrl+plus");
  assert.equal(chordOf(0x2f, 0), "/");
  assert.equal(chordOf(0x35, 0), "5");
});

test("a modifier alone, or an unnamed key, is no chord", () => {
  assert.equal(chordOf(0x01000021, CTRL), null); // Key_Control
  assert.equal(chordOf(0x01000020, SHIFT), null); // Key_Shift
  assert.equal(chordOf(0x01000000, 0), null); // Key_Escape is not bindable
});

test("normalize accepts a hand-written chord and rejects nonsense", () => {
  assert.equal(normalize("Ctrl+M"), "ctrl+m");
  assert.equal(normalize("shift+ctrl+up"), "ctrl+shift+up");
  assert.equal(normalize("F"), "f");
  assert.equal(normalize("+"), "plus");
  assert.equal(normalize("  "), "");
  assert.equal(normalize("ctrl+nope"), null);
  assert.equal(normalize("ab"), null);
  assert.equal(normalize("hyper+x"), null);
  assert.equal(normalize(5), null);
});

test("label spells a chord for the settings window", () => {
  assert.equal(label("ctrl+m"), "Ctrl+M");
  assert.equal(label("up"), "Up");
  assert.equal(label("meta+shift+f5"), "Super+Shift+F5");
  assert.equal(label(""), "");
});
