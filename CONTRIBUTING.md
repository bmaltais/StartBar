# Contributing to StartBar

The agreed behaviour is in [docs/SPEC.md](docs/SPEC.md) and the vocabulary in [CONTEXT.md](CONTEXT.md). Work is tracked in the GitHub issues.

## Development install

This repository's root is the plugin directory (`manifest.json` at the root), with id `io.github.bmaltais.startbar`.

1. Symlink the checkout into the Omarchy plugins directory:

   ```sh
   ln -s "$(pwd)" ~/.config/omarchy/plugins/io.github.bmaltais.startbar
   ```

2. Enable it in the shell:

   ```sh
   omarchy plugin enable io.github.bmaltais.startbar
   ```

3. Confirm it's loaded:

   ```sh
   omarchy plugin list        # io.github.bmaltais.startbar should show as enabled, third-party, service
   omarchy plugin validate .  # validates manifest.json against the shell's plugin schema
   ```

The shell watches `~/.config/omarchy/plugins/` for changes and reloads automatically, but its watcher does not follow directory symlinks, so edits made in this checkout are not picked up on save when it's symlinked in this way. After editing, force a reload with:

```sh
omarchy-shell shell rescanPlugins
```

Changes to `Service.qml` or `StartMenuView.qml` (loaded as part of the `keepLoaded` service) need `omarchy restart shell` instead of a rescan. Check `journalctl --user -t omarchy-shell` for load warnings or errors.

### Tests

The Dock model (`DockModel.js`), Start menu logic (`StartMenu.js`) and settings module (`DockConfig.js`) are pure JavaScript with no Quickshell imports, so they run under Node:

```sh
npm test
```

Everything else — panels, hover, timers, animation, tooltips, the context menu, drag — is verified by the manual checklist below, since it depends on Quickshell/Hyprland and has no scripted coverage .

## Manual verification checklist

