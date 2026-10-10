# Omarchy Dock: specification

Agreed on 2026-09-11 after a design interview. Vocabulary is defined in [CONTEXT.md](../CONTEXT.md); capitalised terms below refer to it.

## Identity

- Omarchy shell plugin, id `bernard.dock`, display name "Dock", licence MIT.
- Kind `service` with `keepLoaded: true`; the plugin owns its own layer-shell surfaces.
- This repository's root is the plugin directory (`manifest.json` at the root), so `omarchy plugin add <git-url>` installs it. For development, symlink the checkout into `~/.config/omarchy/plugins/bernard.dock/`. The shell's own file watcher doesn't follow that symlink, so a save there isn't picked up automatically; run `omarchy-shell shell rescanPlugins` after editing, or `omarchy restart shell` to pick up changes to the `keepLoaded` service itself. See the README's development-install section.
- Personal project, published so others can use it.

## What the Dock shows

- One Dock per monitor, bottom centre. Every Dock shows the same Items.
- One Window Item per Window, across all workspaces and all monitors, including special workspaces.
- A Window whose App cannot be resolved shows a Letter Tile and cannot be pinned.
- Pins: an App kept in the Dock whether or not it has Windows. A Pin holds a slot; while its App has Windows their Window Items occupy that slot, otherwise the Pin is shown and launches the App on click. A Pin whose App is no longer installed shows a Letter Tile with a "missing" tooltip and stays until unpinned.
- Ordering: Launch Order, with a new Window joining the Window Items of its own App. Any Item may be dragged to a Placed position; a Placed Pin keeps it permanently, a Placed Window Item until the Window closes. Dragging one Window of a pinned App moves only that Window.
- Indicators: Active Window highlight, running dot on every Window Item, workspace badge on every Window Item when `showWorkspaceBadge` is on (default off, amended 2026-10-09; both styles), tooltip with title and workspace, urgent-colour tint for Attention. No magnification.
- Overflow: icons shrink until every Item fits the monitor width.
- Colours and fonts come from the current Omarchy theme and follow theme switches live.

## How the Dock behaves

- Default state Hidden. The Reveal Strip spans the full bottom edge of each monitor, above any space the bar reserves. Pointer resting on it for the reveal delay (default 200 ms) makes the Dock Revealed; the Dock returns to Hidden after the hide delay (default 300 ms) once the pointer leaves it. Reveal slides up from the edge in about 150 ms.
- The Dock stays Revealed while its context menu is open and for the whole of a drag; the hide timer starts after the drop or menu close.
- The Dock floats on the Top layer and never reserves screen space, so fullscreen windows cover it.
- Position is fixed at the bottom in version one.
- Attention never reveals the Dock by itself.

## Input

- Left click on a Window Item: focus the Window, switching workspace and monitor as needed; a special-workspace Window is toggled into view. Clicking the Active Window's Item does nothing.
- Left click on a Pin with no Windows: launch the App.
- Middle click on any Item with a resolvable App: launch a new instance.
- Right click: menu in three groups. (1) Pin/Unpin, New Window, and the App's own desktop actions (e.g. "New Private Window"). (2) For a Window Item, its state: Maximize/Restore, Full screen/Exit full screen, Float/Tile, and, when floating, Center and Pin on top/Unpin from top; Move to scratchpad (hidden once there). (3) Close Window. Pin is disabled on Letter Tile Items. The state rows act on that Window whether or not it is focused. (Amended 2026-10-09; originally exactly Pin/Unpin, New Window, Close Window.)
- Drag within the Dock: reorder (see Placed). Drag out of the Dock: unpin the Item's App if pinned, otherwise snap back.
- The Dock never takes keyboard focus.

## Configuration

