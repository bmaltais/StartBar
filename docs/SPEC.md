# StartBar: specification

What StartBar does today. Vocabulary is defined in [CONTEXT.md](../CONTEXT.md); capitalised terms below refer to it. Decisions that shaped it are in [docs/adr/](adr/).

## Identity

- Omarchy shell plugin, id `io.github.bmaltais.startbar`, display name "StartBar", licence MIT.
- Kind `service` with `keepLoaded: true`; the plugin owns its own layer-shell surfaces.
- This repository's root is the plugin directory (`manifest.json` at the root), so `omarchy plugin add <git-url>` installs it. The development install is in [CONTRIBUTING.md](../CONTRIBUTING.md).
- Listed on the Omarchy plugin marketplace.

## What the Dock shows

- One Dock per monitor: a full-width bar along the bottom edge with the Start button, the Items and an optional clock. Every Dock shows the same Items.
- One Window Item per Window, across all workspaces and all monitors, including special workspaces.
- A Window whose App cannot be resolved shows a Letter Tile and cannot be pinned.
- An App whose icon file Qt cannot find shows a Letter Tile with the first letter of its name (the Start menu leaves the icon blank), and the Dock and the Start menu, sharing one lookup (`IconResolver.qml`), search the icon directories for the file itself: at once, then every ~10 seconds, three searches in all. If it finds one the icon replaces the tile. (Qt remembers a miss until the shell restarts, so an icon installed after the App was first looked up, such as a package installed while the shell runs, would otherwise stay blank.)
- Grouping (`groupWindows`, true; added 2026-10-10): with it on, an App's Windows collapse into one Group Item when it has two or more; a lone Window is a plain Window Item as ever. See "Grouping" below.
- Pins: an App kept in the Dock whether or not it has Windows. A Pin holds a slot; while its App has Windows their Window Items occupy that slot, otherwise the Pin is shown and launches the App on click. A Pin whose App is no longer installed shows a Letter Tile with a "missing" tooltip and stays until unpinned.
- Ordering: Launch Order, with a new Window joining the Window Items of its own App. Any Item may be dragged to a Placed position; a Placed Pin keeps it permanently, a Placed Window Item until the Window closes. Dragging one Window of a pinned App moves only that Window.
- Indicators: a small pill under every Window Item, wide and accent-coloured for the Active Window, which is also highlighted; a workspace badge on every Window Item when `showWorkspaceBadge` is on (default off); an urgent-colour tint for Attention. No magnification.
- Previews (`showPreviews`, on): hovering a Window Item shows its Preview, a live thumbnail with the title and a close button. The thumbnail keeps the Window's own aspect ratio inside a fixed-size box and holds its last good frame if the live capture blanks. A Pin without Windows shows a tooltip with the App's name instead. With previews off, a Window Item shows a tooltip with its title and workspace.
- Slide (`previewSlide`, true): the Preview rises out of the Dock edge (clipped by its own box) over ~200ms when it appears; closing it is instant, and moving to a neighbouring Item closes it at once and slides that Item's up after the open delay.
- Peek (`previewPeek`, true; added 2026-10-10): hovering a thumbnail for 150ms shows that Window by focusing it, as Windows' Aero Peek does: its workspace comes into view, and a maximized or full-screen Window covering it on that workspace is un-maximized for the peek. Moving to another thumbnail first undoes the previous peek, then applies the new one. Leaving the thumbnails (200ms) or closing the popup restores the focused Window, each monitor's workspace and the maximized state; a click on the thumbnail keeps the Window focused instead. State is saved in `$XDG_RUNTIME_DIR/startbar-peek` and any leftover is restored when the shell starts. Hyprland cannot unset a window's opacity, so the peek focuses rather than fading other windows.
- Overflow: icons shrink until every Item fits the monitor width.
- Colours and fonts come from the current Omarchy theme and follow theme switches live, unless a fixed palette is chosen (see "The bar").

## The bar