Walk through this after any change to the Quickshell side, on a two-monitor Omarchy machine. Each item names the user story it covers (see [docs/SPEC.md](docs/SPEC.md)/#19). Have at least one pinned app, one unpinned app with a Window, and one app with no matching desktop entry (or rename a `.desktop` file's `Exec`/class temporarily) so the Letter Tile path is reachable.

### Last run

- **Date:** 2026-09-11
- **Machine:** Omarchy 4, two monitors (DP-1, DP-3)
- **Method:** Presence, layout, Hidden/Revealed, and the indicators were checked by warping the pointer with `hyprctl dispatch` and comparing `grim` screenshots against live `hyprctl` state (window class, workspace, active window). That confirms everything the compositor reports independently of a real pointer. It does **not** exercise anything that needs a genuine click, drag, or fine hover-motion sequence — this machine has no `ydotool`/`uinput` set up for synthetic input, and a plain cursor warp reaches the Dock's Reveal Strip (a surface-level enter) but doesn't generate the intra-surface motion Qt's per-item hover needs, so tooltips didn't appear under warped hover either. Every item below is marked accordingly; unchecked items need a real mouse pass before the next release, not a re-run of this method.
- **Result:** Everything checked this way passed. Nothing checked this way failed.

### Presence and layout

- [x] The Dock appears on every monitor, bottom centre, once enabled. *(confirmed: DP-1 and DP-3 both showed the same four Items after a reveal)*
- [x] Every Dock shows the same Items, in the same order. *(confirmed: identical icons/badges on both monitors)*
- [x] One Window Item exists per open Window, across every workspace and monitor, including special workspaces. *(confirmed for ordinary workspaces — the four open Windows across ws2/ws3 all had Items; no special-workspace Window was open to check that half)*
- [ ] A Window whose App can't be resolved shows a Letter Tile (first letter of the window class). *(not checked — no unresolvable App was open)*
- [ ] Icons shrink as Items are added, keeping every Item on screen at the monitor's width (overflow). *(not checked — only 4 Items open, not enough to trigger shrink)*

### Hidden / Revealed

- [x] The Dock is Hidden by default and takes no screen space. *(confirmed: baseline screenshot showed no Dock, and other windows' content ran flush to the bottom edge with no reserved gap)*
- [x] Resting the pointer on the Reveal Strip shows the Dock. *(confirmed: warping the pointer to the bottom edge and waiting past `revealDelayMs` revealed it)*
- [ ] A quick pass across the edge does not reveal it. *(not checked — needs a real short hover, not a warp-and-wait)*
- [ ] The Dock slides up from the edge over ~150ms. *(not checked — a still screenshot can't show the animation; confirmed only by reading `slideDurationMs` in `Service.qml`)*
- [x] The Dock returns to Hidden after the pointer leaves it. *(confirmed: screenshot after moving the pointer away and waiting past `hideDelayMs` showed no Dock)*
- [x] The Dock floats on the Top layer and reserves no space. *(confirmed: `hyprctl layers` shows the Dock's surface on layer level 2/top, and other windows' content is not pushed up by it)*
- [ ] If the bar is at the bottom, the Dock's Reveal Strip and panel sit above its reserved space, never overlapping. *(not applicable this run — this machine's bar is at the top)*

### Indicators

- [x] The Active Window's Item is highlighted. *(confirmed: the Chromium Item — matching `hyprctl activewindow`'s real active window — had a visibly lighter background square the other three Items lacked)*
- [ ] ...and the highlight moves immediately when focus changes. *(not independently re-checked — this run only ever had one active window; the highlight already being wired to live active-window state makes a change of focus the same code path, but that wasn't exercised by switching focus)*
- [x] Every Window Item shows a running dot; a bare Pin (no Windows) does not. *(confirmed: all four open Windows showed a dot; no bare Pin was present to check the negative case)*
- [x] With `showWorkspaceBadge` on, every Window Item shows a workspace badge (off by default since 1.1.1). *(confirmed: badges read 2/3/3/3, matching each Window's real workspace from `hyprctl clients`)*
- [ ] A special-workspace Window's badge shows its name. *(not checked — no special-workspace Window was open)*
- [ ] Hovering an Item shows a tooltip with the Window's title and workspace. *(not confirmed — see Method above; a warped hover didn't trigger it)*
- [ ] Hovering the tooltip never restarts or blocks the hide timer, and it disappears when the Dock hides. *(not checked, follows from the item above)*
- [ ] A Window requesting Attention gets the theme's urgent-colour tint until focused, and the Dock does not reveal itself for it. *(not checked — no Window was requesting Attention)*

### Input

- [ ] Left click on a Window Item focuses that Window, switching workspace/monitor as needed.
- [ ] Left click on the Active Window's own Item does nothing.
- [ ] Left click on a special-workspace Window's Item toggles it into view.
- [ ] Left click on a Pin with no Windows launches its App.
- [ ] Middle click on any Item with a resolvable App launches a new instance; middle click on a Letter Tile does nothing.
- [ ] Right click opens a themed popup: Pin/Unpin, New Window and the app's own actions; for a window, Maximize, Full screen, Float (plus Center and Pin on top when floating) and Move to scratchpad; then Close Window. Each window-state row labels itself with its undo while active.
  - [ ] Pin shows for an unpinned App, Unpin for a pinned one.
  - [ ] Pin is disabled on a Letter Tile Item.
  - [ ] New Window launches another instance of the Item's App.
  - [ ] Close Window closes that specific Window.
  - [ ] Clicking outside the menu closes it; the Dock stays Revealed while it's open and starts its hide timer only once it closes.

  *(none of the above checked — every one needs a real mouse click/press, which this machine has no way to synthesize)*

### Pins

- [x] Pinning an App keeps it in the Dock after its last Window closes, shown as a bare Pin, and a pinned App's Windows occupy that Pin's slot instead of a separate icon. *(confirmed structurally: `chromium` is in this run's `pins` config, and its one open Window occupied that slot rather than showing twice — matches `dockModel.test.js`'s coverage of the same rule)*
- [ ] Unpinning an App with open Windows leaves its Windows as ordinary Window Items. *(not exercised live this run — needs the context menu; covered by a Node test)*
- [ ] A Pin whose App is no longer installed shows a Letter Tile with a "missing" tooltip and stays until Unpin. *(not checked — no missing App was configured this run; covered by a Node test)*
- [ ] Pins persist in `~/.config/omarchy/shell.json` and survive an `omarchy restart shell`. *(not checked — no restart was performed this run)*

### Drag

- [ ] Dragging an Item within the Dock shows a live insertion preview and drops it at the new position.
- [ ] A Placed Pin keeps its dropped position across an `omarchy restart shell`.
- [ ] A Placed Window Item keeps its position until that Window closes, then reverts to Launch Order.
- [ ] Dragging one Window of a pinned App with several open Windows moves only that Window; its siblings stay in the Pin's slot.
- [ ] Dragging a pinned Item out of the Dock unpins its App; the Windows remain as ordinary Window Items.
- [ ] Dragging an unpinned Window Item out of the Dock snaps it back to its original position.
- [ ] The Dock stays Revealed for the whole drag and starts its hide timer only after the drop.

  *(none of the above checked — dragging needs a real mouse-button-down-move-up sequence; the Placed/drag-out rules themselves are covered by Node tests, but the gesture and the "stays Revealed" behaviour are Quickshell-side and untested here)*

### Theming and ordering

- [x] Dock colours and fonts match the current Omarchy theme. *(confirmed visually: the Dock's badges, highlight, and panel colours matched this machine's active theme palette in the screenshots)*
- [ ] Switching the Omarchy theme updates the Dock live, with no restart. *(not checked — no theme switch was performed this run)*
- [x] New Windows join Launch Order next to existing Windows of the same App, not at the end. *(confirmed structurally by the Pins slot ordering above and by `dockModel.test.js`'s same-App-clustering coverage; not independently re-checked by opening a new Window live)*
- [ ] The Dock never takes keyboard focus. *(not checked — needs typing into another window while hovering/clicking the Dock)*

### Taskbar style, Start menu and menus (added in 1.1.0)

Not yet walked through with a real mouse; the pieces marked *checked* were confirmed with screenshots and `hyprctl` only.

- [x] `"style": "taskbar"` shows a full-width bar with the Start grid, centred icons and a clock; `"alignment": "left"` moves the group to the left. *(checked)*
- [x] With `"autoHide": true` the bar hides and slides up when the pointer reaches the bottom edge. *(checked)*
- [ ] Resting the pointer on the Start button keeps the bar up, and clicking it opens the chosen menu. With the built-in menu and `startHoverOpen`, resting opens it after a moment, it stays up while the pointer is on the button or the menu (no flicker), closes shortly after you leave (or at once on reaching another icon), and typing, or clicking the search box, keeps it open.
- [ ] Right-clicking an empty part of the bar opens the quick menu; each row changes its setting live; "Settings…" opens the settings window on that monitor, where each switch, choice, stepper, slider, text field and list change takes effect live and survives a shell restart; Escape closes it; "Reset to defaults" asks twice.
- [ ] In dock style, right-clicking the gap between icons or the bottom edge opens a menu with "Switch to taskbar style" and "Settings…".
- [x] Hovering a window's icon shows a live thumbnail with its title and a close button. *(checked)*
- [ ] Clicking a thumbnail focuses the window and, with `previewWarpPointer`, moves the pointer to its middle.
- [ ] Sweeping across icons next to a busy browser shows no flicker.
- [ ] `omarchy-shell io.github.bmaltais.startbar startMenu` opens and closes the menu on the focused monitor; with nothing typed the arrow keys select pinned then recommended apps and Enter launches; in All apps Up/Down move; clicking a letter heading opens the A-Z grid; dragging a pinned app to another slot reorders it and survives a restart; the Settings button opens the Omarchy setup menu; a `~/.face` picture shows in a circle.
- [ ] Start menu (`"startCommand": "builtin"`): typing searches, Enter launches, Escape backs out a layer; All apps lists A-Z; right-click pins and unpins; Recommended fills after launching an app.
- [ ] Places opens Home, Documents and Downloads in the file manager; the power menu's Sleep, Restart and Shut down work, and the name menu's Lock and Sign out (try Lock first).
- [ ] Right-clicking an icon shows the window rows (Maximize, Full screen, Float...); their labels flip when active; the menu stays open until a row is chosen or the pointer leaves it.

### Install path

- [x] From a clean plugins directory, `omarchy plugin add https://github.com/bmaltais/StartBar.git --enable` succeeds, `omarchy plugin validate` accepts the manifest, and the Dock appears on every monitor without further setup.
