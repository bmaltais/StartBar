# Contributing to StartBar

The agreed behaviour is in [docs/SPEC.md](docs/SPEC.md) and the vocabulary in [CONTEXT.md](CONTEXT.md). Candidates that are not issues yet are in [docs/IDEAS.md](docs/IDEAS.md). Accepted work is tracked in the GitHub issues.

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

The rules live in pure JavaScript modules with no Quickshell imports, so they run under Node:

| Module | What it decides |
| --- | --- |
| `DockModel.js` | Which Items the Dock shows and in what order: Launch Order, Pins, Placed |
| `DockConfig.js` | Settings: defaults, the effective view of the config entry, and every change to it |
| `DockInteraction.js` | Reveal and hide (one hold per holder: strip, dock, menus, Start menu, drag), and where a dragged Item lands |
| `DockHyprland.js` | How to ask Hyprland for each thing the Dock wants: focus, raise, close, Window-state rows, Peek. Returns the command; tests run `bash -n` over every script |
| `DockIcons.js` | Finding an App's icon file when Qt's lookup has missed: the command that searches the icon directories, which file is best, and when to search again |
| `IconResolver.qml` | The QML side of `DockIcons.js`, one instance shared by the Dock and the Start menu: `source(name)` is Qt's icon path, else a found file, else "" while it searches |
| `PlainText.js` | What a plain text field does with a key or a paste (`PlainField.qml` draws it): typing, Backspace, Ctrl+U, and the bounded `wl-paste` command |
| `DockPreview.js` | The hover Preview, Peek and the Preview menu: when a Preview shows and goes, what is peeked, kept or put back, and that the Preview's menu holds it up |
| `StartMenu.js` | The Start menu: opening and closing, Hover mode, search, selection, Escape, Start Pin reorder |

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
| `dockRow` | The Items, drag and drop |

### Checks

```sh
npm run check
```

runs everything that can be checked without the shell:

- the tests above, which also keep the docs in step with the code: every setting has a row in `docs/SETTINGS.md`, every `SPEC.md "…"` section a comment cites exists, `manifest.json` and `package.json` agree on the version, and the Dock and what rises from it take their colours from the colour scheme instead of the theme directly;
- `omarchy plugin validate .`;
- `npm run lint:sh`, which syntax-checks `scripts/*.sh` and runs `shellcheck` over them when it is installed;
- `npm run lint:qml`, which fails on any `qmllint` warning not already listed in `scripts/qmllint-baseline.txt`. `qmllint` can't see Quickshell's types, so the QML carries standing warnings; a new one is usually a misspelt or removed id. Accept a legitimate new one with `npm run lint:qml -- --update`.

Run it on every commit with the pre-commit hook:

```sh
git config core.hooksPath .githooks
```

Pull requests run `npm test` on GitHub; the manifest and QML checks need Omarchy and Qt, so they only run locally.

### Live smoke test

`Service.qml` (the Dock, the menus, the settings window) and `StartMenuView.qml` (the Start menu's view) draw what the modules decide. They depend on Quickshell and Hyprland, so after changing them run:

```sh
scripts/smoke.sh            # --monitor NAME, --type, --out DIR, --no-restart
```

It restarts the shell with this checkout, fails if the plugin logs anything, and screenshots the Dock, the Start menu and the settings window in each colour scheme. It edits the plugin's entry in `shell.json` for the run and restores it on exit. Look at the screenshots: the script only knows the plugin loaded quietly. It cannot click, drag or hover. `scripts/pointer.sh` can (`move X Y`, `reveal`, `left`, `right`, `shot FILE [WxH+X+Y]`), given `ydotool` and a writable `/dev/uinput` (`docs/hyprland-notes.md` "Moving the pointer"); use it for Previews, the Item menu and the Bar menu. With auto-hide on, `reveal` first and `shoot` before the first click: a click while the Dock is hidden goes to the window behind it. Drag, and anything it could not reach, still needs the checklist below.

### Retaking screenshots

The README images are in `screenshots/`. Retake one only when its subject changed: a new row in the settings window changes `settings.png`; a new look for the Dock or Start menu changes `taskbar.png` and the `start-menu*.png` and `search.png` files; the Preview and the bar's menu have `preview.png` and `right-click.png`.

Run `scripts/screenshots.sh` (needs `ydotool`; see `docs/hyprland-notes.md` "Moving the pointer"). It retakes every image the same way: on an empty workspace, with two throwaway windows for the Preview, the real pointer for the hover and the right-click, and the crops anchored to the monitor's bottom-left corner like the current files. It leaves the results in a scratch directory and prints each size beside the file it would replace; `--only NAME,NAME` takes some, `--install` copies them over `screenshots/`. Look at every image before committing it: the Dock shows your pins and open windows, and the wallpaper and theme are yours, so the images change from release to release for those reasons alone. The Preview shows the throwaway windows' group with a letter tile, not an App's icon.

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

- [ ] Right click on an Item opens the Item menu: Pin/Unpin, New Window and the App's own actions; for a Window, Maximize, Full screen, Float (plus Center and Pin on top when floating) and Move to scratchpad; then Close Window.
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
