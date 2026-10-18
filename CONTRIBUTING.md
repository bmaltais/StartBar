# Contributing to StartBar

The agreed behaviour is in [docs/SPEC.md](docs/SPEC.md) and the vocabulary in [CONTEXT.md](CONTEXT.md). Candidates that are not issues yet are in [docs/IDEAS.md](docs/IDEAS.md). Accepted work is tracked in the GitHub issues.

## Development install

Clone with `git clone --recurse-submodules` (or run `git submodule update --init` in an existing clone): `scripts/devkit`, the test session and recorder, is a submodule of the shared [omarchy-plugin-devkit](https://github.com/bmaltais/omarchy-plugin-devkit). It is development tooling, so it is not in what `omarchy plugin add` installs; without it `npm run check` still passes, skipping the devkit's rules.

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

The rules live in pure JavaScript modules with no Quickshell imports, so they run under Node:

| Module | What it decides |
| --- | --- |
| `DockModel.js` | Which Items the Dock shows and in what order: Launch Order, Pins, Placed. It also takes Hyprland's toplevels to Items (`refreshItems`: Launch Order ranks, Windows held back until they have a class, App lookup, what changed) and decides where a drop is stored (`dropPlaced`: a Pin's position for settings, a Window's or Group's in memory). Tests give it plain objects shaped like the toplevels |
| `DockConfig.js` | Settings: defaults, the effective view of the config entry, and every change to it |
| `DockBarMenu.js` | The Bar menu: its rows (`barMenuRows`, each with the `setSettings` patch it writes) and the labels that size it and its submenu |
| `DockSettingsWindow.js` | The settings window's search over `settingsSchema` and whether a field is enabled |
| `DockInteraction.js` | Reveal and hide (one hold per holder: strip, dock, menus, Start menu, drag), and where a dragged Item lands |
| `DockGeometry.js` | Where the bar and what stands on it sit on each of the four edges (`layout`: the bar, Reveal Strip, Start button, clock and Items as rectangles; `iconSize`; `slot` and `dots` for an Item's icon and running dots). The QML binds to these instead of choosing per edge |
| `DockPlacement.js` | Where popups stand for the Dock's edge: a Preview and the Item menu beside their Item, the Bar menu beside the bar, its submenu, the Start menu (`beside`, `barTarget`, `submenu`, `startMenu`, `slide`) |
| `DockHyprland.js` | How to ask Hyprland for each thing the Dock wants: focus, raise, close, Window-state rows, Peek. Returns the command; tests run `bash -n` over every script |
| `DockIcons.js` | Finding an App's icon file when Qt's lookup has missed: the command that searches the icon directories, which file is best, and when to search again |
| `IconResolver.qml` | The QML side of `DockIcons.js`, one instance shared by the Dock and the Start menu: `source(name)` is Qt's icon path, else a found file, else "" while it searches |
| `PlainText.js` | What a plain text field does with a key or a paste (`PlainField.qml` draws it): typing, Backspace, Ctrl+U, and the bounded `wl-paste` command |
| `DockPreview.js` | The hover Preview, Peek and the Preview menu: when a Preview shows and goes, what is peeked, kept or put back, and that the Preview's menu holds it up |
| `StartMenu.js` | The Start menu: opening and closing, Hover mode, search, selection, Escape, Start Pin reorder |
| `StartMenuApps.js` | The Start menu's app lists: search results (`filterApps`), the A-Z groups and jump letters, and saved Pins and recents mapped to installed Apps (`catalog`, `resolveApps`) |
| `StartPlaces.js` | The Places the Start menu lists: the user's XDG folders or a `startPlaces` setting |
| `StartMenuActions.js` | The rows the Start menu's overlays offer (`overlayRows`), the account's name and the command that opens a Place |

Every `Text` in the QML says `textFormat: Text.PlainText`: Qt's default renders anything that looks like HTML, and rich text loads `<img>` files synchronously, so a window title or a pasted string could hang the shell. `test/textFormat.test.js` fails on one that doesn't. [docs/SECURITY.md](docs/SECURITY.md) lists every place outside data reaches the plugin and what bounds it; add a row when you add one.

```sh
npm test
```

### Where things are in `Service.qml`

It is one long file. Search for these names:

| Name | What it is |
| --- | --- |
| `focusWindow`, `focusWindowAndWarp`, `runWindowAction`, `closeWindow` | Run what `DockHyprland.js` builds for a click or a menu row |
| `peekWindow`, `peekRestore`, `peekCommit` | Peek: run the scripts (`DockHyprland.js`) that show a Window and put things back (`DockPreview.js` decides when) |
| `previewState`, `previewPopup` | The state, timers and effects of `DockPreview.js`, and the Preview itself with its thumbnails |
| `contextMenu` | The Item menu, and the Preview menu (`previewWindowId`) |
| `barMenu` | The Bar menu |
| `dockState` | Holds what `DockModel.refreshItems` returns and calls it on every Hyprland event; `placeItem` stores a drop through `DockModel.dropPlaced` |
| `dockRow` | The Items, drag and drop |
| `panel.geo`, `panel.edge` | Where everything on the Dock sits (`DockGeometry.layout`) and which edge it is on |

### Checks

```sh
npm run check
```

runs everything that can be checked without the shell:

- the tests above, which also keep the docs in step with the code: every setting has a row in `docs/SETTINGS.md`, every `SPEC.md "…"` section a comment cites exists, `manifest.json` and `package.json` agree on the version, and the Dock and what rises from it take their colours from the colour scheme instead of the theme directly;
- `omarchy plugin validate .`;
- the shell scripts (`bash -n`, and `shellcheck` when it is installed, with the rules in `.shellcheckrc`) and the project rules no linter knows (`scripts/devkit/bin/lint`): both are steps of the devkit's `scripts/check`, which `npm run check` runs;
- `npm run lint:qml`, which fails on any `qmllint` warning not already listed in `scripts/qmllint-baseline.txt`. `qmllint` can't see Quickshell's types, so the QML carries standing warnings; a new one is usually a misspelt or removed id. Accept a legitimate new one with `npm run lint:qml -- --update` (it refuses to baseline a real bug such as a property override).

Run it on every commit with the pre-commit hook:

```sh
git config core.hooksPath .githooks   # or: scripts/devkit/bin/pre-commit --install
```

The hook also runs `scripts/check-file-size.sh`, which rejects a staged source file over ~5000 tokens (bytes/4) and says how to split it. Files already over are listed in `.file-size-guard-ignore`; `scripts/check-file-size.sh --all` audits every tracked file.

Pull requests run the devkit's `check` on GitHub (its shell, rules and `npm test` steps); the manifest and QML checks need Omarchy and Qt, so they only run locally.

### Trying a change: the test session

`Service.qml` (the Dock, the menus, the settings window) and `StartMenuView.qml` (the Start menu's view) draw what the modules decide. They depend on Quickshell and Hyprland, so try a change in the test session, a second Hyprland and Omarchy shell running this checkout that your mouse and keyboard cannot reach, with a home of its own and a guard that refuses the Start menu's Shut down, Restart, Sleep, Sign out and Lock. Nothing of yours is restarted, moved or changed. [docs/testing.md](docs/testing.md) is the guide; in short:

```sh
scripts/dev up                  # the session, and a view-only window of it on your screen
scripts/dev run foot -a foot sleep 600     # a window for the Dock to show
scripts/dev startmenu           # or: settings, close
scripts/dev move 78 776         # hover an Item: its Preview opens. click, rclick, scroll, type, key, set, layout: scripts/dev --help
scripts/dev shot /tmp/a.png     # then look at it
scripts/dev reload              # after editing a .qml file; the session loads uncommitted files
scripts/dev down
```

`npm run smoke` does the standing part for you: it starts the session, fails if the plugin logs anything, and screenshots the Dock, the Start menu and the settings window in each colour scheme (`--position`, `--type`, `--out`). Look at the screenshots: the script only knows the plugin loaded quietly. It cannot hover or drag; use `scripts/dev` for a Preview, the Item menu and the Bar menu. Drag, a second monitor and anything it could not reach still need the checklist below, on a real desktop.

To see a change on your own shell, `scripts/reload` restarts it with this checkout. `scripts/pointer` (a real pointer through `ydotool`, `docs/hyprland-notes.md` "Moving the pointer") and `scripts/try-setting` act on your real desktop, so use them only when you mean to.

### Retaking screenshots and animations

The README's animations and images are in `screenshots/`: `hero.avif` (the tour at the top), `taskbar-clip.avif`, `icon-menu-clip.avif`, `start-menu-clip.avif`, `bar-menu-clip.avif` and `settings-clip.avif`, and the stills (`start-menu-light.png`, `start-menu-dark.png`, `preview.png` and the rest). Retake one only when its subject changed: a new row in the settings window changes `settings-clip.avif`; a new look for the Dock or Start menu changes the clips and the stills; the Preview and the bar's menu have `taskbar-clip.avif`, `preview.png` and `bar-menu-clip.avif`.

```sh
scripts/hero.sh --install       # the tour at the top of the README (about three minutes)
scripts/clips.sh                # the five clips, installed (or: scripts/clips.sh start-menu settings)
scripts/screenshots.sh --install   # the stills (--only NAME,NAME takes some)
scripts/make-preview.sh         # preview.png at the repo root, the marketplace's picture: rerun it after retaking a still it uses
```

They all run in the test session, so they do not touch your desktop, your windows or your pins: the Dock shows five apps pinned in `scripts/tours/common.sh` (edit `TOUR_PINS` if one is not installed) and terminals posing as apps. The wallpaper and colours are the Omarchy theme's. Look at every image before committing it. [docs/recording-tours.md](docs/recording-tours.md) says how to write or change a tour, and `scripts/sheet FILE` makes a contact sheet of one to look at.

Releasing is described in [docs/agents/release.md](docs/agents/release.md).

## Manual verification checklist

Walk through this after any change to the QML, on a two-monitor Omarchy machine. Have at least one Pin, one unpinned App with a Window, and one Window with no matching desktop entry so the Letter Tile is reachable. Leave `startCommand` at its default, `builtin`, for the Start menu items.

### Last run

- **Date:** 2026-10-10, version 1.1.0
- **Machine:** Omarchy, two monitors (DP-1, DP-3)
- **Method:** `grim` screenshots after driving the plugin with `omarchy-shell` commands, typed keys (`wtype`), a warped pointer and temporary config edits. No real mouse: a warped pointer reaches the Reveal Strip but does not trigger hover inside the Dock, and nothing here can click or drag.
- **Result:** the ticked items passed. Unticked items were not exercised; none was seen to fail.

### The Dock

- [x] The Dock is a full-width bar along the bottom of the monitor with the Start button, the Items and, with `showClock`, a clock.
- [x] `"alignment": "left"` moves the Start button and Items to the left; `center` centres them.
- [ ] Every monitor's Dock shows the same Items, in the same order.
- [ ] One Window Item exists per open Window, across every workspace and monitor, including special workspaces.
- [ ] A Window whose App can't be resolved shows a Letter Tile (first letter of the window class).
- [ ] Icons shrink as Items are added, keeping every Item on screen.
- [x] The Dock floats on the Top layer and reserves no space.
- [x] `"colorScheme": "light"` and `"dark"` recolour the bar and the Start menu.
- [ ] ...and the Item menu, the Bar menu and the Previews.
- [ ] Switching the Omarchy theme updates the Dock live with `"colorScheme": "theme"`.
- [x] A leftover `"style": "dock"` in the entry changes nothing.

### Hidden / Revealed

These need `"autoHide": true`. With it off the Dock is always visible.

- [x] The Dock is Hidden until the pointer rests on the bottom edge, then slides up.
- [ ] A quick pass across the edge does not reveal it.
- [ ] The Dock returns to Hidden shortly after the pointer leaves it.
- [ ] It stays Revealed while a menu or the Start menu is open, while the pointer is on the Start button, and for the whole of a drag.
- [ ] If the Omarchy bar is at the bottom, the Reveal Strip and the Dock sit above its reserved space.

### Indicators and Previews

- [ ] Every Window Item shows a pill under its icon, wide and accent-coloured for the Active Window; a Pin with no Windows shows none.
- [ ] The Active Window's highlight moves at once when focus changes.
- [ ] With `showWorkspaceBadge` on, every Window Item shows its workspace; a special-workspace Window shows the workspace's name.
- [ ] A Window requesting Attention gets the urgent-colour tint until focused, and the Dock does not reveal itself for it.
- [ ] Hovering a Window Item shows its Preview: a live thumbnail, the title and a close button.
- [ ] Right-clicking a thumbnail in a Preview opens a menu with its bottom-left corner at the pointer, with that Window's state rows and Close Window; the Preview stays up while it is open, and the rows act on that Window even if it is not focused. In a group, try it on each thumbnail.
- [ ] A floating Window hidden behind another floating Window (a full-size floating terminal, say): hovering its Preview peeks it to the front, and clicking the Preview or its Item brings it to the front and makes it the focused Window.
- [ ] Clicking a Preview focuses the Window and, with `previewWarpPointer`, moves the pointer to its middle.
- [ ] Sweeping across Items next to a busy browser shows no flicker.
- [ ] With `showPreviews` off, hovering a Window Item shows a tooltip with its title and workspace. A Pin with no Windows always shows a tooltip with the App's name.

### Input

- [ ] Left click on a Window Item focuses that Window, switching workspace and monitor as needed.
- [ ] Left click on the Active Window's own Item does nothing.
- [ ] Left click on a special-workspace Window's Item toggles it into view.
- [ ] Left click on a Pin with no Windows launches its App.
- [ ] Middle click on an Item with a resolvable App launches a new instance; on a Letter Tile it does nothing.
- [ ] Clicking in another window while using the Dock shows the Dock never took keyboard focus.

### Item menu

- [ ] Right click on an Item opens the Item menu: Pin/Unpin, New Window and the App's own actions; for a Window, Maximize, Full screen, Float (plus Center and Pin on top when floating) and Move to scratchpad; then the app and Pin/Unpin; last, Close window (Close all windows on a group, whose icon shows stacked copies).
- [ ] Pin shows for an unpinned App and Unpin for a pinned one; Pin is disabled on a Letter Tile.
- [ ] Each window-state row shows its undo label while active (Restore, Exit full screen, Tile).
- [ ] New Window launches another instance; Close Window closes that specific Window.
- [ ] The menu closes when a row is chosen, on a click outside it, or when the pointer leaves it.

### Pins and drag

- [ ] Pinning an App keeps it in the Dock after its last Window closes, and its Windows occupy the Pin's slot instead of showing a second icon.
- [ ] Unpinning an App with open Windows leaves them as ordinary Window Items.
- [ ] A Pin whose App is no longer installed shows a Letter Tile with a "missing" tooltip and stays until Unpin.
- [ ] Pins survive an `omarchy restart shell`.
- [ ] Pressing an Item shrinks it; dragging it lifts it a little bigger than the rest, the Items in between step aside, and it stops at the first and last slot (never over the Start button) while the pointer goes on. Dropping puts it there. Dragging it up off the bar still unpins a pinned Item.
- [ ] A Placed Pin keeps its position across an `omarchy restart shell`.
- [ ] A Placed Window Item keeps its position until that Window closes, then falls back to Launch Order.
- [ ] Dragging one Window of a pinned App with several Windows moves only that Window.
- [ ] Dragging a pinned Item out of the Dock unpins its App; dragging an unpinned Window Item out snaps it back.
- [ ] Pinning an App and then placing it straight away keeps both changes.

### Start menu

- [x] `omarchy-shell io.github.bmaltais.startbar startMenu` opens and closes the menu on the focused monitor, above the Start button (centred with centred icons).
- [ ] Clicking the Start button opens it; clicking again closes it; a click outside closes it.
- [ ] Hover mode: resting the pointer on the Start button opens the menu after a moment; it stays while the pointer is on the button or the menu and closes shortly after it leaves, or at once on reaching an Item. Clicking the Start button does not make it stay.
- [ ] Typing a key, or clicking the search box, in a hover-opened menu keeps it open after the pointer leaves.
- [x] Typing filters every installed App and the first result is highlighted.
- [ ] Up/Down move the highlight and Enter launches; the App then appears under Recommended.
- [ ] With nothing typed, the arrow keys walk Pinned then Recommended and Enter launches the selection.
- [ ] All apps lists A-Z; Up/Down walk it; a letter heading opens the jump grid and a letter jumps to its first App.
- [ ] Escape backs out one layer at a time: overlay menu, jump grid, search text, All apps, then the menu.
- [ ] Right-click an App: Pin to / Unpin from Start and Dock leave the menu open; Open launches it.
- [ ] Dragging a Start Pin works like the Dock's drag (shrinks on press, bigger when lifted, the tiles in between step aside, stops at the first and last pin), across rows too; the order survives a restart; a plain click still launches; dropping well outside the grid changes nothing.
- [ ] Places opens Home, Documents and Downloads in the file manager.
- [ ] The footer shows the account name and a `~/.face` picture in a circle; it offers Lock and Sign out, and the power button Sleep, Restart and Shut down (try Lock first).
- [ ] Keyboard focus returns to the previous window when the menu closes.
- [ ] With a `startCommand` other than `builtin`, the Start button and the command run it and never open the menu.

### Bar menu and settings window

- [ ] Right-clicking an empty part of the Dock opens the Bar menu; each row changes its setting live.
- [x] `omarchy-shell io.github.bmaltais.startbar settings` opens the settings window on the focused monitor.
- [ ] "Settings…" in the Bar menu opens it on that monitor; Escape and the close button close it.
- [ ] Each switch, choice, stepper, slider, text field and list change takes effect live and survives a shell restart.
- [ ] "Reset to defaults" asks twice and leaves Pins, Placed positions, Start Pins and Recommended alone.

### Install path

- [ ] From a clean plugins directory, `omarchy plugin add https://github.com/bmaltais/StartBar --enable` succeeds and the Dock appears on every monitor without further setup.
- [x] `omarchy plugin validate .` accepts the manifest.
