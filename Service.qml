// Dock service entry point (see docs/SPEC.md, milestones 1-4; vocabulary in
// CONTEXT.md). Owns one layer-shell panel per monitor, each rendering the
// same Items built by DockModel.buildDockItems from live Hyprland state,
// the Dock's own Pins, and this session's Placed positions — Hidden by
// default and Revealed by hovering its Reveal Strip, with the
// Active/Attention/running/workspace indicators from milestone 3, a
// context menu for Pin/Unpin/New Window/Close Window, and drag to reorder
// or drag out to unpin/snap back (CONTEXT.md "Placed").
import QtQuick
import QtQml.Models
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "DockModel.js" as DockModel
import "DockConfig.js" as DockConfig

Item {
  id: root

  // Injected by omarchy-shell (the first-party/plugin service loader).
  property var shell: null

  // True for the whole of a drag, on any monitor (docs/SPEC.md "Input";
  // set/cleared around Service.qml's drag.onActiveChanged/finishDrag).
  // dockState.refresh() checks this and skips rebuilding dockState.items
  // while it holds: DockModel.buildDockItems always returns fresh Item
  // objects, so any refresh mid-drag — an unrelated Hyprland event fires
  // constantly on a real desktop — would make the Repeater tear down and
  // rebuild every delegate, destroying the very Item whose MouseArea is
  // driving the drag. finishDrag clears this before placeItem/unpinFromDrag
  // so the drop's own refresh (immediate for a Window Item, via the
  // settings write's reload for a Pin) is never the one that gets skipped.
  property bool dragInProgress: false

  // Icon size and auto-hide timing (SPEC.md "How the Dock behaves" and
  // "Configuration"): read from the Dock's own entry in the shell config
  // (dockSettings below) and defaulted by DockConfig when the entry has no
  // values, a value is missing, or a hand edit leaves one unusable.
  // hideDelayMs must comfortably exceed slideDurationMs: the pointer
  // crosses the sliver between the Reveal Strip and the risen Dock while
  // neither is hovered, and the hide timer must not win that race.
  readonly property int iconSize: dockSettings.iconSize
  readonly property int revealDelayMs: dockSettings.revealDelayMs
  readonly property int hideDelayMs: dockSettings.hideDelayMs
  readonly property int slideDurationMs: 150
  // Kept just thick enough to be reliably hoverable; the screen edge itself
  // stops the cursor, so the strip doesn't need real height to feel solid,
  // and staying thin keeps it from swallowing clicks meant for a maximized
  // window's bottom edge.
  readonly property int revealStripHeight: 4

  // Taskbar style (docs/SPEC.md "Taskbar style"): the Windows-11-like bar is
  // the same Items and behaviour in a different frame, picked by the
  // `style` setting. The dock style never auto-hides off, so autoHide is
  // always true for it (DockConfig.effectiveTaskbar).
  readonly property var taskbar: dockSettings.taskbar
  readonly property bool isTaskbar: taskbar.style === "taskbar"
  readonly property bool autoHide: taskbar.autoHide
  // A fixed palette for colorScheme dark/light, null to follow the theme.
  readonly property var scheme: DockConfig.schemeColors(taskbar.colorScheme)
  readonly property color colBackground: scheme ? scheme.background : Color.background
  readonly property color colForeground: scheme ? scheme.foreground : Color.foreground
  readonly property color colMuted: scheme ? scheme.muted : Color.muted
  readonly property color colAccent: scheme ? scheme.accent : Color.accent
  readonly property color colBorder: scheme ? scheme.border : Color.muted

  // Settings and Pins (docs/SPEC.md "Configuration"): read from the Dock's
  // own entry in the shell config's plugins[] array and written back
  // through shell.updateEntryInline, the write-back hook the shell gives
  // every plugin for its own entry (PluginShellApi.updateEntryInline).
  // rawEntry keeps the entry exactly as last read so write() can fold a
  // change onto it (DockConfig.mergeSettings) instead of replacing it
  // outright — updateEntryInline persists whatever object it's given as
  // the whole entry, so losing rawEntry's other keys here would lose them
  // from shell.json too. pins re-triggers dockState.refresh() on change
  // (below) the same way a Hyprland event does, so a hand edit to the
  // Pins list applies live exactly like a hand edit to a setting does.
  QtObject {
    id: dockSettings

    readonly property string pluginId: root.shell && root.shell.pluginId ? root.shell.pluginId : "bernard.dock"
    property var rawEntry: null
    property int iconSize: DockConfig.DEFAULT_ICON_SIZE
    property int revealDelayMs: DockConfig.DEFAULT_REVEAL_DELAY_MS
    property int hideDelayMs: DockConfig.DEFAULT_HIDE_DELAY_MS
    property var pins: []
    property var taskbar: DockConfig.effectiveTaskbar(null)
    // A Placed Pin's own position (CONTEXT.md "Placed"), persisted here
    // the same way pins is. A Placed Window Item's lives only in
    // dockState.windowPlacements — it has no business surviving a
    // restart — so it isn't part of this settings object at all.
    property var placements: []

    onPinsChanged: dockState.refresh()
    onPlacementsChanged: dockState.refresh()

    function applyShellConfig(shellConfig) {
      var entry = DockConfig.findPluginEntry(shellConfig, dockSettings.pluginId)
      var effective = DockConfig.effectiveSettings(entry)
      dockSettings.rawEntry = entry
      dockSettings.iconSize = effective.iconSize
      dockSettings.revealDelayMs = effective.revealDelayMs
      dockSettings.hideDelayMs = effective.hideDelayMs
      dockSettings.taskbar = DockConfig.effectiveTaskbar(entry)
      dockSettings.pins = DockConfig.effectivePins(entry)
      dockSettings.placements = DockConfig.effectivePlacements(entry)
    }

    function write(patch) {
      if (!root.shell || typeof root.shell.updateEntryInline !== "function") return false
      var merged = DockConfig.mergeSettings(dockSettings.rawEntry, patch)
      return root.shell.updateEntryInline(dockSettings.pluginId, merged)
    }
  }

  FileView {
    id: shellConfigFile
    path: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
    watchChanges: true
    printErrors: false

    function parseText() {
      try {
        return JSON.parse(text() || "{}")
      } catch (e) {
        return null
      }
    }

    onLoaded: dockSettings.applyShellConfig(shellConfigFile.parseText())
    onLoadFailed: dockSettings.applyShellConfig(null)
    onFileChanged: reload()
  }

  // Tracks Launch Order across live IPC updates: each Window's opened-at
  // rank is assigned the first time its address is seen and kept for as
  // long as the Window stays open, so closing one Window never reshuffles
  // the others. Named dockState, not state — every Item already has a
  // built-in `state` property, which would silently shadow an id of that
  // name in any binding written inside an Item (Repeater, Row, ...).
  QtObject {
    id: dockState

    property var openedAtByAddress: ({})
    property int nextOpenedAt: 0
    // A Placed Window Item's own position (CONTEXT.md "Placed"; DockModel.js
    // comment on `placements`): kept only here, in memory, keyed by Window
    // address exactly like openedAtByAddress, and pruned the same way on
    // every refresh — once a Window's address drops out, its entry drops
    // with it, so its Placed position doesn't linger for some later,
    // unrelated Window that happens to reuse the same address.
    property var windowPlacements: ({})
    property var items: []
    // HyprlandToplevel by Window address, for the taskbar's hover previews
    // (the Wayland handle ScreencopyView captures hangs off it).
    property var toplevelByAddress: ({})
    // Window titles by address, kept apart from `items` so a title change
    // (a browser tab switching, say) updates tooltips and previews without
    // rebuilding the Items — see refresh().
    property var titles: ({})
    property string itemsSignature: ""

    // The `placements` DockModel.buildDockItems applies (DockModel.js
    // comment on `placements`): the permanent, persisted Placed Pins from
    // settings, plus this session's Placed Window Items.
    function placements() {
      var combined = dockSettings.placements.slice()
      for (var address in dockState.windowPlacements) {
        combined.push({ key: "window:" + address, index: dockState.windowPlacements[address] })
      }
      return combined
    }

    function refresh() {
      if (root.dragInProgress) return

      var toplevels = Hyprland.toplevels ? Hyprland.toplevels.values : []
      var seenAddresses = {}
      var windows = []
      var handles = {}

      for (var i = 0; i < toplevels.length; i++) {
        var toplevel = toplevels[i]
        var address = toplevel.address
        if (typeof address !== "string" || address.length === 0) continue

        seenAddresses[address] = true
        handles[address] = toplevel
        if (!(address in dockState.openedAtByAddress)) {
          dockState.openedAtByAddress[address] = dockState.nextOpenedAt++
        }

        var info = toplevel.lastIpcObject || {}
        windows.push({
          id: address,
          class: info.class || "",
          workspace: toplevel.workspace ? toplevel.workspace.name : String((info.workspace && info.workspace.name) || ""),
          openedAt: dockState.openedAtByAddress[address],
          title: toplevel.title || info.title || "",
          active: !!toplevel.activated,
          attention: !!toplevel.urgent,
          fullscreen: info.fullscreen || 0,
          floating: !!info.floating,
          pinned: !!info.pinned,
        })
      }

      var keptOpenedAt = {}
      for (var key in dockState.openedAtByAddress) {
        if (seenAddresses[key]) keptOpenedAt[key] = dockState.openedAtByAddress[key]
      }
      dockState.openedAtByAddress = keptOpenedAt
      dockState.toplevelByAddress = handles

      var keptPlacements = {}
      for (var placedAddress in dockState.windowPlacements) {
        if (seenAddresses[placedAddress]) keptPlacements[placedAddress] = dockState.windowPlacements[placedAddress]
      }
      dockState.windowPlacements = keptPlacements

      var titles = {}
      for (var t = 0; t < windows.length; t++) titles[windows[t].id] = windows[t].title
      dockState.titles = titles

      // The Repeater below is fed a plain array, so assigning a new one
      // destroys and recreates every Item delegate — including the one the
      // pointer is on, which a hover preview is anchored to. A browser fires
      // a stream of Hyprland events (title changes, tab activity) that
      // change nothing the Dock shows, so only assign when the visible
      // content differs. The signature leaves out `title` (tracked in
      // dockState.titles) and reduces each App to its id.
      var next = DockModel.buildDockItems(windows, resolveApp, dockSettings.pins, resolveAppById, dockState.placements())
      var signature = JSON.stringify(next, function (key, value) {
        if (key === "title") return undefined
        if (key === "app") return value ? value.id : null
        return value
      })
      if (signature === dockState.itemsSignature) return
      dockState.itemsSignature = signature
      dockState.items = next
    }
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) { dockState.refresh() }
  }

  // DesktopEntries scans .desktop files asynchronously in the background,
  // so the very first refresh() (Component.onCompleted, below) can run
  // before it has found any entries, resolving every already-open Window's
  // App to null. Without this, those Windows would be stuck showing a
  // blank Letter Tile forever, since nothing else re-resolves an Item once
  // built — Hyprland's own onRawEvent refresh happens to paper over this on
  // a busy desktop, but not on one sitting idle right after the Dock loads.
  Connections {
    target: DesktopEntries.applications
    function onValuesChanged() { dockState.refresh() }
  }

  // A Window's `class` (used for both App resolution and the Letter Tile
  // fallback) comes from toplevel.lastIpcObject, which Quickshell only
  // populates from a Window's own "openwindow" IPC event — a Window
  // already open when this service starts (every Window, right after
  // enabling the Dock or restarting the shell) never gets that event
  // during this run, so its lastIpcObject stays `{}` forever and it
  // renders as a blank, letter-less square (confirmed on a machine with
  // no Windows opened since the last shell restart). Hyprland.refreshToplevels()
  // force-fetches the missing data via `hyprctl -j clients`.
  Component.onCompleted: {
    Hyprland.refreshToplevels()
    dockState.refresh()
  }

  // refreshToplevels() is async with no completion signal of its own, and a
  // blind "wait a bit then refresh once" timer isn't reliable: confirmed on
  // this machine, a cold `hyprctl -j clients` fetch can take over a
  // second, so a fixed-delay timer fires before the data lands on a slow
  // boot, and nothing else was ever guaranteed to retry — every
  // already-open Window's tile stayed blank until some unrelated Hyprland
  // event happened to trigger a refresh. Confirmed via live logging on
  // this machine that Hyprland.toplevels gains its entries for these
  // Windows *before* their class does: each toplevel is added with an
  // empty lastIpcObject, which is then hydrated moments later in place.
  // So both edges matter — onObjectAdded covers a toplevel that (on some
  // runs) arrives already populated, and the per-toplevel
  // lastIpcObjectChanged watcher below covers the far more common case
  // here, where it arrives empty and is corrected right after.
  Instantiator {
    model: Hyprland.toplevels
    delegate: Item {
      id: hydrationWatcher
      required property var modelData

      Connections {
        target: hydrationWatcher.modelData
        function onLastIpcObjectChanged() { dockState.refresh() }
      }
    }
    onObjectAdded: function (index, object) { dockState.refresh() }
  }

  // The two hydration paths above only fire if `hyprctl -j clients` (the
  // fetch refreshToplevels() triggers) actually lands, and that isn't
  // guaranteed — confirmed live, more than once, on this machine: a
  // Window can sit with an empty class through dozens of unrelated
  // refresh() calls and 20+ seconds (once even 56+ seconds) without
  // either path ever firing for it. This isn't only a login-time thing
  // either — it's been seen for a Window opened minutes into an
  // already-running session, well past any fixed post-startup window.
  // So this polls dockState.items every second, for as long as the
  // service runs, and re-issues refreshToplevels() whenever a Window
  // Item is still sitting unresolved (no App, no Letter Tile letter).
  //
  // An earlier version tried to be clever and stop once nothing looked
  // unresolved, counting a fixed number of attempts after startup only —
  // confirmed live that this disarms itself on attempt 1, before the
  // stalled toplevel has even been added to Hyprland.toplevels (an empty
  // item list has nothing to find unresolved), and confirmed live again
  // that a stall can happen well after any such fixed window would have
  // expired. So this never stops, and only calls refreshToplevels() when
  // there's actually something to fix — a same-tick miss just costs one
  // more second before the next tick catches it, rather than losing the
  // safety net for good.
  Timer {
    interval: 1000
    repeat: true
    running: true

    onTriggered: {
      var unresolved = dockState.items.some(function (it) {
        return it.kind === "window" && !it.app && !it.letter
      })
      if (unresolved) Hyprland.refreshToplevels()
    }
  }

  function resolveApp(window) {
    return window.class ? DesktopEntries.heuristicLookup(window.class) || null : null
  }

  // A Pin resolves its own App directly by the id it was pinned under
  // (CONTEXT.md "Pin"), independent of any Window — unlike resolveApp,
  // which only ever has a window class to go on. A falsy return here is
  // exactly the "App is no longer installed" case (docs/SPEC.md "What the
  // Dock shows").
  function resolveAppById(appId) {
    return appId ? DesktopEntries.byId(appId) || null : null
  }

  // HyprlandToplevel.address comes back as bare hex ("56538020a4f0"),
  // unlike hyprctl's own "0x"-prefixed address strings — normalize before
  // handing it to a dispatch's "address:0x.." window selector.
  function normalizedAddress(address) {
    if (typeof address !== "string") return null
    var hex = address.indexOf("0x") === 0 ? address.slice(2) : address
    return /^[0-9a-fA-F]+$/.test(hex) ? "0x" + hex : null
  }

  // A click on a hover preview (taskbar) can also bring the pointer along
  // (previewWarpPointer): after focusing, the pointer is moved to the middle
  // of the Window, read from `hyprctl -j clients`, which also covers a
  // Window on another workspace or monitor once focus has switched to it.
  function focusWindowAndWarp(address) {
    var normalized = normalizedAddress(address)
    if (!normalized) return
    var script = "addr=\"$1\"; "
      + "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$addr\\\" })\" >/dev/null; "
      + "sleep 0.1; "
      + "pos=$(hyprctl -j clients | jq -r --arg a \"$addr\" '.[] | select(.address == $a) | \"\\(.at[0] + (.size[0] / 2) | floor) \\(.at[1] + (.size[1] / 2) | floor)\"'); "
      + "[ -n \"$pos\" ] && hyprctl dispatch \"hl.dsp.cursor.move({ x = ${pos% *}, y = ${pos#* } })\" >/dev/null"
    Quickshell.execDetached(["bash", "-lc", script, "bash", normalized])
  }

  function focusWindow(address) {
    var normalized = normalizedAddress(address)
    if (!normalized) return
    // Toggle cursor:no_warps around the dispatch so clicking a Dock Item
    // never yanks the pointer off the Dock to the centre of the newly
    // focused Window.
    var script = "addr=\"$1\"; "
      + "orig=false; hyprctl -j getoption cursor:no_warps | grep -q '\"bool\": true' && orig=true; "
      + "hyprctl eval 'hl.config({ cursor = { no_warps = true } })' >/dev/null; "
      + "hyprctl dispatch \"hl.dsp.focus({ window = \\\"address:$addr\\\" })\"; "
      + "hyprctl eval \"hl.config({ cursor = { no_warps = $orig } })\" >/dev/null"
    Quickshell.execDetached(["bash", "-lc", script, "bash", normalized])
  }

  // Left click on a Pin with no Windows launches its App (docs/SPEC.md
  // "Input"). A missing App's Pin has no `execute` to call — clicking it
  // is a no-op until Unpin, same as a Letter Tile Window Item is a no-op
  // to click on today.
  function launchApp(app) {
    if (!app || typeof app.execute !== "function") return
    app.execute()
  }

  // A Window-state row of the context menu (DockModel.windowActions maps
  // the ids): one hyprctl dispatch aimed at the Window by address, whether
  // or not it is the focused one. The dispatch string is passed as an
  // argument, so there is nothing to shell-escape.
  function runWindowAction(id, address) {
    var normalized = normalizedAddress(address)
    if (!normalized) return
    var target = "window = \"address:" + normalized + "\""
    var dispatch = {
      maximize: "hl.dsp.window.fullscreen({ mode = \"maximized\", " + target + " })",
      fullscreen: "hl.dsp.window.fullscreen({ mode = \"fullscreen\", " + target + " })",
      float: "hl.dsp.window.float({ action = \"toggle\", " + target + " })",
      center: "hl.dsp.window.center({ " + target + " })",
      pin: "hl.dsp.window.pin({ " + target + " })",
      scratchpad: "hl.dsp.window.move({ workspace = \"special:scratchpad\", follow = false, " + target + " })",
    }[id]
    if (!dispatch) return
    Quickshell.execDetached(["bash", "-lc", "hyprctl dispatch \"$1\"", "bash", dispatch])
  }

  // Close Window (docs/SPEC.md "Input", the context menu): the same
  // dispatch convention as focusWindow, minus the cursor no-warp dance
  // that dispatch needs but this one doesn't.
  function closeWindow(address) {
    var normalized = normalizedAddress(address)
    if (!normalized) return
    Quickshell.execDetached(["bash", "-lc",
      "hyprctl dispatch \"hl.dsp.window.close({ window = \\\"address:$1\\\" })\"",
      "bash", normalized])
  }

  // Pin/Unpin (docs/SPEC.md "Input", the context menu): DockModel.nextPins
  // computes the Pins list's new contents; this only hands it to
  // dockSettings.write, the same write-back path a hand edit to Pins
  // already applies live through.
  function togglePin(appId, pinned) {
    if (!appId) return
    dockSettings.write({ pins: DockModel.nextPins(dockSettings.pins, appId, pinned) })
  }

  // Drag within the Dock (docs/SPEC.md "Input": "reorder"; CONTEXT.md
  // "Placed"): a Pin Item's own drop is persisted through dockSettings.write
  // exactly like Pin/Unpin already is, so it survives a restart. A Window
  // Item's drop only updates dockState.windowPlacements directly — it has
  // no write-back of its own to trigger dockState.refresh() the way a
  // settings change does, so this calls it explicitly.
  function placeItem(item, targetIndex) {
    if (item.kind === "pin") {
      dockSettings.write({ placements: DockModel.placeAt(dockSettings.placements, item.key, targetIndex) })
      return
    }
    dockState.windowPlacements[item.window.id] = targetIndex
    dockState.refresh()
  }

  // Drag out of the Dock, for an Item whose App is pinned (docs/SPEC.md
  // "Input": "Drag out of the Dock: unpin the Item's App if pinned"): one
  // write so dropping the App from Pins and dropping its own Pin's Placed
  // position (CONTEXT.md "Placed") land in the same shellConfig update —
  // two separate dockSettings.write calls here would each merge onto the
  // same pre-write rawEntry, and the first's change would be lost under
  // the second's. Dragging an unpinned Window Item out is a snap-back
  // (docs/SPEC.md "Input"): the Dock itself has nothing to persist for
  // that, so it never calls this at all.
  function unpinFromDrag(appId) {
    if (!appId) return
    dockSettings.write({
      pins: DockModel.nextPins(dockSettings.pins, appId, true),
      placements: DockModel.unplace(dockSettings.placements, "pin:" + appId),
    })
  }

  // A Pin's tooltip (docs/SPEC.md "What the Dock shows": "a 'missing'
  // tooltip"): the App's own name once resolved, its bare Pin id if the
  // App resolved but has none, or an explicit missing note once its App
  // is no longer installed.
  function pinTooltipText(item) {
    if (item.missing) return item.appId + " (missing)"
    return (item.app && item.app.name) || item.appId
  }

  // The Item's own App id for Pin/Unpin (docs/SPEC.md "Input"): a Pin's
  // own id directly, or a Window Item's resolved App id — DockModel.menuFor
  // already reports canPin false whenever a Window Item has none.
  function menuAppId(item) {
    return item.kind === "pin" ? item.appId : (item.app ? item.app.id : null)
  }

  function windowTooltipText(item) {
    return (dockState.titles[item.window.id] || item.window.title || item.window.class || "") + "\nWorkspace: " + (item.badge || "")
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: panel

      required property var modelData
      screen: modelData
      visible: true
      color: "transparent"

      WlrLayershell.namespace: "omarchy-dock"
      WlrLayershell.layer: WlrLayer.Top
      WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

      // exclusiveZone 0 with Normal mode reserves no space of our own but
      // still keeps us out of any space another layer surface (the bar)
      // has already claimed, so the panel's own geometry lands above it
      // automatically with no manual bar-height bookkeeping.
      exclusiveZone: 0
      exclusionMode: ExclusionMode.Normal

      anchors {
        top: true
        bottom: true
        left: true
        right: true
      }

      // The input region is the union of the Reveal Strip and the Dock
      // itself: whichever one the Row's slide currently makes zero-area
      // simply contributes nothing, so this holds for both Dock states.
      mask: Region {
        Region { item: revealStrip }
        Region { item: bar }
        Region { item: dockRow }
        Region { item: startButton }
        Region { item: clock }
      }

      // Whether the Dock/bar is on screen: always, unless it auto-hides, in
      // which case it follows the Revealed state.
      readonly property bool shown: !root.autoHide || revealState.revealed

      // Full-width, above any bar reservation because it's anchored to
      // this panel's own bottom edge, which ExclusionMode.Normal already
      // keeps clear of the bar's exclusive zone (see exclusionMode above).
      Item {
        id: revealStrip
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: root.autoHide ? root.revealStripHeight : 0

        HoverHandler {
          onHoveredChanged: revealState.hoveringStrip = hovered
        }

        // Dock style has no bar to right-click, so the options menu (which
        // there only offers the switch to the taskbar style) opens from here
        // and from the gaps between Items (dockRow, below).
        TapHandler {
          acceptedButtons: Qt.RightButton
          onTapped: function (eventPoint) {
            barMenu.openAt(revealStrip.mapToItem(panel.contentItem, eventPoint.position.x, 0).x)
          }
        }
      }

      // Hidden/Revealed and the reveal/hide timers (SPEC.md "How the Dock
      // behaves"). Kept per panel, so hovering one monitor's Reveal Strip
      // never reveals the other monitor's Dock. menuOpen holds the Dock
      // Revealed for the whole of a context-menu visit (SPEC.md "The Dock
      // stays Revealed while its context menu is open") independent of
      // hover, since the pointer moves onto the menu's own popup window
      // and away from both the strip and the Dock itself. dragging does
      // the same for the whole of a drag (SPEC.md "The Dock stays
      // Revealed ... for the whole of a drag; the hide timer starts after
      // the drop"): once it drops back to false the hide timer starts
      // exactly like it does when hover ends, with no separate handling
      // needed here.
      QtObject {
        id: revealState

        property bool hoveringStrip: false
        property bool hoveringDock: false
        property bool hoveringBar: false
        property bool hoveringStart: false
        property bool hoveringPreview: false
        property bool menuOpen: false
        property bool dragging: false
        property bool revealed: false
        readonly property bool hovering: hoveringStrip || hoveringDock || hoveringBar || hoveringStart || hoveringPreview || menuOpen || dragging

        onHoveringChanged: {
          if (hovering) {
            hideTimer.stop()
            if (!revealed) revealTimer.restart()
          } else {
            revealTimer.stop()
            hideTimer.restart()
          }
        }
      }

      Timer {
        id: revealTimer
        interval: root.revealDelayMs
        onTriggered: revealState.revealed = true
      }

      Timer {
        id: hideTimer
        interval: root.hideDelayMs
        onTriggered: revealState.revealed = false
      }

      // The taskbar's full-width bar (taskbar style only; zero-height, so
      // zero input area, for the dock style). Slides away with the same
      // Hidden/Revealed rule as the dock when it auto-hides.
      Rectangle {
        id: bar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.bottomMargin: panel.shown ? 0 : -height
        height: root.isTaskbar ? root.taskbar.barHeight : 0
        color: root.taskbar.transparent ? "transparent" : Util.alpha(root.colBackground, root.taskbar.opacity)

        Behavior on anchors.bottomMargin {
          NumberAnimation { duration: root.slideDurationMs; easing.type: Easing.InOutCubic }
        }

        HoverHandler {
          onHoveredChanged: revealState.hoveringBar = hovered
        }

        // Right click on the bar itself (Item MouseAreas above it take their
        // own clicks first) opens the bar's options menu. A TapHandler, not
        // a MouseArea, so it can't take hover from the HoverHandler above.
        TapHandler {
          acceptedButtons: Qt.RightButton
          onTapped: function (eventPoint) {
            barMenu.openAt(bar.mapToItem(panel.contentItem, eventPoint.position.x, 0).x)
          }
        }

        Rectangle {
          visible: !root.taskbar.transparent
          anchors.top: parent.top
          anchors.left: parent.left
          anchors.right: parent.right
          height: 1
          color: Util.alpha(root.colBorder, 0.6)
        }
      }

      // Start button: runs the configured command (by default the Omarchy
      // apps menu). Sits just left of the Items, so it is part of the
      // centred group.
      Rectangle {
        id: startButton
        visible: root.isTaskbar && root.taskbar.showStart
        width: visible ? root.taskbar.barHeight - 8 : 0
        height: width
        radius: Style.cornerRadius
        x: dockRow.x - dockRow.startReserve
        anchors.bottom: parent.bottom
        anchors.bottomMargin: panel.shown ? (root.taskbar.barHeight - height) / 2 : -height
        color: startMouse.containsMouse ? Util.alpha(root.colForeground, 0.12) : "transparent"

        Behavior on anchors.bottomMargin {
          NumberAnimation { duration: root.slideDurationMs; easing.type: Easing.InOutCubic }
        }

        readonly property var iconSpec: DockConfig.resolveStartIcon(root.taskbar.startIcon)

        // The built-in grid: four panes, drawn here so no artwork ships.
        Grid {
          visible: startButton.iconSpec.kind === "grid"
          anchors.centerIn: parent
          columns: 2
          spacing: 2
          Repeater {
            model: 4
            Rectangle {
              width: Math.round(startButton.width * 0.2)
              height: width
              radius: 1
              color: root.colAccent
            }
          }
        }

        Image {
          visible: startButton.iconSpec.kind !== "grid"
          anchors.centerIn: parent
          width: Math.round(startButton.width * 0.6)
          height: width
          fillMode: Image.PreserveAspectFit
          asynchronous: true
          sourceSize.width: width * Screen.devicePixelRatio
          sourceSize.height: height * Screen.devicePixelRatio
          source: startButton.iconSpec.kind === "path"
            ? "file://" + startButton.iconSpec.value
            : (startButton.iconSpec.kind === "icon" ? Quickshell.iconPath(startButton.iconSpec.value, true) : "")
        }

        // The MouseArea below takes hover away from the bar's own handler
        // (this button is the bar's sibling, not its child), so it keeps the
        // bar Revealed itself.
        HoverHandler {
          onHoveredChanged: revealState.hoveringStart = hovered
        }

        MouseArea {
          id: startMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: {
            if (root.taskbar.startCommand === "builtin") startMenu.visible = !startMenu.visible
            else Quickshell.execDetached(["bash", "-lc", root.taskbar.startCommand])
          }
        }
      }

      // Clock at the bar's right end (taskbar style only). The wrapper's
      // size is what the mask and layout see, zero while hidden.
      Item {
        id: clock
        visible: root.isTaskbar && root.taskbar.showClock
        width: visible ? clockLabel.implicitWidth : 0
        height: clockLabel.implicitHeight
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.bottom: parent.bottom
        anchors.bottomMargin: panel.shown ? (root.taskbar.barHeight - height) / 2 : -height

        Text {
          id: clockLabel
          horizontalAlignment: Text.AlignRight
          color: root.colForeground
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
          text: Qt.formatTime(clockTimer.now, Locale.ShortFormat) + "\n" + Qt.formatDate(clockTimer.now, Locale.ShortFormat)
        }

        Timer {
          id: clockTimer
          property date now: new Date()
          interval: 15000
          repeat: true
          running: clock.visible
          triggeredOnStart: true
          onTriggered: clockTimer.now = new Date()
        }
      }

      Row {
        id: dockRow

        anchors.horizontalCenter: root.isTaskbar ? undefined : parent.horizontalCenter
        anchors.bottom: parent.bottom
        // Hidden parks the Row below the visible edge without unmapping
        // the panel itself; Revealed rests it at the usual gap. Slides
        // between the two over slideDurationMs. In the taskbar it centres
        // vertically in the bar instead.
        anchors.bottomMargin: root.isTaskbar
          ? (panel.shown ? (root.taskbar.barHeight - height) / 2 : -height)
          : (revealState.revealed ? Style.gapsOut : -(height + Style.gapsOut))
        spacing: root.isTaskbar ? 2 : Style.spacing.sm

        // Taskbar horizontal placement: the Start button and the Items form
        // one group, centred or pushed to the left edge.
        readonly property real startReserve: startButton.visible ? startButton.width + 4 : 0
        readonly property real clockReserve: clock.visible ? clock.width + 32 : 0
        readonly property real edgePad: 12
        Binding on x {
          when: root.isTaskbar
          value: root.taskbar.alignment === "left"
            ? dockRow.edgePad + dockRow.startReserve
            : (panel.width - (dockRow.startReserve + dockRow.width)) / 2 + dockRow.startReserve
        }

        Behavior on anchors.bottomMargin {
          NumberAnimation { duration: root.slideDurationMs; easing.type: Easing.InOutCubic }
        }

        HoverHandler {
          onHoveredChanged: revealState.hoveringDock = hovered
        }

        TapHandler {
          acceptedButtons: Qt.RightButton
          onTapped: function (eventPoint) {
            barMenu.openAt(dockRow.mapToItem(panel.contentItem, eventPoint.position.x, 0).x)
          }
        }

        // The taskbar's icons are smaller than the dock's and each Item has
        // side padding for a roomier hit area; itemWidth is what one Item
        // occupies, and everything that steps through the Row uses it.
        readonly property int baseIconSize: root.isTaskbar
          ? Math.max(16, Math.min(root.iconSize, root.taskbar.barHeight - 20))
          : root.iconSize
        readonly property int pad: root.isTaskbar ? 16 : 0
        readonly property real maxWidth: root.isTaskbar
          ? Math.max(0, panel.width - edgePad * 2 - 2 * (startReserve + clockReserve))
          : Math.max(0, panel.width - Style.gapsOut * 2)
        readonly property int iconSize: {
          var count = repeater.count
          if (count <= 0) return baseIconSize
          var available = Math.max(0, maxWidth - spacing * Math.max(0, count - 1))
          var natural = (baseIconSize + pad) * count
          return natural <= available ? baseIconSize : Math.max(16, Math.floor(available / count) - pad)
        }
        readonly property int itemWidth: iconSize + pad

        // Drag to reorder (docs/SPEC.md "Input"; CONTEXT.md "Placed"). The
        // dragged Item's own delegate stays put in the Repeater (so every
        // other Item's slot is undisturbed — reordering this Row's own
        // model mid-drag would make the Repeater tear down and rebuild
        // every delegate, destroying the very Item whose MouseArea is
        // driving the drag) but renders invisible for as long as its key
        // matches dragKey; dragGhost (declared below, a sibling of this
        // Row) shows in its place and follows the pointer, and dropLine
        // (also below) is the live insertion preview: a bar at whichever
        // gap dragPreviewIndex currently names. dragKey empty and
        // dragPreviewIndex -1 both mean "no drag in progress".
        property string dragKey: ""
        property int dragPreviewIndex: -1
        // Recomputed alongside dragPreviewIndex (see updateDragPreview):
        // hides dropLine once the drag has left the Dock, since a drag-out
        // has nothing to do with dragPreviewIndex any more (docs/SPEC.md
        // "Input": drag-out is unpin-or-snap-back, never a reorder).
        property bool draggingOutside: false

        function indexOfKey(items, key) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].key === key) return i
          }
          return -1
        }

        // Recomputed from dragGhost's own position (docs/SPEC.md "Input")
        // as it follows the pointer, in this Row's own parent's coordinate
        // space — the same space dragGhost.x/y are set in, since both are
        // children of it (see dragGhost below).
        function updateDragPreview() {
          if (!dockRow.dragKey) return
          var step = dockRow.itemWidth + dockRow.spacing
          var localX = (dragGhost.x + dragGhost.width / 2) - dockRow.x
          var index = step > 0 ? Math.round(localX / step) : 0
          dockRow.dragPreviewIndex = Math.max(0, Math.min(index, dockState.items.length - 1))
          dockRow.draggingOutside = dockRow.isGhostOutsideRow()
        }

        // Drag out of the Dock (docs/SPEC.md "Input"): dragGhost's centre
        // clear of this Row's own rectangle, widened by half an icon so a
        // drop right at the row's own edge still counts as a reorder.
        function isGhostOutsideRow() {
          var margin = dockRow.iconSize / 2
          var left = dockRow.x - margin
          var right = dockRow.x + dockRow.width + margin
          var top = dockRow.y - margin
          var bottom = dockRow.y + dockRow.height + margin
          var centerX = dragGhost.x + dragGhost.width / 2
          var centerY = dragGhost.y + dragGhost.height / 2
          return centerX < left || centerX > right || centerY < top || centerY > bottom
        }

        // The drop (docs/SPEC.md "Input"): reorder within the Dock, unpin
        // for an Item whose App is pinned dragged out, or (an unpinned
        // Window Item dragged out) a snap-back with nothing to persist —
        // dragGhost simply stops following the pointer and every Item,
        // this one included, falls back to dockState.items' own order.
        // Drag state (root.dragInProgress included) clears first, so the
        // refresh placeItem/unpinFromDrag triggers isn't the one
        // dockState.refresh's own drag guard skips.
        function finishDrag(item) {
          var draggedOut = dockRow.isGhostOutsideRow()
          var targetIndex = dockRow.dragPreviewIndex

          dockRow.dragKey = ""
          dockRow.dragPreviewIndex = -1
          dockRow.draggingOutside = false
          dragGhost.visible = false
          revealState.dragging = false
          root.dragInProgress = false

          if (draggedOut) {
            if (item.kind === "pin" || item.pinned) root.unpinFromDrag(root.menuAppId(item))
          } else if (targetIndex >= 0) {
            root.placeItem(item, targetIndex)
          }
        }

        Repeater {
          id: repeater
          model: dockState.items

          delegate: Item {
            id: dockItem
            required property var modelData

            readonly property bool active: dockItem.modelData.active
            readonly property bool attention: dockItem.modelData.attention
            readonly property bool isPin: dockItem.modelData.kind === "pin"
            // Guards onClicked below: MouseArea still emits clicked() on
            // release after a drag.target drag, so without this a drop
            // would also focus/launch the Item it was just dropped near.
            property bool wasDragged: false

            opacity: dockRow.dragKey === dockItem.modelData.key ? 0 : 1
            width: dockRow.itemWidth
            height: icon.height + runningDot.height + Style.spacing.xxs

            // The Active Window's highlight and the Attention tint (SPEC.md
            // "Indicators"): CONTEXT.md says the Window Item itself is
            // highlighted/tinted, so these cover the whole Item — icon and
            // running dot both — not just the icon square. Drawn behind the
            // icon so both can show at once without fighting the icon/Letter
            // Tile for the same Rectangle.
            Rectangle {
              visible: dockItem.active
              anchors.fill: parent
              radius: Style.cornerRadius
              color: Style.selectedFill
              border.width: Style.selectedBorderWidth
              border.color: Style.selectedBorderColor
            }

            Rectangle {
              visible: dockItem.attention
              anchors.fill: parent
              radius: Style.cornerRadius
              color: Util.alpha(Color.urgent, 0.35)
            }

            Item {
              id: icon
              anchors.top: parent.top
              anchors.horizontalCenter: parent.horizontalCenter
              width: dockRow.iconSize
              height: dockRow.iconSize

              Image {
                visible: dockItem.modelData.app !== null
                anchors.fill: parent
                fillMode: Image.PreserveAspectFit
                asynchronous: true
                sourceSize.width: width * Screen.devicePixelRatio
                sourceSize.height: height * Screen.devicePixelRatio
                source: dockItem.modelData.app ? Quickshell.iconPath(dockItem.modelData.app.icon, true) : ""
              }

              Rectangle {
                visible: dockItem.modelData.app === null
                anchors.fill: parent
                radius: Style.cornerRadius
                color: Color.muted

                Text {
                  anchors.centerIn: parent
                  text: dockItem.modelData.letter || ""
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.icon
                }
              }

              // Workspace badge (docs/SPEC.md "Indicators"): the model
              // has already turned a special workspace's "special:" IPC
              // name into its own name.
              Rectangle {
                visible: root.taskbar.showWorkspaceBadge && (dockItem.modelData.badge || "").length > 0
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                radius: height / 2
                color: Color.background
                border.width: Style.normalBorderWidth
                border.color: Color.muted
                width: Math.max(height, badgeText.implicitWidth + Style.spacing.xs * 2)
                height: Style.font.caption + Style.spacing.xxs * 2

                Text {
                  id: badgeText
                  anchors.centerIn: parent
                  text: dockItem.modelData.badge || ""
                  color: Color.foreground
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              MouseArea {
                id: mouseArea
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
                // Only a left-button press drags (docs/SPEC.md "Input"
                // reserves right/middle for the menu and launching); drag
                // moves dragGhost, a sibling of dockRow, not this Item
                // itself — dockRow is a positioner and would fight any
                // attempt to move dockItem directly.
                drag.target: dragGhost

                onContainsMouseChanged: {
                  if (mouseArea.containsMouse) previewState.hoverStart(dockItem)
                  else previewState.hoverEnd()
                }

                onPressed: function (mouse) {
                  dockItem.wasDragged = false
                  if (mouse.button !== Qt.LeftButton) {
                    mouseArea.drag.target = null
                    return
                  }
                  mouseArea.drag.target = dragGhost
                  dragGhost.item = dockItem.modelData
                  var origin = dockItem.mapToItem(dockRow.parent, 0, 0)
                  dragGhost.x = origin.x
                  dragGhost.y = origin.y
                  dragGhost.width = dockItem.width
                  dragGhost.height = dockItem.height
                }

                drag.onActiveChanged: {
                  if (mouseArea.drag.active) {
                    dockItem.wasDragged = true
                    root.dragInProgress = true
                    revealState.dragging = true
                    dockRow.dragKey = dockItem.modelData.key
                    dockRow.dragPreviewIndex = dockRow.indexOfKey(dockState.items, dockItem.modelData.key)
                    dragGhost.visible = true
                  } else if (dockRow.dragKey === dockItem.modelData.key) {
                    dockRow.finishDrag(dockItem.modelData)
                  }
                }

                onClicked: function (mouse) {
                  if (dockItem.wasDragged) return
                  if (mouse.button === Qt.RightButton) {
                    contextMenu.anchorItem = dockItem
                    contextMenu.menuItem = dockItem.modelData
                    contextMenu.visible = true
                    return
                  }
                  // Middle click on any Item with a resolvable App launches
                  // a new instance (docs/SPEC.md "Input"); launchApp is
                  // already a no-op when there's no App to launch.
                  if (mouse.button === Qt.MiddleButton) {
                    root.launchApp(dockItem.modelData.app)
                    return
                  }
                  if (dockItem.isPin) {
                    root.launchApp(dockItem.modelData.app)
                    return
                  }
                  if (dockItem.active) return
                  root.focusWindow(dockItem.modelData.window.id)
                }
              }

              // Bound to revealState.revealed, not just hover, so the
              // tooltip disappears the moment the Dock hides instead of
              // lingering until the pointer physically leaves the Item; it
              // has no hover handling of its own, so it never feeds
              // revealState and can't keep the Dock revealed on its own.
              PanelToolTip {
                visible: mouseArea.containsMouse && panel.shown && !previewState.enabledFor(dockItem.modelData)
                text: dockItem.isPin
                  ? root.pinTooltipText(dockItem.modelData)
                  : root.windowTooltipText(dockItem.modelData)
              }
            }

            // The running dot (SPEC.md "Indicators"): every Window Item
            // shows one; a Pin with no Windows (CONTEXT.md "Pin") is the
            // only Item without it.
            Rectangle {
              id: runningDot
              visible: !dockItem.isPin
              anchors.top: icon.bottom
              anchors.topMargin: Style.spacing.xxs
              anchors.horizontalCenter: parent.horizontalCenter
              width: root.isTaskbar ? (dockItem.active ? 16 : 6) : Style.spacing.xs
              height: root.isTaskbar ? 3 : Style.spacing.xs
              radius: height / 2
              color: root.isTaskbar && dockItem.active ? root.colAccent : root.colForeground

              Behavior on width {
                NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
              }
            }
          }
        }
      }

      // The floating icon a drag follows (docs/SPEC.md "Input": "Drag
      // within the Dock: reorder"; issue #16's own acceptance criteria add
      // "with a live insertion preview"). A sibling of dockRow, not one of
      // its Repeater delegates, so dockRow's own positioning never fights its
      // position; mouseArea.drag.target (above) moves it directly by the
      // pointer's own delta, in this shared parent's coordinate space,
      // starting from wherever the dragged delegate's onPressed measured
      // it to be.
      Item {
        id: dragGhost

        property var item: null

        visible: false
        z: 1000
        opacity: 0.85

        // Recomputes the live insertion preview directly off of the
        // position mouseArea.drag.target (above) is actually driving —
        // rather than off the mouse event that causes it, so this never
        // races whatever order Qt applies the two in.
        onXChanged: if (dockRow.dragKey) dockRow.updateDragPreview()
        onYChanged: if (dockRow.dragKey) dockRow.updateDragPreview()

        Image {
          visible: dragGhost.item && dragGhost.item.app !== null
          anchors.fill: parent
          anchors.leftMargin: dockRow.pad / 2
          anchors.rightMargin: dockRow.pad / 2
          fillMode: Image.PreserveAspectFit
          asynchronous: true
          sourceSize.width: width * Screen.devicePixelRatio
          sourceSize.height: height * Screen.devicePixelRatio
          source: dragGhost.item && dragGhost.item.app ? Quickshell.iconPath(dragGhost.item.app.icon, true) : ""
        }

        Rectangle {
          visible: dragGhost.item && dragGhost.item.app === null
          anchors.fill: parent
          radius: Style.cornerRadius
          color: Color.muted

          Text {
            anchors.centerIn: parent
            text: (dragGhost.item && dragGhost.item.letter) || ""
            color: Color.foreground
            font.family: Style.font.family
            font.pixelSize: Style.font.icon
          }
        }
      }

      // The live insertion preview itself (issue #16's acceptance
      // criteria, on top of docs/SPEC.md "Input"'s own "Drag within the
      // Dock: reorder"): a bar at the gap dragPreviewIndex names, hidden
      // once the drag has left the Dock (see draggingOutside) since
      // drag-out is never a reorder.
      Rectangle {
        id: dropLine

        visible: dockRow.dragKey !== "" && !dockRow.draggingOutside
        x: dockRow.x + dockRow.dragPreviewIndex * (dockRow.itemWidth + dockRow.spacing) - dockRow.spacing / 2 - width / 2
        y: dockRow.y
        width: 2
        height: dockRow.height
        radius: 1
        color: Color.accent
      }

      // Hover previews (taskbar style, showPreviews): a live thumbnail of the
      // hovered Window with its title and a close button. previewState holds
      // which Item is shown and the open/leave timers; hovering the popup
      // itself keeps it (and the bar, via revealState.hoveringPreview) up.
      QtObject {
        id: previewState

        // Where the hovered Item is, in panel coordinates, captured at hover
        // time so the popup never depends on the delegate staying alive.
        property real anchorX: 0
        property real anchorY: 0
        property var hoveredItem: null
        property var shownItem: null
        readonly property bool showing: shownItem !== null

        function enabledFor(item) {
          return root.isTaskbar && root.taskbar.showPreviews && item.kind === "window"
        }

        function hoverStart(delegate) {
          if (root.dragInProgress || !enabledFor(delegate.modelData)) return
          previewLeaveTimer.stop()
          var point = delegate.mapToItem(panel.contentItem, delegate.width / 2, 0)
          previewState.anchorX = point.x
          previewState.anchorY = point.y
          previewState.hoveredItem = delegate.modelData
          if (previewState.showing) previewState.shownItem = delegate.modelData
          else previewOpenTimer.restart()
        }

        function hoverEnd() {
          previewOpenTimer.stop()
          previewLeaveTimer.restart()
        }

        function dismiss() {
          previewOpenTimer.stop()
          previewLeaveTimer.stop()
          previewState.shownItem = null
        }
      }

      Timer {
        id: previewOpenTimer
        interval: 350
        onTriggered: if (previewState.hoveredItem) previewState.shownItem = previewState.hoveredItem
      }

      Timer {
        id: previewLeaveTimer
        interval: 250
        onTriggered: previewState.shownItem = null
      }

      // Moving from one Item to its neighbour while a preview is up swaps
      // the shown Window in place; the popup has to be re-anchored to follow.
      Connections {
        target: previewState
        function onAnchorXChanged() {
          if (previewPopup.visible) previewPopup.anchor.updateAnchor()
        }
      }

      PopupWindow {
        id: previewPopup

        readonly property int thumbWidth: Style.space(220)
        readonly property int thumbHeight: Style.space(124)
        readonly property var toplevel: previewState.shownItem
          ? dockState.toplevelByAddress[previewState.shownItem.window.id] || null
          : null

        visible: previewState.showing
        color: "transparent"
        implicitWidth: thumbWidth + Style.spacing.sm * 2
        implicitHeight: previewColumn.implicitHeight + Style.spacing.sm * 2

        onVisibleChanged: revealState.hoveringPreview = previewPopup.visible

        anchor {
          id: previewAnchor
          window: panel
          adjustment: PopupAdjustment.Slide
          edges: Edges.Top | Edges.Left
          gravity: Edges.Bottom | Edges.Right
          rect.width: 1
          rect.height: 1

          onAnchoring: {
            var x = previewState.anchorX - previewPopup.implicitWidth / 2
            x = Math.max(Style.spacing.xs, Math.min(x, panel.width - previewPopup.implicitWidth - Style.spacing.xs))
            previewAnchor.rect.x = Math.round(x)
            previewAnchor.rect.y = Math.round(Math.max(Style.spacing.xs, previewState.anchorY - previewPopup.implicitHeight - Style.spacing.xs))
          }
        }

        Rectangle {
          anchors.fill: parent
          radius: Style.cornerRadius
          color: Color.popups.background
          border.width: Style.normalBorderWidth
          border.color: Color.popups.border

          HoverHandler {
            onHoveredChanged: {
              if (hovered) previewLeaveTimer.stop()
              else previewLeaveTimer.restart()
            }
          }

          Column {
            id: previewColumn
            anchors.fill: parent
            anchors.margins: Style.spacing.sm
            spacing: Style.spacing.xs

            Row {
              width: parent.width
              spacing: Style.spacing.xs

              Text {
                width: parent.width - closeButton.width - parent.spacing
                anchors.verticalCenter: parent.verticalCenter
                elide: Text.ElideRight
                color: Color.popups.text
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
                text: previewState.shownItem ? (dockState.titles[previewState.shownItem.window.id] || previewState.shownItem.window.title || previewState.shownItem.window.class) : ""
              }

              Rectangle {
                id: closeButton
                width: Style.space(20)
                height: width
                radius: Style.cornerRadius
                color: closeMouse.containsMouse ? Util.alpha(Color.urgent, 0.5) : "transparent"

                Text {
                  anchors.centerIn: parent
                  text: "\u2715"
                  color: Color.popups.text
                  font.pixelSize: Style.font.caption
                }

                MouseArea {
                  id: closeMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: {
                    var id = previewState.shownItem ? previewState.shownItem.window.id : null
                    previewState.dismiss()
                    if (id) root.closeWindow(id)
                  }
                }
              }
            }

            // The thumbnail: a fixed-size box (so a Window that resizes or
            // changes shape never resizes the popup), holding a live capture
            // scaled to the Window's own aspect ratio. Live capture can
            // blank for a frame when the Window's content changes a lot (a
            // busy browser); the ShaderEffectSource underneath keeps the
            // last frame the capture actually had, so that frame shows
            // through instead of a flicker. Left-clicking the thumbnail
            // focuses the Window, like its Item.
            Item {
              width: previewPopup.thumbWidth
              height: previewPopup.thumbHeight

              ShaderEffectSource {
                anchors.centerIn: parent
                width: capture.width
                height: capture.height
                sourceItem: capture
                live: capture.hasContent
                hideSource: false
              }

              ScreencopyView {
                id: capture
                anchors.centerIn: parent
                constraintSize: Qt.size(previewPopup.thumbWidth, previewPopup.thumbHeight)
                captureSource: previewPopup.visible ? previewPopup.toplevel && previewPopup.toplevel.wayland : null
                live: true
              }

              MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  var item = previewState.shownItem
                  previewState.dismiss()
                  if (!item) return
                  if (root.taskbar.previewWarpPointer) root.focusWindowAndWarp(item.window.id)
                  else if (!item.active) root.focusWindow(item.window.id)
                }
              }
            }
          }
        }
      }

      // The built-in Start menu (startCommand "builtin"), modelled on the
      // Windows 11 one (docs/SPEC.md "Start menu"): a popup rising from the
      // Start button with search, a Pinned grid, an "All apps" A-Z list, a
      // Recommended list of recently launched apps, right-click to pin/unpin,
      // and an account + power row. Unlike the rest of the Dock it takes
      // keyboard focus while open, so typing searches. DockModel's
      // filterApps/groupAlphabetically/pushRecent and DockConfig's
      // effectiveStartPins/effectiveRecent/startPowerActions hold the logic.
      PopupWindow {
        id: startMenu

        readonly property int menuMargin: Style.spacing.xs
        readonly property var allApps: {
          var values = DesktopEntries.applications.values
          var list = []
          for (var i = 0; i < values.length; i++) {
            var entry = values[i]
            list.push({
              id: entry.id,
              name: entry.name || entry.id,
              genericName: entry.genericName || "",
              keywords: entry.keywords || [],
              noDisplay: !!entry.noDisplay,
              icon: entry.icon,
              entry: entry,
            })
          }
          return list
        }
        readonly property var appsById: {
          var map = ({})
          for (var i = 0; i < startMenu.allApps.length; i++) map[startMenu.allApps[i].id] = startMenu.allApps[i]
          return map
        }
        readonly property var startPinIds: DockConfig.effectiveStartPins(dockSettings.rawEntry, dockSettings.pins)
        readonly property var recentIds: DockConfig.effectiveRecent(dockSettings.rawEntry)
        readonly property var pinnedApps: startMenu.resolve(startMenu.startPinIds)
        readonly property var recentApps: startMenu.resolve(startMenu.recentIds)
        readonly property bool searching: searchInput.text.trim().length > 0
        readonly property var results: DockModel.filterApps(startMenu.allApps, searchInput.text)
        // "All apps" flattened for a sectioned ListView: each app carries
        // its section letter.
        readonly property var allAppsFlat: {
          var groups = DockModel.groupAlphabetically(startMenu.allApps)
          var flat = []
          for (var g = 0; g < groups.length; g++) {
            for (var a = 0; a < groups[g].apps.length; a++) {
              var app = groups[g].apps[a]
              flat.push({ id: app.id, name: app.name, icon: app.icon, entry: app.entry, letter: groups[g].letter })
            }
          }
          return flat
        }
        // Places column on the left (Home, Documents, Downloads...): from the
        // user's XDG folders or a `startPlaces` list (DockConfig.effectivePlaces).
        property string userDirsText: ""
        readonly property var places: DockConfig.effectivePlaces(dockSettings.rawEntry, startMenu.userDirsText, Quickshell.env("HOME") || "")
        readonly property real placesWidth: startMenu.places.length > 0 ? Style.space(150) : 0

        FileView {
          path: Quickshell.env("HOME") + "/.config/user-dirs.dirs"
          printErrors: false
          onLoaded: startMenu.userDirsText = text()
        }

        readonly property string userName: {
          var name = Quickshell.env("USER") || ""
          return name.length > 0 ? name.charAt(0).toUpperCase() + name.slice(1) : "User"
        }

        property bool showAll: false
        property bool powerOpen: false
        // The menu behind the user's name (Lock, Sign out).
        property bool userOpen: false
        // The right-clicked app (null when its menu is closed) and where.
        property var menuApp: null
        property real menuX: 0
        property real menuY: 0

        function resolve(ids) {
          var out = []
          for (var i = 0; i < ids.length; i++) {
            if (startMenu.appsById[ids[i]]) out.push(startMenu.appsById[ids[i]])
          }
          return out
        }

        function launch(app) {
          if (!app) return
          startMenu.visible = false
          root.launchApp(app.entry)
          dockSettings.write({ recentApps: DockModel.pushRecent(startMenu.recentIds, app.id) })
        }

        function openAppMenu(app, item, mouse) {
          var point = item.mapToItem(card, mouse.x, mouse.y)
          startMenu.menuX = Math.min(point.x, card.width - Style.space(200))
          startMenu.menuY = Math.min(point.y, card.height - Style.space(130))
          startMenu.powerOpen = false
          startMenu.userOpen = false
          startMenu.menuApp = app
        }

        function closeOverlays() {
          startMenu.menuApp = null
          startMenu.powerOpen = false
          startMenu.userOpen = false
        }

        readonly property var menuRows: {
          var app = startMenu.menuApp
          if (!app) return []
          var startPinned = startMenu.startPinIds.indexOf(app.id) >= 0
          var dockPinned = dockSettings.pins.indexOf(app.id) >= 0
          return [
            {
              label: startPinned ? "Unpin from Start" : "Pin to Start",
              run: function () { dockSettings.write({ startPins: DockModel.nextPins(startMenu.startPinIds, app.id, startPinned) }) },
            },
            {
              label: dockPinned ? "Unpin from Dock" : "Pin to Dock",
              run: function () { root.togglePin(app.id, dockPinned) },
            },
            { label: "Open", run: function () { startMenu.launch(app) } },
          ]
        }

        grabFocus: true
        visible: false
        color: "transparent"
        anchor.window: panel
        anchor.adjustment: PopupAdjustment.Slide
        anchor.edges: Edges.Top | Edges.Left
        anchor.gravity: Edges.Bottom | Edges.Right
        anchor.rect.width: 1
        anchor.rect.height: 1
        anchor.onAnchoring: {
          anchor.rect.x = Math.round(Math.max(startMenu.menuMargin, Math.min(startButton.x, panel.width - startMenu.implicitWidth - startMenu.menuMargin)))
          anchor.rect.y = Math.round(Math.max(startMenu.menuMargin, panel.height - root.taskbar.barHeight - startMenu.implicitHeight - startMenu.menuMargin))
        }

        implicitWidth: Style.space(600) + startMenu.placesWidth
        implicitHeight: Math.min(Style.space(640), Math.max(Style.space(240), panel.height - root.taskbar.barHeight - startMenu.menuMargin * 2))

        onVisibleChanged: {
          revealState.menuOpen = startMenu.visible
          if (startMenu.visible) {
            searchInput.text = ""
            startMenu.showAll = false
            startMenu.closeOverlays()
            resultList.currentIndex = 0
            searchInput.forceActiveFocus()
          }
        }
        onClosed: startMenu.visible = false

        Rectangle {
          id: card
          anchors.fill: parent
          radius: Style.cornerRadius
          color: Color.popups.background
          border.width: Style.normalBorderWidth
          border.color: Color.popups.border

          Rectangle {
            id: searchBox
            anchors.top: parent.top
            anchors.left: placesPane.right
            anchors.right: parent.right
            anchors.margins: Style.spacing.md
            height: Style.space(36)
            radius: height / 2
            color: Util.alpha(Color.popups.text, 0.08)

            Text {
              visible: searchInput.text.length === 0
              anchors.verticalCenter: parent.verticalCenter
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              text: "Search for apps"
              color: Util.alpha(Color.popups.text, 0.5)
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }

            TextInput {
              id: searchInput
              anchors.fill: parent
              anchors.leftMargin: Style.spacing.md
              anchors.rightMargin: Style.spacing.md
              verticalAlignment: TextInput.AlignVCenter
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.body
              clip: true
              focus: true
              onTextChanged: {
                resultList.currentIndex = 0
                startMenu.closeOverlays()
              }

              Keys.onPressed: function (event) {
                if (event.key === Qt.Key_Down && startMenu.searching) {
                  resultList.currentIndex = Math.min(resultList.count - 1, resultList.currentIndex + 1)
                  event.accepted = true
                } else if (event.key === Qt.Key_Up && startMenu.searching) {
                  resultList.currentIndex = Math.max(0, resultList.currentIndex - 1)
                  event.accepted = true
                } else if ((event.key === Qt.Key_Return || event.key === Qt.Key_Enter) && startMenu.searching) {
                  startMenu.launch(startMenu.results[resultList.currentIndex])
                  event.accepted = true
                } else if (event.key === Qt.Key_Escape) {
                  // Back out one layer at a time: overlay, search, All apps, menu.
                  if (startMenu.menuApp || startMenu.powerOpen || startMenu.userOpen) startMenu.closeOverlays()
                  else if (startMenu.searching) searchInput.text = ""
                  else if (startMenu.showAll) startMenu.showAll = false
                  else startMenu.visible = false
                  event.accepted = true
                }
              }
            }
          }

          // Places: one click opens the folder in the default file manager.
          Item {
            id: placesPane
            anchors.top: parent.top
            anchors.bottom: footer.top
            anchors.left: parent.left
            width: startMenu.placesWidth
            visible: startMenu.placesWidth > 0

            Column {
              anchors.top: parent.top
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.margins: Style.spacing.md
              spacing: 2

              Repeater {
                model: startMenu.places

                delegate: Rectangle {
                  id: placeRow
                  required property var modelData
                  width: parent.width
                  height: Style.space(38)
                  radius: Style.cornerRadius
                  color: placeMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

                  Image {
                    id: placeIcon
                    anchors.left: parent.left
                    anchors.leftMargin: Style.spacing.sm
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(22)
                    height: width
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    sourceSize.width: width * Screen.devicePixelRatio
                    sourceSize.height: height * Screen.devicePixelRatio
                    source: Quickshell.iconPath(placeRow.modelData.icon, true)
                  }

                  Text {
                    anchors.left: placeIcon.right
                    anchors.leftMargin: Style.spacing.md
                    anchors.right: parent.right
                    anchors.rightMargin: Style.spacing.sm
                    anchors.verticalCenter: parent.verticalCenter
                    elide: Text.ElideRight
                    text: placeRow.modelData.label
                    color: Color.popups.text
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  MouseArea {
                    id: placeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      startMenu.visible = false
                      Quickshell.execDetached(["xdg-open", placeRow.modelData.path])
                    }
                  }
                }
              }
            }
          }

          Item {
            id: body
            anchors.top: searchBox.bottom
            anchors.topMargin: Style.spacing.sm
            anchors.bottom: footer.top
            anchors.left: placesPane.right
            anchors.right: parent.right
            anchors.leftMargin: Style.spacing.md
            anchors.rightMargin: Style.spacing.md

            // Search results.
            ListView {
              id: resultList
              visible: startMenu.searching
              anchors.fill: parent
              clip: true
              model: startMenu.results
              boundsBehavior: Flickable.StopAtBounds
              highlightMoveDuration: 0

              delegate: Rectangle {
                id: resultRow
                required property var modelData
                required property int index
                width: resultList.width
                height: Style.space(44)
                radius: Style.cornerRadius
                color: (resultList.currentIndex === index || resultMouse.containsMouse)
                  ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

                Image {
                  id: resultIcon
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(28)
                  height: width
                  fillMode: Image.PreserveAspectFit
                  asynchronous: true
                  sourceSize.width: width * Screen.devicePixelRatio
                  sourceSize.height: height * Screen.devicePixelRatio
                  source: resultRow.modelData.icon ? Quickshell.iconPath(resultRow.modelData.icon, true) : ""
                }

                Text {
                  anchors.left: resultIcon.right
                  anchors.leftMargin: Style.spacing.md
                  anchors.right: parent.right
                  anchors.rightMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  elide: Text.ElideRight
                  text: resultRow.modelData.name
                  color: Color.popups.text
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }

                MouseArea {
                  id: resultMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  acceptedButtons: Qt.LeftButton | Qt.RightButton
                  cursorShape: Qt.PointingHandCursor
                  onClicked: function (mouse) {
                    if (mouse.button === Qt.RightButton) startMenu.openAppMenu(resultRow.modelData, resultMouse, mouse)
                    else startMenu.launch(resultRow.modelData)
                  }
                }
              }
            }

            // All apps: A-Z with letter headings.
            ListView {
              id: allList
              visible: !startMenu.searching && startMenu.showAll
              anchors.fill: parent
              clip: true
              model: startMenu.allAppsFlat
              boundsBehavior: Flickable.StopAtBounds

              section.property: "letter"
              section.criteria: ViewSection.FullString
              section.delegate: Item {
                required property string section
                width: allList.width
                height: Style.space(30)

                Text {
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  text: parent.section
                  color: Color.accent
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                  font.bold: true
                }
              }

              header: Item {
                width: allList.width
                height: Style.space(34)

                Text {
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  text: "‹  Back"
                  color: Color.popups.text
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body

                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.spacing.sm
                    cursorShape: Qt.PointingHandCursor
                    onClicked: startMenu.showAll = false
                  }
                }
              }

              delegate: Rectangle {
                id: allRow
                required property var modelData
                width: allList.width
                height: Style.space(40)
                radius: Style.cornerRadius
                color: allMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

                Image {
                  id: allIcon
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(26)
                  height: width
                  fillMode: Image.PreserveAspectFit
                  asynchronous: true
                  sourceSize.width: width * Screen.devicePixelRatio
                  sourceSize.height: height * Screen.devicePixelRatio
                  source: allRow.modelData.icon ? Quickshell.iconPath(allRow.modelData.icon, true) : ""
                }

                Text {
                  anchors.left: allIcon.right
                  anchors.leftMargin: Style.spacing.md
                  anchors.right: parent.right
                  anchors.rightMargin: Style.spacing.sm
                  anchors.verticalCenter: parent.verticalCenter
                  elide: Text.ElideRight
                  text: allRow.modelData.name
                  color: Color.popups.text
                  font.family: Style.font.family
                  font.pixelSize: Style.font.body
                }

                MouseArea {
                  id: allMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  acceptedButtons: Qt.LeftButton | Qt.RightButton
                  cursorShape: Qt.PointingHandCursor
                  onClicked: function (mouse) {
                    if (mouse.button === Qt.RightButton) startMenu.openAppMenu(allRow.modelData, allMouse, mouse)
                    else startMenu.launch(allRow.modelData)
                  }
                }
              }
            }

            // Home: Pinned grid and Recommended list.
            Item {
              id: home
              visible: !startMenu.searching && !startMenu.showAll
              anchors.fill: parent

              Text {
                id: pinnedTitle
                anchors.top: parent.top
                anchors.left: parent.left
                anchors.leftMargin: Style.spacing.sm
                text: "Pinned"
                color: Color.popups.text
                font.family: Style.font.family
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Rectangle {
                id: allAppsButton
                anchors.verticalCenter: pinnedTitle.verticalCenter
                anchors.right: parent.right
                width: allAppsLabel.implicitWidth + Style.spacing.md * 2
                height: Style.space(26)
                radius: Style.cornerRadius
                color: allAppsMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

                Text {
                  id: allAppsLabel
                  anchors.centerIn: parent
                  text: "All apps  ›"
                  color: Color.popups.text
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }

                MouseArea {
                  id: allAppsMouse
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: startMenu.showAll = true
                }
              }

              GridView {
                id: pinnedGrid
                anchors.top: pinnedTitle.bottom
                anchors.topMargin: Style.spacing.sm
                anchors.bottom: recommendedTitle.top
                anchors.bottomMargin: Style.spacing.sm
                anchors.left: parent.left
                anchors.right: parent.right
                clip: true
                cellWidth: Math.floor(width / 6)
                cellHeight: Style.space(88)
                model: startMenu.pinnedApps
                boundsBehavior: Flickable.StopAtBounds

                delegate: Item {
                  id: pinnedTile
                  required property var modelData
                  width: pinnedGrid.cellWidth
                  height: pinnedGrid.cellHeight

                  Rectangle {
                    anchors.fill: parent
                    anchors.margins: 2
                    radius: Style.cornerRadius
                    color: pinnedMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"
                  }

                  Image {
                    id: pinnedIcon
                    anchors.top: parent.top
                    anchors.topMargin: Style.spacing.md
                    anchors.horizontalCenter: parent.horizontalCenter
                    width: Style.space(36)
                    height: width
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    sourceSize.width: width * Screen.devicePixelRatio
                    sourceSize.height: height * Screen.devicePixelRatio
                    source: pinnedTile.modelData.icon ? Quickshell.iconPath(pinnedTile.modelData.icon, true) : ""
                  }

                  Text {
                    anchors.top: pinnedIcon.bottom
                    anchors.topMargin: Style.spacing.xs
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.leftMargin: 4
                    anchors.rightMargin: 4
                    horizontalAlignment: Text.AlignHCenter
                    elide: Text.ElideRight
                    text: pinnedTile.modelData.name
                    color: Color.popups.text
                    font.family: Style.font.family
                    font.pixelSize: Style.font.caption
                  }

                  MouseArea {
                    id: pinnedMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    cursorShape: Qt.PointingHandCursor
                    onClicked: function (mouse) {
                      if (mouse.button === Qt.RightButton) startMenu.openAppMenu(pinnedTile.modelData, pinnedMouse, mouse)
                      else startMenu.launch(pinnedTile.modelData)
                    }
                  }
                }

                Text {
                  visible: startMenu.pinnedApps.length === 0
                  anchors.centerIn: parent
                  text: "Right-click an app in All apps to pin it here"
                  color: Util.alpha(Color.popups.text, 0.5)
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }

              Text {
                id: recommendedTitle
                anchors.bottom: recommendedGrid.top
                anchors.bottomMargin: Style.spacing.sm
                anchors.left: parent.left
                anchors.leftMargin: Style.spacing.sm
                text: "Recommended"
                color: Color.popups.text
                font.family: Style.font.family
                font.pixelSize: Style.font.body
                font.bold: true
              }

              GridView {
                id: recommendedGrid
                anchors.bottom: parent.bottom
                anchors.left: parent.left
                anchors.right: parent.right
                height: Style.space(48) * 3
                clip: true
                cellWidth: Math.floor(width / 2)
                cellHeight: Style.space(48)
                model: startMenu.recentApps
                interactive: false

                delegate: Item {
                  id: recentTile
                  required property var modelData
                  width: recommendedGrid.cellWidth
                  height: recommendedGrid.cellHeight

                  Rectangle {
                    anchors.fill: parent
                    anchors.margins: 2
                    radius: Style.cornerRadius
                    color: recentMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"
                  }

                  Image {
                    id: recentIcon
                    anchors.left: parent.left
                    anchors.leftMargin: Style.spacing.md
                    anchors.verticalCenter: parent.verticalCenter
                    width: Style.space(28)
                    height: width
                    fillMode: Image.PreserveAspectFit
                    asynchronous: true
                    sourceSize.width: width * Screen.devicePixelRatio
                    sourceSize.height: height * Screen.devicePixelRatio
                    source: recentTile.modelData.icon ? Quickshell.iconPath(recentTile.modelData.icon, true) : ""
                  }

                  Text {
                    anchors.left: recentIcon.right
                    anchors.leftMargin: Style.spacing.md
                    anchors.right: parent.right
                    anchors.rightMargin: Style.spacing.sm
                    anchors.verticalCenter: parent.verticalCenter
                    elide: Text.ElideRight
                    text: recentTile.modelData.name
                    color: Color.popups.text
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  MouseArea {
                    id: recentMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    cursorShape: Qt.PointingHandCursor
                    onClicked: function (mouse) {
                      if (mouse.button === Qt.RightButton) startMenu.openAppMenu(recentTile.modelData, recentMouse, mouse)
                      else startMenu.launch(recentTile.modelData)
                    }
                  }
                }

                Text {
                  visible: startMenu.recentApps.length === 0
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.sm
                  anchors.top: parent.top
                  text: "Apps you open from here show up here"
                  color: Util.alpha(Color.popups.text, 0.5)
                  font.family: Style.font.family
                  font.pixelSize: Style.font.caption
                }
              }
            }
          }

          // Account and power row.
          Rectangle {
            id: footer
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            anchors.right: parent.right
            height: Style.space(56)
            radius: Style.cornerRadius
            color: Util.alpha(Color.popups.text, 0.05)

            // Clicking the account (avatar or name) opens Lock / Sign out.
            Rectangle {
              id: userButton
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.xs
              anchors.verticalCenter: parent.verticalCenter
              width: userNameText.x + userNameText.width + Style.spacing.md
              height: Style.space(44)
              radius: Style.cornerRadius
              color: userMouse.containsMouse || startMenu.userOpen ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

              MouseArea {
                id: userMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  startMenu.menuApp = null
                  startMenu.powerOpen = false
                  startMenu.userOpen = !startMenu.userOpen
                }
              }
            }

            Rectangle {
              id: avatar
              anchors.left: parent.left
              anchors.leftMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(32)
              height: width
              radius: width / 2
              color: Color.accent

              Text {
                anchors.centerIn: parent
                text: startMenu.userName.charAt(0)
                color: Color.background
                font.family: Style.font.family
                font.pixelSize: Style.font.body
                font.bold: true
              }
            }

            Text {
              id: userNameText
              anchors.left: avatar.right
              anchors.leftMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              text: startMenu.userName
              color: Color.popups.text
              font.family: Style.font.family
              font.pixelSize: Style.font.body
            }

            Rectangle {
              id: powerButton
              anchors.right: parent.right
              anchors.rightMargin: Style.spacing.md
              anchors.verticalCenter: parent.verticalCenter
              width: Style.space(36)
              height: width
              radius: Style.cornerRadius
              color: powerMouse.containsMouse || startMenu.powerOpen ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

              Text {
                anchors.centerIn: parent
                text: "⏻"
                color: Color.popups.text
                font.pixelSize: Style.font.body + 4
              }

              MouseArea {
                id: powerMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                  startMenu.menuApp = null
                  startMenu.userOpen = false
                  startMenu.powerOpen = !startMenu.powerOpen
                }
              }
            }
          }

          // Click anywhere else closes an open overlay menu.
          MouseArea {
            anchors.fill: parent
            z: 20
            visible: startMenu.menuApp !== null || startMenu.powerOpen || startMenu.userOpen
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: startMenu.closeOverlays()
          }

          // Right-click menu on an app, and the power menu.
          Rectangle {
            id: overlayMenu
            z: 30
            visible: startMenu.menuApp !== null || startMenu.powerOpen || startMenu.userOpen
            width: Style.space(190)
            height: overlayColumn.implicitHeight + Style.spacing.xxs * 2
            radius: Style.cornerRadius
            color: Color.popups.background
            border.width: Style.normalBorderWidth
            border.color: Color.popups.border
            x: startMenu.powerOpen ? card.width - width - Style.spacing.md
              : (startMenu.userOpen ? Style.spacing.md : startMenu.menuX)
            y: (startMenu.powerOpen || startMenu.userOpen) ? footer.y - height - Style.spacing.xs : startMenu.menuY

            Column {
              id: overlayColumn
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.top: parent.top
              anchors.margins: Style.spacing.xxs

              Repeater {
                model: startMenu.powerOpen ? DockConfig.startPowerActions()
                  : (startMenu.userOpen ? DockConfig.startUserActions() : startMenu.menuRows)

                delegate: Rectangle {
                  id: overlayRow
                  required property var modelData
                  width: overlayColumn.width
                  height: Style.spacing.popupRowHeight
                  radius: Style.cornerRadius
                  color: overlayMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

                  Text {
                    anchors.left: parent.left
                    anchors.leftMargin: Style.spacing.controlPaddingX
                    anchors.verticalCenter: parent.verticalCenter
                    text: overlayRow.modelData.label
                    color: Color.popups.text
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  MouseArea {
                    id: overlayMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      // Take local references and run the action before
                      // touching any state: closing the overlay changes this
                      // Repeater's model, which destroys this delegate, and
                      // a handler that then reaches for `startMenu` by id
                      // dies with "startMenu is not defined" — before the
                      // action ever ran.
                      var menu = startMenu
                      var system = menu.powerOpen || menu.userOpen
                      var row = overlayRow.modelData
                      if (system) {
                        Quickshell.execDetached(["bash", "-lc", row.command])
                        menu.closeOverlays()
                        menu.visible = false
                      } else {
                        row.run()
                        menu.closeOverlays()
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // The bar's options menu (taskbar style): right click on the bar
      // itself. Rows come from DockConfig.barMenuRows; choosing one writes
      // its patch through the same write-back Pin/Unpin uses, so the bar
      // updates live. Closes on any choice or an outside click, and holds
      // the bar Revealed while open, like the Item context menu.
      PopupWindow {
        id: barMenu

        property real pointX: 0
        readonly property int menuMargin: Style.spacing.xs
        readonly property int rowWidth: Style.space(210)
        readonly property var rows: DockConfig.barMenuRows(root.taskbar)

        function close() { barMenu.visible = false }
        function openAt(x) {
          barMenu.pointX = x
          barMenu.visible = true
        }
        // The menu sits just above whichever frame opened it.
        readonly property real frameTop: root.isTaskbar ? panel.height - root.taskbar.barHeight : dockRow.y

        grabFocus: true
        visible: false
        color: "transparent"
        anchor.window: panel
        anchor.adjustment: PopupAdjustment.Slide
        anchor.edges: Edges.Top | Edges.Left
        anchor.gravity: Edges.Bottom | Edges.Right
        anchor.rect.width: 1
        anchor.rect.height: 1
        anchor.onAnchoring: {
          var x = barMenu.pointX - barMenu.implicitWidth / 2
          anchor.rect.x = Math.round(Math.max(barMenu.menuMargin, Math.min(x, panel.width - barMenu.implicitWidth - barMenu.menuMargin)))
          anchor.rect.y = Math.round(Math.max(barMenu.menuMargin, barMenu.frameTop - barMenu.implicitHeight - barMenu.menuMargin))
        }

        implicitWidth: rowWidth
        implicitHeight: barMenuColumn.implicitHeight + Style.spacing.xxs * 2

        onVisibleChanged: revealState.menuOpen = barMenu.visible
        onClosed: barMenu.close()

        Rectangle {
          anchors.fill: parent
          radius: Style.cornerRadius
          color: Color.popups.background
          border.width: Style.normalBorderWidth
          border.color: Color.popups.border

          Column {
            id: barMenuColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Style.spacing.xxs

            Repeater {
              model: barMenu.rows

              delegate: Item {
                id: barRow
                required property var modelData
                required property int index

                readonly property bool newGroup: index > 0 && barMenu.rows[index - 1].group !== modelData.group

                width: barMenuColumn.width
                height: Style.spacing.popupRowHeight + (newGroup ? 5 : 0)

                Rectangle {
                  visible: barRow.newGroup
                  anchors.top: parent.top
                  anchors.topMargin: 2
                  anchors.left: parent.left
                  anchors.right: parent.right
                  height: 1
                  color: Util.alpha(Color.popups.border, 0.8)
                }

                Rectangle {
                  anchors.bottom: parent.bottom
                  width: parent.width
                  height: Style.spacing.popupRowHeight
                  radius: Style.cornerRadius
                  color: barRowMouse.containsMouse ? Style.hoverFillFor(Color.foreground, Color.accent) : "transparent"

                  Text {
                    anchors.left: parent.left
                    anchors.leftMargin: Style.spacing.controlPaddingX
                    anchors.verticalCenter: parent.verticalCenter
                    text: barRow.modelData.checked ? "\u2713" : ""
                    color: Color.popups.text
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  Text {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: Style.spacing.controlPaddingX + Style.space(22)
                    anchors.rightMargin: Style.spacing.controlPaddingX
                    text: barRow.modelData.label
                    color: Color.popups.text
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  MouseArea {
                    id: barRowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      dockSettings.write(barRow.modelData.patch)
                      barMenu.close()
                    }
                  }
                }
              }
            }
          }
        }
      }

      // The context menu (docs/SPEC.md "Input": "Right click: menu with
      // exactly Pin/Unpin, New Window, Close Window. Pin is disabled on
      // Letter Tile Items"). One instance per monitor's panel, re-anchored
      // to whichever Item was right-clicked; DockModel.menuFor supplies
      // every row's enabled state from the Item alone, so this only turns
      // that into labels and the dispatch each row triggers on click.
      PopupWindow {
        id: contextMenu

        property var anchorItem: null
        property var menuItem: null
        readonly property var anchorWindow: contextMenu.anchorItem ? contextMenu.anchorItem.QsWindow.window : null
        readonly property int menuMargin: Style.spacing.xs
        readonly property int rowWidth: Style.space(160)

        // Rows in three groups, divided in the menu: App rows (Pin/Unpin, New
        // Window and the App's own desktop actions, e.g. "New Private
        // Window"), Window-state rows for a Window Item (DockModel.windowActions),
        // and Close Window. DockModel.menuFor supplies each row's enabled
        // state from the Item alone.
        readonly property var rows: {
          var item = contextMenu.menuItem
          if (!item) return []
          var menu = DockModel.menuFor(item)
          var appId = root.menuAppId(item)
          var list = [
            {
              label: menu.pinned ? "Unpin" : "Pin",
              enabled: menu.canPin,
              group: 0,
              trigger: function () { root.togglePin(appId, menu.pinned) },
            },
            {
              label: "New Window",
              enabled: menu.canLaunch,
              group: 0,
              trigger: function () { root.launchApp(item.app) },
            },
          ]
          var appActions = item.app && item.app.actions ? item.app.actions : []
          for (var i = 0; i < appActions.length; i++) {
            list.push({
              label: appActions[i].name,
              enabled: true,
              group: 0,
              trigger: (function (action) { return function () { action.execute() } })(appActions[i]),
            })
          }
          if (item.kind === "window") {
            var states = DockModel.windowActions(item.window)
            for (var j = 0; j < states.length; j++) {
              list.push({
                label: states[j].label,
                enabled: true,
                group: 1,
                trigger: (function (id) { return function () { root.runWindowAction(id, item.window.id) } })(states[j].id),
              })
            }
          }
          list.push({
            label: "Close Window",
            enabled: menu.canClose,
            group: 2,
            trigger: function () { root.closeWindow(item.window.id) },
          })
          return list
        }

        function close() { contextMenu.visible = false }

        // The menu stays open until a row is chosen, an outside click closes
        // it (the focus grab below), or the pointer leaves it: leaving only
        // counts once the pointer has actually been on the menu
        // (enteredMenu), so one that is still travelling up from the
        // right-clicked Item never closes it, however long that takes.
        // Leaving closes after hideDelayMs, the same delay the Dock's own
        // auto-hide uses, so a brief crossing between rows doesn't.
        readonly property bool hoveringMenu: menuHover.hovered
        property bool enteredMenu: false

        // Without this, the popup renders on top but never actually
        // becomes the surface Hyprland routes pointer input to — hover
        // and clicks fall through to whatever's underneath, and any real
        // click reads as "outside" to the focus grab below.
        grabFocus: true

        visible: false
        color: "transparent"
        implicitWidth: contextMenu.rowWidth
        implicitHeight: menuColumn.implicitHeight

        onVisibleChanged: {
          revealState.menuOpen = contextMenu.visible
          contextMenu.enteredMenu = false
          menuLeaveTimer.stop()
        }

        onHoveringMenuChanged: {
          if (contextMenu.hoveringMenu) {
            contextMenu.enteredMenu = true
            menuLeaveTimer.stop()
          } else if (contextMenu.visible && contextMenu.enteredMenu) {
            menuLeaveTimer.restart()
          }
        }

        Timer {
          id: menuLeaveTimer
          interval: root.hideDelayMs
          onTriggered: contextMenu.close()
        }

        // Outside-click dismissal: grabFocus's own compositor grab already
        // dismisses the popup on an outside click; onClosed is the signal
        // it fires when that happens, so this only needs to mirror that
        // into `visible`. A second, separate HyprlandFocusGrab here (as
        // PopupCard uses, for a popup that does *not* set grabFocus)
        // fought this one and cleared it the instant it opened.
        onClosed: contextMenu.close()

        anchor {
          id: menuAnchor
          window: contextMenu.anchorWindow
          adjustment: PopupAdjustment.Slide
          edges: Edges.Top | Edges.Left
          gravity: Edges.Bottom | Edges.Right
          rect.width: 1
          rect.height: 1

          onAnchoring: {
            if (!contextMenu.anchorItem || !contextMenu.anchorWindow) return
            var target = contextMenu.anchorItem
            var popupWidth = contextMenu.implicitWidth
            var popupHeight = contextMenu.implicitHeight
            var localX = target.width / 2 - popupWidth / 2
            var localY = -popupHeight - contextMenu.menuMargin
            var point = contextMenu.anchorWindow.contentItem.mapFromItem(target, localX, localY)
            point.x = Math.max(contextMenu.menuMargin, Math.min(point.x, contextMenu.anchorWindow.width - popupWidth - contextMenu.menuMargin))
            point.y = Math.max(contextMenu.menuMargin, point.y)
            menuAnchor.rect.x = Math.round(point.x)
            menuAnchor.rect.y = Math.round(point.y)
          }
        }

        Rectangle {
          anchors.fill: parent
          radius: Style.cornerRadius
          color: Color.popups.background
          border.width: Style.normalBorderWidth
          border.color: Color.popups.border

          HoverHandler {
            id: menuHover
          }

          Column {
            id: menuColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: Style.spacing.xxs

            Repeater {
              model: contextMenu.rows

              delegate: Item {
                id: menuRow
                required property var modelData
                required property int index

                readonly property bool newGroup: index > 0 && contextMenu.rows[index - 1].group !== modelData.group

                width: menuColumn.width
                height: Style.spacing.popupRowHeight + (newGroup ? 5 : 0)

                Rectangle {
                  visible: menuRow.newGroup
                  anchors.top: parent.top
                  anchors.topMargin: 2
                  anchors.left: parent.left
                  anchors.right: parent.right
                  height: 1
                  color: Util.alpha(Color.popups.border, 0.8)
                }

                Rectangle {
                  id: menuRowBody
                  anchors.bottom: parent.bottom
                  width: parent.width
                  height: Style.spacing.popupRowHeight
                  radius: Style.cornerRadius
                  // containsMouse, not a HoverHandler, to match Button.qml's
                  // own hover-fill convention.
                  color: menuRow.modelData.enabled && rowMouse.containsMouse
                    ? Style.hoverFillFor(Color.foreground, Color.accent)
                    : "transparent"

                  Text {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: Style.spacing.controlPaddingX
                    anchors.rightMargin: Style.spacing.controlPaddingX
                    text: menuRow.modelData.label
                    color: menuRow.modelData.enabled ? Color.popups.text : Color.muted
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    enabled: menuRow.modelData.enabled
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      menuRow.modelData.trigger()
                      contextMenu.close()
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