- Full-width along the bottom, `barHeight` (48) tall, with `opacity` (0.9) or `transparent` (icons only).
- Icons are `iconSize` (48) at most and also fit inside the bar (`barHeight - 20`), so with the defaults they are 28px.
- `alignment`: `left` (default, changed from `center` 2026-10-10) or `center` for the group of Start button and Items.
- Start button (`showStart`, on) at the start of that group. It runs `startCommand`, which is `builtin` by default and opens the Start menu; any other value is run as a command, such as `omarchy-menu toggle apps` for the Omarchy menu. `startIcon` is `grid` (drawn by the plugin, the default), `omarchy`, `arch`, `linux`, an icon-theme name, or an absolute image path.
- Clock (`showClock`, off) at the right end.
- `colorScheme`: `theme` (default) follows Omarchy; `dark` and `light` are fixed palettes. It applies to the bar and everything that rises from it: the Start menu, the menus and the Previews. Tooltips and the settings window always follow the theme.

## How the Dock behaves

- The Dock floats on the Top layer and never reserves screen space, so fullscreen windows cover it.
- It is always Revealed unless `autoHide` is on (default off).
- Reveal: with auto-hide on, the Dock is Hidden by default and the Reveal Strip spans the full bottom edge of each monitor, above any space the Omarchy bar reserves. The pointer resting on it for the reveal delay (`revealDelayMs`, 200 ms) makes the Dock Revealed; it returns to Hidden after the hide delay (`hideDelayMs`, 300 ms) once the pointer leaves it. It slides up from the edge in about 150 ms. Without auto-hide there is no Reveal Strip and no timers run.
- With auto-hide on, the Dock stays Revealed while a menu or the Start menu is open, while the pointer is on the Start button, and for the whole of a drag; the hide timer starts after the drop or the close.
- Attention never reveals the Dock by itself.
- The Dock is always at the bottom edge.

## Input

- Focusing a floating Window from the Dock (a click on its Item or Preview) also raises it above other floating Windows (added 2026-10-11): Hyprland's focus alone leaves it underneath, focused but hidden. Tiled Windows are not raised. A peek raises a floating Window too, since a peek of one left under another would show nothing; it stays raised after the peek is put back, because Hyprland has no way to put the order back.
- Left click on a Window Item: focus the Window, switching workspace and monitor as needed; a special-workspace Window is toggled into view. Clicking the Active Window's Item does nothing.
- Left click on a Pin with no Windows: launch the App.
- Middle click on any Item with a resolvable App: launch a new instance.
- Click on a Preview: focus its Window and, with `previewWarpPointer` (on), move the pointer to the middle of that Window. Clicking an Item itself never moves the pointer.
- Right click on an Item: the Item menu, in three groups. (1) Pin/Unpin, New Window, and the App's own desktop actions (e.g. "New Private Window"). (2) For a Window Item, its state: Maximize/Restore, Full screen/Exit full screen, Float/Tile, and, when floating, Center and Pin on top/Unpin from top; Move to scratchpad (hidden once there). (3) Close Window. Pin is disabled on Letter Tile Items. The state rows act on that Window whether or not it is focused. The menu stays open until a row is chosen, a click lands outside it, or the pointer leaves it.
- Right click on a Preview (added 2026-10-11): the Preview menu for that one Window, with its bottom-left corner at the pointer, as in Windows 11: its state rows (as in the Item menu's second group) and Close Window. A peek in progress is left as it is while the menu is open (restoring it would change focus and close the menu); choosing a state row keeps that Window focused, as a click does, and closing the menu any other way puts the peek back. The Preview stays up while the menu is open; the Preview goes after the menu closes if the pointer has left it. Choosing a row acts on that Window whether or not it is focused. Unlike the Item menu it has no Pin or New Window rows: those are about the App, and the Item menu has them.
- Right click on the bar (not on an Item): the Bar menu, the common options in divided groups: icon alignment; colour scheme; the Start button, built-in or Omarchy menu, and open-on-hover; then auto-hide, clock, previews, pointer-follows-preview, show-window-on-hover, group windows, workspace badge and transparent background; then Settings…. Choosing a row writes the setting and closes the menu; the bar updates live.
- Drag within the Dock: reorder. A pressed Item shrinks a little; once lifted it is drawn a little bigger than the others, and the Items between its slot and the one under it step aside to show where it would land. It stops at the first and last slot while the pointer goes on, and never goes past the Start button. Drag out of the Dock (up or down, off the bar): unpin the Item's App if pinned, otherwise snap back.
- The Dock never takes keyboard focus. The two exceptions are the Start menu while it is open and the settings window.

## Start menu

With `startCommand: "builtin"`, the default, the Start button opens StartBar's own menu, anchored above the button (the Omarchy menu always centres on screen and can't be anchored). With centred icons it is centred on the monitor.

