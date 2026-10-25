// Pure Start menu rows and commands (docs/SPEC.md "Start menu"; vocabulary in
// CONTEXT.md). No Quickshell or QML imports, so the exact same file loads as a
// JS import inside the shell and via `require` under Node for the test suite.
//
// What the menu's lists offer and run: the rows of the app, user and power
// overlays (`overlayRows`), the account's name (`parseFullName`) and the argv
// that opens a Place (`openCommand`). StartMenu.js carries out the effects
// these rows name.

// The account's real name from a `getent passwd` line (the fifth,
// comma-separated field's first part), else `fallback`.
function parseFullName(passwdLine, fallback) {
  var line = String(passwdLine || "").split("\n")[0];
  var fields = line.split(":");
  var name = fields.length > 4 ? fields[4].split(",")[0].trim() : "";
  return name.length > 0 ? name : fallback;
}

// The menu behind the user's name in the Start menu (Windows 11 offers lock
// and sign out there).
function startUserActions() {
  return [
    { label: "Lock", command: "omarchy-system-lock" },
    { label: "Sign out", command: "omarchy-system logout" },
  ];
}

function startPowerActions() {
  return [
    { label: "Sleep", command: "systemctl suspend" },
    { label: "Restart", command: "omarchy-system reboot" },
    { label: "Shut down", command: "omarchy-system shutdown" },
  ];
}

// The rows of whichever overlay is up, each { label, action } where `action`
// is the effect choosing it carries out. `ctx.startPinIds` / `ctx.dockPinIds`
// decide the Pin / Unpin wording.
function overlayRows(overlay, ctx) {
  if (!overlay) return [];
  if (overlay.kind === "power" || overlay.kind === "user") {
    var actions = overlay.kind === "power" ? startPowerActions() : startUserActions();
    return actions.map(function (a) { return { label: a.label, action: { type: "run", command: a.command } }; });
  }
  var app = overlay.app;
  var startPinned = ctx.startPinIds.indexOf(app.id) >= 0;
  var dockPinned = ctx.dockPinIds.indexOf(app.id) >= 0;
  return [
    {
      label: startPinned ? "Unpin from Start" : "Pin to Start",
      action: { type: "apply", intent: { type: startPinned ? "unpinStartApp" : "pinStartApp", appId: app.id } },
    },
    {
      label: dockPinned ? "Unpin from Dock" : "Pin to Dock",
      action: { type: "togglePin", appId: app.id, pinned: dockPinned },
    },
    { label: "Open", action: { type: "launch", app: app } },
  ];
}

// The argv that opens a Place. A path that starts with "-" would be read by
// xdg-open as an option, so it is made relative.
function openCommand(path) {
  var p = String(path === undefined || path === null ? "" : path);
  return ["xdg-open", p.charAt(0) === "-" ? "./" + p : p];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    overlayRows: overlayRows,
    parseFullName: parseFullName,
    openCommand: openCommand,
  };
}
