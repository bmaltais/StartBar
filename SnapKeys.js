// The keys of the Super+Z picker (docs/SPEC.md "Snap layouts"): a key chord is
// a string such as "f", "up", "ctrl+m" or "ctrl+shift+f5", lowercase, modifiers
// in the order ctrl, alt, shift, meta, then one key name. "" means no key. No
// Quickshell or QML imports, so the file loads under Node for the test suite.
//
//   chordOf(key, modifiers)  the chord a key event makes, from Qt's key code and
//                            modifier mask; null for a modifier on its own or a
//                            key with no name here
//   normalize(value)         a stored chord in canonical form; null if invalid
//   label(chord)             "Ctrl+M", "Up", for the settings window
//   ACTIONS, valueOr, snapKeyMap   the picker's key settings and their chord -> action map

var MODIFIERS = [
  { name: "ctrl", mask: 0x04000000, label: "Ctrl" },
  { name: "alt", mask: 0x08000000, label: "Alt" },
  { name: "shift", mask: 0x02000000, label: "Shift" },
  { name: "meta", mask: 0x10000000, label: "Super" },
];

// Qt::Key values outside the printable ASCII range that a chord can name.
var NAMED = {
  0x20: "space",
  0x2b: "plus",
  0x01000001: "tab",
  0x01000003: "backspace",
  0x01000004: "return",
  0x01000005: "return",
  0x01000006: "insert",
  0x01000007: "delete",
  0x01000010: "home",
  0x01000011: "end",
  0x01000012: "left",
  0x01000013: "up",
  0x01000014: "right",
  0x01000015: "down",
  0x01000016: "pageup",
  0x01000017: "pagedown",
};
for (var f = 1; f <= 12; f++) NAMED[0x01000030 + f - 1] = "f" + f;

var NAMES = {};
Object.keys(NAMED).forEach(function (code) { NAMES[NAMED[code]] = true; });

function keyName(key) {
  if (NAMED[key]) return NAMED[key];
  if (key >= 0x41 && key <= 0x5a) return String.fromCharCode(key + 32);
  if (key > 0x20 && key < 0x7f) return String.fromCharCode(key);
  return null;
}

function validName(name) {
  return !!NAMES[name] || (name.length === 1 && name.charCodeAt(0) > 0x20 && name.charCodeAt(0) < 0x7f && name !== "+");
}

function chordOf(key, modifiers) {
  var name = keyName(key);
  if (!name) return null;
  var parts = [];
  for (var i = 0; i < MODIFIERS.length; i++) {
    if ((modifiers || 0) & MODIFIERS[i].mask) parts.push(MODIFIERS[i].name);
  }
  parts.push(name);
  return parts.join("+");
}

function normalize(value) {
  if (typeof value !== "string") return null;
  var text = value.trim().toLowerCase();
  if (text.length === 0) return "";
  // A lone "+" is the plus key; "ctrl++" is not how a chord is written.
  var tokens = text === "+" ? ["plus"] : text.split("+");
  var name = tokens.pop();
  if (!validName(name)) return null;
  var seen = {};
  for (var t = 0; t < tokens.length; t++) {
    var known = MODIFIERS.some(function (m) { return m.name === tokens[t]; });
    if (!known) return null;
    seen[tokens[t]] = true;
  }
  var parts = MODIFIERS.filter(function (m) { return seen[m.name]; }).map(function (m) { return m.name; });
  parts.push(name);
  return parts.join("+");
}

function label(chord) {
  if (!chord) return "";
  var tokens = chord.split("+");
  return tokens.map(function (token) {
    for (var i = 0; i < MODIFIERS.length; i++) if (MODIFIERS[i].name === token) return MODIFIERS[i].label;
    if (token === "plus") return "+";
    return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
  }).join("+");
}

// ---- The settings: one chord per action ----

// The keys that act on the Window of the Super+Z picker (docs/SPEC.md "Snap
// layouts"): one setting per action, holding one chord, "" for none. `action`
// is a DockModel.windowActions id, or "close".
var ACTIONS = [
  { key: "snapKeyMaximize", action: "maximize", label: "Maximize", fallback: "f" },
  { key: "snapKeyFullscreen", action: "fullscreen", label: "Full screen", fallback: "x" },
  { key: "snapKeyFloat", action: "float", label: "Float / tile", fallback: "t" },
  { key: "snapKeyCenter", action: "center", label: "Center (floating)", fallback: "c" },
  { key: "snapKeyPin", action: "pin", label: "Pin on top (floating)", fallback: "p" },
  { key: "snapKeyScratchpad", action: "scratchpad", label: "Move to scratchpad", fallback: "s" },
  { key: "snapKeyMoveLeft", action: "moveLeft", label: "Move left (tiled)", fallback: "h" },
  { key: "snapKeyMoveDown", action: "moveDown", label: "Move down (tiled)", fallback: "j" },
  { key: "snapKeyMoveUp", action: "moveUp", label: "Move up (tiled)", fallback: "k" },
  { key: "snapKeyMoveRight", action: "moveRight", label: "Move right (tiled)", fallback: "l" },
  { key: "snapKeyClose", action: "close", label: "Close window", fallback: "" },
];

// A key setting: a chord (SnapKeys.js), "" when blank, the default when unusable.
// Escape cannot be taken: it closes the picker.
function valueOr(value, fallback) {
  var chord = normalize(value);
  return chord === null ? fallback : chord;
}

// Chord -> action for the picker's keys, from the effective taskbar. When two
// actions share a chord, the first in ACTIONS keeps it.
function snapKeyMap(taskbar) {
  var map = {};
  for (var i = 0; i < ACTIONS.length; i++) {
    var ch = taskbar ? taskbar[ACTIONS[i].key] : "";
    if (ch && !map[ch]) map[ch] = ACTIONS[i].action;
  }
  return map;
}

// The settings window's fields for them, each dimmed while Snap layouts is off.
function settingsFields() {
  return ACTIONS.map(function (k, n) {
    var field = { key: k.key, label: k.label, type: "key", enabledWhen: { key: "snapLayouts", is: true } };
    if (n === 0) {
      field.heading = "In the snap picker";
      field.hint = "Keys pressed while the picker is open act on the window. Click, then press the key (Backspace clears); it replaces that key's usual job in the picker";
    }
    return field;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { chordOf: chordOf, normalize: normalize, label: label, ACTIONS: ACTIONS, valueOr: valueOr, settingsFields: settingsFields, snapKeyMap: snapKeyMap };
}