- Opening: a click on the Start button, or, with `startHoverOpen` (off by default, changed from on 2026-10-10), the pointer resting on the Start button for 400 ms.
- Hover mode: a menu opened by resting the pointer. It already has the keyboard, so typing searches at once, but it closes 500 ms after the pointer is on neither the button nor the menu. Clicking the Start button does not make it stay, and moving the pointer on to an Item closes it at once so that Item's Preview takes over. Typing a key, or clicking the search box, ends hover mode: the menu then stays until dismissed, like a clicked-open one.
- From the keyboard: `omarchy-shell io.github.bmaltais.startbar startMenu` toggles it on the focused monitor and `closeStartMenu` closes it, for a Super-key binding. It never opens in hover mode this way. With a `startCommand` other than `builtin`, both the button and this command run that command instead.
- Search box at the top: type to filter all Apps; Up/Down move the highlight and Enter launches it. It is not a native text control, because Qt reads the clipboard whenever it changes with no size limit, which a hostile clipboard owner can use to stall the shell. So it only types (up to 256 characters), Backspace deletes one character, and Ctrl+U or Ctrl+Backspace clears it: no paste, caret movement, selection or IME composition.
- Pinned: a six-column grid of Start Pins. Until the list is first changed it shows the Dock's Pins. A tile can be dragged to another slot to reorder, the same way as on the Dock: it shrinks when pressed, is drawn bigger once lifted, the tiles between its slot and the one under it step aside, and it stops at the first and last pin. The order is saved on release; dropping a cell or more beyond the grid changes nothing.
- "All apps ›" switches to an A-Z list titled "All", with letter headings, an outlined "‹ Back" button opposite the title, and each App's generic name under its name when it has one. Clicking a letter heading opens an A-Z jump grid; letters with no Apps are dimmed.
- Recommended: the last six Apps launched from the menu, each with its generic name (such as "Web Browser") under it when the desktop entry has one.
- Right-click an App: Pin to / Unpin from Start, Pin to / Unpin from Dock, Open.
- Places: a column on the left with Home and the user's XDG folders (Documents, Downloads, Pictures, Music, Videos, read from `~/.config/user-dirs.dirs`; any that is just Home is skipped). One click opens the folder with `xdg-open`. A `startPlaces` list of paths (`~` allowed) replaces the defaults; an empty list hides the column.
- Footer: the account's real name (from the system account, else the login) with the `~/.face` picture cropped to a circle, or an initial when there is none. Clicking it offers Lock and Sign out. A power button offers Sleep, Restart and Shut down. These run Omarchy's system commands and `systemctl suspend`.
- Keys with nothing typed: the arrow keys walk the Pinned grid and then Recommended, and Enter launches the selection. In All apps, Up/Down walk the list.
- Escape backs out one layer at a time: an open overlay menu, the jump grid, the search text, All apps, then the menu itself. Outside hover mode, a click anywhere outside the menu closes it.
- The menu is part of the Dock's own surface, not a popup window: a popup's keyboard grab needs a recent click inside the plugin's window, which hover-opened and keyboard-opened menus lack, so the compositor would refuse it and keys would go to the focused window. While the menu is open the surface takes exclusive keyboard focus, as Omarchy's own menu does.