Stored in the Dock's entry in Omarchy's shell config (`~/.config/omarchy/shell.json`, `plugins[]`), written through the shell's plugin write-back hook. Keys: icon size, reveal delay, hide delay, Pins, and each Placed Pin's own position (a Placed Window Item's position is never stored here — it lasts only until the Window closes). Nothing else is configurable in version one.

## Taskbar style (added 2026-10-09; see docs/adr/0001)

`style: "taskbar"` swaps the dock's frame for a full-width bar; Items, Pins, ordering, drag and the context menu are unchanged. `style: "dock"` (default) is exactly the original behaviour.

- Bar: full-width along the bottom, `barHeight` (48), `opacity` (0.9) or `transparent` (icons only). Floats on the Top layer, reserves no space.
- `alignment`: `center` or `left` for the group of Start button + Items.
- Start button (`showStart`, true): runs `startCommand` (`omarchy-menu toggle apps`); `startIcon` is `grid` (drawn in QML, default), `omarchy`, `arch`, `linux`, an icon-theme name, or an absolute image path.
- Start menu: with `startCommand: "builtin"` the Start button opens a popup anchored above it, modelled on Windows 11's (the Omarchy menu itself always centres on screen and can't be anchored):
  - Opens on a click, or, with `startHoverOpen` (true), after the pointer rests on the Start button for 400ms. A menu opened by hover is in hover mode: it already has the keyboard, so typing searches at once, but it closes 500ms after the pointer is on neither the button nor the menu. Clicking the Start button does not make it permanent, and moving the pointer on to another icon closes it at once so that icon's preview takes over. Typing a key, or clicking the search box, ends hover mode: the menu then stays until dismissed, like a clicked-open one.
  - Search box on top (`DockModel.filterApps`): type to filter all Apps, Up/Down, Enter launches.
  - Pinned: a six-column grid of the Start menu's own pins (`startPins`; until it is first changed it shows the Dock's Pins). "All apps ›" switches to an A-Z list with letter headings (`groupAlphabetically`) and a Back link.
  - Recommended: the last six Apps launched from the menu (`recentApps`, `pushRecent`). Recent files are out of scope: there is no equivalent index.
  - Right-click an App: Pin to / Unpin from Start, Pin to / Unpin from Dock, Open.
  - Places column on the left: Home and the user's XDG folders (Documents, Downloads, Pictures, Music, Videos; any that is just Home is skipped, read from `~/.config/user-dirs.dirs`). One click opens the folder with `xdg-open`. A `startPlaces` list of paths (`~` allowed) replaces the defaults; an empty list hides the column.
  - Opened from the keyboard with `omarchy-shell bernard.dock startMenu` (toggles; `closeStartMenu` closes), on the focused monitor, for a Super-key binding. With a non-built-in `startCommand` it runs that command instead.
  - Pinned apps can be dragged to reorder them: left-drag a tile, the slot under it is outlined, release to save the new order in `startPins` (`DockModel.moveItem`).
  - Keyboard: with nothing typed, the arrow keys walk the Pinned grid and then Recommended (`DockModel.moveSelection`), Enter launches the selection; in All apps Up/Down walk the list.
  - In All apps, clicking a letter heading opens an A-Z jump grid (letters with no apps are dimmed); Escape closes it first.
  - A Settings button at the bottom of the Places column opens Omarchy's setup menu (`omarchy-menu summon setup`), like the gear on Windows 10's left rail.
  - Footer: the account's real name (from the system account, else the login) with your `~/.face` picture cropped to a circle (an initial when there is none) (click it for Lock and Sign out, as in Windows 11; "Change account settings" has no Omarchy equivalent), and a power button: Sleep, Restart, Shut down (Omarchy's system commands; Lock and Sign out are behind the name, as in Windows 11).
  - Escape backs out one layer (overlay, search, All apps, menu); an outside click closes it.
  - It is an Item of the panel's full-screen layer surface, not a popup window: a popup's keyboard grab needs a recent click inside our window, which hover- and IPC-opened menus lack, so the compositor refused it and keys went to the focused window. While open the panel takes exclusive keyboard focus (as Omarchy's own menu does), and, outside hover mode, a click anywhere outside the menu closes it. This is the one exception to "never takes keyboard focus".
  - Not implemented: drag to reorder pins, pin folders, Uninstall, web search results, recent files.
- Clock (`showClock`, true) at the right end.
- Indicators: a small pill under each Window Item; a wide accent pill for the Active Window.
- Previews (`showPreviews`, true): hovering a Window Item shows a live thumbnail with title, a close button, and click-to-focus. Pins without Windows keep the name tooltip. The thumbnail keeps the Window's own aspect ratio inside a fixed-size box and holds its last good frame if the live capture blanks. With `previewWarpPointer` (true) a click on the thumbnail also moves the pointer to the middle of that Window; false only focuses it. Clicking an Item itself never moves the pointer.
- `colorScheme`: `theme` (default), `dark`, `light` fixed palettes.
- Right click on the bar (not on an Item) opens a quick menu of the common options in divided groups: icon alignment; colour scheme; the Start button, built-in or Omarchy Start menu and open-on-hover; then auto-hide, clock, previews, pointer-follows-preview, workspace badge and transparent background; then Settings…. Choosing a row writes the setting and closes the menu; the bar updates live. Its last row, "Settings…", opens the full settings window (below). In dock style the same menu holds "Switch to taskbar style" and "Settings…", opened by right-clicking the gap between Items or the very bottom edge of the screen (the Reveal Strip).
- `autoHide` (false): when true the bar uses the Dock's Reveal Strip and Hidden/Revealed rules unchanged.

## Settings window (added 2026-10-09)

A window titled "Taskbar settings" (or "Dock settings" in dock style) with a widget for every option stored in the config file, so nothing needs hand-editing. It is a layer-shell window on the Overlay layer, centred on the monitor that was clicked, taking keyboard focus on demand; Escape or the close button closes it.

- Opened from the "Settings…" row of the bar's quick menu, and by `omarchy-shell bernard.dock settings` (on the focused monitor; `closeSettings` closes it), so it can be bound to a key.
- Driven by `DockConfig.settingsSchema()`: groups Appearance, Behavior and Start menu, each field a switch, choice buttons, stepper, slider, text field or list editor. A test keeps the schema in step with the keys the config module understands.
- Every change is written immediately through the same write-back as Pin/Unpin, so the Dock updates live. Text fields commit on Enter or when focus leaves; the opacity slider writes once, on release.
- Places: unset means the Start menu's XDG folders; "Customize" seeds an editable list from them and "Use defaults" removes the key again.
- "Reset to defaults" (two clicks, to confirm) removes every setting in the window. Pins, their positions, the Start menu's pins and recents are not settings and are untouched.
- Not in the window: Pins and Placed positions (managed by the Dock itself), `startPins` and `recentApps` (managed by the Start menu).

## Out of scope for version one

Pinned-only launcher mode, minimise-to-special-workspace on second click, configurable position, per-monitor enable, keyboard toggle, scripted tests.

## Verification

Manual checklist kept in the README, walked through after each milestone on a two-monitor Omarchy 4 machine.

## Milestones

1. Static Dock: Window Items with icons on both monitors, click to focus.
2. Auto-hide: Reveal Strip, Hidden/Revealed, slide animation.
3. Indicators: Active highlight, running dots, workspace badge, tooltip, Attention tint.
4. Pins, context menu, middle click, drag to reorder, settings.
5. README with checklist, publish.
