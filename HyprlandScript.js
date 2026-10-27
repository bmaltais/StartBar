// The pieces every Hyprland command of the Dock is built from: the address
// check, the argv shape and the shell fragments that guard a dispatch. No
// Quickshell or QML imports, so the same file loads as a JS import inside the
// shell and via `require` under Node.
//
// A command is the argv `["bash", "-lc", script, "bash", arg...]`, run by
// Service.qml; an address is passed as an argument, never spliced into the script.

// HyprlandToplevel.address comes back as bare hex ("56538020a4f0"), unlike
// hyprctl's own "0x"-prefixed address strings: normalize before handing it to
// a dispatch's "address:0x.." window selector. null for anything else.
function normalizedAddress(address) {
  if (typeof address !== "string") return null;
  var hex = address.indexOf("0x") === 0 ? address.slice(2) : address;
  return /^[0-9a-fA-F]+$/.test(hex) ? "0x" + hex : null;
}

// `args` is one argument, a list of them, or none.
function argv(script, args) {
  var list = args === undefined ? [] : [].concat(args);
  return ["bash", "-lc", script, "bash"].concat(list);
}

// Focusing can warp the pointer: toggle cursor:no_warps around a dispatch and
// put the old value back.
var NO_WARPS = "orig=false; hyprctl -j getoption cursor:no_warps | grep -q '\"bool\": true' && orig=true; "
  + "hyprctl eval 'hl.config({ cursor = { no_warps = true } })' >/dev/null; ";
var WARPS_BACK = "hyprctl eval \"hl.config({ cursor = { no_warps = $orig } })\" >/dev/null";

// Take a Window out of maximized and full screen, whichever it is in (the unset
// must name the mode: maximized (1), full screen (2) or both (3)). `target` is
// the dispatch's window selector as shell text, such as `window = \"address:$a\"`.
function unsetFullscreen(target) {
  return "for m in maximized fullscreen; do hyprctl dispatch \"hl.dsp.window.fullscreen({ mode = \\\"$m\\\", action = \\\"unset\\\", "
    + target + " })\" >/dev/null; done";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalizedAddress: normalizedAddress, argv: argv, NO_WARPS: NO_WARPS, WARPS_BACK: WARPS_BACK, unsetFullscreen: unsetFullscreen,
  };
}