## Configuration

Stored in StartBar's entry in Omarchy's shell config (`~/.config/omarchy/shell.json`, `plugins[]`), written through the shell's plugin write-back hook. A hand edit to the entry applies live. The entry holds:

- the settings named above; every key and default is listed in [SETTINGS.md](SETTINGS.md)
- `pins`, the Pins in order, and `placements`, each Placed Pin's position (a Placed Window Item's position is never stored: it lasts only until the Window closes)
- `startPins`, `recentApps` and `startPlaces` for the Start menu

A value that is missing or unusable falls back to its default. A leftover `style` key from the removed dock style ([ADR 0002](adr/0002-startbar-is-only-a-taskbar.md)) is ignored.

## Grouping

Optional, on by default (`groupWindows`, which can be turned off; also a row in the bar's right-click menu and in the settings window). Modelled on the Windows taskbar. The "one Window Item per Window" rule above holds while it is off.

- Windows of one App (Windows with no App group by window class) become a single Group Item, in the slot Launch Order or the App's Pin gives them. The icon has the edges of the other Windows stacked behind it, and the running indicator shows one dot per Window (at most three). The Group Item is highlighted when any of its Windows is the Active Window, and tinted when any is in Attention. Its workspace badge shows only when all its Windows are on one workspace.
- Hover: the preview popup shows one thumbnail per Window in a row, each with title and close button; the Active Window's is outlined. Thumbnails shrink to fit the screen. Clicking a thumbnail focuses that Window; closing one leaves the popup up for the rest, and the last one closing takes it away. With `showPreviews` off the tooltip gives the App name and Window count.
- Left click on a Group Item does nothing (pick from the preview, as on Windows), except with previews off, where it focuses the Window after the Active one. Middle click launches a new instance.
- Right click: Pin/Unpin, New Window and the App's actions as for any Item; the Window-state rows are left out; "Close all N windows" replaces Close Window.
- Placed: a Group Item's position is kept until the App's last Window closes. Dragging it moves the whole group, and dragging a pinned App's group out unpins the App.

## Settings window

A window titled "Taskbar settings" with a control for every setting, so nothing needs hand-editing. It is a layer-shell window on the Overlay layer, centred on the monitor it was opened from, taking keyboard focus on demand; Escape or the close button closes it.

- Opened from the "Settings…" row of the Bar menu, and by `omarchy-shell io.github.bmaltais.startbar settings` on the focused monitor (`closeSettings` closes it), so it can be bound to a key.
- Groups: Appearance, Behavior and Start menu. Each field is a switch, choice buttons, a stepper, a slider, a text field or a list editor. A test keeps the fields in step with the keys the configuration understands.
- Every change is written immediately, so the Dock updates live. Text fields commit on Enter or when focus leaves; the opacity slider writes once, on release.
- Places: unset means the Start menu's XDG folders; "Customize" seeds an editable list from them and "Use defaults" removes the key again.
- "Reset to defaults" (two clicks, to confirm) removes every setting in the window. Pins, their positions, Start Pins and recent Apps are not settings and are untouched.
- Not in the window: Pins and Placed positions (managed on the Dock itself), Start Pins and recent Apps (managed in the Start menu).

## Out of scope

- A floating dock style ([ADR 0002](adr/0002-startbar-is-only-a-taskbar.md)), a pinned-only launcher mode, minimise on a second click.
- A position other than the bottom edge, and enabling the Dock on some monitors only.
- In the Start menu: pin folders, Uninstall, web search results and recent files (there is no index of them to read).

Candidates for later releases, and ideas considered and set aside, are in [IDEAS.md](IDEAS.md).

## Verification

The pure JavaScript modules (ordering, Pins, Placed, configuration, the Start menu's rules, the reveal, preview and drag rules) are covered by `npm test`. Everything that depends on Quickshell or Hyprland is checked by hand with the checklist in [CONTRIBUTING.md](../CONTRIBUTING.md), on a two-monitor Omarchy machine.
