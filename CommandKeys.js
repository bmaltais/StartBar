// The Command keys (CONTEXT.md): keys StartBar itself binds, at runtime, to
// its own commands (docs/keyboard.md). A key is a chord string such as
// "super+z" or "super+shift+f5": lowercase, modifiers in the order super, ctrl,
// alt, shift, then one key name, and at least one of super, ctrl and alt, so a Command key
// never takes a plain key from the apps. "" means no key. No Quickshell or QML
// imports, so the file loads under Node for the test suite.
//
//   COMMANDS                      the commands that have a key, their settings and defaults
//   normalize(value)              a stored key in canonical form; null if unusable
//   valueOr(value, fallback)      the effective key: absent -> fallback, "" -> "", junk -> fallback
//   toChord / fromChord           the SnapKeys.js spelling (meta) <-> this file's (super)
//   desired(taskbar)              the key each command has now ("" when unbound or gated off)
//   hyprKey(chord), modmask(chord) the chord as Hyprland writes it / as its `binds` JSON counts it
//   reconcile(desired, binds)     what to unbind and bind, and which keys are taken, given `hyprctl -j binds`
//   luaFor(plan)                  the `hyprctl eval` chunk that carries a plan out
//   settingsFields()              the Keyboard page's command rows

.import "SnapKeys.js" as SnapKeys

var IPC_TARGET = "io.github.bmaltais.startbar";
var DESCRIPTION_PREFIX = "StartBar: ";

// `ipc` is the command the bind runs (omarchy-shell <target> <ipc>). The snap
// picker's bind only opens it (Escape closes), so a second press cannot close
// the card it just opened. `needs` is a Boolean setting that must be on.
var COMMANDS = [
  { key: "keySnapPicker", command: "snapPicker", ipc: "openSnapPicker", label: "Snap picker", fallback: "super+z", needs: "snapLayouts" },
  { key: "keyShowDesktop", command: "showDesktop", ipc: "showDesktop", label: "Show desktop", fallback: "super+d" },
  { key: "keyStartMenu", command: "startMenu", ipc: "startMenu", label: "Start menu", fallback: "" },
  { key: "keySettings", command: "settings", ipc: "settings", label: "Settings", fallback: "" },
];

// Modifier -> [name, Hyprland's name, bit of `modmask` in `hyprctl -j binds`].
var MODIFIERS = [
  { name: "super", hypr: "SUPER", mask: 64 },
  { name: "ctrl", hypr: "CTRL", mask: 4 },
  { name: "alt", hypr: "ALT", mask: 8 },
  { name: "shift", hypr: "SHIFT", mask: 1 },
];
var ALIASES = { meta: "super", win: "super", windows: "super", mod4: "super", control: "ctrl" };

// Key names whose Hyprland (xkb) keysym differs from the chord's name.
var HYPR_NAMES = {
  plus: "plus", pageup: "Prior", pagedown: "Next", " ": "space",
  ",": "comma", ".": "period", "-": "minus", "=": "equal", "/": "slash", "\\": "backslash",
  ";": "semicolon", "'": "apostrophe", "`": "grave", "[": "bracketleft", "]": "bracketright",
};

function normalize(value) {
  if (typeof value !== "string") return null;
  var text = value.trim().toLowerCase();
  if (text.length === 0) return "";
  var tokens = text === "+" ? ["plus"] : text.split("+");
  var name = tokens.pop();
  // The key name is checked by SnapKeys: "ctrl+" + name must come back as such.
  if (SnapKeys.normalize(name) !== name || name === "") return null;
  var seen = {};
  for (var t = 0; t < tokens.length; t++) {
    var token = ALIASES[tokens[t]] || tokens[t];
    if (!MODIFIERS.some(function (m) { return m.name === token; })) return null;
    seen[token] = true;
  }
  var parts = MODIFIERS.filter(function (m) { return seen[m.name]; }).map(function (m) { return m.name; });
  // Shift alone would take capital letters from every app.
  if (parts.every(function (p) { return p === "shift"; })) return null;
  parts.push(name);
  return parts.join("+");
}

function valueOr(value, fallback) {
  if (value === undefined || value === null) return fallback;
  var chord = normalize(value);
  return chord === null ? fallback : chord;
}

// SnapKeys.js (the settings window's key capture) calls the Super key "meta".
function toChord(command) {
  return command ? command.split("+").map(function (t) { return t === "super" ? "meta" : t; }).join("+") : "";
}

function fromChord(chord) {
  return chord ? chord.split("+").map(function (t) { return t === "meta" ? "super" : t; }).join("+") : "";
}

// What each command is bound to right now. `taskbar` is the effective taskbar.
function desired(taskbar) {
  return COMMANDS.map(function (c) {
    var bar = taskbar || {};
    var chord = valueOr(bar[c.key], c.fallback);
    if (c.needs && !bar[c.needs]) chord = "";
    return { key: c.key, command: c.command, ipc: c.ipc, label: c.label, chord: chord };
  });
}

function keyName(chord) {
  var name = chord.split("+").pop();
  return HYPR_NAMES[name] || name.toUpperCase();
}

// "super+shift+z" -> "SUPER + SHIFT + Z", as hl.bind and hl.unbind take it.
function hyprKey(chord) {
  var parts = chord.split("+");
  parts.pop();
  var mods = parts.map(function (p) { return MODIFIERS.filter(function (m) { return m.name === p; })[0].hypr; });
  return mods.concat([keyName(chord)]).join(" + ");
}

