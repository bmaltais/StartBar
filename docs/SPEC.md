# StartBar: specification

What StartBar does today. Vocabulary is defined in [CONTEXT.md](../CONTEXT.md); capitalised terms below refer to it. Decisions that shaped it are in [docs/adr/](adr/).

## Identity

- Omarchy shell plugin, id `io.github.bmaltais.startbar`, display name "StartBar", licence MIT.
- Kind `service` with `keepLoaded: true`; the plugin owns its own layer-shell surfaces.
- This repository's root is the plugin directory (`manifest.json` at the root), so `omarchy plugin add <git-url>` installs it. The development install is in [CONTRIBUTING.md](../CONTRIBUTING.md).
- Listed on the Omarchy plugin marketplace.

## What the Dock shows

- One Dock per monitor: a full-width bar along the bottom edge with the Start button, the Items and a clock. Every Dock shows the same Items.
- One Window Item per Window, across all workspaces and all monitors, including special workspaces.
- A Window whose App cannot be resolved shows a Letter Tile and cannot be pinned.
- Pins: an App kept in the Dock whether or not it has Windows. A Pin holds a slot; while its App has Windows their Window Items occupy that slot, otherwise the Pin is shown and launches the App on click. A Pin whose App is no longer installed shows a Letter Tile with a "missing" tooltip and stays until unpinned.
- Ordering: Launch Order, with a new Window joining the Window Items of its own App. Any Item may be dragged to a Placed position; a Placed Pin keeps it permanently, a Placed Window Item until the Window closes. Dragging one Window of a pinned App moves only that Window.
- Indicators: a small pill under every Window Item, wide and accent-coloured for the Active Window, which is also highlighted; a workspace badge on every Window Item when `showWorkspaceBadge` is on (default off); an urgent-colour tint for Attention. No magnification.
- Previews (`showPreviews`, on): hovering a Window Item shows its Preview, a live thumbnail with the title and a close button. The thumbnail keeps the Window's own aspect ratio inside a fixed-size box and holds its last good frame if the live capture blanks. A Pin without Windows shows a tooltip with the App's name instead. With previews off, a Window Item shows a tooltip with its title and workspace.
- Overflow: icons shrink until every Item fits the monitor width.
- Colours and fonts come from the current Omarchy theme and follow theme switches live, unless a fixed palette is chosen (see "The bar").

## The bar

- Full-width along the bottom, `barHeight` (48) tall, with `opacity` (0.9) or `transparent` (icons only).
- Icons are `iconSize` (48) at most and also fit inside the bar (`barHeight - 20`), so with the defaults they are 28px.
- `alignment`: `center` or `left` for the group of Start button and Items.
- Start button (`showStart`, on) at the start of that group. It runs `startCommand`, which is `omarchy-menu toggle apps` by default; `builtin` opens the Start menu instead. `startIcon` is `grid` (drawn by the plugin, the default), `omarchy`, `arch`, `linux`, an icon-theme name, or an absolute image path.
- Clock (`showClock`, on) at the right end.
- `colorScheme`: `theme` (default) follows Omarchy; `dark` and `light` are fixed palettes. It applies to the bar and everything that rises from it: the Start menu, the menus and the Previews. Tooltips and the settings window always follow the theme.

## How the Dock behaves

- The Dock floats on the Top layer and never reserves screen space, so fullscreen windows cover it.
- It is always Revealed unless `autoHide` is on (default off).
- Reveal: with auto-hide on, the Dock is Hidden by default and the Reveal Strip spans the full bottom edge of each monitor, above any space the Omarchy bar reserves. The pointer resting on it for the reveal delay (`revealDelayMs`, 200 ms) makes the Dock Revealed; it returns to Hidden after the hide delay (`hideDelayMs`, 300 ms) once the pointer leaves it. It slides up from the edge in about 150 ms. Without auto-hide there is no Reveal Strip and no timers run.
- With auto-hide on, the Dock stays Revealed while a menu or the Start menu is open, while the pointer is on the Start button, and for the whole of a drag; the hide timer starts after the drop or the close.
- Attention never reveals the Dock by itself.
- The Dock is always at the bottom edge.

## Input

- Left click on a Window Item: focus the Window, switching workspace and monitor as needed; a special-workspace Window is toggled into view. Clicking the Active Window's Item does nothing.
- Left click on a Pin with no Windows: launch the App.
- Middle click on any Item with a resolvable App: launch a new instance.
- Click on a Preview: focus its Window and, with `previewWarpPointer` (on), move the pointer to the middle of that Window. Clicking an Item itself never moves the pointer.
- Right click on an Item: the Item menu, in three groups. (1) Pin/Unpin, New Window, and the App's own desktop actions (e.g. "New Private Window"). (2) For a Window Item, its state: Maximize/Restore, Full screen/Exit full screen, Float/Tile, and, when floating, Center and Pin on top/Unpin from top; Move to scratchpad (hidden once there). (3) Close Window. Pin is disabled on Letter Tile Items. The state rows act on that Window whether or not it is focused. The menu stays open until a row is chosen, a click lands outside it, or the pointer leaves it.
- Right click on the bar (not on an Item): the Bar menu, the common options in divided groups: icon alignment; colour scheme; the Start button, built-in or Omarchy menu, and open-on-hover; then auto-hide, clock, previews, pointer-follows-preview, workspace badge and transparent background; then Settings…. Choosing a row writes the setting and closes the menu; the bar updates live.
- Drag within the Dock: reorder, with a live insertion preview (see Placed). Drag out of the Dock: unpin the Item's App if pinned, otherwise snap back.
- The Dock never takes keyboard focus. The two exceptions are the Start menu while it is open and the settings window.

## Start menu

With `startCommand: "builtin"` the Start button opens StartBar's own menu, anchored above the button (the Omarchy menu always centres on screen and can't be anchored). With centred icons it is centred on the monitor.

- Opening: a click on the Start button, or, with `startHoverOpen` (on), the pointer resting on the Start button for 400 ms.
- Hover mode: a menu opened by resting the pointer. It already has the keyboard, so typing searches at once, but it closes 500 ms after the pointer is on neither the button nor the menu. Clicking the Start button does not make it stay, and moving the pointer on to an Item closes it at once so that Item's Preview takes over. Typing a key, or clicking the search box, ends hover mode: the menu then stays until dismissed, like a clicked-open one.
- From the keyboard: `omarchy-shell io.github.bmaltais.startbar startMenu` toggles it on the focused monitor and `closeStartMenu` closes it, for a Super-key binding. It never opens in hover mode this way. With a `startCommand` other than `builtin`, both the button and this command run that command instead.
- Search box at the top: type to filter all Apps; Up/Down move the highlight and Enter launches it.
- Pinned: a six-column grid of Start Pins. Until the list is first changed it shows the Dock's Pins. A tile can be dragged to another slot to reorder; the slot under it is outlined and the order is saved on release.
- "All apps ›" switches to an A-Z list with letter headings and a Back link. Clicking a letter heading opens an A-Z jump grid; letters with no Apps are dimmed.
- Recommended: the last six Apps launched from the menu.
- Right-click an App: Pin to / Unpin from Start, Pin to / Unpin from Dock, Open.
- Places: a column on the left with Home and the user's XDG folders (Documents, Downloads, Pictures, Music, Videos, read from `~/.config/user-dirs.dirs`; any that is just Home is skipped). One click opens the folder with `xdg-open`. A `startPlaces` list of paths (`~` allowed) replaces the defaults; an empty list hides the column.
- A Settings button at the bottom of the Places column opens Omarchy's setup menu (`omarchy-menu summon setup`).
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
