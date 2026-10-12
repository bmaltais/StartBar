// Dock service entry point (see docs/SPEC.md; vocabulary in CONTEXT.md).
// Owns one layer-shell panel per monitor, each drawing the same Items built
// by DockModel.buildDockItems from live Hyprland state, the Pins and this
// session's Placed positions, between the Start button and the clock. It
// also owns what rises from the Dock (Previews, the Item menu, the Bar
// menu, and the Start menu in StartMenuView.qml) and the settings window.
// The rules themselves live in the JS modules imported below.
import QtQuick
import QtQml.Models
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Ui
import "DockModel.js" as DockModel
import "DockConfig.js" as DockConfig
import "StartMenu.js" as StartMenu
import "DockInteraction.js" as DockInteraction
import "DockPreview.js" as DockPreview
import "DockHyprland.js" as DockHyprland

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

  // The bar's own settings (docs/SPEC.md "The bar"). autoHide is off by
  // default; when on, the bar uses the Reveal Strip and Hidden/Revealed rules.
  readonly property var taskbar: dockSettings.taskbar
  readonly property bool autoHide: taskbar.autoHide
  // A fixed palette for colorScheme dark/light, null to follow the theme.
  readonly property var scheme: DockConfig.schemeColors(taskbar.colorScheme)
  readonly property color colBackground: scheme ? scheme.background : Color.background
  readonly property color colForeground: scheme ? scheme.foreground : Color.foreground
  readonly property color colMuted: scheme ? scheme.muted : Color.muted
  readonly property color colAccent: scheme ? scheme.accent : Color.accent
  readonly property color colBorder: scheme ? scheme.border : Color.muted
  // The same choice for what rises from the bar (the Start menu, the menus,
  // the hover previews and tooltips), which otherwise wear the theme's popup
  // colours.
  readonly property color colPopupBackground: scheme ? scheme.background : Color.popups.background
  readonly property color colPopupText: scheme ? scheme.foreground : Color.popups.text
  readonly property color colPopupBorder: scheme ? scheme.border : Color.popups.border

  // How every menu and window the plugin raises looks, after Windows 11:
  // rounded corners (never sharper than the Start menu's), a hairline edge in
  // the text colour instead of the theme's accent line, a quiet hover fill.
  // Style.cornerRadius follows Hyprland's rounding, often 0.
  readonly property int menuRadius: Math.max(Style.cornerRadius, Style.space(8))
  readonly property int menuRowRadius: Math.max(Style.cornerRadius, Style.space(4))
  readonly property int menuPad: Style.space(4)
  readonly property int menuRowHeight: Style.space(32)
  // A popup window is only as big as it is drawn, so its shadow needs room
  // of its own: the popups are this much larger on every side and the menu
  // is drawn inset, with the anchor moved out by the same amount.
  readonly property int menuShadow: Style.space(14)
  readonly property color colHairline: Util.alpha(colPopupText, 0.12)
  readonly property color colRowHover: Util.alpha(colPopupText, 0.08)

  // Settings and Pins (docs/SPEC.md "Configuration"): read from the Dock's
  // own entry in the shell config's plugins[] array and written back
  // through shell.updateEntryInline, the write-back hook the shell gives
  // every plugin for its own entry (PluginShellApi.updateEntryInline).
  // This object is only the adapter around DockConfig.js, which owns the
  // keys and defaults: effectiveView turns the entry into the properties
  // below, and apply(intent) hands a named intent to DockConfig.applyIntent
  // and persists the next entry. updateEntryInline persists whatever object
  // it's given as the whole entry, so each intent folds onto the entry as
  // last read, or onto the entry an earlier intent in the same tick already
  // produced (pendingEntry) — the file hasn't been re-read by then, and
  // folding onto rawEntry again would lose the first change. pins re-triggers
  // dockState.refresh() on change (below) the same way a Hyprland event
  // does, so a hand edit to the Pins list applies live exactly like a hand
  // edit to a setting does.
  QtObject {
    id: dockSettings

    readonly property string pluginId: root.shell && root.shell.pluginId ? root.shell.pluginId : "io.github.bmaltais.startbar"
    property var rawEntry: null
    property var pendingEntry: null
    property int iconSize: DockConfig.DEFAULT_ICON_SIZE
    property int revealDelayMs: DockConfig.DEFAULT_REVEAL_DELAY_MS
    property int hideDelayMs: DockConfig.DEFAULT_HIDE_DELAY_MS
    property var pins: []
    property var taskbar: DockConfig.effectiveView(null).taskbar
    // A Placed Pin's own position (CONTEXT.md "Placed"), persisted here
    // the same way pins is. A Placed Window Item's lives only in
    // dockState.windowPlacements — it has no business surviving a
    // restart — so it isn't part of this settings object at all.
    property var placements: []
    // The Start menu's own pinned list and recent apps, its custom Places
    // folders (null: the user's XDG folders), and every settings-window
    // field's current value.
    property var startPins: []
    property var recentApps: []
    property var startPlaces: null
    property var values: DockConfig.effectiveView(null).values

    onPinsChanged: dockState.refresh()
    onPlacementsChanged: dockState.refresh()
    // groupWindows changes the Items themselves; any other bar setting
    // leaves the signature unchanged, so refresh() drops it again.
    onTaskbarChanged: dockState.refresh()

    function applyShellConfig(shellConfig) {
      var entry = DockConfig.findPluginEntry(shellConfig, dockSettings.pluginId)
      var view = DockConfig.effectiveView(entry)
      dockSettings.rawEntry = entry
      dockSettings.pendingEntry = null
      dockSettings.iconSize = view.settings.iconSize
      dockSettings.revealDelayMs = view.settings.revealDelayMs
      dockSettings.hideDelayMs = view.settings.hideDelayMs
      dockSettings.taskbar = view.taskbar
      dockSettings.pins = view.pins
      dockSettings.placements = view.placements
      dockSettings.startPins = view.startPins
      dockSettings.recentApps = view.recentApps
      dockSettings.startPlaces = view.startPlaces
      dockSettings.values = view.values
    }

    function apply(intent) {
      if (!root.shell || typeof root.shell.updateEntryInline !== "function") return false
      var base = dockSettings.pendingEntry !== null ? dockSettings.pendingEntry : dockSettings.rawEntry
      var next = DockConfig.applyIntent(base, intent)
      dockSettings.pendingEntry = next
      var written = root.shell.updateEntryInline(dockSettings.pluginId, next)
      if (!written) dockSettings.pendingEntry = null
      return written
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
  ListModel { id: dockItemKeys }

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
      for (var key in dockState.windowPlacements) {
        combined.push({ key: key, index: dockState.windowPlacements[key] })
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
          class: DockModel.clipText(info.class),
          workspace: toplevel.workspace ? toplevel.workspace.name : String((info.workspace && info.workspace.name) || ""),
          openedAt: dockState.openedAtByAddress[address],
          title: DockModel.clipText(toplevel.title || info.title),
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
      var next = DockModel.buildDockItems(windows, resolveApp, dockSettings.pins, resolveAppById, dockState.placements(), !!(root.taskbar && root.taskbar.groupWindows))
      // A Placed Window or Group Item lasts only while its Item exists.
      var itemKeys = {}
      for (var n = 0; n < next.length; n++) itemKeys[next[n].key] = true
      var keptPlacements = {}
      for (var placedKey in dockState.windowPlacements) {
        if (itemKeys[placedKey]) keptPlacements[placedKey] = dockState.windowPlacements[placedKey]
      }
      dockState.windowPlacements = keptPlacements
      var signature = JSON.stringify(next, function (key, value) {
        if (key === "title") return undefined
        if (key === "app") return value ? value.id : null
        return value
      })
      if (signature === dockState.itemsSignature) return
      dockState.itemsSignature = signature
      dockState.items = next
      dockState.syncItemModel(next)
    }

    // The Dock's Repeater runs over dockItemKeys, one row per Item key, and
    // each delegate looks its Item up in itemByKey. Replacing the Items
    // array instead would tear down and rebuild every delegate on any
    // reorder, so a drop made every icon flash as it loaded again. Here an
    // Item that stays keeps its delegate, and a reorder is a `move`.
    property var itemByKey: ({})

    function syncItemModel(next) {
      var byKey = {}
      for (var n = 0; n < next.length; n++) byKey[next[n].key] = next[n]
      for (var r = dockItemKeys.count - 1; r >= 0; r--) {
        if (!byKey[dockItemKeys.get(r).key]) dockItemKeys.remove(r)
      }
      dockState.itemByKey = byKey
      for (var i = 0; i < next.length; i++) {
        if (i < dockItemKeys.count && dockItemKeys.get(i).key === next[i].key) continue
        var at = -1
        for (var j = i + 1; j < dockItemKeys.count; j++) {
          if (dockItemKeys.get(j).key === next[i].key) { at = j; break }
        }
        if (at >= 0) dockItemKeys.move(at, i, 1)
        else dockItemKeys.insert(i, { key: next[i].key })
      }
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
    // A peek the last shell never got to undo (it restarted mid-hover).
    root.peekRestore()
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

  // App icons, for the Dock and the Start menu (IconResolver.qml): Qt's
  // lookup, then a search of the icon directories when Qt has cached a miss.
  IconResolver { id: iconResolver }
  property alias icons: iconResolver

  function iconSource(name) {
    return root.icons.source(name)
  }

  // The Letter Tile's letter for an App with no icon: its name's first letter.
  function appLetter(app) {
    return app && app.name ? app.name.charAt(0).toUpperCase() : ""
  }

  // A Pin resolves its own App directly by the id it was pinned under
  // (CONTEXT.md "Pin"), independent of any Window — unlike resolveApp,
  // which only ever has a window class to go on. A falsy return here is
  // exactly the "App is no longer installed" case (docs/SPEC.md "What the
  // Dock shows").
  function resolveAppById(appId) {
    return appId ? DesktopEntries.byId(appId) || null : null
  }

  // Everything that asks Hyprland for something is built in DockHyprland.js,
  // which returns the command to run; these only run it.
  function focusWindowAndWarp(address) {
    var command = DockHyprland.focusWindowAndWarp(address)
    if (command) Quickshell.execDetached(command)
  }

  function focusWindow(address) {
    var command = DockHyprland.focusWindow(address)
    if (command) Quickshell.execDetached(command)
  }

  // Left click on a Pin with no Windows launches its App (docs/SPEC.md
  // "Input"). A missing App's Pin has no `execute` to call — clicking it
  // is a no-op until Unpin, same as a Letter Tile Window Item is a no-op
  // to click on today.
  function launchApp(app) {
    if (!app || typeof app.execute !== "function") return
    app.execute()
  }

  // A Window-state row of the context menu (DockModel.windowActions has the
  // ids and labels, DockHyprland.windowAction the dispatch).
  function runWindowAction(id, address) {
    var command = DockHyprland.windowAction(id, address)
    if (command) Quickshell.execDetached(command)
  }

  // Close Window (docs/SPEC.md "Input", the context menu).
  function closeWindow(address) {
    var command = DockHyprland.closeWindow(address)
    if (command) Quickshell.execDetached(command)
  }

  // Pin/Unpin (docs/SPEC.md "Input", the context menu): DockConfig.applyIntent
  // computes the Pins list's new contents; this only hands the intent to
  // dockSettings.apply, the same write-back path a hand edit to Pins
  // already applies live through.
  function togglePin(appId, pinned) {
    if (!appId) return
    dockSettings.apply({ type: pinned ? "unpinApp" : "pinApp", appId: appId })
  }

  // Drag within the Dock (docs/SPEC.md "Input": "reorder"; CONTEXT.md
  // "Placed"): DockModel.movedPlacements works out every Placed position
  // after the drop. The Pins' are persisted through dockSettings.apply
  // exactly like Pin/Unpin already is, so they survive a restart; the Window
  // Items' go to dockState.windowPlacements directly.
  function placeItem(item, targetIndex) {
    var placements = DockModel.movedPlacements(dockState.items, dockState.placements(), item.key, targetIndex)
    var windowPlacements = {}
    var pinPlacements = []
    for (var i = 0; i < placements.length; i++) {
      if (placements[i].key.indexOf("pin:") === 0) pinPlacements.push(placements[i])
      else windowPlacements[placements[i].key] = placements[i].index
    }
    dockState.windowPlacements = windowPlacements
    // Shown now, not once the config file has been written and read back: the
    // Dock would otherwise sit in the old order for a moment after a drop.
    dockSettings.placements = pinPlacements
    dockSettings.apply({ type: "setPlacements", placements: pinPlacements })
    dockState.refresh()
  }

  // Drag out of the Dock, for an Item whose App is pinned (docs/SPEC.md
  // "Input": "Drag out of the Dock: unpin the Item's App if pinned"): one
  // intent so dropping the App from Pins and dropping its own Pin's Placed
  // position (CONTEXT.md "Placed") land in the same shellConfig update.
  // Dragging an unpinned Window Item out is a snap-back
  // (docs/SPEC.md "Input"): the Dock itself has nothing to persist for
  // that, so it never calls this at all.
  function unpinFromDrag(appId) {
    if (!appId) return
    dockSettings.apply({ type: "unpinAppFromDrag", appId: appId })
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

  // Peek (previewPeek): hovering a preview thumbnail focuses its Window to
  // show it, and leaving puts things back. The first peek saves the
  // focused Window and each monitor's workspace in a state file; peekRestore
  // replays it, peekCommit (a click picked the Window) throws it away.
  // DockPreview.js decides when each is asked for, DockHyprland.js builds them.
  //
  // Peek scripts run one at a time, in the order asked for (a plain
  // execDetached per script let a restore overtake a peek).
  property var peekQueue: []

  Process {
    id: peekRunner
    onExited: root.peekNext()
  }

  function peekRun(command) {
    root.peekQueue.push(command)
    if (!peekRunner.running) root.peekNext()
  }

  function peekNext() {
    if (root.peekQueue.length === 0) return
    peekRunner.command = root.peekQueue.shift()
    peekRunner.running = true
  }

  function peekWindow(address) {
    var command = DockHyprland.peekWindow(address)
    if (command) root.peekRun(command)
  }

  function peekRestore() {
    root.peekRun(DockHyprland.peekRestore())
  }

  function peekCommit() {
    root.peekRun(DockHyprland.peekCommit())
  }

  // Previews off: a click on a Group Item focuses the Window after the
  // Active one, wrapping round.
  function focusNextInGroup(item) {
    var windows = item.windows || []
    var at = -1
    for (var i = 0; i < windows.length; i++) if (windows[i].active) at = i
    var next = windows[(at + 1) % windows.length]
    if (next) root.focusWindow(next.id)
  }

  function windowTooltipText(item) {
    if (item.count > 1) {
      var name = (item.app && item.app.name) || item.window.class || ""
      return name + "\n" + item.count + " windows"
    }
    return (dockState.titles[item.window.id] || item.window.title || item.window.class || "") + "\nWorkspace: " + (item.badge || "")
  }

  // ---- Settings window (docs/SPEC.md "Settings window") -------------------
  // Opened by a right click on the bar, or with
  // `omarchy-shell io.github.bmaltais.startbar settings`. One window, shown on the monitor
  // that was clicked. DockConfig.settingsSchema() lists every option and its
  // widget; every change is written straight back through dockSettings.apply,
  // so the Dock updates live. Text fields commit when you press Enter or
  // click away.
  property var settingsScreen: Quickshell.screens.length > 0 ? Quickshell.screens[0] : null

  // The monitor the keyboard/pointer focus is on, for opens that don't come
  // from a click on a particular monitor's bar.
  function focusedScreen() {
    var name = Hyprland.focusedMonitor ? Hyprland.focusedMonitor.name : ""
    for (var i = 0; i < Quickshell.screens.length; i++) {
      if (Quickshell.screens[i].name === name) return Quickshell.screens[i]
    }
    return null
  }

  // Asked (by IPC) to toggle or close the Start menu on one monitor; each
  // monitor's panel owns a menu and answers only for its own screen.
  signal startMenuRequested(string screenName, string action)

  function focusedScreenName() {
    var screen = root.focusedScreen()
    return screen ? screen.name : ""
  }

  function openSettings(screen) {
    var target = screen || root.focusedScreen()
    if (target) root.settingsScreen = target
    settingsWindow.visible = true
  }

  IpcHandler {
    target: "io.github.bmaltais.startbar"
    function settings(): void { root.openSettings(null) }
    function closeSettings(): void { settingsWindow.visible = false }
    // For a Super-key binding: `omarchy-shell io.github.bmaltais.startbar startMenu`.
    function startMenu(): void { root.startMenuRequested(root.focusedScreenName(), "toggle") }
    function closeStartMenu(): void { root.startMenuRequested(root.focusedScreenName(), "close") }
  }

  FileView {
    id: userDirsForSettings
    path: Quickshell.env("HOME") + "/.config/user-dirs.dirs"
    printErrors: false
  }

  PanelWindow {
    id: settingsWindow

    readonly property var values: dockSettings.values
    property bool confirmingReset: false

    screen: root.settingsScreen
    visible: false
    color: "transparent"
    WlrLayershell.namespace: "omarchy-startbar-settings"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.OnDemand
    exclusionMode: ExclusionMode.Ignore

    implicitWidth: Style.space(640) + root.menuShadow * 2
    implicitHeight: Math.min(Style.space(760), (root.settingsScreen ? root.settingsScreen.height : 900) - Style.space(80)) + root.menuShadow * 2

    onVisibleChanged: if (!visible) settingsWindow.confirmingReset = false

    function commit(key, value) {
      dockSettings.apply({ type: "setSetting", key: key, value: value })
    }

    // Every setting back to its default; Pins, their positions and the Start
    // menu's own pins and recents are left alone.
    function resetAll() {
      dockSettings.apply({ type: "resetSettings" })
    }

    Timer {
      id: resetConfirmTimer
      interval: 3000
      onTriggered: settingsWindow.confirmingReset = false
    }

    RectangularShadow {
      anchors.fill: settingsFrame
      radius: settingsFrame.radius
      blur: root.menuShadow
      offset.y: Style.space(4)
      color: Qt.rgba(0, 0, 0, 0.6)
    }

    Rectangle {
      id: settingsFrame
      anchors.fill: parent
      anchors.margins: root.menuShadow
      radius: root.menuRadius
      color: root.colPopupBackground
      border.width: Style.normalBorderWidth
      border.color: root.colHairline
      focus: true
      Keys.onEscapePressed: settingsWindow.visible = false

      // Header
      Item {
        id: settingsHeader
        anchors.top: parent.top
        anchors.left: parent.left
        anchors.right: parent.right
        height: Style.space(52)

        Text {
          textFormat: Text.PlainText
          anchors.left: parent.left
          anchors.leftMargin: Style.spacing.lg
          anchors.verticalCenter: parent.verticalCenter
          text: "Taskbar settings"
          color: root.colPopupText
          font.family: Style.font.family
          font.pixelSize: Style.font.body + 3
          font.bold: true
        }

        Rectangle {
          anchors.right: parent.right
          anchors.rightMargin: Style.spacing.md
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(30)
          height: width
          radius: root.menuRowRadius
          color: closeSettingsMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : "transparent"

          Text {
            textFormat: Text.PlainText
            anchors.centerIn: parent
            text: "✕"
            color: root.colPopupText
            font.pixelSize: Style.font.body
          }

          MouseArea {
            id: closeSettingsMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: settingsWindow.visible = false
          }
        }
      }

      // Body: scrolls when the screen is short.
      Flickable {
        id: settingsFlick
        anchors.top: settingsHeader.bottom
        anchors.bottom: settingsFooter.top
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.leftMargin: Style.spacing.lg
        anchors.rightMargin: Style.spacing.lg
        contentHeight: settingsColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds

        Column {
          id: settingsColumn
          width: settingsFlick.width
          spacing: Style.spacing.xs

          Repeater {
            model: DockConfig.settingsSchema()

            delegate: Column {
              id: groupBlock
              required property var modelData
              width: settingsColumn.width

              Text {
                textFormat: Text.PlainText
                topPadding: Style.spacing.md
                bottomPadding: Style.spacing.xs
                text: groupBlock.modelData.title
                color: root.colPopupText
                font.family: Style.font.family
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Repeater {
                model: groupBlock.modelData.fields

                delegate: Item {
                  id: fieldRow
                  required property var modelData
                  readonly property var field: fieldRow.modelData
                  readonly property var value: settingsWindow.values[fieldRow.field.key]
                  readonly property bool stacked: fieldRow.field.type === "list"

                  width: groupBlock.width
                  height: fieldRow.stacked
                    ? labelColumn.implicitHeight + editorLoader.height + Style.spacing.md * 2
                    : Math.max(labelColumn.implicitHeight, editorLoader.height) + Style.spacing.md * 2

                  Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.left: parent.left
                    anchors.right: parent.right
                    height: 1
                    color: Util.alpha(root.colHairline, 0.5)
                  }

                  Column {
                    id: labelColumn
                    anchors.top: parent.top
                    anchors.topMargin: Style.spacing.md
                    anchors.left: parent.left
                    width: fieldRow.stacked ? parent.width : parent.width - editorLoader.width - Style.spacing.md

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width
                      elide: Text.ElideRight
                      text: fieldRow.field.label
                      color: root.colPopupText
                      font.family: Style.font.family
                      font.pixelSize: Style.font.body
                    }

                    Text {
                      textFormat: Text.PlainText
                      visible: !!fieldRow.field.hint
                      width: parent.width
                      wrapMode: Text.WordWrap
                      text: fieldRow.field.hint || ""
                      color: Util.alpha(root.colPopupText, 0.55)
                      font.family: Style.font.family
                      font.pixelSize: Style.font.caption
                    }
                  }

                  Loader {
                    id: editorLoader
                    anchors.right: parent.right
                    anchors.verticalCenter: fieldRow.stacked ? undefined : parent.verticalCenter
                    anchors.bottom: fieldRow.stacked ? parent.bottom : undefined
                    anchors.bottomMargin: fieldRow.stacked ? Style.spacing.md : 0
                    width: fieldRow.stacked ? parent.width : implicitWidth
                    sourceComponent: {
                      switch (fieldRow.field.type) {
                      case "bool": return switchEditor
                      case "choice": return choiceEditor
                      case "int": return stepperEditor
                      case "slider": return sliderEditor
                      case "text": return textEditor
                      case "list": return listEditor
                      }
                      return null
                    }
                    onLoaded: {
                      item.field = Qt.binding(function () { return fieldRow.field })
                      item.value = Qt.binding(function () { return fieldRow.value })
                    }

                    Connections {
                      target: editorLoader.item
                      ignoreUnknownSignals: true
                      function onCommit(next) { settingsWindow.commit(fieldRow.field.key, next) }
                    }
                  }
                }
              }
            }
          }

          Item { width: 1; height: Style.spacing.md }
        }
      }

      // Footer
      Item {
        id: settingsFooter
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.right: parent.right
        height: Style.space(52)

        Text {
          textFormat: Text.PlainText
          anchors.left: parent.left
          anchors.leftMargin: Style.spacing.lg
          anchors.verticalCenter: parent.verticalCenter
          text: "Changes apply instantly"
          color: Util.alpha(root.colPopupText, 0.55)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Rectangle {
          anchors.right: parent.right
          anchors.rightMargin: Style.spacing.lg
          anchors.verticalCenter: parent.verticalCenter
          width: resetLabel.implicitWidth + Style.spacing.lg * 2
          height: Style.space(32)
          radius: root.menuRowRadius
          color: settingsWindow.confirmingReset
            ? Util.alpha(Color.urgent, 0.5)
            : (resetMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : Util.alpha(root.colPopupText, 0.08))

          Text {
            textFormat: Text.PlainText
            id: resetLabel
            anchors.centerIn: parent
            text: settingsWindow.confirmingReset ? "Click again to reset everything" : "Reset to defaults"
            color: root.colPopupText
            font.family: Style.font.family
            font.pixelSize: Style.font.caption
          }

          MouseArea {
            id: resetMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
              if (settingsWindow.confirmingReset) {
                settingsWindow.confirmingReset = false
                resetConfirmTimer.stop()
                settingsWindow.resetAll()
              } else {
                settingsWindow.confirmingReset = true
                resetConfirmTimer.restart()
              }
            }
          }
        }
      }
    }

    // --- Editors: each is given `field` and `value` and emits commit(next).

    Component {
      id: switchEditor
      Rectangle {
        id: sw
        property var field: null
        property var value: false
        signal commit(var next)
        implicitWidth: Style.space(42)
        implicitHeight: Style.space(24)
        width: implicitWidth
        height: implicitHeight
        radius: height / 2
        color: sw.value ? root.colAccent : Util.alpha(root.colPopupText, 0.25)

        Rectangle {
          width: parent.height - 6
          height: width
          radius: width / 2
          y: 3
          x: sw.value ? parent.width - width - 3 : 3
          color: root.colPopupBackground

          Behavior on x { NumberAnimation { duration: 100 } }
        }

        MouseArea {
          anchors.fill: parent
          cursorShape: Qt.PointingHandCursor
          onClicked: sw.commit(!sw.value)
        }
      }
    }

    Component {
      id: choiceEditor
      Row {
        id: choices
        property var field: null
        property var value: ""
        signal commit(var next)
        spacing: 2

        Repeater {
          model: choices.field ? choices.field.options : []

          delegate: Rectangle {
            id: choice
            required property var modelData
            required property int index
            readonly property bool selected: choices.value === choice.modelData.value
            width: choiceLabel.implicitWidth + Style.spacing.lg * 2
            height: Style.space(28)
            radius: root.menuRowRadius
            color: choice.selected ? root.colAccent : (choiceMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : Util.alpha(root.colPopupText, 0.08))

            Text {
              textFormat: Text.PlainText
              id: choiceLabel
              anchors.centerIn: parent
              text: choice.modelData.label
              color: choice.selected ? root.colPopupBackground : root.colPopupText
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }

            MouseArea {
              id: choiceMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: choices.commit(choice.modelData.value)
            }
          }
        }
      }
    }

    Component {
      id: stepperEditor
      Row {
        id: stepper
        property var field: null
        property var value: 0
        signal commit(var next)
        spacing: Style.spacing.sm

        function step(direction) {
          var f = stepper.field
          var next = Number(stepper.value) + direction * f.step
          stepper.commit(Math.max(f.min, Math.min(f.max, next)))
        }

        Rectangle {
          width: Style.space(28)
          height: width
          radius: root.menuRowRadius
          color: minusMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : Util.alpha(root.colPopupText, 0.08)
          Text { textFormat: Text.PlainText; anchors.centerIn: parent; text: "−"; color: root.colPopupText; font.pixelSize: Style.font.body }
          MouseArea { id: minusMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: stepper.step(-1) }
        }

        Text {
          textFormat: Text.PlainText
          anchors.verticalCenter: undefined
          width: Style.space(66)
          height: Style.space(28)
          horizontalAlignment: Text.AlignHCenter
          verticalAlignment: Text.AlignVCenter
          text: stepper.value + (stepper.field && stepper.field.unit ? " " + stepper.field.unit : "")
          color: root.colPopupText
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }

        Rectangle {
          width: Style.space(28)
          height: width
          radius: root.menuRowRadius
          color: plusMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : Util.alpha(root.colPopupText, 0.08)
          Text { textFormat: Text.PlainText; anchors.centerIn: parent; text: "+"; color: root.colPopupText; font.pixelSize: Style.font.body }
          MouseArea { id: plusMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: stepper.step(1) }
        }
      }
    }

    Component {
      id: sliderEditor
      Row {
        id: slider
        property var field: null
        property var value: 0
        signal commit(var next)
        spacing: Style.spacing.md
        // The knob follows the pointer while dragging; the value is written
        // once, on release, so a drag is one config write, not hundreds.
        property real dragValue: -1
        readonly property real shown: slider.dragValue >= 0 ? slider.dragValue : Number(slider.value)

        Item {
          id: track
          width: Style.space(160)
          height: Style.space(24)

          Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: 4
            radius: 2
            color: Util.alpha(root.colPopupText, 0.25)

            Rectangle {
              width: slider.field ? parent.width * (slider.shown - slider.field.min) / (slider.field.max - slider.field.min) : 0
              height: parent.height
              radius: 2
              color: root.colAccent
            }
          }

          Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: Style.space(14)
            height: width
            radius: width / 2
            color: root.colAccent
            x: slider.field ? (track.width - width) * (slider.shown - slider.field.min) / (slider.field.max - slider.field.min) : 0
          }

          MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            function valueAt(x) {
              var f = slider.field
              var ratio = Math.max(0, Math.min(1, x / track.width))
              var raw = f.min + ratio * (f.max - f.min)
              return Math.round(raw / f.step) * f.step
            }
            onPressed: function (mouse) { slider.dragValue = valueAt(mouse.x) }
            onPositionChanged: function (mouse) { if (pressed) slider.dragValue = valueAt(mouse.x) }
            onReleased: {
              var next = slider.dragValue
              slider.dragValue = -1
              if (next >= 0) slider.commit(Math.round(next * 100) / 100)
            }
          }
        }

        Text {
          textFormat: Text.PlainText
          width: Style.space(40)
          height: Style.space(24)
          verticalAlignment: Text.AlignVCenter
          text: Math.round(slider.shown * 100) + "%"
          color: root.colPopupText
          font.family: Style.font.family
          font.pixelSize: Style.font.body
        }
      }
    }

    Component {
      id: textEditor
      Rectangle {
        id: textBox
        property var field: null
        property var value: ""
        signal commit(var next)
        implicitWidth: Style.space(260)
        implicitHeight: Style.space(30)
        width: implicitWidth
        height: implicitHeight
        radius: root.menuRowRadius
        color: Util.alpha(root.colPopupText, 0.08)
        border.width: input.activeFocus ? 1 : 0
        border.color: root.colAccent

        PlainField {
          id: input
          anchors.fill: parent
          anchors.leftMargin: Style.spacing.md
          anchors.rightMargin: Style.spacing.md
          color: root.colPopupText
          fontFamily: Style.font.family
          fontPixelSize: Style.font.body
          text: textBox.value === undefined || textBox.value === null ? "" : String(textBox.value)
          onEditingFinished: {
            if (input.text !== String(textBox.value)) textBox.commit(input.text)
          }
        }
      }
    }

    Component {
      id: listEditor
      Column {
        id: listBox
        property var field: null
        property var value: null
        signal commit(var next)
        spacing: Style.spacing.xs

        // Unset means the Start menu uses your XDG folders.
        readonly property bool isDefault: listBox.value === null || listBox.value === undefined
        readonly property var items: listBox.isDefault ? [] : listBox.value

        function seedFromDefaults() {
          var places = StartMenu.effectivePlaces(dockSettings.startPlaces, userDirsForSettings.text(), Quickshell.env("HOME") || "")
          var paths = []
          for (var i = 0; i < places.length; i++) paths.push(places[i].path)
          listBox.commit(paths)
        }

        function replaceAt(index, text) {
          var next = listBox.items.slice()
          next[index] = text
          listBox.commit(next)
        }

        function removeAt(index) {
          var next = listBox.items.slice()
          next.splice(index, 1)
          listBox.commit(next)
        }

        Text {
          textFormat: Text.PlainText
          visible: listBox.isDefault
          text: "Default: Home and your Documents, Downloads, Pictures, Music and Videos folders"
          color: Util.alpha(root.colPopupText, 0.7)
          font.family: Style.font.family
          font.pixelSize: Style.font.caption
        }

        Repeater {
          model: listBox.items

          delegate: Row {
            id: placeEntry
            required property string modelData
            required property int index
            spacing: Style.spacing.sm

            Rectangle {
              width: listBox.width - Style.space(34)
              height: Style.space(30)
              radius: root.menuRowRadius
              color: Util.alpha(root.colPopupText, 0.08)
              border.width: placeInput.activeFocus ? 1 : 0
              border.color: root.colAccent

              PlainField {
                id: placeInput
                anchors.fill: parent
                anchors.leftMargin: Style.spacing.md
                anchors.rightMargin: Style.spacing.md
                color: root.colPopupText
                fontFamily: Style.font.family
                fontPixelSize: Style.font.body
                text: placeEntry.modelData
                onEditingFinished: if (placeInput.text !== placeEntry.modelData) listBox.replaceAt(placeEntry.index, placeInput.text)
              }
            }

            Rectangle {
              width: Style.space(28)
              height: width
              radius: root.menuRowRadius
              color: removeMouse.containsMouse ? Util.alpha(Color.urgent, 0.5) : "transparent"
              Text { textFormat: Text.PlainText; anchors.centerIn: parent; text: "✕"; color: root.colPopupText; font.pixelSize: Style.font.caption }
              MouseArea { id: removeMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: listBox.removeAt(placeEntry.index) }
            }
          }
        }

        Row {
          spacing: Style.spacing.sm

          Rectangle {
            width: addLabel.implicitWidth + Style.spacing.lg * 2
            height: Style.space(28)
            radius: root.menuRowRadius
            color: addMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : Util.alpha(root.colPopupText, 0.08)
            Text {
              textFormat: Text.PlainText
              id: addLabel
              anchors.centerIn: parent
              text: listBox.isDefault ? "Customize" : "Add folder"
              color: root.colPopupText
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
            MouseArea {
              id: addMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: {
                if (listBox.isDefault) listBox.seedFromDefaults()
                else listBox.commit(listBox.items.concat(["~/"]))
              }
            }
          }

          Rectangle {
            visible: !listBox.isDefault
            width: useDefaultLabel.implicitWidth + Style.spacing.lg * 2
            height: Style.space(28)
            radius: root.menuRowRadius
            color: useDefaultMouse.containsMouse ? Style.hoverFillFor(root.colForeground, root.colAccent) : Util.alpha(root.colPopupText, 0.08)
            Text {
              textFormat: Text.PlainText
              id: useDefaultLabel
              anchors.centerIn: parent
              text: "Use defaults"
              color: root.colPopupText
              font.family: Style.font.family
              font.pixelSize: Style.font.caption
            }
            MouseArea {
              id: useDefaultMouse
              anchors.fill: parent
              hoverEnabled: true
              cursorShape: Qt.PointingHandCursor
              onClicked: listBox.commit(undefined)
            }
          }
        }
      }
    }
  }

  Variants {
    model: Quickshell.screens

    PanelWindow {
      id: panel

      required property var modelData
      screen: modelData
      visible: true
      color: "transparent"

      WlrLayershell.namespace: "omarchy-startbar"
      WlrLayershell.layer: WlrLayer.Top
      // Exclusive while the built-in Start menu is open, hover-shown or not,
      // so typing searches it wherever the pointer is. (A popup's grab would
      // have pulled pointer focus off the Start button; this does not.)
      WlrLayershell.keyboardFocus: startMenu.open ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

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
        Region { item: startMenu }
        Region { item: startDismiss }
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
          onHoveredChanged: revealState.set("strip", hovered)
        }
      }

      // Hidden/Revealed and the reveal/hide timers (SPEC.md "How the Dock
      // behaves"). Kept per panel, so hovering one monitor's Reveal Strip
      // never reveals the other monitor's Dock. menuOpen holds the Dock
      // Revealed for the whole of a context-menu visit (SPEC.md "How the Dock
      // behaves": it stays Revealed while a menu is open) independent of
      // hover, since the pointer moves onto the menu's own popup window
      // and away from both the strip and the Dock itself. dragging does
      // the same for the whole of a drag (SPEC.md "How the Dock behaves":
      // Revealed for the whole of a drag, the hide timer starts after the
      // drop): once it drops back to false the hide timer starts
      // exactly like it does when hover ends, with no separate handling
      // needed here.
      QtObject {
        id: revealState

        // The rules live in DockInteraction.js; this holds its state and arms
        // the timers a transition asks for.
        property var model: DockInteraction.initialReveal()
        readonly property bool revealed: revealState.model.revealed

        // `name` is one of strip, dock, bar, start, preview, menu, barMenu,
        // startMenu, drag.
        function set(name, value) {
          revealState.apply(DockInteraction.setRevealFlag(revealState.model, name, value))
        }

        function apply(result) {
          revealState.model = result.state
          if (result.timers.hide === "stop") hideTimer.stop()
          else if (result.timers.hide === "start") hideTimer.restart()
          if (result.timers.reveal === "stop") revealTimer.stop()
          else if (result.timers.reveal === "start") revealTimer.restart()
        }
      }

      Timer {
        id: revealTimer
        interval: root.revealDelayMs
        onTriggered: revealState.apply(DockInteraction.revealTimerFired(revealState.model))
      }

      Timer {
        id: hideTimer
        interval: root.hideDelayMs
        onTriggered: revealState.apply(DockInteraction.hideTimerFired(revealState.model))
      }

      // The full-width bar. Slides away with the Hidden/Revealed rule when
      // it auto-hides.
      Rectangle {
        id: bar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        anchors.bottomMargin: panel.shown ? 0 : -height
        height: root.taskbar.barHeight
        color: root.taskbar.transparent ? "transparent" : Util.alpha(root.colBackground, root.taskbar.opacity)

        Behavior on anchors.bottomMargin {
          NumberAnimation { duration: root.slideDurationMs; easing.type: Easing.InOutCubic }
        }

        HoverHandler {
          onHoveredChanged: revealState.set("bar", hovered)
        }

        // Right click on the bar itself (Item MouseAreas above it take their
        // own clicks first) opens the bar's options menu. A TapHandler, not
        // a MouseArea, so it can't take hover from the HoverHandler above.
        TapHandler {
          acceptedButtons: Qt.RightButton
          onTapped: function (eventPoint) {
            barMenu.openAt(revealStrip.mapToItem(panel.contentItem, eventPoint.position.x, 0).x)
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
        visible: root.taskbar.showStart
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
          spacing: 3
          Repeater {
            model: 4
            Rectangle {
              width: Math.round(startButton.width * 0.27)
              height: width
              radius: 2
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
            : (startButton.iconSpec.kind === "icon" ? root.iconSource(startButton.iconSpec.value) : "")
        }

        // The MouseArea below takes hover away from the bar's own handler
        // (this button is the bar's sibling, not its child), so it keeps the
        // bar Revealed itself.
        HoverHandler {
          onHoveredChanged: revealState.set("start", hovered)
        }

        // The built-in menu's open/close rules (resting here opens it after a
        // moment, clicking toggles it, a hover-opened one closes when the
        // pointer leaves) live in StartMenu.js; this only reports what the
        // pointer and the keyboard command did.
        Connections {
          target: root
          function onStartMenuRequested(screenName, action) {
            if (panel.screen.name !== screenName) return
            startMenu.send({ type: "command", action: action })
          }
        }

        MouseArea {
          id: startMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onContainsMouseChanged: startMenu.send({ type: "buttonHover", hovered: startMouse.containsMouse })
          onClicked: startMenu.send({ type: "buttonClick" })
        }
      }

      // Clock at the bar's right end. The wrapper's size is what the mask and
      // layout see, zero while hidden.
      Item {
        id: clock
        visible: root.taskbar.showClock
        width: visible ? clockLabel.implicitWidth : 0
        height: clockLabel.implicitHeight
        anchors.right: parent.right
        anchors.rightMargin: 16
        anchors.bottom: parent.bottom
        anchors.bottomMargin: panel.shown ? (root.taskbar.barHeight - height) / 2 : -height

        Text {
          textFormat: Text.PlainText
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

        anchors.bottom: parent.bottom
        // Centred vertically in the bar. Hidden parks the Row below the
        // visible edge without unmapping the panel itself; Revealed rests it
        // in the bar. Slides between the two over slideDurationMs.
        anchors.bottomMargin: panel.shown ? (root.taskbar.barHeight - height) / 2 : -height
        spacing: 2

        // Horizontal placement: the Start button and the Items form
        // one group, centred or pushed to the left edge.
        readonly property real startReserve: startButton.visible ? startButton.width + 4 : 0
        readonly property real clockReserve: clock.visible ? clock.width + 32 : 0
        readonly property real edgePad: 12
        x: root.taskbar.alignment === "left"
          ? dockRow.edgePad + dockRow.startReserve
          : (panel.width - (dockRow.startReserve + dockRow.width)) / 2 + dockRow.startReserve

        Behavior on anchors.bottomMargin {
          NumberAnimation { duration: root.slideDurationMs; easing.type: Easing.InOutCubic }
        }

        HoverHandler {
          onHoveredChanged: revealState.set("dock", hovered)
        }

        TapHandler {
          acceptedButtons: Qt.RightButton
          onTapped: function (eventPoint) {
            barMenu.openAt(dockRow.mapToItem(panel.contentItem, eventPoint.position.x, 0).x)
          }
        }

        // Icons are at most iconSize and fit inside the bar; each Item has
        // side padding for a roomier hit area; itemWidth is what one Item
        // occupies, and everything that steps through the Row uses it.
        readonly property int baseIconSize: Math.max(16, Math.min(root.iconSize, root.taskbar.barHeight - 20))
        readonly property int pad: 16
        readonly property real maxWidth: Math.max(0, panel.width - edgePad * 2 - 2 * (startReserve + clockReserve))
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
        // matches dragKey. dragProbe (declared below, a sibling of this
        // Row) is what the pointer drags; dragGhost shows the Item in its
        // place, a little bigger than the rest and stopping at the first
        // and last slot; the Items between the two slots step aside by
        // dragShift, so the gap shows where a drop would land. dragKey
        // empty means "no drag in progress".
        property var drag: DockInteraction.initialDrag()
        readonly property string dragKey: dockRow.drag.key
        // True from the drop until the Items have been reordered, so their
        // dragShift snaps back to 0 instead of gliding against the reorder.
        property bool dropping: false

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
          dockRow.drag = DockInteraction.dragMove(dockRow.drag, dockRow.ghostCenter(), dockRow.rect(),
            dockRow.itemWidth + dockRow.spacing, dockRow.iconSize, dockState.items.length)
          dragGhost.x = DockInteraction.clampGhostX(dragProbe.x, dockRow.rect(),
            dockRow.itemWidth + dockRow.spacing, dockState.items.length)
          dragGhost.y = dragProbe.y
        }

        // Where the pointer has taken the Item, not where the ghost is
        // drawn: the ghost stops at the ends of the row, the pointer does not.
        function ghostCenter() {
          return { x: dragProbe.x + dragProbe.width / 2, y: dragProbe.y + dragProbe.height / 2 }
        }

        function rect() {
          return { x: dockRow.x, y: dockRow.y, width: dockRow.width, height: dockRow.height }
        }

        // The drop (docs/SPEC.md "Input"; the decision is
        // DockInteraction.dragDrop): reorder within the Dock, unpin for an
        // Item whose App is pinned dragged out, or (an unpinned Window Item
        // dragged out) a snap-back with nothing to persist — dragGhost
        // simply stops following the pointer and every Item, this one
        // included, falls back to dockState.items' own order. Drag state
        // (root.dragInProgress included) clears first, so the refresh
        // placeItem/unpinFromDrag triggers isn't the one dockState.refresh's
        // own drag guard skips.
        function finishDrag(item) {
          var decision = DockInteraction.dragDrop(dockRow.drag, dockRow.ghostCenter(), dockRow.rect(),
            dockRow.iconSize, { pinned: item.kind === "pin" || !!item.pinned })

          var from = dockRow.drag.from
          dockRow.dropping = true
          dockRow.drag = DockInteraction.initialDrag()
          revealState.set("drag", false)
          root.dragInProgress = false

          // The ghost settles into the slot the Item now has, then gives way
          // to it; a drag-out has no slot to settle into.
          if (decision.action === "unpin") {
            dragGhost.visible = false
            root.unpinFromDrag(root.menuAppId(item))
          } else {
            var slot = decision.action === "reorder" ? decision.index : from
            dockRow.settlingKey = item.key
            settleX.to = dockRow.x + slot * (dockRow.itemWidth + dockRow.spacing)
            settleY.to = dockRow.dragHomeY
            dragGhost.scale = 1
            settle.restart()
            if (decision.action === "reorder") root.placeItem(item, decision.index)
          }
          Qt.callLater(function () { dockRow.dropping = false })
        }

        // The Item whose ghost is still settling into its slot, and where the
        // ghost's top edge rests (where the Item's own was when pressed).
        property string settlingKey: ""
        property real dragHomeY: 0

        Repeater {
          id: repeater
          model: dockItemKeys

          delegate: Item {
            id: dockItem
            required property string key
            required property int index
            // The Item itself, looked up by key; it keeps the last one found
            // for the moment between an Item going and its delegate going.
            readonly property var live: dockState.itemByKey[dockItem.key]
            property var modelData: ({})
            onLiveChanged: if (dockItem.live) dockItem.modelData = dockItem.live
            Component.onCompleted: if (dockItem.live) dockItem.modelData = dockItem.live

            readonly property bool active: dockItem.modelData.active
            readonly property bool attention: dockItem.modelData.attention
            readonly property bool isPin: dockItem.modelData.kind === "pin"
            // Guards onClicked below: MouseArea still emits clicked() on
            // release after a drag.target drag, so without this a drop
            // would also focus/launch the Item it was just dropped near.
            property bool wasDragged: false

            opacity: dockRow.dragKey === dockItem.key || dockRow.settlingKey === dockItem.key ? 0 : 1

            // Items the dragged one has passed step aside by one slot, and a
            // pressed Item shrinks a little before it is lifted.
            property real dragShift: dockRow.dragKey !== ""
              ? DockInteraction.slotShift(dockRow.drag, dockItem.index, dockRow.itemWidth + dockRow.spacing) : 0
            Behavior on dragShift {
              enabled: !dockRow.dropping
              NumberAnimation { duration: 150; easing.type: Easing.OutCubic }
            }
            transform: Translate { x: dockItem.dragShift }
            scale: (mouseArea.pressedButtons & Qt.LeftButton) && dockRow.dragKey === "" ? 0.88 : 1
            Behavior on scale { NumberAnimation { duration: 100; easing.type: Easing.OutCubic } }
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

            // A Group Item (groupWindows, docs/SPEC.md "Grouping") shows the
            // edges of the Windows stacked behind its icon, as Windows does.
            Repeater {
              model: Math.min(dockItem.modelData.count || 1, 3) - 1

              Rectangle {
                required property int index
                z: -1 - index
                x: icon.x + icon.width - Style.space(2) + (index + 1) * Style.space(3)
                y: icon.y + icon.height * 0.15
                width: Style.space(3)
                height: icon.height * 0.7
                radius: width / 2
                color: Util.alpha(root.colForeground, 0.35 - index * 0.1)
              }
            }

            Item {
              id: icon
              anchors.top: parent.top
              anchors.horizontalCenter: parent.horizontalCenter
              width: dockRow.iconSize
              height: dockRow.iconSize

              Image {
                visible: source.toString() !== ""
                anchors.fill: parent
                fillMode: Image.PreserveAspectFit
                asynchronous: true
                sourceSize.width: width * Screen.devicePixelRatio
                sourceSize.height: height * Screen.devicePixelRatio
                source: dockItem.modelData.app ? root.iconSource(dockItem.modelData.app.icon) : ""
              }

              // The Letter Tile: no App, or an App whose icon file is not
              // found (yet).
              Rectangle {
                visible: dockItem.modelData.app === null || root.iconSource(dockItem.modelData.app.icon) === ""
                anchors.fill: parent
                radius: Style.cornerRadius
                color: root.colMuted

                Text {
                  textFormat: Text.PlainText
                  anchors.centerIn: parent
                  text: dockItem.modelData.letter || root.appLetter(dockItem.modelData.app)
                  color: root.colForeground
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
                color: root.colBackground
                border.width: Style.normalBorderWidth
                border.color: root.colMuted
                width: Math.max(height, badgeText.implicitWidth + Style.spacing.xs * 2)
                height: Style.font.caption + Style.spacing.xxs * 2

                Text {
                  textFormat: Text.PlainText
                  id: badgeText
                  anchors.centerIn: parent
                  text: dockItem.modelData.badge || ""
                  color: root.colForeground
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
                drag.target: dragProbe

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
                  mouseArea.drag.target = dragProbe
                  dragGhost.item = dockItem.modelData
                  var origin = dockItem.mapToItem(dockRow.parent, 0, 0)
                  dragProbe.x = origin.x
                  dragProbe.y = origin.y
                  dockRow.dragHomeY = origin.y
                  settle.stop()
                  dockRow.settlingKey = ""
                  dragProbe.width = dockItem.width
                  dragProbe.height = dockItem.height
                  dragGhost.x = origin.x
                  dragGhost.y = origin.y
                  dragGhost.width = dockItem.width
                  dragGhost.height = dockItem.height
                  dragGhost.scale = 0.88
                }

                drag.onActiveChanged: {
                  if (mouseArea.drag.active) {
                    dockItem.wasDragged = true
                    root.dragInProgress = true
                    revealState.set("drag", true)
                    dockRow.drag = DockInteraction.dragStart(dockItem.modelData.key, dockRow.indexOfKey(dockState.items, dockItem.modelData.key))
                    dragGhost.visible = true
                    dragGhost.scale = 1.15
                  } else if (dockRow.dragKey === dockItem.modelData.key) {
                    dockRow.finishDrag(dockItem.modelData)
                  }
                }

                onClicked: function (mouse) {
                  if (dockItem.wasDragged) return
                  if (mouse.button === Qt.RightButton) {
                    // Drop any hover preview first, so the menu never shows over it.
                    previewState.dismiss()
                    contextMenu.previewCell = null
                    contextMenu.previewWindowId = ""
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
                  // A Group Item with a preview to pick from does nothing on
                  // click, as on Windows (docs/SPEC.md "Grouping"); without
                  // previews the click steps through the group's Windows.
                  if (dockItem.modelData.count > 1) {
                    if (!root.taskbar.showPreviews) root.focusNextInGroup(dockItem.modelData)
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
            // A Group Item shows up to three dots, one per Window; the
            // Active Window's is the wide accent pill.
            Row {
              id: runningDot
              visible: !dockItem.isPin
              anchors.top: icon.bottom
              anchors.topMargin: Style.spacing.xxs
              anchors.horizontalCenter: parent.horizontalCenter
              height: 3
              spacing: 3

              Repeater {
                model: Math.min(dockItem.modelData.count || 1, 3)

                Rectangle {
                  required property int index
                  readonly property bool lead: index === 0
                  width: lead && dockItem.active ? 16 : 6
                  height: 3
                  radius: height / 2
                  color: lead && dockItem.active ? root.colAccent : root.colForeground

                  Behavior on width {
                    NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
                  }
                }
              }
            }
          }
        }
      }

      // What the pointer drags (mouseArea.drag.target above): an invisible
      // Item that goes wherever the pointer does, in this shared parent's
      // coordinate space, starting from wherever the dragged delegate's
      // onPressed measured it to be. dragGhost is drawn from it.
      Item {
        id: dragProbe
        visible: false
        onXChanged: dockRow.updateDragPreview()
        onYChanged: dockRow.updateDragPreview()
      }

      // The drop: the ghost glides into its slot, then the Item shows again.
      ParallelAnimation {
        id: settle
        onFinished: {
          dragGhost.visible = false
          dockRow.settlingKey = ""
        }
        NumberAnimation { id: settleX; target: dragGhost; property: "x"; duration: 120; easing.type: Easing.OutCubic }
        NumberAnimation { id: settleY; target: dragGhost; property: "y"; duration: 120; easing.type: Easing.OutCubic }
      }

      // The floating icon of a drag (docs/SPEC.md "Input"): a little bigger
      // than the Items beside it, following the pointer sideways until it
      // reaches the first or last slot, where it stays while the pointer
      // goes on. A sibling of dockRow, not one of its Repeater delegates, so
      // dockRow's own positioning never fights its position.
      Item {
        id: dragGhost

        property var item: null

        visible: false
        z: 1000
        opacity: 0.95
        scale: 1
        Behavior on scale { NumberAnimation { duration: 120; easing.type: Easing.OutCubic } }

        Image {
          visible: source.toString() !== ""
          anchors.fill: parent
          anchors.leftMargin: dockRow.pad / 2
          anchors.rightMargin: dockRow.pad / 2
          fillMode: Image.PreserveAspectFit
          asynchronous: true
          sourceSize.width: width * Screen.devicePixelRatio
          sourceSize.height: height * Screen.devicePixelRatio
          source: dragGhost.item && dragGhost.item.app ? root.iconSource(dragGhost.item.app.icon) : ""
        }

        Rectangle {
          visible: dragGhost.item && (dragGhost.item.app === null || root.iconSource(dragGhost.item.app.icon) === "")
          anchors.fill: parent
          radius: Style.cornerRadius
          color: root.colMuted

          Text {
            textFormat: Text.PlainText
            anchors.centerIn: parent
            text: (dragGhost.item && (dragGhost.item.letter || root.appLetter(dragGhost.item.app))) || ""
            color: root.colForeground
            font.family: Style.font.family
            font.pixelSize: Style.font.icon
          }
        }
      }

      // Hover previews (showPreviews): a live thumbnail of the
      // hovered Window with its title and a close button. The rules are in
      // DockPreview.js (the Preview, Peek, the Preview menu holding it up);
      // previewState keeps its state, arms the timers it names and carries out
      // the effects. Hovering the popup itself keeps it (and the bar, via
      // revealState "preview") up.
      QtObject {
        id: previewState

        // Where the hovered Item is, in panel coordinates, captured at hover
        // time so the popup never depends on the delegate staying alive.
        property real anchorX: 0
        property real anchorY: 0
        property var model: DockPreview.initial()
        readonly property var hoveredItem: previewState.model.hovered
        readonly property var shownItem: previewState.model.shown
        readonly property bool showing: shownItem !== null

        function enabledFor(item) {
          return root.taskbar.showPreviews && item.kind === "window"
        }

        function send(event) {
          var result = DockPreview.transition(previewState.model, event,
            { previewPeek: root.taskbar.previewPeek, warp: root.taskbar.previewWarpPointer })
          // The state first: it can flip the popup's visibility, whose
          // handler sends its own event and reads the state as it now is.
          previewState.model = result.state
          previewState.arm(result.timers)
          for (var i = 0; i < result.effects.length; i++) previewState.perform(result.effects[i])
        }

        function arm(timers) {
          if (timers.open === "stop") previewOpenTimer.stop()
          else if (timers.open === "start") previewOpenTimer.restart()
          if (timers.leave === "stop") previewLeaveTimer.stop()
          else if (timers.leave === "start") previewLeaveTimer.restart()
          if (timers.peek === "stop") peekTimer.stop()
          else if (timers.peek === "start") peekTimer.restart()
          if (timers.peekRestore === "stop") peekRestoreTimer.stop()
          else if (timers.peekRestore === "start") peekRestoreTimer.restart()
        }

        function perform(effect) {
          switch (effect.type) {
          case "peek": root.peekWindow(effect.id); break
          case "restore": root.peekRestore(); break
          case "commit": root.peekCommit(); break
          case "focus":
            if (effect.warp) root.focusWindowAndWarp(effect.id)
            else root.focusWindow(effect.id)
            break
          }
        }

        function hoverStart(delegate) {
          // Moving on to an icon takes over from a hover-opened Start menu at
          // once, instead of both showing until the menu's leave timer fires.
          startMenu.send({ type: "itemHovered" })
          var enabled = enabledFor(delegate.modelData)
          // The anchor only moves for an Item that can have a Preview: a Pin
          // hovered while another Item's is up must not drag that one along.
          if (enabled && !root.dragInProgress) {
            var point = delegate.mapToItem(panel.contentItem, delegate.width / 2, 0)
            previewState.anchorX = point.x
            previewState.anchorY = point.y
          }
          previewState.send({ type: "hoverStart", item: delegate.modelData, enabled: enabled, dragging: root.dragInProgress })
        }

        function hoverEnd() {
          previewState.send({ type: "hoverEnd" })
        }

        function popupHover(hovered) {
          previewState.send({ type: "previewHover", hovered: hovered })
        }

        function dismiss() {
          previewState.send({ type: "dismiss" })
        }
      }

      Timer {
        id: previewOpenTimer
        interval: 350
        onTriggered: previewState.send({ type: "openFired" })
      }

      Timer {
        id: previewLeaveTimer
        interval: 250
        onTriggered: previewState.send({ type: "leaveFired" })
      }

      // Peek, debounced so sweeping the pointer along the thumbnails
      // doesn't flash every window in turn, and so passing between two
      // cells doesn't restore in between.
      Timer {
        id: peekTimer
        interval: 150
        onTriggered: previewState.send({ type: "peekFired" })
      }

      Timer {
        id: peekRestoreTimer
        interval: 200
        onTriggered: previewState.send({ type: "peekRestoreFired" })
      }

      // Keep the popup anchored if the hovered Item's position changes while
      // it is up (e.g. the row reflows).
      Connections {
        target: previewState
        function onAnchorXChanged() {
          if (previewPopup.visible) previewPopup.anchor.updateAnchor()
        }
      }

      // One thumbnail per Window of the shown Item: a lone Window Item shows
      // its one, a Group Item (groupWindows) a row of them to pick from.
      // `liveItem` is the shown Item as the Dock has it now, matched by
      // Window id since a Group Item's key changes as Windows come and go,
      // so a Window closed from the popup drops out of it at once and the
      // popup closes with the last one.
      PopupWindow {
        id: previewPopup

        readonly property var liveItem: DockPreview.liveItem(previewState.shownItem, dockState.items)
        readonly property var liveWindows: liveItem ? (liveItem.windows || [liveItem.window]) : []
        // The thumbnail cells are keyed by Window id and only rebuilt when
        // the set of Windows changes. A peek moves focus, which rebuilds
        // the Items and so liveWindows; if the cells were rebuilt with it,
        // the one under the pointer would be destroyed, its hover would
        // end and the peek would be undone at once.
        property var windowIds: []
        onLiveWindowsChanged: windowIds = DockPreview.windowIds(windowIds, liveWindows)

        function windowFor(id) {
          for (var i = 0; i < liveWindows.length; i++) if (liveWindows[i].id === id) return liveWindows[i]
          return { id: id }
        }
        readonly property int thumbWidth: {
          var n = Math.max(1, windowIds.length)
          var room = panel.width - Style.spacing.xs * 2 - Style.spacing.sm * 2 - (Style.spacing.xs * 2 + Style.spacing.xs) * n
          return Math.max(Style.space(80), Math.min(Style.space(220), Math.floor(room / n)))
        }
        readonly property int thumbHeight: Math.round(thumbWidth * 124 / 220)

        readonly property color textColor: root.colPopupText
        readonly property color accentColor: root.colAccent

        // The delegates below can't see `root`, so they act through these.
        function focusPicked(window) {
          previewState.send({ type: "thumbPicked", window: window })
        }

        function peekHover(window, hovered) {
          previewState.send({ type: "thumbHover", window: window, hovered: hovered })
        }

        // Right click on a thumbnail: that Window's menu, above the thumbnail.
        // What happens to a peek meanwhile is DockPreview.js's "thumbMenu".
        function openMenu(cell, pointX, pointY) {
          previewState.send({ type: "thumbMenu", windowId: cell.modelData })
          contextMenu.close()
          contextMenu.previewCell = cell
          contextMenu.previewPointX = pointX
          contextMenu.previewPointY = pointY
          contextMenu.previewWindowId = cell.modelData
          contextMenu.anchorItem = null
          contextMenu.menuItem = null
          contextMenu.visible = true
        }

        function closePicked(window) {
          root.closeWindow(window.id)
        }

        visible: previewState.showing && liveItem !== null
        color: "transparent"
        implicitWidth: previewRow.implicitWidth + Style.spacing.sm * 2
        implicitHeight: previewRow.implicitHeight + Style.spacing.sm * 2

        onVisibleChanged: {
          revealState.set("preview", previewPopup.visible)
          previewSlideAnim.stop()
          if (visible && root.taskbar.previewSlide) previewSlideAnim.start()
          else slide = 1
          if (!previewPopup.visible) previewState.send({ type: "previewClosed" })
        }
        onImplicitWidthChanged: if (visible) previewPopup.anchor.updateAnchor()

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

        // 0 → 1 as the popup slides up into place; snaps to 1 when off.
        property real slide: 1
        NumberAnimation {
          id: previewSlideAnim
          target: previewPopup
          property: "slide"
          from: 0
          to: 1
          duration: 220
          easing.type: Easing.OutCubic
        }

        // Clips the card to the popup's own box, so it rises out from the
        // Dock's edge instead of fading in mid-air.
        Item {
          anchors.fill: parent
          clip: true

          Rectangle {
            width: parent.width
            height: parent.height
            radius: root.menuRadius
            color: root.colPopupBackground
            border.width: Style.normalBorderWidth
            border.color: root.colHairline
            y: (1 - previewPopup.slide) * height

            HoverHandler {
              onHoveredChanged: previewState.popupHover(hovered)
            }

            Row {
              id: previewRow
              anchors.fill: parent
              anchors.margins: Style.spacing.sm
              spacing: Style.spacing.xs

              Repeater {
                model: previewPopup.windowIds

                // One Window's cell: a tinted background under the pointer, so
                // it is clear which thumbnail a click will pick.
                Item {
                  id: cell
                  required property var modelData
                  readonly property var win: previewPopup.windowFor(cell.modelData)
                  readonly property var toplevel: dockState.toplevelByAddress[cell.modelData] || null
                  readonly property int pad: Style.spacing.xs
                  implicitWidth: cellColumn.implicitWidth + pad * 2
                  implicitHeight: cellColumn.implicitHeight + pad * 2

                  Rectangle {
                    anchors.fill: parent
                    radius: Style.cornerRadius
                    color: cellHover.hovered ? Style.selectedFill : "transparent"
                  }

                  HoverHandler {
                    id: cellHover
                    onHoveredChanged: previewPopup.peekHover(cell.win, hovered)
                  }

                  // Right click anywhere on the cell: this Window's menu. Left
                  // clicks fall through to the thumbnail and close button.
                  MouseArea {
                    anchors.fill: parent
                    acceptedButtons: Qt.RightButton
                    onClicked: function (mouse) {
                      var at = mapToItem(previewPopup.contentItem, mouse.x, mouse.y)
                      previewPopup.openMenu(cell, previewAnchor.rect.x + at.x, previewAnchor.rect.y + at.y)
                    }
                  }

                Column {
                  id: cellColumn
                  x: cell.pad
                  y: cell.pad
                  spacing: Style.spacing.xs

                  Row {
                    width: previewPopup.thumbWidth
                    spacing: Style.spacing.xs

                    Text {
                      textFormat: Text.PlainText
                      width: parent.width - closeButton.width - parent.spacing
                      anchors.verticalCenter: parent.verticalCenter
                      elide: Text.ElideRight
                      color: previewPopup.textColor
                      font.family: Style.font.family
                      font.pixelSize: Style.font.caption
                      text: dockState.titles[cell.modelData] || cell.win.title || cell.win.class || ""
                    }

                    Rectangle {
                      id: closeButton
                      width: Style.space(20)
                      height: width
                      radius: Style.cornerRadius
                      color: closeMouse.containsMouse ? Util.alpha(Color.urgent, 0.5) : "transparent"

                      Text {
                        textFormat: Text.PlainText
                        anchors.centerIn: parent
                        text: "\u2715"
                        color: previewPopup.textColor
                        font.pixelSize: Style.font.caption
                      }

                      MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                          // The last Window closing takes the popup with it
                          // (liveItem goes null); otherwise it stays up so
                          // the rest can still be picked.
                          previewPopup.closePicked(cell.win)
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
                  // focuses the Window, like its Item. In a group, the Active
                  // Window's thumbnail is outlined.
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
                      captureSource: previewPopup.visible ? cell.toplevel && cell.toplevel.wayland : null
                      live: true
                    }

                    Rectangle {
                      visible: previewPopup.windowIds.length > 1 && !!cell.win.active
                      anchors.fill: parent
                      color: "transparent"
                      radius: Style.cornerRadius
                      border.width: Style.selectedBorderWidth
                      border.color: previewPopup.accentColor
                    }

                    MouseArea {
                      anchors.fill: parent
                      cursorShape: Qt.PointingHandCursor
                      onClicked: {
                        previewPopup.focusPicked(cell.win)
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

      // Catches a click anywhere outside an open (non-hover) Start menu to
      // close it. Zero-sized otherwise, so it never gets in the way.
      Item {
        id: startDismiss
        z: 40
        width: (startMenu.open && !startMenu.hoverMode) ? panel.width : 0
        height: (startMenu.open && !startMenu.hoverMode) ? panel.height : 0

        MouseArea {
          anchors.fill: parent
          acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
          onPressed: startMenu.send({ type: "dismiss" })
        }
      }

      // The built-in Start menu (startCommand "builtin"): StartMenuView.qml,
      // driven by StartMenu.js. Part of the panel, not a popup, so it can
      // hold the keyboard (see keyboardFocus on the panel); `send()` is the
      // only way in.
      StartMenuView {
        id: startMenu
        z: 50

        taskbar: root.taskbar
        settings: dockSettings
        scheme: root.scheme
        panelWidth: panel.width
        panelHeight: panel.height
        buttonX: startButton.x
        buttonHovered: startMouse.containsMouse
        icons: root.icons

        onLaunchRequested: function (entry) { root.launchApp(entry) }
        onTogglePinRequested: function (appId, pinned) { root.togglePin(appId, pinned) }
        onDockHoldRequested: function (held) { revealState.set("startMenu", held) }
      }


      // The bar's quick menu: right click on the bar
      // itself. Rows come from DockConfig.barMenuRows; choosing one writes
      // its patch through the same write-back Pin/Unpin uses, so the bar
      // updates live. Closes on any choice or an outside click, and holds
      // the bar Revealed while open, like the Item context menu.
      PopupWindow {
        id: barMenu

        property real pointX: 0
        readonly property int menuMargin: Style.spacing.xs
        readonly property var rows: DockConfig.barMenuRows(root.taskbar)
        // Sized to its longest label (plus the check column and padding), so
        // nothing is cut off however long a row's label is; never narrower
        // than a comfortable minimum.
        readonly property int rowWidth: Math.max(Style.space(190),
          Math.ceil(barMenuMetrics.advanceWidth) + Style.space(22) + Style.space(12) * 2 + root.menuPad * 2 + Style.space(12))

        TextMetrics {
          id: barMenuMetrics
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          text: DockConfig.longestLabel(barMenu.rows)
        }

        function close() { barMenu.visible = false }
        function openAt(x) {
          barMenu.pointX = x
          barMenu.visible = true
        }
        // The menu sits just above the bar.
        readonly property real frameTop: panel.height - root.taskbar.barHeight

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
          anchor.rect.y = Math.round(Math.max(barMenu.menuMargin, barMenu.frameTop - barMenu.implicitHeight - barMenu.menuMargin + root.menuShadow))
        }

        implicitWidth: rowWidth + root.menuShadow * 2
        implicitHeight: barMenuColumn.implicitHeight + root.menuPad * 2 + root.menuShadow * 2

        onVisibleChanged: revealState.set("barMenu", barMenu.visible)
        onClosed: barMenu.close()

        RectangularShadow {
          anchors.fill: barFrame
          radius: barFrame.radius
          blur: root.menuShadow
          offset.y: Style.space(4)
          spread: 0
          color: Qt.rgba(0, 0, 0, 0.6)
        }

        Rectangle {
          id: barFrame
          anchors.fill: parent
          anchors.margins: root.menuShadow
          radius: root.menuRadius
          color: root.colPopupBackground
          border.width: Style.normalBorderWidth
          border.color: root.colHairline

          Column {
            id: barMenuColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: root.menuPad

            Repeater {
              model: barMenu.rows

              delegate: Item {
                id: barRow
                required property var modelData
                required property int index

                readonly property bool newGroup: index > 0 && barMenu.rows[index - 1].group !== modelData.group

                width: barMenuColumn.width
                height: root.menuRowHeight + (newGroup ? root.menuPad * 2 + 1 : 0)

                Rectangle {
                  visible: barRow.newGroup
                  anchors.top: parent.top
                  anchors.topMargin: root.menuPad
                  anchors.left: parent.left
                  anchors.right: parent.right
                  height: 1
                  color: root.colHairline
                }

                Rectangle {
                  anchors.bottom: parent.bottom
                  width: parent.width
                  height: root.menuRowHeight
                  radius: root.menuRowRadius
                  color: barRowMouse.containsMouse ? Style.hoverFillFor(root.colForeground, previewPopup.accentColor) : "transparent"

                  Text {
                    textFormat: Text.PlainText
                    anchors.left: parent.left
                    anchors.leftMargin: Style.space(12)
                    anchors.verticalCenter: parent.verticalCenter
                    text: barRow.modelData.checked ? "\u2713" : ""
                    color: previewPopup.textColor
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  Text {
                    textFormat: Text.PlainText
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: Style.space(12) + Style.space(22)
                    anchors.rightMargin: Style.space(12)
                    elide: Text.ElideRight
                    text: barRow.modelData.label
                    color: previewPopup.textColor
                    font.family: Style.font.family
                    font.pixelSize: Style.font.body
                  }

                  MouseArea {
                    id: barRowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                      // The Settings row opens the full window; every other
                      // row writes its setting. Close first so the menu never
                      // lingers over the window it opens.
                      var row = barRow.modelData
                      barMenu.close()
                      if (row.action === "settings") root.openSettings(panel.screen)
                      else dockSettings.apply({ type: "setSettings", patch: row.patch })
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
        // Set when opened from a Preview thumbnail (docs/SPEC.md "Input"):
        // the menu is then for that one Window and sits above the thumbnail.
        // It is anchored to the panel, not the Preview popup, using the
        // thumbnail's place worked out in panel coordinates.
        property var previewCell: null
        property string previewWindowId: ""
        // Where the pointer was, in panel coordinates: the menu's bottom-left
        // corner goes there, as in Windows 11.
        property real previewPointX: 0
        property real previewPointY: 0
        readonly property bool forPreview: contextMenu.previewWindowId !== ""
        readonly property var anchorWindow: contextMenu.forPreview ? panel
          : (contextMenu.anchorItem ? contextMenu.anchorItem.QsWindow.window : null)
        readonly property int menuMargin: Style.spacing.xs
        // Sized to its longest row, since app actions ("New Private Window")
        // and window rows ("Move to scratchpad") vary; see barMenu.rowWidth.
        readonly property int rowWidth: Math.max(Style.space(160),
          Math.ceil(contextMenuMetrics.advanceWidth) + Style.space(12) * 2 + root.menuPad * 2 + Style.space(12))

        TextMetrics {
          id: contextMenuMetrics
          font.family: Style.font.family
          font.pixelSize: Style.font.body
          text: DockConfig.longestLabel(contextMenu.rows)
        }

        // Rows in three groups, divided in the menu: App rows (Pin/Unpin, New
        // Window and the App's own desktop actions, e.g. "New Private
        // Window"), Window-state rows for a Window Item (DockModel.windowActions),
        // and Close Window. DockModel.menuFor supplies each row's enabled
        // state from the Item alone.
        readonly property var rows: {
          if (contextMenu.forPreview) {
            // Live, so a state that changes while the menu is open (or a
            // peek being put back) is reflected in the labels.
            var win = previewPopup.windowFor(contextMenu.previewWindowId)
            var previewRows = []
            var winStates = DockModel.windowActions(win)
            for (var s = 0; s < winStates.length; s++) {
              previewRows.push({
                label: winStates[s].label,
                enabled: true,
                group: 1,
                // Choosing a state row keeps the peeked Window focused, as a
                // click on the thumbnail does, instead of the peek being put back.
                trigger: (function (id) { return function () { previewState.send({ type: "menuRowChosen" }); root.runWindowAction(id, win.id) } })(winStates[s].id),
              })
            }
            previewRows.push({
              label: "Close Window",
              enabled: true,
              group: 2,
              trigger: function () { root.closeWindow(win.id) },
            })
            return previewRows
          }
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
          if (item.kind === "window" && !(item.count > 1)) {
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
          // A Group Item's menu acts on the whole group: the window-state
          // rows are left out and Close closes every Window in it.
          var grouped = item.count > 1
          list.push({
            label: grouped ? "Close all " + item.count + " windows" : "Close Window",
            enabled: menu.canClose,
            group: 2,
            trigger: function () {
              var windows = grouped ? item.windows : [item.window]
              for (var w = 0; w < windows.length; w++) root.closeWindow(windows[w].id)
            },
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
        implicitWidth: contextMenu.rowWidth + root.menuShadow * 2
        implicitHeight: menuColumn.implicitHeight + root.menuShadow * 2

        onVisibleChanged: {
          revealState.set("menu", contextMenu.visible)
          contextMenu.enteredMenu = false
          menuLeaveTimer.stop()
          previewState.send({ type: "menuVisible", visible: contextMenu.visible, forPreview: contextMenu.forPreview })
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
            if (contextMenu.forPreview) {
              var px = Math.max(contextMenu.menuMargin,
                Math.min(contextMenu.previewPointX, panel.width - contextMenu.implicitWidth - contextMenu.menuMargin))
              menuAnchor.rect.x = Math.round(px - root.menuShadow)
              menuAnchor.rect.y = Math.round(Math.max(contextMenu.menuMargin, contextMenu.previewPointY - contextMenu.implicitHeight + root.menuShadow))
              return
            }
            if (!contextMenu.anchorItem || !contextMenu.anchorWindow) return
            var target = contextMenu.anchorItem
            var popupWidth = contextMenu.implicitWidth
            var popupHeight = contextMenu.implicitHeight
            var localX = target.width / 2 - popupWidth / 2
            var localY = -popupHeight - contextMenu.menuMargin + root.menuShadow
            var point = contextMenu.anchorWindow.contentItem.mapFromItem(target, localX, localY)
            point.x = Math.max(contextMenu.menuMargin, Math.min(point.x, contextMenu.anchorWindow.width - popupWidth - contextMenu.menuMargin))
            point.y = Math.max(contextMenu.menuMargin, point.y)
            menuAnchor.rect.x = Math.round(point.x)
            menuAnchor.rect.y = Math.round(point.y)
          }
        }

        RectangularShadow {
          anchors.fill: menuFrame
          radius: menuFrame.radius
          blur: root.menuShadow
          offset.y: Style.space(4)
          spread: 0
          color: Qt.rgba(0, 0, 0, 0.6)
        }

        Rectangle {
          id: menuFrame
          anchors.fill: parent
          anchors.margins: root.menuShadow
          radius: root.menuRadius
          color: root.colPopupBackground
          border.width: Style.normalBorderWidth
          border.color: root.colHairline

          HoverHandler {
            id: menuHover
          }

          Column {
            id: menuColumn
            anchors.left: parent.left
            anchors.right: parent.right
            anchors.top: parent.top
            anchors.margins: root.menuPad

            Repeater {
              model: contextMenu.rows

              delegate: Item {
                id: menuRow
                required property var modelData
                required property int index

                readonly property bool newGroup: index > 0 && contextMenu.rows[index - 1].group !== modelData.group

                width: menuColumn.width
                height: root.menuRowHeight + (newGroup ? root.menuPad * 2 + 1 : 0)

                Rectangle {
                  visible: menuRow.newGroup
                  anchors.top: parent.top
                  anchors.topMargin: root.menuPad
                  anchors.left: parent.left
                  anchors.right: parent.right
                  height: 1
                  color: root.colHairline
                }

                Rectangle {
                  id: menuRowBody
                  anchors.bottom: parent.bottom
                  width: parent.width
                  height: root.menuRowHeight
                  radius: root.menuRowRadius
                  // containsMouse, not a HoverHandler, to match Button.qml's
                  // own hover-fill convention.
                  color: menuRow.modelData.enabled && rowMouse.containsMouse
                    ? Style.hoverFillFor(root.colForeground, previewPopup.accentColor)
                    : "transparent"

                  Text {
                    textFormat: Text.PlainText
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.leftMargin: Style.space(12)
                    anchors.rightMargin: Style.space(12)
                    elide: Text.ElideRight
                    text: menuRow.modelData.label
                    color: menuRow.modelData.enabled ? previewPopup.textColor : root.colMuted
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