function modmask(chord) {
  var mask = 0;
  chord.split("+").slice(0, -1).forEach(function (p) {
    MODIFIERS.forEach(function (m) { if (m.name === p) mask |= m.mask; });
  });
  return mask;
}

function sameKey(bind, chord) {
  return bind.modmask === modmask(chord) && String(bind.key).toLowerCase() === keyName(chord).toLowerCase();
}

function isOurs(bind) {
  return typeof bind.description === "string" && bind.description.indexOf(DESCRIPTION_PREFIX) === 0;
}

// What to call the bind that holds a key, for the "Taken by" note.
function owner(bind) {
  if (bind.description) return String(bind.description);
  if (bind.dispatcher && bind.dispatcher !== "__lua") return String(bind.dispatcher) + (bind.arg ? " " + bind.arg : "");
  return "another binding";
}

// Given what each command wants (desired()) and Hyprland's `binds` (parsed
// `hyprctl -j binds`), the work to do: `unbind` the Hyprland keys our binds
// hold that are not wanted, `bind` the commands whose key is free, and `taken`
// (setting key -> who holds it) for the wanted keys another bind holds. It reads
// the state each time, so a reload (which drops our binds), a restart or a
// changed setting all come out right. A bind of someone else is never removed
// (hl.unbind takes every bind on a key): when a key is shared with one, ours
// stays and is not rebound. Two commands on one key: the first keeps it.
function reconcile(wanted, binds) {
  var all = Array.isArray(binds) ? binds.filter(function (b) { return b && b.submap === ""; }) : [];
  var plan = { unbind: [], bind: [], taken: {} };
  var claimed = [];
  var unbound = {};
  function dropOurs(bind) {
    var shared = all.some(function (o) { return !isOurs(o) && o.modmask === bind.modmask && String(o.key).toLowerCase() === String(bind.key).toLowerCase(); });
    var id = bind.modmask + ":" + String(bind.key).toLowerCase();
    if (shared || unbound[id]) return;
    unbound[id] = true;
    plan.unbind.push({ modmask: bind.modmask, key: bind.key });
  }
  wanted.forEach(function (w) {
    var description = DESCRIPTION_PREFIX + w.label;
    var ours = all.filter(function (b) { return b.description === description; });
    var right = w.chord ? ours.filter(function (b) { return sameKey(b, w.chord); }) : [];
    ours.forEach(function (b) { if (right.indexOf(b) === -1) dropOurs(b); });
    if (!w.chord) return;
    var earlier = claimed.filter(function (c) { return c.chord === w.chord; })[0];
    if (earlier) { plan.taken[w.key] = DESCRIPTION_PREFIX + earlier.label; return; }
    claimed.push(w);
    var holder = all.filter(function (b) { return !isOurs(b) && sameKey(b, w.chord); })[0]
      || all.filter(function (b) { return isOurs(b) && b.description !== description && sameKey(b, w.chord); })[0];
    if (holder) { plan.taken[w.key] = owner(holder); return; }
    if (right.length === 0) plan.bind.push({ key: w.key, command: w.command, ipc: w.ipc, label: w.label, chord: w.chord });
  });
  return plan;
}

function lua(text) {
  return "'" + String(text).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
}

// An unbind from `reconcile` needs the key as Hyprland names it; the JSON has
// it as `key` with the mask, so rebuild "SUPER + Z".
function hyprKeyOf(bind) {
  var mods = MODIFIERS.filter(function (m) { return (bind.modmask & m.mask) !== 0; }).map(function (m) { return m.hypr; });
  return mods.concat([String(bind.key)]).join(" + ");
}

// The `hyprctl eval` chunk for a plan; "" when there is nothing to do. The
// chord, label and command come from this file's tables, never from input.
function luaFor(plan) {
  var out = [];
  plan.unbind.forEach(function (b) { out.push("hl.unbind(" + lua(hyprKeyOf(b)) + ")"); });
  plan.bind.forEach(function (b) {
    out.push("hl.bind(" + lua(hyprKey(b.chord)) + ", hl.dsp.exec_cmd(" + lua("omarchy-shell " + IPC_TARGET + " " + b.ipc) + "), { description = "
      + lua(DESCRIPTION_PREFIX + b.label) + " })");
  });
  return out.join("; ");
}

// The Keyboard page's rows for the commands (the picker's own keys follow:
// SnapKeys.settingsFields).
function settingsFields() {
  return COMMANDS.map(function (c, n) {
    var field = { key: c.key, label: c.label, type: "key", command: true };
    if (n === 0) field.heading = "Commands";
    if (n === 0) field.hint = "Keys StartBar binds itself, anywhere on the desktop. Click, then press the key with Super, Ctrl or Alt, and Shift if you like (Backspace clears). A key bound elsewhere is left alone";
    if (c.needs) field.enabledWhen = { key: c.needs, is: true };
    return field;
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COMMANDS: COMMANDS, normalize: normalize, valueOr: valueOr, toChord: toChord, fromChord: fromChord, desired: desired,
    hyprKey: hyprKey, modmask: modmask, reconcile: reconcile, luaFor: luaFor, settingsFields: settingsFields,
  };
}
